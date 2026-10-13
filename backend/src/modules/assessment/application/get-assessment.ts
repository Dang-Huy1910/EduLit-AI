import { DomainError } from "../../../core/errors.js";
import type { EduLitPrisma } from "../../../infrastructure/database/prisma.client.js";
import type { AssessmentActor } from "../domain/actor.js";
import { assertActiveActor } from "./assert-actor.js";
import {
  toStudentAssessmentView,
  toTeacherAssessmentView,
  type StudentAssessmentView,
  type TeacherAssessmentView,
} from "./serialize-assessment.js";

export type GetAssessmentResult =
  | { audience: "student"; assessment: StudentAssessmentView }
  | { audience: "teacher"; assessment: TeacherAssessmentView };

export async function getAssessment(
  prisma: EduLitPrisma,
  actor: AssessmentActor,
  input: { assessmentId: string },
): Promise<GetAssessmentResult> {
  const user = await assertActiveActor(prisma, actor);
  const assessment = await prisma.assessment.findUnique({ where: { id: input.assessmentId } });
  if (!assessment) {
    throw new DomainError("ASSESSMENT_MISSING", "assessment not found");
  }
  const submission = await prisma.submission.findUnique({ where: { id: assessment.submissionId } });
  if (!submission) {
    throw new DomainError("ASSESSMENT_MISSING", "assessment not found");
  }

  if (user.role === "STUDENT") {
    if (submission.studentId !== user.id) {
      throw new DomainError("ASSESSMENT_MISSING", "assessment not found");
    }
    return { audience: "student", assessment: toStudentAssessmentView(assessment) };
  }

  const assignment = await prisma.assignment.findUnique({ where: { id: submission.assignmentId } });
  if (!assignment || assignment.teacherId !== user.id) {
    throw new DomainError("ASSESSMENT_MISSING", "assessment not found");
  }
  return { audience: "teacher", assessment: toTeacherAssessmentView(assessment) };
}
