import type { Prisma } from "../src/generated/prisma/client.js";
import { sha256Utf8 } from "../src/core/hash.js";
import { offsetsForQuote } from "../src/core/utf16.js";
import type { EduLitPrisma } from "../src/infrastructure/database/prisma.client.js";
import type { PrivateStoragePort } from "../src/infrastructure/storage/private-storage.port.js";
import { renderOcrFixturePng } from "../src/infrastructure/vision/ocr-fixtures.js";
import { makeMaskedDerivative } from "../src/modules/submissions/application/mask-image.js";
import { sha256Buffer } from "../src/core/hash.js";
import { canonicalizeRubric, validateRubric } from "../src/modules/assignments/domain/rubric.js";
import { buildProfileSummary, emptySummary } from "../src/modules/writing-profile/domain/profile.js";
import { SEED_IDS } from "./seed-ids.js";
import { DEMO_ASSIGNMENTS, DEMO_STUDENTS, DEMO_TEACHER_2, demoUuid } from "./demo-ids.js";

const NLXH4 = canonicalizeRubric(validateRubric({
  criteria: [
    { criterionId: "C1_STRUCTURE", name: "Bố cục", weight: "2.00", descriptor: "Đủ ba phần." },
    { criterionId: "C2_ARGUMENT", name: "Luận điểm", weight: "4.00", requiredElements: ["Giải thích", "Dẫn chứng"] },
    { criterionId: "C3_EXPRESSION", name: "Diễn đạt", weight: "2.00" },
    { criterionId: "C4_CREATIVITY", name: "Sáng tạo", weight: "2.00" },
  ],
}, "10.00", "0.25"));

const NLXH3 = canonicalizeRubric(validateRubric({
  criteria: [
    { criterionId: "A1_IDEA", name: "Ý tưởng", weight: "3.00", descriptor: "Nắm vấn đề." },
    { criterionId: "A2_EVIDENCE", name: "Dẫn chứng", weight: "3.00" },
    { criterionId: "A3_STYLE", name: "Diễn đạt", weight: "2.00" },
  ],
}, "8.00", "0.50"));

const NLVH3 = canonicalizeRubric(validateRubric({
  criteria: [
    { criterionId: "V1_CONTENT", name: "Nội dung", weight: "5.00", descriptor: "Nắm hình tượng." },
    { criterionId: "V2_FORM", name: "Hình thức", weight: "3.00" },
    { criterionId: "V3_LANGUAGE", name: "Ngôn ngữ", weight: "2.00" },
  ],
}, "10.00", "0.25"));

const ESSAY_STRONG =
  "Ý chí giúp người trẻ không bỏ cuộc khi gặp khó khăn. Tuy nhiên, kiên định không đồng nghĩa với bảo thủ. Em lấy gương một bạn lớp mình kiên trì ôn tập giữa áp lực thi cử, chứ không sao chép văn mẫu. 🙂";
const ESSAY_WEAK =
  "Người trẻ cần kiên định nhưng bài viết còn lặp ý. Câu văn ghép thiếu vế nên lập luận chưa chặt.";
const ESSAY_NLVH =
  "Sông Hương ở thượng nguồn hiện lên vừa trữ tình vừa dữ dội, như một sức sống mãnh liệt trước khi dịu dàng giữa thành phố Huế.";

const STUDENTS: Array<{ id: string; loginId: string; displayName: string }> = [
  { id: DEMO_STUDENTS.quan, loginId: "tran.minhquan", displayName: "Trần Minh Quân" },
  { id: DEMO_STUDENTS.thuong, loginId: "le.thuong", displayName: "Lê Thương" },
  { id: DEMO_STUDENTS.linh, loginId: "pham.linh", displayName: "Phạm Linh" },
  { id: DEMO_STUDENTS.nam, loginId: "hoang.nam", displayName: "Hoàng Nam" },
  { id: DEMO_STUDENTS.ha, loginId: "vo.ha", displayName: "Võ Hà" },
  { id: DEMO_STUDENTS.khoa, loginId: "dang.khoa", displayName: "Đặng Khoa" },
  { id: DEMO_STUDENTS.trang, loginId: "bui.trang", displayName: "Bùi Trang" },
  { id: DEMO_STUDENTS.duc, loginId: "ngo.duc", displayName: "Ngô Đức" },
  { id: DEMO_STUDENTS.yen, loginId: "do.yen", displayName: "Đỗ Yến" },
  { id: DEMO_STUDENTS.son, loginId: "mai.son", displayName: "Mai Sơn" },
];

type ProgressKind =
  | "unread"
  | "read"
  | "socratic"
  | "outline"
  | "privacy"
  | "ocr_review"
  | "ocr_failed"
  | "confirmed"
  | "ai_draft"
  | "published_done"
  | "published_failed"
  | "published_pending";

export async function seedDemoDatabase(prisma: EduLitPrisma, passwordHash: string, storage: PrivateStoragePort): Promise<void> {
  await upsertUser(prisma, { id: SEED_IDS.teacher, loginId: "dang.loan", displayName: "Cô Đặng Loan", role: "TEACHER", passwordHash });
  await upsertUser(prisma, { id: SEED_IDS.studentMy, loginId: "bui.hamy", displayName: "Bùi Hà My", role: "STUDENT", passwordHash });
  await upsertUser(prisma, { id: SEED_IDS.studentAn, loginId: "nguyen.an", displayName: "Nguyễn An", role: "STUDENT", passwordHash });
  await upsertUser(prisma, { id: DEMO_TEACHER_2, loginId: "pham.thuha", displayName: "Cô Phạm Thu Hà", role: "TEACHER", passwordHash });
  for (const student of STUDENTS) {
    await upsertUser(prisma, { ...student, role: "STUDENT", passwordHash });
  }

  await upsertAssignment(prisma, {
    id: DEMO_ASSIGNMENTS.nlxh10, teacherId: SEED_IDS.teacher, code: "DEMO-NLXH-10",
    title: "Nghị luận xã hội khối 10: Trách nhiệm với cộng đồng",
    instructions: "Viết khoảng 400 chữ về trách nhiệm của học sinh với cộng đồng xung quanh.",
    genre: "NLXH", gradeLevel: 10,
    learningMaterialText: "Ngữ liệu nhập tay: mỗi người đóng góp một phần nhỏ cũng làm cộng đồng vững hơn. Không phải trích dẫn tác phẩm.",
    rubric: NLXH3, maxScore: "8.00", scoreStep: "0.50", status: "PUBLISHED",
    publishedAt: new Date("2026-09-05T00:00:00.000Z"),
  });
  await upsertAssignment(prisma, {
    id: DEMO_ASSIGNMENTS.nlxh11, teacherId: SEED_IDS.teacher, code: "DEMO-NLXH-11",
    title: "Nghị luận xã hội khối 11: Trung thực trong học tập",
    instructions: "Bàn về trung thực khi học và thi. Không bắt buộc phản đề.",
    genre: "NLXH", gradeLevel: 11,
    learningMaterialText: "Một ý kiến cho rằng thành tích chỉ có ý nghĩa khi người trẻ giữ được sự trung thực.",
    rubric: NLXH4, maxScore: "10.00", scoreStep: "0.25", status: "PUBLISHED",
    publishedAt: new Date("2026-09-12T00:00:00.000Z"),
  });
  await upsertAssignment(prisma, {
    id: DEMO_ASSIGNMENTS.nlxh12, teacherId: SEED_IDS.teacher, code: "DEMO-NLXH-12",
    title: "Nghị luận xã hội: Bản lĩnh trước áp lực thành tích (pipeline mới)",
    instructions: "Viết khoảng 600 chữ. Đây là đề để chạy mới toàn bộ năm bước trên giao diện.",
    genre: "NLXH", gradeLevel: 12,
    learningMaterialText: "Áp lực thành tích dễ khiến người trẻ đánh đổi sự trung thực. Hãy lập luận từ quan sát đời sống học đường, không dùng văn mẫu.",
    rubric: NLXH4, maxScore: "10.00", scoreStep: "0.25", status: "PUBLISHED",
    publishedAt: new Date("2026-10-01T00:00:00.000Z"),
  });
  await upsertAssignment(prisma, {
    id: DEMO_ASSIGNMENTS.nlvh12, teacherId: SEED_IDS.teacher, code: "DEMO-NLVH-12",
    title: "Nghị luận văn học: Hình tượng sông Hương",
    instructions: "Phân tích nét trữ tình và sức sống của sông Hương ở thượng nguồn.",
    genre: "NLVH", gradeLevel: 12,
    learningMaterialText: "Ngữ liệu nhập tay mô tả sông Hương lúc còn là bản trường ca của rừng già. Không gán đây là trích dẫn nguyên văn tác phẩm.",
    rubric: NLVH3, maxScore: "10.00", scoreStep: "0.25", status: "PUBLISHED",
    publishedAt: new Date("2026-09-20T00:00:00.000Z"),
  });
  await upsertAssignment(prisma, {
    id: DEMO_ASSIGNMENTS.nlxhNext, teacherId: SEED_IDS.teacher, code: "DEMO-NLXH-NEXT",
    title: "Nghị luận xã hội: Dũng khí nhận lỗi",
    instructions: "Đề cùng thể loại NLXH để Socratic đọc profile sau khi bài trước được công bố.",
    genre: "NLXH", gradeLevel: 12,
    learningMaterialText: "Nhận lỗi đúng lúc là bản lĩnh, không phải yếu đuối.",
    rubric: NLXH4, maxScore: "10.00", scoreStep: "0.25", status: "PUBLISHED",
    publishedAt: new Date("2026-10-08T00:00:00.000Z"),
  });
  await upsertAssignment(prisma, {
    id: DEMO_ASSIGNMENTS.nlxhDraft, teacherId: SEED_IDS.teacher, code: "DEMO-NLXH-DRAFT",
    title: "Nháp NLXH: Chưa công bố",
    instructions: "Bản nháp giáo viên đang soạn.",
    genre: "NLXH", gradeLevel: 12,
    learningMaterialText: "Ngữ liệu nháp.",
    rubric: NLXH4, maxScore: "10.00", scoreStep: "0.25", status: "DRAFT",
  });
  await upsertAssignment(prisma, {
    id: DEMO_ASSIGNMENTS.nlvhDraft, teacherId: DEMO_TEACHER_2, code: "DEMO-NLVH-DRAFT",
    title: "Nháp NLVH của giáo viên thứ hai",
    instructions: "Dùng để thử ownership: giáo viên khác không sửa đề của cô Loan.",
    genre: "NLVH", gradeLevel: 11,
    learningMaterialText: "Ngữ liệu nháp NLVH.",
    rubric: NLVH3, maxScore: "10.00", scoreStep: "0.25", status: "DRAFT",
  });
  await upsertAssignment(prisma, {
    id: DEMO_ASSIGNMENTS.nlxhClosed, teacherId: SEED_IDS.teacher, code: "DEMO-NLXH-CLOSED",
    title: "Nghị luận xã hội: Đề đã đóng",
    instructions: "Đề đóng, không nhận phiên/nộp mới. Học sinh đã tham gia vẫn xem được ngữ liệu/kết quả.",
    genre: "NLXH", gradeLevel: 12,
    learningMaterialText: "Đề đóng sau khi một số em đã nộp.",
    rubric: NLXH4, maxScore: "10.00", scoreStep: "0.25", status: "CLOSED",
    publishedAt: new Date("2026-08-01T00:00:00.000Z"),
  });

  const cases: Array<{ studentId: string; assignmentId: string; kind: ProgressKind; text?: string; quote?: string }> = [
    { studentId: DEMO_STUDENTS.quan, assignmentId: DEMO_ASSIGNMENTS.nlxh12, kind: "unread" },
    { studentId: DEMO_STUDENTS.thuong, assignmentId: DEMO_ASSIGNMENTS.nlxh12, kind: "read" },
    { studentId: DEMO_STUDENTS.linh, assignmentId: DEMO_ASSIGNMENTS.nlxh12, kind: "socratic" },
    { studentId: DEMO_STUDENTS.nam, assignmentId: DEMO_ASSIGNMENTS.nlxh12, kind: "outline" },
    { studentId: DEMO_STUDENTS.ha, assignmentId: DEMO_ASSIGNMENTS.nlxh12, kind: "privacy" },
    { studentId: DEMO_STUDENTS.khoa, assignmentId: DEMO_ASSIGNMENTS.nlxh12, kind: "ocr_review" },
    { studentId: DEMO_STUDENTS.trang, assignmentId: DEMO_ASSIGNMENTS.nlxh12, kind: "confirmed", text: ESSAY_STRONG },
    { studentId: DEMO_STUDENTS.duc, assignmentId: DEMO_ASSIGNMENTS.nlxh12, kind: "ai_draft", text: ESSAY_WEAK },
    { studentId: DEMO_STUDENTS.yen, assignmentId: DEMO_ASSIGNMENTS.nlxh12, kind: "published_done", text: ESSAY_STRONG, quote: "kiên định không đồng nghĩa với bảo thủ" },
    { studentId: DEMO_STUDENTS.son, assignmentId: DEMO_ASSIGNMENTS.nlxh12, kind: "published_failed", text: ESSAY_WEAK, quote: "Câu văn ghép thiếu vế" },
    { studentId: SEED_IDS.studentMy, assignmentId: DEMO_ASSIGNMENTS.nlxh10, kind: "published_done", text: ESSAY_STRONG, quote: "không sao chép văn mẫu" },
    { studentId: SEED_IDS.studentMy, assignmentId: DEMO_ASSIGNMENTS.nlxh11, kind: "socratic" },
    { studentId: SEED_IDS.studentMy, assignmentId: DEMO_ASSIGNMENTS.nlvh12, kind: "published_done", text: ESSAY_NLVH, quote: "vừa trữ tình vừa dữ dội" },
    { studentId: SEED_IDS.studentMy, assignmentId: DEMO_ASSIGNMENTS.nlxhNext, kind: "unread" },
    { studentId: SEED_IDS.studentAn, assignmentId: DEMO_ASSIGNMENTS.nlxh10, kind: "confirmed", text: ESSAY_WEAK },
    { studentId: SEED_IDS.studentAn, assignmentId: DEMO_ASSIGNMENTS.nlxhClosed, kind: "published_done", text: ESSAY_STRONG, quote: "Ý chí giúp người trẻ" },
    { studentId: DEMO_STUDENTS.thuong, assignmentId: DEMO_ASSIGNMENTS.nlxh10, kind: "privacy" },
    { studentId: DEMO_STUDENTS.linh, assignmentId: DEMO_ASSIGNMENTS.nlxh10, kind: "ocr_failed" },
    { studentId: DEMO_STUDENTS.nam, assignmentId: DEMO_ASSIGNMENTS.nlxh11, kind: "socratic" },
    { studentId: DEMO_STUDENTS.ha, assignmentId: DEMO_ASSIGNMENTS.nlvh12, kind: "outline" },
    { studentId: DEMO_STUDENTS.khoa, assignmentId: DEMO_ASSIGNMENTS.nlxh11, kind: "ocr_review" },
    { studentId: DEMO_STUDENTS.trang, assignmentId: DEMO_ASSIGNMENTS.nlxh10, kind: "published_pending", text: ESSAY_STRONG, quote: "không bỏ cuộc khi gặp khó khăn" },
    { studentId: DEMO_STUDENTS.duc, assignmentId: DEMO_ASSIGNMENTS.nlxh11, kind: "read" },
    { studentId: DEMO_STUDENTS.yen, assignmentId: DEMO_ASSIGNMENTS.nlvh12, kind: "unread" },
  ];
  if (cases.length !== 24) throw new Error(`demo seed requires 24 progress cases, got ${cases.length}`);

  for (const item of cases) {
    await applyProgress(prisma, storage, item);
  }
}

async function applyProgress(
  prisma: EduLitPrisma,
  storage: PrivateStoragePort,
  item: { studentId: string; assignmentId: string; kind: ProgressKind; text?: string; quote?: string },
) {
  const key = `${item.studentId}:${item.assignmentId}`;
  if (item.kind === "unread") return;
  await prisma.assignmentProgress.upsert({
    where: { studentId_assignmentId: { studentId: item.studentId, assignmentId: item.assignmentId } },
    create: { studentId: item.studentId, assignmentId: item.assignmentId, readAt: new Date("2026-10-02T00:00:00.000Z") },
    update: {},
  });
  if (item.kind === "read") return;

  const assignment = await prisma.assignment.findUniqueOrThrow({ where: { id: item.assignmentId } });
  if (item.kind === "socratic" || item.kind === "outline" || needsSession(item.kind)) {
    await ensureSession(prisma, item.studentId, assignment, item.kind !== "socratic");
  }
  if (item.kind === "socratic" || item.kind === "outline") return;

  const text = item.text ?? ESSAY_STRONG;
  const draft = await ensureImageDraft(prisma, storage, item.studentId, assignment, text, item.kind);
  if (item.kind === "privacy" || item.kind === "ocr_review" || item.kind === "ocr_failed") return;

  const submission = await ensureConfirmedSubmission(prisma, draft.id, item.studentId, assignment, text);
  if (item.kind === "confirmed") return;

  const published = item.kind.startsWith("published");
  const assessmentId = demoUuid(`assessment:${key}`);
  await ensureAssessment(prisma, {
    id: assessmentId,
    submissionId: submission.id,
    studentId: item.studentId,
    assignment,
    text,
    status: published ? "PUBLISHED" : "AI_DRAFT",
  });
  if (item.kind === "ai_draft") return;

  const jobStatus = item.kind === "published_failed" ? "FAILED" : item.kind === "published_pending" ? "PENDING" : "COMPLETED";
  await prisma.profileExtractionJob.upsert({
    where: { assessmentId },
    create: { assessmentId, status: jobStatus, attempts: jobStatus === "PENDING" ? 0 : 1, errorCode: jobStatus === "FAILED" ? "AI_TIMEOUT" : null, noObservations: false },
    update: {},
  });
  if (jobStatus !== "COMPLETED" || !item.quote) return;
  await ensureObservation(prisma, {
    id: demoUuid(`obs:${key}`),
    studentId: item.studentId,
    assessmentId,
    genre: assignment.genre,
    text,
    quote: item.quote,
  });
  await ensureProfile(prisma, item.studentId);
}

function needsSession(kind: ProgressKind) {
  return kind === "privacy" || kind === "ocr_review" || kind === "ocr_failed" || kind === "confirmed" || kind === "ai_draft" || kind.startsWith("published");
}

async function ensureSession(prisma: EduLitPrisma, studentId: string, assignment: { id: string; code: string; title: string; instructions: string; genre: string; gradeLevel: number; learningMaterialText: string; rubric: Prisma.JsonValue; maxScore: { toString(): string }; scoreStep: { toString(): string }; status: string; publishedAt: Date | null }, withOutline: boolean) {
  const existing = await prisma.socraticSession.findUnique({ where: { studentId_assignmentId: { studentId, assignmentId: assignment.id } } });
  if (existing) return existing;
  return prisma.socraticSession.create({
    data: {
      id: demoUuid(`session:${studentId}:${assignment.id}`),
      studentId,
      assignmentId: assignment.id,
      contextSnapshot: {
        assignmentId: assignment.id, code: assignment.code, title: assignment.title, instructions: assignment.instructions,
        genre: assignment.genre, gradeLevel: assignment.gradeLevel, learningMaterialText: assignment.learningMaterialText,
        rubric: assignment.rubric, maxScore: assignment.maxScore.toString(), scoreStep: assignment.scoreStep.toString(),
        status: assignment.status, publishedAt: assignment.publishedAt?.toISOString() ?? null, dueAt: null, snapshottedAt: "2026-10-02T00:00:00.000Z",
      } as Prisma.InputJsonValue,
      outline: withOutline
        ? { sections: [{ id: "open", title: "Mở bài", points: ["Đặt vấn đề từ đời sống học đường"] }, { id: "body", title: "Thân bài", points: ["Luận điểm 1", "Dẫn chứng"] }, { id: "close", title: "Kết bài", points: ["Bài học hành động"] }] }
        : { sections: [] },
      outlineRevision: withOutline ? 2 : 1,
      status: "ACTIVE",
    },
  });
}

async function ensureImageDraft(
  prisma: EduLitPrisma,
  storage: PrivateStoragePort,
  studentId: string,
  assignment: { id: string; code: string; title: string; instructions: string; genre: string; gradeLevel: number; learningMaterialText: string; rubric: Prisma.JsonValue; maxScore: { toString(): string }; scoreStep: { toString(): string }; status: string; publishedAt: Date | null },
  text: string,
  kind: ProgressKind,
) {
  const existing = await prisma.submissionDraft.findUnique({ where: { studentId_assignmentId: { studentId, assignmentId: assignment.id } }, include: { pages: true, ocrRevisions: true } });
  const status = kind === "privacy" ? "AWAITING_PRIVACY_REVIEW" : kind === "ocr_failed" ? "OCR_FAILED" : kind === "ocr_review" ? "OCR_REVIEW" : "CONFIRMED";
  if (existing) return existing;
  const snapshot = {
    assignmentId: assignment.id, code: assignment.code, title: assignment.title, instructions: assignment.instructions,
    genre: assignment.genre, gradeLevel: assignment.gradeLevel, learningMaterialText: assignment.learningMaterialText,
    rubric: assignment.rubric, maxScore: assignment.maxScore.toString(), scoreStep: assignment.scoreStep.toString(),
    status: assignment.status, publishedAt: assignment.publishedAt?.toISOString() ?? null, dueAt: null, snapshottedAt: "2026-10-02T00:00:00.000Z",
  };
  const draft = await prisma.submissionDraft.create({
    data: {
      id: demoUuid(`draft:${studentId}:${assignment.id}`),
      studentId, assignmentId: assignment.id,
      assignmentSnapshot: snapshot as Prisma.InputJsonValue,
      status, revision: 3,
    },
  });
  const originalPng = await renderOcrFixturePng("nlxh-p1");
  const original = await storage.put({ data: originalPng, mimeType: "image/png", extension: "png" });
  const derivativeData = await makeMaskedDerivative(originalPng, [{ x: 0, y: 0, width: 1, height: 0.18 }]);
  const derivative = await storage.put({ data: derivativeData, mimeType: "image/jpeg", extension: "jpg" });
  const page = await prisma.submissionDraftPage.create({
    data: {
      id: demoUuid(`page:${draft.id}:0`),
      draftId: draft.id, pageIndex: 0, originalFileId: original.id, derivativeFileId: derivative.id,
      mimeType: "image/png", contentHash: sha256Buffer(derivativeData), masks: [{ x: 0, y: 0, width: 1, height: 0.18 }],
    },
  });
  if (status === "OCR_REVIEW" || status === "CONFIRMED") {
    await prisma.ocrRevision.create({
      data: {
        draftId: draft.id, sourceRevision: 3, revision: 1, status: status === "CONFIRMED" ? "CONFIRMED" : "COMPLETED",
        rawPages: { pages: [{ pageId: page.id, segments: [{ id: "s1", text, needsReview: false }] }] } as Prisma.InputJsonValue,
        correctedText: text, provider: "mock", modelName: "demo-fixture/mock", promptVersion: "ocr-transcription.v1",
      },
    });
  }
  if (status === "OCR_FAILED") {
    await prisma.submissionDraft.update({ where: { id: draft.id }, data: { ocrErrorCode: "OCR_FIXTURE_MISSING" } });
  }
  return prisma.submissionDraft.findUniqueOrThrow({ where: { id: draft.id }, include: { pages: true, ocrRevisions: true } });
}

async function ensureConfirmedSubmission(
  prisma: EduLitPrisma,
  draftId: string,
  studentId: string,
  assignment: { id: string; code: string; title: string; instructions: string; genre: string; gradeLevel: number; learningMaterialText: string; rubric: Prisma.JsonValue; maxScore: { toString(): string }; scoreStep: { toString(): string }; status: string; publishedAt: Date | null },
  text: string,
) {
  const existing = await prisma.submission.findUnique({ where: { studentId_assignmentId: { studentId, assignmentId: assignment.id } } });
  if (existing) return existing;
  return prisma.submission.create({
    data: {
      id: demoUuid(`sub:${studentId}:${assignment.id}`),
      studentId, assignmentId: assignment.id, source: "IMAGE_OCR", sourceDraftId: draftId,
      text, contentHash: sha256Utf8(text),
      assignmentSnapshot: {
        assignmentId: assignment.id, code: assignment.code, title: assignment.title, instructions: assignment.instructions,
        genre: assignment.genre, gradeLevel: assignment.gradeLevel, learningMaterialText: assignment.learningMaterialText,
        rubric: assignment.rubric, maxScore: assignment.maxScore.toString(), scoreStep: assignment.scoreStep.toString(),
        status: assignment.status, publishedAt: assignment.publishedAt?.toISOString() ?? null, dueAt: null, snapshottedAt: "2026-10-02T00:00:00.000Z",
      } as Prisma.InputJsonValue,
      submittedAt: new Date("2026-10-03T00:00:00.000Z"),
    },
  });
}

async function ensureAssessment(
  prisma: EduLitPrisma,
  input: { id: string; submissionId: string; studentId: string; assignment: { rubric: Prisma.JsonValue; maxScore: { toString(): string }; genre: string }; text: string; status: "AI_DRAFT" | "PUBLISHED" },
) {
  const existing = await prisma.assessment.findUnique({ where: { submissionId: input.submissionId } });
  if (existing) return existing;
  const quote = input.text.slice(0, Math.min(18, input.text.length));
  const rubric = input.assignment.rubric as { criteria: Array<{ criterionId: string; weight: string }> };
  const evaluations = rubric.criteria.map((criterion, index) => ({
    criterionId: criterion.criterionId,
    awardedScore: index === 0 ? "1.00" : "1.00",
    comment: "Nhận xét fixture demo, không phải kết quả Gemini/OpenAI live.",
    strengths: ["Có câu chữ liên quan tiêu chí"],
    weaknesses: [],
    evidence: [{ quote, start: 0, end: quote.length }],
    missingElements: [],
  }));
  const total = evaluations.reduce((sum, item) => sum + Number(item.awardedScore), 0).toFixed(2);
  return prisma.assessment.create({
    data: {
      id: input.id, submissionId: input.submissionId, studentId: input.studentId,
      rubricSnapshot: input.assignment.rubric as Prisma.InputJsonValue,
      detailedEvaluations: evaluations as Prisma.InputJsonValue,
      aiDetailedEvaluations: evaluations as Prisma.InputJsonValue,
      totalScore: total, aiTotalScore: total, maxScore: input.assignment.maxScore.toString(),
      status: input.status, modelName: "demo-fixture/mock", provider: "mock", responseMode: "fixture",
      promptVersion: "seed-demo-v1", assessedAt: new Date("2026-10-04T00:00:00.000Z"),
      publishedAt: input.status === "PUBLISHED" ? new Date("2026-10-04T00:00:00.000Z") : null,
    },
  });
}

async function ensureObservation(
  prisma: EduLitPrisma,
  data: { id: string; studentId: string; assessmentId: string; genre: string; text: string; quote: string },
) {
  const existing = await prisma.writingObservation.findUnique({
    where: { studentId_assessmentId_featureKey: { studentId: data.studentId, assessmentId: data.assessmentId, featureKey: `${data.genre}|STYLE|WORD_CHOICE` } },
  });
  if (existing) return;
  const { start, end } = offsetsForQuote(data.text, data.quote);
  await prisma.writingObservation.create({
    data: {
      id: data.id, studentId: data.studentId, assessmentId: data.assessmentId,
      kind: "STYLE", featureKey: `${data.genre}|STYLE|WORD_CHOICE`,
      description: "Bài có cụm từ cụ thể, quan sát được trong đoạn nguồn.",
      genre: data.genre, evidenceQuote: data.quote, evidenceStart: start, evidenceEnd: end,
      status: "PROVISIONAL", provider: "mock", modelName: "demo-fixture/mock", promptVersion: "seed-demo-v1",
      observedAt: new Date("2026-10-04T00:00:00.000Z"),
    },
  });
}

async function ensureProfile(prisma: EduLitPrisma, studentId: string) {
  const existing = await prisma.writingProfile.findUnique({ where: { studentId } });
  if (existing) return;
  const rows = await prisma.writingObservation.findMany({
    where: { studentId, status: { not: "INVALIDATED" } },
    include: { assessment: { include: { submission: true } } },
  });
  const built = buildProfileSummary(rows.map((row) => ({
    id: row.id, kind: row.kind, featureKey: row.featureKey, description: row.description, status: row.status,
    assessmentId: row.assessmentId, assignmentId: row.assessment.submission.assignmentId, observedAt: row.observedAt,
  })));
  await prisma.writingProfile.create({
    data: {
      id: demoUuid(`profile:${studentId}`), studentId,
      declaredGoals: { items: [] },
      summary: (built.summary ?? emptySummary()) as Prisma.InputJsonValue,
      observationIds: built.observationIds, version: 1,
    },
  });
}

async function upsertUser(prisma: EduLitPrisma, data: { id: string; loginId: string; displayName: string; role: "TEACHER" | "STUDENT"; passwordHash: string }) {
  const byId = await prisma.user.findUnique({ where: { id: data.id } });
  if (byId) return;
  const byLogin = await prisma.user.findUnique({ where: { loginId: data.loginId } });
  if (byLogin) return;
  await prisma.user.create({ data: { ...data, status: "ACTIVE" } });
}

async function upsertAssignment(prisma: EduLitPrisma, data: {
  id: string; teacherId: string; code: string; title: string; instructions: string; genre: string; gradeLevel: number;
  learningMaterialText: string; rubric: Prisma.InputJsonValue; maxScore: string; scoreStep: string;
  status: "DRAFT" | "PUBLISHED" | "CLOSED"; publishedAt?: Date;
}) {
  await prisma.assignment.upsert({
    where: { code: data.code },
    create: { ...data, publishedAt: data.status === "DRAFT" ? null : (data.publishedAt ?? new Date()) },
    update: {},
  });
}
