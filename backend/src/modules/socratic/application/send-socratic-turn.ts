import { DomainError } from "../../../core/errors.js";
import { SOCRATIC_MAX_STUDENT_MESSAGE_CHARS } from "../../../infrastructure/ai/ai-config.js";
import type { SocraticAiPort, SocraticAiUsage } from "../../../infrastructure/ai/socratic-ai.port.js";
import type { EduLitPrisma } from "../../../infrastructure/database/prisma.client.js";
import { getProfileContextForSession } from "../../writing-profile/application/query-profile-context.js";
import type { StudentActor } from "../domain/actor.js";
import {
  SOCRATIC_MODEL_NAME,
  type SocraticResponseMode,
} from "../domain/output.js";
import { loadSocraticPromptBundle } from "../prompt-assets.js";
import { assertActiveStudentActor } from "./assert-student-actor.js";
import { buildSocraticUserPayload } from "./conversations/build-socratic-context.js";
import { selectCoachingProfile } from "./conversations/select-profile.js";
import { fallbackSocraticOutput, writeForStudentRefusalOutput } from "./guardrails/fallback.js";
import { joinReplyText } from "./guardrails/sentences.js";
import { inspectSocraticOutput } from "./guardrails/validate-socratic-output.js";
import { looksLikeWriteForStudentRequest } from "./guardrails/write-for-student.js";
import type { SocraticChatMessageView } from "./get-socratic-session.js";
import { persistSocraticTurn, readCommittedTurn } from "./persist-turn.js";
import { assertSessionAcceptsTurn, loadOwnedSession } from "./session-access.js";

export type SendSocraticTurnInput = {
  actor: StudentActor;
  sessionId: string;
  requestId: string;
  expectedLastSequence: number;
  message: string;
};

export type SendSocraticTurnResult = {
  sessionId: string;
  requestId: string;
  userMessage: SocraticChatMessageView;
  assistantMessage: SocraticChatMessageView;
  responseMode: SocraticResponseMode;
  promptVersion: string;
  model: string;
  usage?: SocraticAiUsage;
  latencyMs?: number;
  lastSequence: number;
  outlineRevision: number;
};

const REQUEST_ID_MAX = 128;

export async function sendSocraticTurn(
  prisma: EduLitPrisma,
  ai: SocraticAiPort,
  input: SendSocraticTurnInput,
): Promise<SendSocraticTurnResult> {
  const actor = await assertActiveStudentActor(prisma, input.actor);
  const requestId = normalizeRequestId(input.requestId);
  const message = normalizeStudentMessage(input.message);
  if (!Number.isInteger(input.expectedLastSequence) || input.expectedLastSequence < 0) {
    throw new DomainError("TURN_CONFLICT", "expectedLastSequence must be an integer >= 0");
  }

  const session = await loadOwnedSession(prisma, actor.id, input.sessionId);
  const replay = await readCommittedTurn(prisma, session.id, requestId);
  if (replay) {
    if (replay.userMessage.content !== message) {
      throw new DomainError("REQUEST_ID_CONFLICT", "requestId was reused with a different message");
    }
    return {
      sessionId: session.id,
      requestId,
      userMessage: replay.userMessage,
      assistantMessage: replay.assistantMessage,
      responseMode: "replay",
      promptVersion: loadSocraticPromptBundle().promptVersion,
      model: SOCRATIC_MODEL_NAME,
      lastSequence: replay.lastSequence,
      outlineRevision: replay.outlineRevision,
    };
  }

  assertSessionAcceptsTurn(session);

  const messages = await prisma.chatMessage.findMany({
    where: { sessionId: session.id },
    orderBy: { sequence: "asc" },
  });
  const lastSequence = messages.at(-1)?.sequence ?? 0;
  if (lastSequence !== input.expectedLastSequence) {
    throw new DomainError("TURN_CONFLICT", "expectedLastSequence does not match the session");
  }

  const profileContext = await getProfileContextForSession(prisma, session.studentId);
  const coaching = selectCoachingProfile(profileContext, session.snapshot.genre);
  const history = messages.map((item) => ({
    sequence: item.sequence,
    role: item.role,
    content: item.content,
  }));
  const built = buildSocraticUserPayload({
    snapshot: session.snapshot,
    outline: session.outline,
    history,
    profile: coaching,
    studentMessage: message,
  });
  const bundle = loadSocraticPromptBundle();

  let responseMode: SocraticResponseMode = "model";
  let assistantText: string;
  let usage: SocraticAiUsage | undefined;
  let latencyMs: number | undefined;
  if (looksLikeWriteForStudentRequest(message)) {
    responseMode = "fallback";
    assistantText = joinReplyText(writeForStudentRefusalOutput(session.snapshot).replySentences);
  } else {
    try {
      const generated = await ai.generateTurn({
        systemInstruction: bundle.systemInstruction,
        userPayload: built.userPayload,
        responseJsonSchema: bundle.providerSchema,
        promptVersion: bundle.promptVersion,
      });
      usage = generated.usage;
      latencyMs = generated.latencyMs;
      const inspected = inspectSocraticOutput(generated.output, session.snapshot, { studentMessage: message });
      if (!inspected.ok) {
        responseMode = "fallback";
        assistantText = joinReplyText(fallbackSocraticOutput(session.snapshot).replySentences);
      } else {
        assistantText = joinReplyText(inspected.output.replySentences);
      }
    } catch (error) {
      if (error instanceof DomainError && error.code === "AI_INVALID_OUTPUT") {
        responseMode = "fallback";
        assistantText = joinReplyText(fallbackSocraticOutput(session.snapshot).replySentences);
      } else {
        throw error;
      }
    }
  }

  const persisted = await persistSocraticTurn(prisma, {
    sessionId: session.id,
    studentId: actor.id,
    assignmentId: session.assignmentId,
    requestId,
    expectedLastSequence: input.expectedLastSequence,
    expectedOutlineRevision: session.outlineRevision,
    userContent: message,
    assistantContent: assistantText,
  });

  return {
    sessionId: session.id,
    requestId,
    userMessage: persisted.userMessage,
    assistantMessage: persisted.assistantMessage,
    responseMode: persisted.persisted === "replayed" ? "replay" : responseMode,
    promptVersion: bundle.promptVersion,
    model: SOCRATIC_MODEL_NAME,
    usage: persisted.persisted === "replayed" ? undefined : usage,
    latencyMs: persisted.persisted === "replayed" ? undefined : latencyMs,
    lastSequence: persisted.lastSequence,
    outlineRevision: persisted.outlineRevision,
  };
}

function normalizeRequestId(value: string): string {
  if (typeof value !== "string") {
    throw new DomainError("REQUEST_ID_CONFLICT", "requestId is required");
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new DomainError("REQUEST_ID_CONFLICT", "requestId is required");
  }
  if (trimmed.length > REQUEST_ID_MAX) {
    throw new DomainError("REQUEST_ID_CONFLICT", `requestId exceeds ${REQUEST_ID_MAX} characters`);
  }
  return trimmed;
}

function normalizeStudentMessage(value: string): string {
  if (typeof value !== "string") {
    throw new DomainError("CHAT_CONTENT", "message is required");
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new DomainError("CHAT_CONTENT", "message must not be empty");
  }
  if (trimmed.length > SOCRATIC_MAX_STUDENT_MESSAGE_CHARS) {
    throw new DomainError(
      "CHAT_CONTENT",
      `message exceeds ${SOCRATIC_MAX_STUDENT_MESSAGE_CHARS} characters`,
    );
  }
  return trimmed;
}
