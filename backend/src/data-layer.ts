export { DomainError, VersionConflictError } from "./core/errors.js";
export { assertEvidenceQuote, offsetsForQuote, sliceUtf16 } from "./core/utf16.js";
export { validateRubric } from "./modules/assignments/domain/rubric.js";
export { validateAssessmentScores, DEFAULT_MODEL_NAME } from "./modules/assessment/domain/evaluation.js";
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
  SOCRATIC_MODEL_NAME,
} from "./modules/socratic/domain/output.js";
export { submitAssignment } from "./modules/assessment/application/submit-assignment.js";
export { saveAssessment, publishAssessment } from "./modules/assessment/application/save-assessment.js";
export {
  saveObservationsAndRefreshProfile,
  setObservationStatus,
  refreshWritingProfile,
} from "./modules/writing-profile/application/save-observations.js";
export { getProfileContextForSession } from "./modules/writing-profile/application/query-profile-context.js";
