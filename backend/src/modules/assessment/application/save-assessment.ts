import { Prisma } from "../../../generated/prisma/client.js";
import { DomainError } from "../../../core/errors.js";
import type { EduLitPrisma } from "../../../infrastructure/database/prisma.client.js";
import type { AssignmentSnapshot } from "../../assignments/domain/rubric.js";
import {
  DEFAULT_MODEL_NAME,
  assertRubricSnapshotMatchesAssignment,
  validateAssessmentScores,
} from "../domain/evaluation.js";

export type SaveAssessmentInput = {
  submissionId: string;
  rubricSnapshot?: unknown;
  detailedEvaluations: unknown;
  totalScore: string | number;
  status?: "AI_DRAFT" | "PUBLISHED";
  modelName?: string;
  promptVersion: string;
  assessedAt?: Date;
};

export async function saveAssessment(prisma: EduLitPrisma, input: SaveAssessmentInput) {
  const submission = await prisma.submission.findUnique({ where: { id: input.submissionId } });
  if (!submission) {
    throw new DomainError("ASSESSMENT_SUBMISSION", "submission not found");
  }
  const snapshot = submission.assignmentSnapshot as AssignmentSnapshot;
  const rubricFromSubmission = snapshot.rubric;
  const rubricToStore = input.rubricSnapshot ?? rubricFromSubmission;
  assertRubricSnapshotMatchesAssignment(
    rubricFromSubmission,
    rubricToStore,
    snapshot.maxScore,
    snapshot.scoreStep,
  );
  const scores = validateAssessmentScores({
    rubric: rubricToStore,
    maxScore: snapshot.maxScore,
    scoreStep: snapshot.scoreStep,
    evaluations: input.detailedEvaluations,
    totalScore: input.totalScore,
  });

  const status = input.status ?? "AI_DRAFT";
  const now = input.assessedAt ?? new Date();

  try {
    return await prisma.assessment.create({
      data: {
        submissionId: submission.id,
        studentId: submission.studentId,
        rubricSnapshot: scores.rubric as Prisma.InputJsonValue,
        detailedEvaluations: scores.evaluations as Prisma.InputJsonValue,
        totalScore: scores.totalScore,
        maxScore: scores.maxScore,
        status,
        modelName: input.modelName ?? DEFAULT_MODEL_NAME,
        promptVersion: input.promptVersion,
        assessedAt: now,
        publishedAt: status === "PUBLISHED" ? now : null,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new DomainError("ASSESSMENT_UNIQUE", "submission already has an assessment");
    }
    throw error;
  }
}

export async function publishAssessment(prisma: EduLitPrisma, assessmentId: string) {
  const assessment = await prisma.assessment.findUnique({ where: { id: assessmentId } });
  if (!assessment) {
    throw new DomainError("ASSESSMENT_MISSING", "assessment not found");
  }
  if (assessment.status === "PUBLISHED") {
    return assessment;
  }
  return prisma.assessment.update({
    where: { id: assessmentId },
    data: {
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });
}
