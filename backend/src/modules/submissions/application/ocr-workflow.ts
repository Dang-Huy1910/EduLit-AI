import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { Prisma } from "../../../generated/prisma/client.js";
import { DomainError } from "../../../core/errors.js";
import { sha256Buffer, sha256Utf8 } from "../../../core/hash.js";
import type { EduLitPrisma } from "../../../infrastructure/database/prisma.client.js";
import type { PrivateStoragePort } from "../../../infrastructure/storage/private-storage.port.js";
import type { VisionTranscriptionOutput, VisionTranscriptionPort } from "../../../infrastructure/vision/vision-transcription.port.js";
import { buildAssignmentSnapshot } from "../../assignments/domain/snapshot.js";
import { makeMaskedDerivative } from "./mask-image.js";
import { validatePrivacyMasks, type PrivacyMask } from "../domain/privacy.js";

const MAX_PAGES = 4;
const MAX_TEXT_CHARS = 60_000;

export async function openSubmissionDraft(prisma: EduLitPrisma, studentId: string, assignmentId: string) {
  const assignment = await assertStudentCanDraft(prisma, studentId, assignmentId);
  const existing = await prisma.submissionDraft.findUnique({ where: { studentId_assignmentId: { studentId, assignmentId } } });
  if (existing) return serializeDraft(prisma, existing.id);
  try {
    const draft = await prisma.submissionDraft.create({ data: { studentId, assignmentId, assignmentSnapshot: buildAssignmentSnapshot(assignment, new Date()) as Prisma.InputJsonValue } });
    return serializeDraft(prisma, draft.id);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const winner = await prisma.submissionDraft.findUniqueOrThrow({ where: { studentId_assignmentId: { studentId, assignmentId } } });
      return serializeDraft(prisma, winner.id);
    }
    throw error;
  }
}

export async function getStudentDraft(prisma: EduLitPrisma, studentId: string, draftId: string) {
  const draft = await prisma.submissionDraft.findUnique({ where: { id: draftId } });
  if (!draft || draft.studentId !== studentId) throw new DomainError("DRAFT_NOT_FOUND", "submission draft not found");
  return serializeDraft(prisma, draft.id);
}

export async function uploadDraftPage(
  prisma: EduLitPrisma, storage: PrivateStoragePort,
  input: { studentId: string; draftId: string; expectedRevision: number; data: Buffer; mimeType: string; originalName?: string; maxBytes?: number; maxTotalBytes?: number; maxPixels?: number },
) {
  const draft = await loadStudentDraft(prisma, input.studentId, input.draftId);
  assertEditableDraft(draft.status);
  if (draft.revision !== input.expectedRevision) throw new DomainError("DRAFT_CONFLICT", "draft changed before upload");
  const maxBytes = input.maxBytes ?? 10 * 1024 * 1024;
  const maxTotalBytes = input.maxTotalBytes ?? 40 * 1024 * 1024;
  const maxPixels = input.maxPixels ?? 25_000_000;
  if (input.data.length > maxBytes) throw new DomainError("UPLOAD_LIMIT", "image exceeds the per-page byte limit");
  const detectedMime = await inspectImage(input.data, input.mimeType, maxPixels);
  const existingPages = await prisma.submissionDraftPage.findMany({ where: { draftId: draft.id } });
  const currentPages = existingPages.length;
  if (currentPages >= MAX_PAGES) throw new DomainError("UPLOAD_LIMIT", `a submission draft may have at most ${MAX_PAGES} pages`);
  const existingBytes = (await Promise.all(existingPages.map((page) => storage.read(page.originalFileId)))).reduce((total, file) => total + file.size, 0);
  if (existingBytes + input.data.length > maxTotalBytes) throw new DomainError("UPLOAD_LIMIT", "images exceed the total upload byte limit");
  const extension = extensionFor(detectedMime, input.originalName);
  const original = await storage.put({ data: input.data, mimeType: detectedMime, extension });
  let derivativeId: string | null = null;
  try {
    const derivativeData = await makeMaskedDerivative(input.data, []);
    const derivative = await storage.put({ data: derivativeData, mimeType: "image/jpeg", extension: "jpg" }); derivativeId = derivative.id;
    await prisma.$transaction(async (tx) => {
      const locked = await lockDraft(tx, draft.id);
      if (locked.studentId !== input.studentId || locked.revision !== input.expectedRevision || !isEditableStatus(locked.status)) throw new DomainError("DRAFT_CONFLICT", "draft changed before upload");
      const pageCount = await tx.submissionDraftPage.count({ where: { draftId: draft.id } });
      if (pageCount >= MAX_PAGES) throw new DomainError("UPLOAD_LIMIT", `a submission draft may have at most ${MAX_PAGES} pages`);
      await tx.submissionDraftPage.create({ data: { draftId: draft.id, pageIndex: pageCount, originalFileId: original.id, derivativeFileId: derivative.id, mimeType: detectedMime, contentHash: sha256Buffer(derivativeData), masks: [] } });
      await tx.submissionDraft.update({ where: { id: draft.id }, data: { revision: { increment: 1 }, status: "DRAFT", ocrErrorCode: null } });
    });
  } catch (error) { await storage.remove(original.id); if (derivativeId) await storage.remove(derivativeId); throw error; }
  return getStudentDraft(prisma, input.studentId, input.draftId);
}

export async function deleteDraftPage(
  prisma: EduLitPrisma, storage: PrivateStoragePort,
  input: { studentId: string; draftId: string; pageId: string; expectedRevision: number },
) {
  const draft = await loadStudentDraft(prisma, input.studentId, input.draftId); assertEditableDraft(draft.status);
  const page = await prisma.submissionDraftPage.findUnique({ where: { id: input.pageId } });
  if (!page || page.draftId !== draft.id) throw new DomainError("PAGE_NOT_FOUND", "draft page not found");
  await prisma.$transaction(async (tx) => {
    const locked = await lockDraft(tx, draft.id);
    if (locked.studentId !== input.studentId || locked.revision !== input.expectedRevision || !isEditableStatus(locked.status)) throw new DomainError("DRAFT_CONFLICT", "draft changed before page removal");
    await tx.submissionDraftPage.delete({ where: { id: page.id } });
    const pages = await tx.submissionDraftPage.findMany({ where: { draftId: draft.id }, orderBy: { pageIndex: "asc" } });
    for (const [pageIndex, row] of pages.entries()) await tx.submissionDraftPage.update({ where: { id: row.id }, data: { pageIndex } });
    await tx.submissionDraft.update({ where: { id: draft.id }, data: { revision: { increment: 1 }, status: "DRAFT", ocrErrorCode: null } });
  });
  await Promise.all([storage.remove(page.originalFileId), storage.remove(page.derivativeFileId)]);
  return getStudentDraft(prisma, input.studentId, input.draftId);
}

export async function updatePageMasks(
  prisma: EduLitPrisma, storage: PrivateStoragePort,
  input: { studentId: string; draftId: string; pageId: string; expectedRevision: number; masks: unknown },
) {
  const masks = validatePrivacyMasks(input.masks); const draft = await loadStudentDraft(prisma, input.studentId, input.draftId);
  assertEditableDraft(draft.status); if (draft.revision !== input.expectedRevision) throw new DomainError("DRAFT_CONFLICT", "draft changed before mask update");
  const page = await prisma.submissionDraftPage.findUnique({ where: { id: input.pageId } });
  if (!page || page.draftId !== draft.id) throw new DomainError("PAGE_NOT_FOUND", "draft page not found");
  const original = await storage.read(page.originalFileId); const derivativeData = await makeMaskedDerivative(original.data, masks); const derivative = await storage.put({ data: derivativeData, mimeType: "image/jpeg", extension: "jpg" });
  try {
    await prisma.$transaction(async (tx) => {
      const locked = await lockDraft(tx, draft.id);
      if (locked.studentId !== input.studentId || locked.revision !== input.expectedRevision || !isEditableStatus(locked.status)) throw new DomainError("DRAFT_CONFLICT", "draft changed before mask update");
      await tx.submissionDraftPage.update({ where: { id: page.id }, data: { derivativeFileId: derivative.id, contentHash: sha256Buffer(derivativeData), masks: masks as Prisma.InputJsonValue } });
      await tx.submissionDraft.update({ where: { id: draft.id }, data: { revision: { increment: 1 }, status: "DRAFT", ocrErrorCode: null } });
    });
  } catch (error) { await storage.remove(derivative.id); throw error; }
  await storage.remove(page.derivativeFileId);
  return getStudentDraft(prisma, input.studentId, input.draftId);
}

export async function reorderDraftPages(prisma: EduLitPrisma, input: { studentId: string; draftId: string; expectedRevision: number; pageIds: string[] }) {
  const draft = await loadStudentDraft(prisma, input.studentId, input.draftId); assertEditableDraft(draft.status);
  await prisma.$transaction(async (tx) => {
    const locked = await lockDraft(tx, draft.id);
    if (locked.studentId !== input.studentId || locked.revision !== input.expectedRevision || !isEditableStatus(locked.status)) throw new DomainError("DRAFT_CONFLICT", "draft changed before reorder");
    const pages = await tx.submissionDraftPage.findMany({ where: { draftId: draft.id }, orderBy: { pageIndex: "asc" } });
    if (pages.length !== input.pageIds.length || new Set(input.pageIds).size !== pages.length || pages.some((page) => !input.pageIds.includes(page.id))) throw new DomainError("PAGE_ORDER", "pageIds must contain each draft page once");
    const stagingOffset = 1000;
    for (const [pageIndex, pageId] of input.pageIds.entries()) await tx.submissionDraftPage.update({ where: { id: pageId }, data: { pageIndex: stagingOffset + pageIndex } });
    for (const [pageIndex, pageId] of input.pageIds.entries()) await tx.submissionDraftPage.update({ where: { id: pageId }, data: { pageIndex } });
    await tx.submissionDraft.update({ where: { id: draft.id }, data: { revision: { increment: 1 }, status: "DRAFT", ocrErrorCode: null } });
  });
  return getStudentDraft(prisma, input.studentId, input.draftId);
}

export async function requestPrivacyReview(prisma: EduLitPrisma, studentId: string, draftId: string, expectedRevision: number) {
  const draft = await loadStudentDraft(prisma, studentId, draftId);
  await prisma.$transaction(async (tx) => {
    const locked = await lockDraft(tx, draft.id); if (locked.studentId !== studentId || locked.revision !== expectedRevision || !isEditableStatus(locked.status)) throw new DomainError("DRAFT_CONFLICT", "draft changed before privacy review");
    const pages = await tx.submissionDraftPage.count({ where: { draftId } }); if (!pages) throw new DomainError("UPLOAD_LIMIT", "upload at least one page before privacy review");
    await tx.submissionDraft.update({ where: { id: draft.id }, data: { status: "AWAITING_PRIVACY_REVIEW", privacyReturnReason: null } });
  });
  return getStudentDraft(prisma, studentId, draftId);
}

export async function reviewPrivacy(prisma: EduLitPrisma, teacherId: string, draftId: string, approve: boolean, reason?: string) {
  const draft = await loadTeacherDraft(prisma, teacherId, draftId);
  if (draft.status !== "AWAITING_PRIVACY_REVIEW") throw new DomainError("DRAFT_STATUS", "draft is not awaiting privacy review");
  if (!approve && !reason?.trim()) throw new DomainError("PRIVACY_REASON", "a return reason is required");
  await prisma.submissionDraft.update({ where: { id: draft.id }, data: { status: approve ? "PRIVACY_APPROVED" : "PRIVACY_RETURNED", privacyReviewedById: teacherId, privacyReviewedAt: new Date(), privacyReturnReason: approve ? null : reason!.trim() } });
  return serializeDraft(prisma, draft.id);
}

export async function listTeacherSubmissionDrafts(prisma: EduLitPrisma, teacherId: string, assignmentId: string) {
  const assignment = await prisma.assignment.findUnique({ where: { id: assignmentId } });
  if (!assignment || assignment.teacherId !== teacherId) throw new DomainError("DRAFT_NOT_FOUND", "submission drafts not found");
  const drafts = await prisma.submissionDraft.findMany({ where: { assignmentId }, orderBy: { updatedAt: "desc" } });
  return Promise.all(drafts.map((draft) => serializeDraft(prisma, draft.id)));
}

export async function runOcr(prisma: EduLitPrisma, storage: PrivateStoragePort, ai: VisionTranscriptionPort, teacherId: string, draftId: string) {
  const draft = await loadTeacherDraft(prisma, teacherId, draftId);
  const staleProcessing = draft.status === "OCR_PROCESSING" && !!draft.ocrLeaseUntil && draft.ocrLeaseUntil.getTime() < Date.now();
  if (draft.status !== "PRIVACY_APPROVED" && draft.status !== "OCR_FAILED" && !staleProcessing) throw new DomainError("DRAFT_STATUS", "privacy approval is required before OCR");
  const sourceRevision = draft.revision;
  const leaseToken = randomUUID();
  const claimed = await prisma.submissionDraft.updateMany({ where: { id: draft.id, revision: sourceRevision, status: draft.status }, data: { status: "OCR_PROCESSING", ocrLeaseUntil: new Date(Date.now() + 90_000), ocrLeaseToken: leaseToken, ocrAttempts: { increment: 1 }, ocrErrorCode: null } });
  if (claimed.count !== 1) throw new DomainError("DRAFT_CONFLICT", "OCR job was claimed by another request");
  try {
    const pages = await prisma.submissionDraftPage.findMany({ where: { draftId: draft.id }, orderBy: { pageIndex: "asc" } });
    const requestPages = await Promise.all(pages.map(async (page) => {
      const [file, original] = await Promise.all([storage.read(page.derivativeFileId), storage.read(page.originalFileId)]);
      return { pageId: page.id, mimeType: file.mimeType, data: file.data, contentHash: page.contentHash, sourceHash: sha256Buffer(original.data) };
    }));
    const output = await ai.transcribe({ systemInstruction: "Bạn chép nguyên văn chữ viết tay tiếng Việt theo từng trang. Không sửa chính tả, không chấm điểm, không suy đoán phần không đọc được.", userPayload: "Ảnh dưới đây đã được che thông tin riêng. Trả JSON đúng schema OCR.", responseJsonSchema: ocrSchema(), promptVersion: "ocr-transcription.v1", pages: requestPages });
    const validated = validateOcrOutput(output.output, pages.map((page) => page.id)); const text = joinOcrPages(validated);
    await prisma.$transaction(async (tx) => {
      const locked = await lockDraft(tx, draft.id); if (locked.revision !== sourceRevision || locked.status !== "OCR_PROCESSING" || locked.ocrLeaseToken !== leaseToken) throw new DomainError("DRAFT_CONFLICT", "pages changed while OCR ran");
      const latest = await tx.ocrRevision.aggregate({ where: { draftId: draft.id }, _max: { revision: true } }); const revision = (latest._max.revision ?? 0) + 1;
      await tx.ocrRevision.updateMany({ where: { draftId: draft.id, status: "COMPLETED" }, data: { status: "SUPERSEDED" } });
      await tx.ocrRevision.create({ data: { draftId: draft.id, sourceRevision, revision, rawPages: validated as Prisma.InputJsonValue, correctedText: text, provider: output.provider, modelName: output.model, promptVersion: output.promptVersion } });
      await tx.submissionDraft.update({ where: { id: draft.id }, data: { status: "OCR_REVIEW", ocrLeaseUntil: null, ocrLeaseToken: null, ocrErrorCode: null } });
    });
  } catch (error) { await prisma.submissionDraft.updateMany({ where: { id: draft.id, status: "OCR_PROCESSING", ocrLeaseToken: leaseToken }, data: { status: "OCR_FAILED", ocrLeaseUntil: null, ocrLeaseToken: null, ocrErrorCode: error instanceof DomainError ? error.code : "OCR_FAILED" } }); throw error; }
  return serializeDraft(prisma, draft.id);
}

export async function reportOcrIssue(prisma: EduLitPrisma, studentId: string, input: { draftId: string; ocrRevisionId: string; pageId?: string; segmentId?: string; reportedText: string; note?: string }) {
  const draft = await loadStudentDraft(prisma, studentId, input.draftId); if (draft.status !== "OCR_REVIEW") throw new DomainError("DRAFT_STATUS", "OCR is not ready for review");
  const revision = await prisma.ocrRevision.findUnique({ where: { id: input.ocrRevisionId } }); if (!revision || revision.draftId !== draft.id) throw new DomainError("OCR_NOT_FOUND", "OCR revision not found");
  if (!input.reportedText.trim()) throw new DomainError("OCR_ISSUE", "reportedText is required");
  return prisma.ocrIssue.create({ data: { ocrRevisionId: revision.id, reporterId: studentId, pageId: input.pageId ?? null, segmentId: input.segmentId ?? null, reportedText: input.reportedText, note: input.note?.trim() || null } });
}

export async function correctOcrText(prisma: EduLitPrisma, teacherId: string, input: { draftId: string; expectedOcrRevision: number; correctedText: string; reason?: string }) {
  const draft = await loadTeacherDraft(prisma, teacherId, input.draftId); if (draft.status !== "OCR_REVIEW") throw new DomainError("DRAFT_STATUS", "OCR is not ready for correction");
  const current = await latestOcr(prisma, draft.id); if (!current || current.revision !== input.expectedOcrRevision) throw new DomainError("OCR_CONFLICT", "OCR revision changed");
  if (input.correctedText.length > MAX_TEXT_CHARS) throw new DomainError("OCR_TEXT", "corrected text is too large");
  return prisma.$transaction(async (tx) => { await tx.ocrRevision.update({ where: { id: current.id }, data: { status: "SUPERSEDED" } }); const revised = await tx.ocrRevision.create({ data: { draftId: draft.id, sourceRevision: current.sourceRevision, revision: current.revision + 1, rawPages: current.rawPages === null ? Prisma.JsonNull : current.rawPages, correctedText: input.correctedText, provider: current.provider, modelName: current.modelName, promptVersion: current.promptVersion } }); await tx.ocrIssue.updateMany({ where: { ocrRevisionId: current.id, status: "OPEN" }, data: { status: "RESOLVED", resolvedById: teacherId, resolvedAt: new Date() } }); return revised; });
}

export async function confirmOcrSubmission(prisma: EduLitPrisma, teacherId: string, input: { draftId: string; expectedOcrRevision: number }) {
  const draft = await loadTeacherDraft(prisma, teacherId, input.draftId);
  return prisma.$transaction(async (tx) => {
    const locked = await lockDraft(tx, draft.id); if (locked.status !== "OCR_REVIEW") throw new DomainError("DRAFT_STATUS", "OCR is not ready for confirmation");
    const [assignment, teacher] = await Promise.all([tx.assignment.findUniqueOrThrow({ where: { id: locked.assignmentId } }), tx.user.findUnique({ where: { id: teacherId } })]); if (assignment.teacherId !== teacherId || assignment.status !== "PUBLISHED" || teacher?.role !== "TEACHER" || teacher.status !== "ACTIVE") throw new DomainError("SUBMISSION_ASSIGNMENT", "only the owning active teacher can confirm a submission");
    const current = await tx.ocrRevision.findFirst({ where: { draftId: draft.id, status: "COMPLETED" }, orderBy: { revision: "desc" } }); if (!current || current.revision !== input.expectedOcrRevision || current.sourceRevision !== locked.revision) throw new DomainError("OCR_CONFLICT", "OCR revision changed or no longer matches pages");
    const existing = await tx.submission.findUnique({ where: { sourceDraftId: draft.id } }); if (existing) return existing;
    const submission = await tx.submission.create({ data: { studentId: locked.studentId, assignmentId: locked.assignmentId, source: "IMAGE_OCR", sourceDraftId: draft.id, text: current.correctedText, contentHash: sha256Utf8(current.correctedText), assignmentSnapshot: locked.assignmentSnapshot === null ? Prisma.JsonNull : locked.assignmentSnapshot, submittedAt: new Date() } });
    await tx.ocrRevision.update({ where: { id: current.id }, data: { status: "CONFIRMED" } }); await tx.submissionDraft.update({ where: { id: draft.id }, data: { status: "CONFIRMED", ocrLeaseUntil: null, ocrLeaseToken: null } }); return submission;
  });
}

export async function getPrivateFileForActor(prisma: EduLitPrisma, actor: { id: string; role: "STUDENT" | "TEACHER" }, fileId: string) {
  const page = await prisma.submissionDraftPage.findFirst({ where: { OR: [{ originalFileId: fileId }, { derivativeFileId: fileId }] }, include: { draft: { include: { assignment: true } } } });
  if (!page || (actor.role === "STUDENT" ? page.draft.studentId !== actor.id : page.draft.assignment.teacherId !== actor.id)) throw new DomainError("FILE_NOT_FOUND", "file not found");
  return page;
}

async function assertStudentCanDraft(prisma: EduLitPrisma, studentId: string, assignmentId: string) { const [student, assignment, submission] = await Promise.all([prisma.user.findUnique({ where: { id: studentId } }), prisma.assignment.findUnique({ where: { id: assignmentId } }), prisma.submission.findUnique({ where: { studentId_assignmentId: { studentId, assignmentId } } })]); if (!student || student.role !== "STUDENT" || student.status !== "ACTIVE") throw new DomainError("ACTOR_FORBIDDEN", "only active students may create a draft"); if (!assignment || assignment.status !== "PUBLISHED") throw new DomainError("SUBMISSION_ASSIGNMENT", "only published assignments accept a draft"); if (submission) throw new DomainError("SESSION_SUBMITTED", "a confirmed submission already exists"); return assignment; }
async function loadStudentDraft(prisma: EduLitPrisma, studentId: string, draftId: string) { const draft = await prisma.submissionDraft.findUnique({ where: { id: draftId } }); if (!draft || draft.studentId !== studentId) throw new DomainError("DRAFT_NOT_FOUND", "submission draft not found"); return draft; }
async function loadTeacherDraft(prisma: EduLitPrisma, teacherId: string, draftId: string) { const draft = await prisma.submissionDraft.findUnique({ where: { id: draftId }, include: { assignment: true } }); if (!draft || draft.assignment.teacherId !== teacherId) throw new DomainError("DRAFT_NOT_FOUND", "submission draft not found"); return draft; }
async function lockDraft(tx: Prisma.TransactionClient, draftId: string) { const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM submission_drafts WHERE id = ${draftId}::uuid FOR UPDATE`); if (!rows.length) throw new DomainError("DRAFT_NOT_FOUND", "submission draft not found"); return tx.submissionDraft.findUniqueOrThrow({ where: { id: draftId } }); }
function isEditableStatus(status: string) { return status === "DRAFT" || status === "PRIVACY_RETURNED"; }
function assertEditableDraft(status: string) { if (!isEditableStatus(status)) throw new DomainError("DRAFT_STATUS", "draft pages are locked while awaiting or after privacy review"); }
function isImageMime(mime: string) { return mime === "image/jpeg" || mime === "image/png" || mime === "image/webp"; }
async function inspectImage(data: Buffer, suppliedMime: string, maxPixels: number): Promise<string> {
  if (!isImageMime(suppliedMime)) throw new DomainError("UPLOAD_MEDIA", "only JPEG, PNG, and WebP images are supported");
  try {
    const metadata = await sharp(data, { failOn: "error" }).metadata();
    const actual = metadata.format === "jpeg" ? "image/jpeg" : metadata.format === "png" ? "image/png" : metadata.format === "webp" ? "image/webp" : null;
    if (!actual || actual !== suppliedMime || !metadata.width || !metadata.height) throw new DomainError("UPLOAD_MEDIA", "file MIME type or image bytes are invalid");
    if (metadata.width * metadata.height > maxPixels) throw new DomainError("UPLOAD_LIMIT", "image exceeds the pixel limit");
    return actual;
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError("UPLOAD_MEDIA", "file is not a decodable supported image");
  }
}
function extensionFor(mime: string, name?: string) { const ext = name?.split(".").pop()?.toLowerCase(); return ext && ["jpg", "jpeg", "png", "webp"].includes(ext) ? ext : mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg"; }
function ocrSchema() {
  return {
    type: "object", additionalProperties: false, required: ["pages"],
    properties: {
      pages: {
        type: "array",
        items: {
          type: "object", additionalProperties: false, required: ["pageId", "segments"],
          properties: {
            pageId: { type: "string" },
            segments: {
              type: "array",
              items: {
                type: "object", additionalProperties: false, required: ["id", "text", "needsReview"],
                properties: { id: { type: "string" }, text: { type: "string" }, needsReview: { type: "boolean" }, reason: { type: "string" } },
              },
            },
          },
        },
      },
    },
  };
}
function validateOcrOutput(output: VisionTranscriptionOutput, expectedIds: string[]) { if (!Array.isArray(output?.pages) || output.pages.length !== expectedIds.length || new Set(output.pages.map((page) => page.pageId)).size !== expectedIds.length || output.pages.some((page) => !expectedIds.includes(page.pageId) || !Array.isArray(page.segments) || page.segments.some((segment) => !segment.id || typeof segment.text !== "string" || typeof segment.needsReview !== "boolean"))) throw new DomainError("AI_INVALID_OUTPUT", "OCR output does not match pages or schema"); if (output.pages.reduce((size, page) => size + page.segments.reduce((n, segment) => n + segment.text.length, 0), 0) > MAX_TEXT_CHARS) throw new DomainError("AI_INVALID_OUTPUT", "OCR text exceeds limit"); return output; }
function joinOcrPages(output: VisionTranscriptionOutput) { return output.pages.map((page) => page.segments.map((segment) => segment.text).join("\n")).join("\n\n"); }
async function latestOcr(prisma: EduLitPrisma, draftId: string) { return prisma.ocrRevision.findFirst({ where: { draftId, status: "COMPLETED" }, orderBy: { revision: "desc" } }); }
async function serializeDraft(prisma: EduLitPrisma, draftId: string) {
  const draft = await prisma.submissionDraft.findUniqueOrThrow({
    where: { id: draftId },
    include: {
      student: { select: { id: true, displayName: true, loginId: true } },
      pages: { orderBy: { pageIndex: "asc" } },
      ocrRevisions: { where: { status: "COMPLETED" }, orderBy: { revision: "desc" }, take: 1, include: { issues: { orderBy: { createdAt: "asc" } } } },
    },
  });
  const current = draft.ocrRevisions[0] ?? null;
  return {
    id: draft.id,
    assignmentId: draft.assignmentId,
    studentId: draft.studentId,
    student: draft.student,
    status: draft.status,
    revision: draft.revision,
    privacyReturnReason: draft.privacyReturnReason,
    ocrErrorCode: draft.ocrErrorCode,
    pages: draft.pages.map((page) => ({ id: page.id, pageIndex: page.pageIndex, mimeType: page.mimeType, masks: page.masks, derivativeUrl: `/api/files/${page.derivativeFileId}` })),
    ocr: current
      ? { id: current.id, revision: current.revision, sourceRevision: current.sourceRevision, rawPages: current.rawPages, correctedText: current.correctedText, issues: current.issues.map((issue) => ({ id: issue.id, pageId: issue.pageId, segmentId: issue.segmentId, reportedText: issue.reportedText, note: issue.note, status: issue.status })) }
      : null,
  };
}
