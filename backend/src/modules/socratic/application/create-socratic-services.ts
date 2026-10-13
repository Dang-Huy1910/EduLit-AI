import type { EduLitPrisma } from "../../../infrastructure/database/prisma.client.js";
import type { SocraticAiPort } from "../../../infrastructure/ai/socratic-ai.port.js";
import { createSocraticAiFromEnv } from "../../../infrastructure/ai/create-socratic-ai.js";
import type { StudentActor } from "../domain/actor.js";
import { getSocraticSession } from "./get-socratic-session.js";
import { openOrResumeSocraticSession } from "./open-or-resume-session.js";
import { saveStudentOutline } from "./save-student-outline.js";
import { sendSocraticTurn } from "./send-socratic-turn.js";

export function createSocraticServices(prisma: EduLitPrisma, ai: SocraticAiPort = createSocraticAiFromEnv()) {
  return {
    openOrResumeSocraticSession: (actor: StudentActor, assignmentId: string) =>
      openOrResumeSocraticSession(prisma, { actor, assignmentId }),
    getSocraticSession: (actor: StudentActor, sessionId: string) =>
      getSocraticSession(prisma, { actor, sessionId }),
    saveStudentOutline: (
      actor: StudentActor,
      sessionId: string,
      outline: unknown,
      expectedOutlineRevision: number,
    ) => saveStudentOutline(prisma, { actor, sessionId, outline, expectedOutlineRevision }),
    sendSocraticTurn: (
      actor: StudentActor,
      sessionId: string,
      requestId: string,
      expectedLastSequence: number,
      message: string,
    ) => sendSocraticTurn(prisma, ai, { actor, sessionId, requestId, expectedLastSequence, message }),
  };
}
