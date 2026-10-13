import { Prisma } from "../../../generated/prisma/client.js";
import { DomainError } from "../../../core/errors.js";
import type { EduLitPrisma } from "../../../infrastructure/database/prisma.client.js";
import { buildAssignmentSnapshot } from "../../assignments/domain/snapshot.js";
import { emptyOutline } from "../domain/outline.js";
import type { StudentActor } from "../domain/actor.js";
import { assertActiveStudentActor } from "./assert-student-actor.js";
import { getSocraticSession, type SocraticSessionView } from "./get-socratic-session.js";

export type OpenOrResumeSocraticSessionInput = {
  actor: StudentActor;
  assignmentId: string;
};

export async function openOrResumeSocraticSession(
  prisma: EduLitPrisma,
  input: OpenOrResumeSocraticSessionInput,
): Promise<SocraticSessionView & { resumed: boolean }> {
  const actor = await assertActiveStudentActor(prisma, input.actor);
  const assignment = await prisma.assignment.findUnique({ where: { id: input.assignmentId } });
  if (!assignment) {
    throw new DomainError("SESSION_ASSIGNMENT", "assignment not found");
  }
  if (assignment.status !== "PUBLISHED") {
    throw new DomainError("SESSION_ASSIGNMENT", "only PUBLISHED assignments can open a socratic session");
  }

  const existing = await prisma.socraticSession.findUnique({
    where: {
      studentId_assignmentId: { studentId: actor.id, assignmentId: assignment.id },
    },
  });
  if (existing) {
    const view = await getSocraticSession(prisma, { actor: input.actor, sessionId: existing.id });
    return { ...view, resumed: true };
  }

  const contextSnapshot = buildAssignmentSnapshot(assignment, new Date());
  try {
    const created = await prisma.socraticSession.create({
      data: {
        studentId: actor.id,
        assignmentId: assignment.id,
        contextSnapshot: contextSnapshot as Prisma.InputJsonValue,
        outline: emptyOutline() as Prisma.InputJsonValue,
        outlineRevision: 1,
        status: "ACTIVE",
      },
    });
    const view = await getSocraticSession(prisma, { actor: input.actor, sessionId: created.id });
    return { ...view, resumed: false };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await prisma.socraticSession.findUnique({
        where: {
          studentId_assignmentId: { studentId: actor.id, assignmentId: assignment.id },
        },
      });
      if (!raced) {
        throw error;
      }
      const view = await getSocraticSession(prisma, { actor: input.actor, sessionId: raced.id });
      return { ...view, resumed: true };
    }
    throw error;
  }
}
