export { DomainError, VersionConflictError } from "./core/errors.js";
export { assertEvidenceQuote, offsetsForQuote, uniqueOffsetsForQuote, sliceUtf16 } from "./core/utf16.js";
export { validateRubric } from "./modules/assignments/domain/rubric.js";
export { validateAssessmentScores, LEGACY_MODEL_NAME } from "./modules/assessment/domain/evaluation.js";
export { PRISMA, createDatabaseProviders, createPrismaClientFactory } from "./infrastructure/database/database.provider.js";
export {
  createPrismaHandle,
  disconnectPrismaHandle,
  type EduLitPrisma,
  type PrismaHandle,
} from "./infrastructure/database/prisma.client.js";
export { createAssignment } from "./modules/assignments/application/create-assignment.js";
export { startSocraticSession } from "./modules/socratic/application/start-session.js";
export { appendChatMessage } from "./modules/socratic/application/append-message.js";
export { openOrResumeSocraticSession } from "./modules/socratic/application/open-or-resume-session.js";
export { getSocraticSession } from "./modules/socratic/application/get-socratic-session.js";
export { saveStudentOutline } from "./modules/socratic/application/save-student-outline.js";
export { sendSocraticTurn } from "./modules/socratic/application/send-socratic-turn.js";
export { createSocraticServices } from "./modules/socratic/application/create-socratic-services.js";
export type { StudentActor } from "./modules/socratic/domain/actor.js";
export type { StudentOutline } from "./modules/socratic/domain/outline.js";
export type { SocraticAiPort } from "./infrastructure/ai/socratic-ai.port.js";
export { FakeSocraticAi } from "./infrastructure/ai/fake-socratic.adapter.js";
export { GeminiSocraticAdapter } from "./infrastructure/ai/gemini-socratic.adapter.js";
export { createSocraticAiFromEnv } from "./infrastructure/ai/create-socratic-ai.js";
export { loadSocraticPromptBundle } from "./modules/socratic/prompt-assets.js";
export {
  SOCRATIC_PROMPT_VERSION,
  SOCRATIC_SCHEMA_VERSION,
} from "./modules/socratic/domain/output.js";
export { submitAssignment } from "./modules/assessment/application/submit-assignment.js";
export { saveAssessment, publishAssessment } from "./modules/assessment/application/save-assessment.js";
export { createAssessmentServices } from "./modules/assessment/application/create-assessment-services.js";
export { submitStudentText } from "./modules/assessment/application/submit-student-text.js";
export { assessSubmission } from "./modules/assessment/application/assess-submission.js";
export { getSubmission } from "./modules/assessment/application/get-submission.js";
export { getAssessment } from "./modules/assessment/application/get-assessment.js";
export { publishReviewedAssessment } from "./modules/assessment/application/publish-reviewed-assessment.js";
export { loadAssessmentPromptBundle } from "./modules/assessment/prompt-assets.js";
export type { AssessmentActor } from "./modules/assessment/domain/actor.js";
export type { AssessmentAiPort } from "./infrastructure/ai/assessment-ai.port.js";
export { FakeAssessmentAi } from "./infrastructure/ai/fake-assessment.adapter.js";
export { GeminiAssessmentAdapter } from "./infrastructure/ai/gemini-assessment.adapter.js";
export { createAssessmentAiFromEnv } from "./infrastructure/ai/create-assessment-ai.js";
export {
  ASSESSMENT_PROMPT_VERSION,
  ASSESSMENT_SCHEMA_VERSION,
} from "./modules/assessment/domain/output.js";
export {
  saveObservationsAndRefreshProfile,
  setObservationStatus,
  refreshWritingProfile,
} from "./modules/writing-profile/application/save-observations.js";
export { getProfileContextForSession } from "./modules/writing-profile/application/query-profile-context.js";
export { createWritingProfileServices } from "./modules/writing-profile/application/create-writing-profile-services.js";
export { extractPublishedObservations } from "./modules/writing-profile/application/extract-published-observations.js";
export { getOwnWritingProfile } from "./modules/writing-profile/application/get-own-writing-profile.js";
export { reviewObservationStatus } from "./modules/writing-profile/application/review-observation-status.js";
export { loadWritingProfilePromptBundle } from "./modules/writing-profile/prompt-assets.js";
export type { WritingObservationAiPort } from "./infrastructure/ai/writing-observation-ai.port.js";
export { FakeWritingObservationAi } from "./infrastructure/ai/fake-writing-observation.adapter.js";
export { GeminiWritingObservationAdapter } from "./infrastructure/ai/gemini-writing-observation.adapter.js";
export { createWritingObservationAiFromEnv } from "./infrastructure/ai/create-writing-observation-ai.js";
export {
  WRITING_PROFILE_PROMPT_VERSION,
  WRITING_PROFILE_SCHEMA_VERSION,
} from "./modules/writing-profile/domain/output.js";
export {
  WRITING_TRAITS,
  WRITING_PROFILE_TAXONOMY_VERSION,
  buildFeatureKey,
} from "./modules/writing-profile/domain/taxonomy.js";
