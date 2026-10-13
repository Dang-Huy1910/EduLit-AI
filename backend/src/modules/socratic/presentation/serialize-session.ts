import type { SaveStudentOutlineResult } from "../application/save-student-outline.js";
import type { SocraticSessionView } from "../application/get-socratic-session.js";
import type { SendSocraticTurnResult } from "../application/send-socratic-turn.js";

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

export function serializeSocraticSession(
  view: SocraticSessionView,
  extra: { resumed?: boolean } = {},
): Record<string, unknown> {
  return {
    sessionId: view.sessionId,
    studentId: view.studentId,
    assignmentId: view.assignmentId,
    status: view.status,
    assignmentStatus: view.assignmentStatus,
    hasSubmission: view.hasSubmission,
    snapshot: view.snapshot,
    messages: view.messages.map((item) => ({
      id: item.id,
      sequence: item.sequence,
      role: item.role,
      content: item.content,
      requestId: item.requestId,
      createdAt: iso(item.createdAt),
    })),
    outline: view.outline,
    outlineRevision: view.outlineRevision,
    lastSequence: view.lastSequence,
    ...(extra.resumed !== undefined ? { resumed: extra.resumed } : {}),
  };
}

export function serializeOutlineResult(result: SaveStudentOutlineResult): Record<string, unknown> {
  return {
    sessionId: result.sessionId,
    outline: result.outline,
    outlineRevision: result.outlineRevision,
  };
}

export function serializeTurnResult(result: SendSocraticTurnResult): Record<string, unknown> {
  return {
    sessionId: result.sessionId,
    requestId: result.requestId,
    userMessage: {
      ...result.userMessage,
      createdAt: iso(result.userMessage.createdAt),
    },
    assistantMessage: {
      ...result.assistantMessage,
      createdAt: iso(result.assistantMessage.createdAt),
    },
    responseMode: result.responseMode,
    promptVersion: result.promptVersion,
    model: result.model,
    lastSequence: result.lastSequence,
    outlineRevision: result.outlineRevision,
    ...(result.usage ? { usage: result.usage } : {}),
    ...(result.latencyMs !== undefined ? { latencyMs: result.latencyMs } : {}),
  };
}
