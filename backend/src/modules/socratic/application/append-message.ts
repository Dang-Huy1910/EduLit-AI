import { Prisma } from "../../../generated/prisma/client.js";
import { DomainError } from "../../../core/errors.js";
import type { EduLitPrisma } from "../../../infrastructure/database/prisma.client.js";

export type AppendChatMessageInput = {
  sessionId: string;
  role: "USER" | "ASSISTANT";
  content: string;
  sequence?: number;
};

export async function appendChatMessage(prisma: EduLitPrisma, input: AppendChatMessageInput) {
  if (!input.content.trim()) {
    throw new DomainError("CHAT_CONTENT", "message content must not be empty");
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT id FROM socratic_sessions WHERE id = ${input.sessionId}::uuid FOR UPDATE`,
      );
      if (locked.length === 0) {
        throw new DomainError("CHAT_SESSION", "socratic session not found");
      }
      const aggregate = await tx.chatMessage.aggregate({
        where: { sessionId: input.sessionId },
        _max: { sequence: true },
      });
      const sequence = input.sequence ?? (aggregate._max.sequence ?? 0) + 1;
      if (sequence < 0) {
        throw new DomainError("CHAT_SEQUENCE", "sequence must be >= 0");
      }
      return tx.chatMessage.create({
        data: {
          sessionId: input.sessionId,
          sequence,
          role: input.role,
          content: input.content,
        },
      });
    });
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new DomainError("CHAT_SEQUENCE", "duplicate (sessionId, sequence)");
    }
    throw error;
  }
}
