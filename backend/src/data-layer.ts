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
export { submitAssignment } from "./modules/assessment/application/submit-assignment.js";
export { saveAssessment, publishAssessment } from "./modules/assessment/application/save-assessment.js";
export {
  saveObservationsAndRefreshProfile,
  refreshWritingProfile,
} from "./modules/writing-profile/application/save-observations.js";
export { getProfileContextForSession } from "./modules/writing-profile/application/query-profile-context.js";
