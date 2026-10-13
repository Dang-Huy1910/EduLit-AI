import type { ObservationStatus } from "../../../generated/prisma/client.js";
import type { EduLitPrisma } from "../../../infrastructure/database/prisma.client.js";
import type { WritingObservationAiPort } from "../../../infrastructure/ai/writing-observation-ai.port.js";
import { createWritingObservationAiFromEnv } from "../../../infrastructure/ai/create-writing-observation-ai.js";
import type { AssessmentActor } from "../../assessment/domain/actor.js";
import { extractPublishedObservations } from "./extract-published-observations.js";
import { getOwnWritingProfile } from "./get-own-writing-profile.js";
import { reviewObservationStatus } from "./review-observation-status.js";

export function createWritingProfileServices(
  prisma: EduLitPrisma,
  ai: WritingObservationAiPort = createWritingObservationAiFromEnv(),
) {
  return {
    extractPublishedObservations: (actor: AssessmentActor, input: { assessmentId: string }) =>
      extractPublishedObservations(prisma, ai, actor, input),
    getOwnWritingProfile: (actor: AssessmentActor) => getOwnWritingProfile(prisma, actor),
    reviewObservationStatus: (
      actor: AssessmentActor,
      input: { observationId: string; status: ObservationStatus; expectedProfileVersion: number },
    ) => reviewObservationStatus(prisma, actor, input),
  };
}
