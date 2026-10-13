import { Prisma } from "../../../generated/prisma/client.js";
import { DomainError } from "../../../core/errors.js";
import type { EduLitPrisma } from "../../../infrastructure/database/prisma.client.js";
import { socraticMessageId } from "../domain/message-ids.js";
import { isBlankOutline, validateStudentOutline, type StudentOutline } from "../domain/outline.js";
import { SCAFFOLD_INIT_REQUEST_ID } from "../domain/output.js";
import { lockStudentThenAssignmentThenSession } from "./session-access.js";

export type PersistScaffoldInitInput = {
  sessionId: string;
  studentId: string;
  assignmentId: string;
  outline: StudentOutline;
  welcomeText: string;
  expectedOutlineRevision: number;
  provider: string;
  modelName: string;
  promptVersion: string;
  responseMode: string;
};

export async function persistScaffoldInit(
  prisma: EduLitPrisma,
  input: PersistScaffoldInitInput,
): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      await lockStudentThenAssignmentThenSession(tx, input.studentId, input.assignmentId, input.sessionId);
      const session = await tx.socraticSession.findUniqueOrThrow({ where: { id: input.sessionId } });
      if (session.studentId !== input.studentId) {
        throw new DomainError("SESSION_OWNERSHIP", "session does not belong to the authenticated student");
      }
      if (session.status !== "ACTIVE") {
        return;
      }
      const assignment = await tx.assignment.findUniqueOrThrow({ where: { id: session.assignmentId } });
      if (assignment.status === "CLOSED") {
        return;
      }
      const submission = await tx.submission.findUnique({
        where: {
          studentId_assignmentId: { studentId: input.studentId, assignmentId: session.assignmentId },
        },
      });
      if (submission) {
        return;
      }

      const existingWelcome = await tx.chatMessage.findFirst({
        where: { sessionId: session.id, requestId: SCAFFOLD_INIT_REQUEST_ID, role: "ASSISTANT" },
      });
      if (existingWelcome) {
        return;
      }
      const messageCount = await tx.chatMessage.count({ where: { sessionId: session.id } });
      if (messageCount > 0) {
        return;
      }
      const currentOutline = validateStudentOutline(session.outline);
      if (isBlankOutline(currentOutline) && input.expectedOutlineRevision === 1 && session.outlineRevision === input.expectedOutlineRevision) {
        const updated = await tx.socraticSession.updateMany({
          where: { id: session.id, outlineRevision: input.expectedOutlineRevision },
          data: {
            outline: input.outline as Prisma.InputJsonValue,
            outlineRevision: { increment: 1 },
          },
        });
        if (updated.count !== 1) return;
      }
      await tx.chatMessage.create({
        data: {
          id: socraticMessageId(session.id, SCAFFOLD_INIT_REQUEST_ID, "ASSISTANT"),
          sessionId: session.id,
          sequence: 1,
          role: "ASSISTANT",
          content: input.welcomeText,
          requestId: SCAFFOLD_INIT_REQUEST_ID,
          provider: input.provider,
          modelName: input.modelName,
          promptVersion: input.promptVersion,
          responseMode: input.responseMode,
        },
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return;
    }
    throw error;
  }
}
