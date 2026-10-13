import type { EduLitPrisma } from "../../../infrastructure/database/prisma.client.js";
import type { AssessmentAiPort } from "../../../infrastructure/ai/assessment-ai.port.js";
import { createAssessmentAiFromEnv } from "../../../infrastructure/ai/create-assessment-ai.js";
import type { AssessmentActor } from "../domain/actor.js";
import { assessSubmission } from "./assess-submission.js";
import { getAssessment } from "./get-assessment.js";
import { getSubmission } from "./get-submission.js";
import { publishReviewedAssessment } from "./publish-reviewed-assessment.js";
import { submitStudentText } from "./submit-student-text.js";

export function createAssessmentServices(
  prisma: EduLitPrisma,
  ai: AssessmentAiPort = createAssessmentAiFromEnv(),
) {
  return {
    submitStudentText: (actor: AssessmentActor, input: { assignmentId: string; socraticSessionId?: string | null; text: string }) =>
      submitStudentText(prisma, actor, input),
    assessSubmission: (actor: AssessmentActor, input: { submissionId: string }) =>
      assessSubmission(prisma, ai, actor, input),
    getSubmission: (actor: AssessmentActor, input: { submissionId: string }) =>
      getSubmission(prisma, actor, input),
    getAssessment: (actor: AssessmentActor, input: { assessmentId: string }) =>
      getAssessment(prisma, actor, input),
    publishReviewedAssessment: (actor: AssessmentActor, input: { assessmentId: string }) =>
      publishReviewedAssessment(prisma, actor, input),
  };
}
