import { DomainError } from "../../../core/errors.js";
import type { EduLitPrisma } from "../../../infrastructure/database/prisma.client.js";
import type { AssessmentActor } from "../domain/actor.js";
import { assertActiveActor } from "./assert-actor.js";
import {
  toStudentAssessmentView,
  toSubmissionDto,
  toTeacherAssessmentView,
  type StudentAssessmentView,
  type SubmissionView,
  type TeacherAssessmentView,
} from "./serialize-assessment.js";

export type GetSubmissionResult =
  | {
      audience: "student";
      submission: SubmissionView;
      assessment: StudentAssessmentView;
    }
  | {
      audience: "teacher";
      submission: SubmissionView;
      assessment: TeacherAssessmentView | null;
    };

export async function getSubmission(
  prisma: EduLitPrisma,
  actor: AssessmentActor,
  input: { submissionId: string },
): Promise<GetSubmissionResult> {
  const user = await assertActiveActor(prisma, actor);
  const submission = await prisma.submission.findUnique({ where: { id: input.submissionId } });
  if (!submission) {
    throw new DomainError("SUBMISSION_NOT_FOUND", "submission not found");
  }
  const assessment = await prisma.assessment.findUnique({ where: { submissionId: submission.id } });

  if (user.role === "STUDENT") {
    if (submission.studentId !== user.id) {
      throw new DomainError("SUBMISSION_NOT_FOUND", "submission not found");
    }
    return {
      audience: "student",
      submission: toSubmissionDto(submission, "student"),
      assessment: toStudentAssessmentView(assessment),
    };
  }

  const assignment = await prisma.assignment.findUnique({ where: { id: submission.assignmentId } });
  if (!assignment || assignment.teacherId !== user.id) {
    throw new DomainError("SUBMISSION_NOT_FOUND", "submission not found");
  }
  return {
    audience: "teacher",
    submission: toSubmissionDto(submission, "teacher"),
    assessment: assessment ? toTeacherAssessmentView(assessment) : null,
  };
}
