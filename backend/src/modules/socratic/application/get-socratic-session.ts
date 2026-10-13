import type { EduLitPrisma } from "../../../infrastructure/database/prisma.client.js";
import type { AssignmentSnapshot } from "../../assignments/domain/rubric.js";
import type { StudentActor } from "../domain/actor.js";
import type { StudentOutline } from "../domain/outline.js";
import { assertActiveStudentActor } from "./assert-student-actor.js";
import { loadOwnedSession } from "./session-access.js";

export type SocraticChatMessageView = {
  id: string;
  sequence: number;
  role: "USER" | "ASSISTANT";
  content: string;
  requestId: string | null;
  createdAt: Date;
};

export type SocraticSessionView = {
  sessionId: string;
  studentId: string;
  assignmentId: string;
  status: "ACTIVE" | "COMPLETED";
  assignmentStatus: "DRAFT" | "PUBLISHED" | "CLOSED";
  hasSubmission: boolean;
  outline: StudentOutline;
  outlineRevision: number;
  lastSequence: number;
  snapshot: AssignmentSnapshot;
  messages: SocraticChatMessageView[];
};

export type GetSocraticSessionInput = {
  actor: StudentActor;
  sessionId: string;
};

export async function getSocraticSession(
  prisma: EduLitPrisma,
  input: GetSocraticSessionInput,
): Promise<SocraticSessionView> {
  const actor = await assertActiveStudentActor(prisma, input.actor);
  const session = await loadOwnedSession(prisma, actor.id, input.sessionId);
  const messages = await prisma.chatMessage.findMany({
    where: { sessionId: session.id },
    orderBy: { sequence: "asc" },
  });
  const lastSequence = messages.at(-1)?.sequence ?? 0;
  return {
    sessionId: session.id,
    studentId: session.studentId,
    assignmentId: session.assignmentId,
    status: session.status,
    assignmentStatus: session.assignmentStatus,
    hasSubmission: session.hasSubmission,
    outline: session.outline,
    outlineRevision: session.outlineRevision,
    lastSequence,
    snapshot: session.snapshot,
    messages: messages.map((item) => ({
      id: item.id,
      sequence: item.sequence,
      role: item.role,
      content: item.content,
      requestId: item.requestId,
      createdAt: item.createdAt,
    })),
  };
}
