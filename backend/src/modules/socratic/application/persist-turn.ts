import { Prisma } from "../../../generated/prisma/client.js";
import { DomainError } from "../../../core/errors.js";
import type { EduLitPrisma } from "../../../infrastructure/database/prisma.client.js";
import { socraticMessageId } from "../domain/message-ids.js";
import { lockStudentThenAssignmentThenSession } from "./session-access.js";
import type { SocraticChatMessageView } from "./get-socratic-session.js";

export type PersistSocraticTurnInput = {
  sessionId: string;
  studentId: string;
  assignmentId: string;
  requestId: string;
  expectedLastSequence: number;
  expectedOutlineRevision: number;
  userContent: string;
  assistantContent: string;
  provider: string;
  modelName: string;
  promptVersion: string;
  responseMode: string;
};

export type PersistSocraticTurnResult = {
  userMessage: SocraticChatMessageView;
  assistantMessage: SocraticChatMessageView;
  lastSequence: number;
  outlineRevision: number;
  persisted: "created" | "replayed";
};

export async function persistSocraticTurn(
  prisma: EduLitPrisma,
  input: PersistSocraticTurnInput,
): Promise<PersistSocraticTurnResult> {
  const userId = socraticMessageId(input.sessionId, input.requestId, "USER");
  const assistantId = socraticMessageId(input.sessionId, input.requestId, "ASSISTANT");

  try {
    return await prisma.$transaction(async (tx) => {
      await lockStudentThenAssignmentThenSession(tx, input.studentId, input.assignmentId, input.sessionId);
      const session = await tx.socraticSession.findUniqueOrThrow({ where: { id: input.sessionId } });
      if (session.studentId !== input.studentId) {
        throw new DomainError("SESSION_OWNERSHIP", "session does not belong to the authenticated student");
      }
      if (session.status !== "ACTIVE") {
        throw new DomainError("SESSION_COMPLETED", "completed sessions do not accept new coaching turns");
      }
      const assignment = await tx.assignment.findUniqueOrThrow({ where: { id: session.assignmentId } });
      if (assignment.status === "CLOSED") {
        throw new DomainError("SESSION_CLOSED", "closed assignments do not accept new coaching turns");
      }
      const submission = await tx.submission.findUnique({
        where: {
          studentId_assignmentId: {
            studentId: input.studentId,
            assignmentId: session.assignmentId,
          },
        },
      });
      if (submission) {
        throw new DomainError("SESSION_SUBMITTED", "submitted assignments do not accept new coaching turns");
      }
      const existing = await tx.chatMessage.findMany({
        where: { sessionId: input.sessionId, requestId: input.requestId },
        orderBy: { sequence: "asc" },
      });
      if (existing.length === 2 && existing[0] && existing[1]) {
        if (existing[0].role !== "USER" || existing[1].role !== "ASSISTANT") {
          throw new DomainError("TURN_CONFLICT", "requestId is bound to an inconsistent turn");
        }
        if (existing[0].content !== input.userContent) {
          throw new DomainError("REQUEST_ID_CONFLICT", "requestId was reused with a different message");
        }
        return {
          userMessage: toView(existing[0]),
          assistantMessage: toView(existing[1]),
          lastSequence: existing[1].sequence,
          outlineRevision: session.outlineRevision,
          persisted: "replayed",
        };
      }
      if (existing.length !== 0) {
        throw new DomainError("TURN_CONFLICT", "requestId is bound to an incomplete turn");
      }
      if (session.outlineRevision !== input.expectedOutlineRevision) {
        throw new DomainError("TURN_CONFLICT", "outline changed while the model response was in flight");
      }
      const aggregate = await tx.chatMessage.aggregate({
        where: { sessionId: input.sessionId },
        _max: { sequence: true },
      });
      const currentLast = aggregate._max.sequence ?? 0;
      if (currentLast !== input.expectedLastSequence) {
        throw new DomainError("TURN_CONFLICT", "another turn was committed with the same expectedLastSequence");
      }

      const userSequence = currentLast + 1;
      const assistantSequence = currentLast + 2;
      const userMessage = await tx.chatMessage.create({
        data: {
          id: userId,
          sessionId: input.sessionId,
          sequence: userSequence,
          role: "USER",
          content: input.userContent,
          requestId: input.requestId,
        },
      });
      const assistantMessage = await tx.chatMessage.create({
        data: {
          id: assistantId,
          sessionId: input.sessionId,
          sequence: assistantSequence,
          role: "ASSISTANT",
          content: input.assistantContent,
          requestId: input.requestId,
          provider: input.provider,
          modelName: input.modelName,
          promptVersion: input.promptVersion,
          responseMode: input.responseMode,
        },
      });
      return {
        userMessage: toView(userMessage),
        assistantMessage: toView(assistantMessage),
        lastSequence: assistantSequence,
        outlineRevision: session.outlineRevision,
        persisted: "created",
      };
    });
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const replay = await readCommittedTurn(prisma, input.sessionId, input.requestId);
      if (replay) {
        if (replay.userMessage.content !== input.userContent) {
          throw new DomainError("REQUEST_ID_CONFLICT", "requestId was reused with a different message");
        }
        return replay;
      }
      throw new DomainError("TURN_CONFLICT", "concurrent turn conflicted on sequence or requestId");
    }
    throw error;
  }
}

export async function readCommittedTurn(
  prisma: EduLitPrisma,
  sessionId: string,
  requestId: string,
): Promise<PersistSocraticTurnResult | null> {
  const rows = await prisma.chatMessage.findMany({
    where: { sessionId, requestId },
    orderBy: { sequence: "asc" },
  });
  if (rows.length === 0) {
    return null;
  }
  if (rows.length !== 2 || rows[0]?.role !== "USER" || rows[1]?.role !== "ASSISTANT") {
    throw new DomainError("TURN_CONFLICT", "requestId is bound to an incomplete or inconsistent turn");
  }
  const session = await prisma.socraticSession.findUniqueOrThrow({ where: { id: sessionId } });
  return {
    userMessage: toView(rows[0]),
    assistantMessage: toView(rows[1]),
    lastSequence: rows[1].sequence,
    outlineRevision: session.outlineRevision,
    persisted: "replayed",
  };
}

function toView(row: {
  id: string;
  sequence: number;
  role: "USER" | "ASSISTANT";
  content: string;
  requestId: string | null;
  provider: string | null;
  modelName: string | null;
  promptVersion: string | null;
  responseMode: string | null;
  createdAt: Date;
}): SocraticChatMessageView {
  return {
    id: row.id,
    sequence: row.sequence,
    role: row.role,
    content: row.content,
    requestId: row.requestId,
    provider: row.provider,
    modelName: row.modelName,
    promptVersion: row.promptVersion,
    responseMode: row.responseMode,
    createdAt: row.createdAt,
  };
}
