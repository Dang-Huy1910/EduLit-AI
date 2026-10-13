import { DomainError } from "../../../core/errors.js";
import type { EduLitPrisma } from "../../../infrastructure/database/prisma.client.js";
import type { AssignmentSnapshot } from "../../assignments/domain/rubric.js";
import type { AssessmentActor } from "../domain/actor.js";
import { validateAssessmentScores } from "../domain/evaluation.js";
import { assertActiveActor } from "./assert-actor.js";
import { lockStudentThenAssignment, lockTeacherRow } from "./lock-assessment.js";
import { toTeacherAssessmentView, type TeacherAssessmentView } from "./serialize-assessment.js";
import { snapshotFromSubmission } from "./assess-submission.js";

export async function publishReviewedAssessment(
  prisma: EduLitPrisma,
  actor: AssessmentActor,
  input: { assessmentId: string },
): Promise<{ assessment: TeacherAssessmentView; replayed: boolean }> {
  const teacher = await assertActiveActor(prisma, actor, "TEACHER");

  return prisma.$transaction(async (tx) => {
    const assessment = await tx.assessment.findUnique({ where: { id: input.assessmentId } });
    if (!assessment) {
      throw new DomainError("ASSESSMENT_MISSING", "assessment not found");
    }
    const submission = await tx.submission.findUnique({ where: { id: assessment.submissionId } });
    if (!submission) {
      throw new DomainError("ASSESSMENT_MISSING", "assessment not found");
    }
    await lockStudentThenAssignment(tx, submission.studentId, submission.assignmentId);
    const teacherRow = await lockTeacherRow(tx, teacher.id);
    if (teacherRow.role !== "TEACHER") {
      throw new DomainError("ACTOR_FORBIDDEN", "only TEACHER actors may publish assessments");
    }
    if (teacherRow.status !== "ACTIVE") {
      throw new DomainError("ACTOR_INACTIVE", "account is INACTIVE");
    }
    const assignment = await tx.assignment.findUniqueOrThrow({ where: { id: submission.assignmentId } });
    if (assignment.teacherId !== teacher.id) {
      throw new DomainError("ASSESSMENT_OWNERSHIP", "assignment is not owned by this teacher");
    }

    const snapshot = snapshotFromSubmission(submission.assignmentSnapshot) as AssignmentSnapshot;
    validateAssessmentScores({
      rubric: snapshot.rubric,
      maxScore: snapshot.maxScore,
      scoreStep: snapshot.scoreStep,
      evaluations: assessment.detailedEvaluations,
      totalScore: assessment.totalScore,
      submissionText: submission.text,
      requireEvidenceContract: hasEvidenceContract(assessment.detailedEvaluations),
    });

    if (assessment.status === "PUBLISHED") {
      return { assessment: toTeacherAssessmentView(assessment), replayed: true };
    }

    const updated = await tx.assessment.update({
      where: { id: assessment.id },
      data: {
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });
    return { assessment: toTeacherAssessmentView(updated), replayed: false };
  });
}

function hasEvidenceContract(evaluations: unknown): boolean {
  if (!Array.isArray(evaluations) || evaluations.length === 0) {
    return false;
  }
  return evaluations.every(
    (item) =>
      item &&
      typeof item === "object" &&
      Array.isArray((item as { evidence?: unknown }).evidence) &&
      Array.isArray((item as { missingElements?: unknown }).missingElements),
  );
}
