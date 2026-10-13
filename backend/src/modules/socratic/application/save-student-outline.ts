import { Prisma } from "../../../generated/prisma/client.js";
import { DomainError } from "../../../core/errors.js";
import type { EduLitPrisma } from "../../../infrastructure/database/prisma.client.js";
import type { StudentActor } from "../domain/actor.js";
import { validateStudentOutline, type StudentOutline } from "../domain/outline.js";
import { assertActiveStudentActor } from "./assert-student-actor.js";
import { assertSessionAcceptsTurn, loadOwnedSession, lockAssignmentThenSession } from "./session-access.js";

export type SaveStudentOutlineInput = {
  actor: StudentActor;
  sessionId: string;
  outline: unknown;
  expectedOutlineRevision: number;
};

export type SaveStudentOutlineResult = {
  sessionId: string;
  outline: StudentOutline;
  outlineRevision: number;
};

export async function saveStudentOutline(
  prisma: EduLitPrisma,
  input: SaveStudentOutlineInput,
): Promise<SaveStudentOutlineResult> {
  const actor = await assertActiveStudentActor(prisma, input.actor);
  const outline = validateStudentOutline(input.outline);
  const loaded = await loadOwnedSession(prisma, actor.id, input.sessionId);
  assertSessionAcceptsTurn(loaded);

  return prisma.$transaction(async (tx) => {
    await lockAssignmentThenSession(tx, loaded.assignmentId, loaded.id);
    const session = await tx.socraticSession.findUniqueOrThrow({ where: { id: loaded.id } });
    if (session.studentId !== actor.id) {
      throw new DomainError("SESSION_OWNERSHIP", "session does not belong to the authenticated student");
    }
    if (session.status !== "ACTIVE") {
      throw new DomainError("SESSION_COMPLETED", "completed sessions do not accept outline updates");
    }
    const assignment = await tx.assignment.findUniqueOrThrow({ where: { id: session.assignmentId } });
    if (assignment.status === "CLOSED") {
      throw new DomainError("SESSION_CLOSED", "closed assignments do not accept outline updates");
    }
    const submission = await tx.submission.findUnique({
      where: {
        studentId_assignmentId: { studentId: actor.id, assignmentId: session.assignmentId },
      },
    });
    if (submission) {
      throw new DomainError("SESSION_SUBMITTED", "submitted assignments do not accept outline updates");
    }
    if (session.outlineRevision !== input.expectedOutlineRevision) {
      throw new DomainError("OUTLINE_VERSION", "outline revision does not match the current session");
    }
    const updated = await tx.socraticSession.update({
      where: { id: session.id },
      data: {
        outline: outline as Prisma.InputJsonValue,
        outlineRevision: session.outlineRevision + 1,
      },
    });
    return {
      sessionId: updated.id,
      outline,
      outlineRevision: updated.outlineRevision,
    };
  });
}
