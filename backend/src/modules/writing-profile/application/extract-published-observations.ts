import { DomainError } from "../../../core/errors.js";
import type { WritingObservationAiPort } from "../../../infrastructure/ai/writing-observation-ai.port.js";
import type { EduLitPrisma } from "../../../infrastructure/database/prisma.client.js";
import type { AssessmentActor } from "../../assessment/domain/actor.js";
import { assertActiveActor } from "../../assessment/application/assert-actor.js";
import { snapshotFromSubmission } from "../../assessment/application/assess-submission.js";
import { lockStudentThenAssignment, lockTeacherRow } from "../../assessment/application/lock-assessment.js";
import { loadWritingProfilePromptBundle } from "../prompt-assets.js";
import { buildExtractionPayload } from "./build-extraction-payload.js";
import { saveObservationsInTransaction } from "./save-observations.js";
import { parseWritingObservationOutput } from "./validate-extraction-output.js";

export type ExtractPublishedObservationsResult = {
  outcome: "extracted" | "replayed" | "no_observations";
  assessmentId: string;
  studentId: string;
  observations: Array<{
    id: string;
    featureKey: string;
    kind: string;
    description: string;
    genre: string;
    evidenceQuote: string;
    evidenceStart: number;
    evidenceEnd: number;
    status: string;
    observedAt: string;
  }>;
  profileVersion: number | null;
};

export async function extractPublishedObservations(
  prisma: EduLitPrisma,
  ai: WritingObservationAiPort,
  actor: AssessmentActor,
  input: { assessmentId: string },
): Promise<ExtractPublishedObservationsResult> {
  const teacher = await assertActiveActor(prisma, actor, "TEACHER");
  const loaded = await loadPublishedSourceForTeacher(prisma, teacher.id, input.assessmentId);
  if (loaded.assessment.status !== "PUBLISHED") {
    throw new DomainError("OBSERVATION_STATUS", "observations require a PUBLISHED assessment");
  }

  const existing = await prisma.writingObservation.findMany({
    where: { assessmentId: loaded.assessment.id, studentId: loaded.submission.studentId },
    orderBy: { observedAt: "desc" },
  });
  if (existing.length > 0) {
    return toResult("replayed", loaded, existing, await currentProfileVersion(prisma, loaded.submission.studentId));
  }

  const snapshot = snapshotFromSubmission(loaded.submission.assignmentSnapshot);
  const built = buildExtractionPayload({
    submissionText: loaded.submission.text,
    contentHash: loaded.submission.contentHash,
    snapshot,
    totalScore: loaded.assessment.totalScore,
    maxScore: loaded.assessment.maxScore,
    detailedEvaluations: loaded.assessment.detailedEvaluations,
  });
  const expectedProfileVersion = await currentProfileVersion(prisma, loaded.submission.studentId);
  const bundle = loadWritingProfilePromptBundle();
  const generated = await ai.extract({
    systemInstruction: bundle.systemInstruction,
    userPayload: built.userPayload,
    responseJsonSchema: bundle.providerSchema,
    promptVersion: bundle.promptVersion,
    extractionInput: built.extractionInput,
  });
  const parsed = parseWritingObservationOutput(generated.output, loaded.submission.text, snapshot.genre);

  return prisma.$transaction(async (tx) => {
    await lockStudentThenAssignment(tx, loaded.submission.studentId, loaded.submission.assignmentId);
    const teacherRow = await lockTeacherRow(tx, teacher.id);
    if (teacherRow.role !== "TEACHER" || teacherRow.status !== "ACTIVE") {
      throw new DomainError(
        teacherRow.status !== "ACTIVE" ? "ACTOR_INACTIVE" : "ACTOR_FORBIDDEN",
        "teacher may not persist observations",
      );
    }
    const assignment = await tx.assignment.findUniqueOrThrow({ where: { id: loaded.submission.assignmentId } });
    if (assignment.teacherId !== teacher.id) {
      throw new DomainError("ASSESSMENT_OWNERSHIP", "assignment is not owned by this teacher");
    }
    const assessment = await tx.assessment.findUniqueOrThrow({ where: { id: loaded.assessment.id } });
    if (assessment.status !== "PUBLISHED") {
      throw new DomainError("OBSERVATION_STATUS", "observations require a PUBLISHED assessment");
    }
    const submission = await tx.submission.findUniqueOrThrow({ where: { id: loaded.submission.id } });
    if (submission.contentHash !== loaded.submission.contentHash || submission.text !== loaded.submission.text) {
      throw new DomainError("SUBMISSION_CONFLICT", "submission content changed while extracting");
    }
    const already = await tx.writingObservation.findMany({
      where: { assessmentId: assessment.id, studentId: submission.studentId },
      orderBy: { observedAt: "desc" },
    });
    if (already.length > 0) {
      const version = await currentProfileVersion(tx, submission.studentId);
      return toResult("replayed", loaded, already, version);
    }
    if (parsed.length === 0) {
      const version = await currentProfileVersion(tx, submission.studentId);
      return toResult("no_observations", loaded, [], version);
    }
    await saveObservationsInTransaction(tx, {
      studentId: submission.studentId,
      assessmentId: assessment.id,
      observations: parsed,
      expectedProfileVersion,
      provider: generated.provider,
      modelName: generated.model,
      promptVersion: generated.promptVersion,
    });
    const saved = await tx.writingObservation.findMany({
      where: { assessmentId: assessment.id, studentId: submission.studentId },
      orderBy: { observedAt: "desc" },
    });
    const version = await currentProfileVersion(tx, submission.studentId);
    return toResult("extracted", loaded, saved, version);
  });
}

export async function loadPublishedSourceForTeacher(
  prisma: EduLitPrisma,
  teacherId: string,
  assessmentId: string,
) {
  const assessment = await prisma.assessment.findUnique({ where: { id: assessmentId } });
  if (!assessment) {
    throw new DomainError("ASSESSMENT_MISSING", "assessment not found");
  }
  const submission = await prisma.submission.findUnique({ where: { id: assessment.submissionId } });
  if (!submission) {
    throw new DomainError("ASSESSMENT_MISSING", "assessment not found");
  }
  const assignment = await prisma.assignment.findUnique({ where: { id: submission.assignmentId } });
  if (!assignment || assignment.teacherId !== teacherId) {
    throw new DomainError("ASSESSMENT_OWNERSHIP", "assignment is not owned by this teacher");
  }
  return { assessment, submission, assignment };
}

async function currentProfileVersion(
  prisma: { writingProfile: { findUnique: EduLitPrisma["writingProfile"]["findUnique"] } },
  studentId: string,
): Promise<number> {
  const profile = await prisma.writingProfile.findUnique({ where: { studentId } });
  return profile?.version ?? 0;
}

function toResult(
  outcome: ExtractPublishedObservationsResult["outcome"],
  loaded: { assessment: { id: string }; submission: { studentId: string } },
  rows: Array<{
    id: string;
    featureKey: string;
    kind: string;
    description: string;
    genre: string;
    evidenceQuote: string;
    evidenceStart: number;
    evidenceEnd: number;
    status: string;
    observedAt: Date;
  }>,
  profileVersion: number,
): ExtractPublishedObservationsResult {
  return {
    outcome,
    assessmentId: loaded.assessment.id,
    studentId: loaded.submission.studentId,
    observations: rows.map((row) => ({
      id: row.id,
      featureKey: row.featureKey,
      kind: row.kind,
      description: row.description,
      genre: row.genre,
      evidenceQuote: row.evidenceQuote,
      evidenceStart: row.evidenceStart,
      evidenceEnd: row.evidenceEnd,
      status: row.status,
      observedAt: row.observedAt.toISOString(),
    })),
    profileVersion: rows.length === 0 && profileVersion === 0 ? null : profileVersion,
  };
}
