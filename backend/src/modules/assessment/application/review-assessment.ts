import { Prisma } from "../../../generated/prisma/client.js";
import { DomainError } from "../../../core/errors.js";
import type { EduLitPrisma } from "../../../infrastructure/database/prisma.client.js";
import type { AssessmentActor } from "../domain/actor.js";
import { validateAssessmentScores } from "../domain/evaluation.js";
import { assertActiveActor } from "./assert-actor.js";
import { snapshotFromSubmission } from "./assess-submission.js";
import { lockStudentThenAssignment, lockTeacherRow } from "./lock-assessment.js";
import { toTeacherAssessmentView } from "./serialize-assessment.js";

/** Saves a teacher's official review while preserving the original model draft. */
export async function reviewAssessment(
  prisma: EduLitPrisma,
  actor: AssessmentActor,
  input: { assessmentId: string; expectedReviewRevision: number; detailedEvaluations: unknown; totalScore: string; reason?: string },
) {
  const teacher = await assertActiveActor(prisma, actor, "TEACHER");
  if (!Number.isInteger(input.expectedReviewRevision) || input.expectedReviewRevision < 0) throw new DomainError("ASSESSMENT_CONFLICT", "expectedReviewRevision is invalid");
  return prisma.$transaction(async (tx) => {
    const assessment = await tx.assessment.findUnique({ where: { id: input.assessmentId } });
    if (!assessment) throw new DomainError("ASSESSMENT_MISSING", "assessment not found");
    const submission = await tx.submission.findUnique({ where: { id: assessment.submissionId } });
    if (!submission) throw new DomainError("ASSESSMENT_MISSING", "submission not found");
    await lockStudentThenAssignment(tx, submission.studentId, submission.assignmentId);
    const [teacherRow, assignment] = await Promise.all([lockTeacherRow(tx, teacher.id), tx.assignment.findUniqueOrThrow({ where: { id: submission.assignmentId } })]);
    if (teacherRow.role !== "TEACHER" || teacherRow.status !== "ACTIVE" || assignment.teacherId !== teacher.id) throw new DomainError("ASSESSMENT_OWNERSHIP", "assessment is not owned by this teacher");
    if (assessment.status === "PUBLISHED") throw new DomainError("ASSESSMENT_STATUS", "published assessments are immutable");
    if (assessment.reviewRevision !== input.expectedReviewRevision) throw new DomainError("ASSESSMENT_CONFLICT", "assessment review changed");
    const snapshot = snapshotFromSubmission(submission.assignmentSnapshot);
    const scores = validateAssessmentScores({ rubric: snapshot.rubric, maxScore: snapshot.maxScore, scoreStep: snapshot.scoreStep, evaluations: input.detailedEvaluations, totalScore: input.totalScore, submissionText: submission.text, requireEvidenceContract: true });
    const changed = JSON.stringify(scores.evaluations) !== JSON.stringify(assessment.detailedEvaluations) || scores.totalScore !== assessment.totalScore.toString();
    if (changed && !input.reason?.trim()) throw new DomainError("ASSESSMENT_REVIEW_REASON", "a reason is required when changing AI feedback");
    const updated = await tx.assessment.update({ where: { id: assessment.id }, data: { detailedEvaluations: scores.evaluations as Prisma.InputJsonValue, totalScore: scores.totalScore, reviewedById: teacher.id, reviewedAt: new Date(), reviewReason: input.reason?.trim() || null, reviewRevision: { increment: 1 } } });
    return toTeacherAssessmentView(updated);
  });
}
