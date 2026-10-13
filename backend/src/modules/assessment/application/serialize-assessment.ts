import { decimalString } from "../../../core/decimal.js";
import type { Assessment, Submission } from "../../../generated/prisma/client.js";
import type { CriterionEvaluation } from "../domain/evaluation.js";

export type SubmissionView = {
  id: string;
  studentId: string;
  assignmentId: string;
  socraticSessionId: string | null;
  text: string;
  contentHash: string;
  submittedAt: string;
  createdAt: string;
};

export type StudentAssessmentView =
  | { status: "PENDING" }
  | {
      status: "PUBLISHED";
      id: string;
      totalScore: string;
      maxScore: string;
      detailedEvaluations: CriterionEvaluation[];
      publishedAt: string | null;
      assessedAt: string;
      promptVersion: string;
      modelName: string;
    };

export type TeacherAssessmentView = {
  id: string;
  submissionId: string;
  studentId: string;
  status: "AI_DRAFT" | "PUBLISHED";
  totalScore: string;
  maxScore: string;
  detailedEvaluations: CriterionEvaluation[];
  rubricSnapshot: unknown;
  modelName: string;
  promptVersion: string;
  assessedAt: string;
  publishedAt: string | null;
  createdAt: string;
};

export function toSubmissionDto(row: Submission, _audience: "student" | "teacher"): SubmissionView {
  return {
    id: row.id,
    studentId: row.studentId,
    assignmentId: row.assignmentId,
    socraticSessionId: row.socraticSessionId,
    text: row.text,
    contentHash: row.contentHash,
    submittedAt: row.submittedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toStudentAssessmentView(row: Assessment | null): StudentAssessmentView {
  if (!row || row.status !== "PUBLISHED") {
    return { status: "PENDING" };
  }
  return {
    status: "PUBLISHED",
    id: row.id,
    totalScore: decimalString(row.totalScore),
    maxScore: decimalString(row.maxScore),
    detailedEvaluations: row.detailedEvaluations as CriterionEvaluation[],
    publishedAt: row.publishedAt?.toISOString() ?? null,
    assessedAt: row.assessedAt.toISOString(),
    promptVersion: row.promptVersion,
    modelName: row.modelName,
  };
}

export function toTeacherAssessmentView(row: Assessment): TeacherAssessmentView {
  return {
    id: row.id,
    submissionId: row.submissionId,
    studentId: row.studentId,
    status: row.status,
    totalScore: decimalString(row.totalScore),
    maxScore: decimalString(row.maxScore),
    detailedEvaluations: row.detailedEvaluations as CriterionEvaluation[],
    rubricSnapshot: row.rubricSnapshot,
    modelName: row.modelName,
    promptVersion: row.promptVersion,
    assessedAt: row.assessedAt.toISOString(),
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
