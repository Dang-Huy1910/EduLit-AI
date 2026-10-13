import { Prisma } from "../../../generated/prisma/client.js";
import { DomainError } from "../../../core/errors.js";
import type { EduLitPrisma } from "../../../infrastructure/database/prisma.client.js";
import {
  assignmentSnapshotFromContext,
} from "../../assignments/domain/snapshot.js";
import type { AssignmentSnapshot } from "../../assignments/domain/rubric.js";
import { validateStudentOutline, type StudentOutline } from "../domain/outline.js";

export type LoadedSocraticSession = {
  id: string;
  studentId: string;
  assignmentId: string;
  status: "ACTIVE" | "COMPLETED";
  outline: StudentOutline;
  outlineRevision: number;
  contextSnapshot: unknown;
  snapshot: AssignmentSnapshot;
  assignmentStatus: "DRAFT" | "PUBLISHED" | "CLOSED";
  hasSubmission: boolean;
};

export async function loadOwnedSession(
  prisma: EduLitPrisma,
  studentId: string,
  sessionId: string,
): Promise<LoadedSocraticSession> {
  const session = await prisma.socraticSession.findUnique({ where: { id: sessionId } });
  if (!session) {
    throw new DomainError("SESSION_NOT_FOUND", "socratic session not found");
  }
  if (session.studentId !== studentId) {
    throw new DomainError("SESSION_OWNERSHIP", "session does not belong to the authenticated student");
  }
  const assignment = await prisma.assignment.findUnique({ where: { id: session.assignmentId } });
  if (!assignment) {
    throw new DomainError("SESSION_ASSIGNMENT", "assignment not found");
  }
  const submission = await prisma.submission.findUnique({
    where: {
      studentId_assignmentId: { studentId, assignmentId: session.assignmentId },
    },
  });
  const snapshot = assignmentSnapshotFromContext(session.contextSnapshot, session.createdAt);
  return {
    id: session.id,
    studentId: session.studentId,
    assignmentId: session.assignmentId,
    status: session.status,
    outline: validateStudentOutline(session.outline),
    outlineRevision: session.outlineRevision,
    contextSnapshot: session.contextSnapshot,
    snapshot,
    assignmentStatus: assignment.status,
    hasSubmission: Boolean(submission),
  };
}

export function assertSessionAcceptsTurn(session: LoadedSocraticSession): void {
  if (session.status === "COMPLETED") {
    throw new DomainError("SESSION_COMPLETED", "completed sessions do not accept new coaching turns");
  }
  if (session.assignmentStatus === "CLOSED") {
    throw new DomainError("SESSION_CLOSED", "closed assignments do not accept new coaching turns");
  }
  if (session.hasSubmission) {
    throw new DomainError("SESSION_SUBMITTED", "submitted assignments do not accept new coaching turns");
  }
}

export async function lockStudentThenAssignmentThenSession(
  tx: Prisma.TransactionClient,
  studentId: string,
  assignmentId: string,
  sessionId: string,
): Promise<void> {
  const users = await tx.$queryRaw<Array<{ id: string; role: string; status: string }>>(
    Prisma.sql`SELECT id, role, status FROM users WHERE id = ${studentId}::uuid FOR UPDATE`,
  );
  const user = users[0];
  if (!user) {
    throw new DomainError("ACTOR_INVALID", "authenticated user does not exist");
  }
  if (user.role !== "STUDENT") {
    throw new DomainError("ACTOR_FORBIDDEN", "only STUDENT actors may use socratic coaching");
  }
  if (user.status !== "ACTIVE") {
    throw new DomainError("ACTOR_INACTIVE", "student account is INACTIVE");
  }
  await lockAssignmentThenSession(tx, assignmentId, sessionId);
}

export async function lockAssignmentThenSession(
  tx: Prisma.TransactionClient,
  assignmentId: string,
  sessionId: string,
): Promise<void> {
  const assignment = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT id FROM assignments WHERE id = ${assignmentId}::uuid FOR UPDATE`,
  );
  if (assignment.length === 0) {
    throw new DomainError("SESSION_ASSIGNMENT", "assignment not found");
  }
  const session = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT id FROM socratic_sessions WHERE id = ${sessionId}::uuid FOR UPDATE`,
  );
  if (session.length === 0) {
    throw new DomainError("SESSION_NOT_FOUND", "socratic session not found");
  }
}
