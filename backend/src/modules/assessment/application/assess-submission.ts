import { Prisma } from "../../../generated/prisma/client.js";
import { DomainError } from "../../../core/errors.js";
import type { AssessmentAiPort, AssessmentAiUsage } from "../../../infrastructure/ai/assessment-ai.port.js";
import type { EduLitPrisma } from "../../../infrastructure/database/prisma.client.js";
import type { AssignmentSnapshot } from "../../assignments/domain/rubric.js";
import { assignmentSnapshotFromContext } from "../../assignments/domain/snapshot.js";
import type { AssessmentActor } from "../domain/actor.js";
import { ASSESSMENT_PROMPT_VERSION } from "../domain/output.js";
import type { ScoringInput } from "../domain/scoring-input.js";
import { loadAssessmentPromptBundle } from "../prompt-assets.js";
import { assertActiveActor } from "./assert-actor.js";
import { assertScoringInputIsolated, buildScoringPayload } from "./build-scoring-payload.js";
import { lockStudentThenAssignment, lockTeacherRow } from "./lock-assessment.js";
import { saveAssessment } from "./save-assessment.js";
import { toTeacherAssessmentView, type TeacherAssessmentView } from "./serialize-assessment.js";
import { parseAssessmentModelOutput } from "./validate-assessment-output.js";

export type AssessSubmissionResult = {
  assessment: TeacherAssessmentView;
  replayed: boolean;
  scoringInput: ScoringInput;
  usage?: AssessmentAiUsage;
  latencyMs?: number;
};

export async function assessSubmission(
  prisma: EduLitPrisma,
  ai: AssessmentAiPort,
  actor: AssessmentActor,
  input: { submissionId: string },
): Promise<AssessSubmissionResult> {
  const teacher = await assertActiveActor(prisma, actor, "TEACHER");
  const loaded = await loadOwnedSubmissionForTeacher(prisma, teacher.id, input.submissionId);
  const snapshot = snapshotFromSubmission(loaded.submission.assignmentSnapshot);
  const built = buildScoringPayload(snapshot, loaded.submission.text);
  assertScoringInputIsolated(built.scoringInput);

  const existing = await prisma.assessment.findUnique({ where: { submissionId: loaded.submission.id } });
  if (existing) {
    return {
      assessment: toTeacherAssessmentView(existing),
      replayed: true,
      scoringInput: built.scoringInput,
    };
  }

  const bundle = loadAssessmentPromptBundle();
  const generated = await ai.grade({
    systemInstruction: bundle.systemInstruction,
    userPayload: built.userPayload,
    responseJsonSchema: bundle.providerSchema,
    promptVersion: bundle.promptVersion,
    scoringInput: built.scoringInput,
  });
  const parsed = parseAssessmentModelOutput(generated.output, snapshot, loaded.submission.text);

  const persisted = await prisma.$transaction(async (tx) => {
    await lockStudentThenAssignment(tx, loaded.submission.studentId, loaded.submission.assignmentId);
    const teacherRow = await lockTeacherRow(tx, teacher.id);
    if (teacherRow.role !== "TEACHER") {
      throw new DomainError("ACTOR_FORBIDDEN", "only TEACHER actors may grade submissions");
    }
    if (teacherRow.status !== "ACTIVE") {
      throw new DomainError("ACTOR_INACTIVE", "account is INACTIVE");
    }
    const assignment = await tx.assignment.findUniqueOrThrow({ where: { id: loaded.submission.assignmentId } });
    if (assignment.teacherId !== teacher.id) {
      throw new DomainError("ASSESSMENT_OWNERSHIP", "assignment is not owned by this teacher");
    }
    const submission = await tx.submission.findUniqueOrThrow({ where: { id: loaded.submission.id } });
    if (submission.contentHash !== loaded.submission.contentHash || submission.text !== loaded.submission.text) {
      throw new DomainError("SUBMISSION_CONFLICT", "submission content changed while grading");
    }
    const winner = await tx.assessment.findUnique({ where: { submissionId: submission.id } });
    if (winner) {
      return { row: winner, replayed: true as const };
    }
    try {
      const created = await saveAssessment(tx, {
        submissionId: submission.id,
        detailedEvaluations: parsed.evaluations,
        totalScore: parsed.totalScore,
        status: "AI_DRAFT",
        modelName: generated.model,
        provider: generated.provider,
        responseMode: generated.provider === "mock" ? "mock" : "model",
        promptVersion: generated.promptVersion || bundle.promptVersion || ASSESSMENT_PROMPT_VERSION,
        assessedAt: new Date(),
      });
      return { row: created, replayed: false as const };
    } catch (error) {
      if (error instanceof DomainError && error.code === "ASSESSMENT_UNIQUE") {
        const after = await tx.assessment.findUniqueOrThrow({ where: { submissionId: submission.id } });
        return { row: after, replayed: true as const };
      }
      throw error;
    }
  });

  return {
    assessment: toTeacherAssessmentView(persisted.row),
    replayed: persisted.replayed,
    scoringInput: built.scoringInput,
    usage: persisted.replayed ? undefined : generated.usage,
    latencyMs: persisted.replayed ? undefined : generated.latencyMs,
  };
}

export async function loadOwnedSubmissionForTeacher(
  prisma: EduLitPrisma,
  teacherId: string,
  submissionId: string,
) {
  const submission = await prisma.submission.findUnique({ where: { id: submissionId } });
  if (!submission) {
    throw new DomainError("SUBMISSION_NOT_FOUND", "submission not found");
  }
  const assignment = await prisma.assignment.findUnique({ where: { id: submission.assignmentId } });
  if (!assignment || assignment.teacherId !== teacherId) {
    throw new DomainError("ASSESSMENT_OWNERSHIP", "assignment is not owned by this teacher");
  }
  return { submission, assignment };
}

export function snapshotFromSubmission(value: unknown): AssignmentSnapshot {
  return assignmentSnapshotFromContext(value, new Date());
}
