import { Prisma } from "../../../generated/prisma/client.js";
import { DomainError } from "../../../core/errors.js";
import { sha256Utf8 } from "../../../core/hash.js";
import type { EduLitPrisma } from "../../../infrastructure/database/prisma.client.js";
import type { AssignmentSnapshot } from "../../assignments/domain/rubric.js";
import {
  assignmentSnapshotFromContext,
  buildAssignmentSnapshot,
} from "../../assignments/domain/snapshot.js";

export type SubmitAssignmentInput = {
  studentId: string;
  assignmentId: string;
  text: string;
  socraticSessionId?: string | null;
};

/**
 * MVP policy:
 * - Only PUBLISHED assignments accept submissions. CLOSED and DRAFT are rejected.
 * - dueAt is informational and does not block submit.
 * - Submitting with a socraticSessionId freezes the session contextSnapshot so
 *   guidance and grading use the same rubric/instructions.
 * - Submitting without a session freezes the current published assignment row.
 */
export async function submitAssignment(prisma: EduLitPrisma, input: SubmitAssignmentInput) {
  if (!input.text.trim()) {
    throw new DomainError("SUBMISSION_TEXT", "submission text must not be empty");
  }

  return prisma.$transaction(async (tx) => {
    const student = await tx.user.findUnique({ where: { id: input.studentId } });
    if (!student || student.role !== "STUDENT" || student.status !== "ACTIVE") {
      throw new DomainError("SUBMISSION_STUDENT", "studentId must be an active STUDENT");
    }

    const lockedAssignment = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM assignments WHERE id = ${input.assignmentId}::uuid FOR UPDATE`,
    );
    if (lockedAssignment.length === 0) {
      throw new DomainError("SUBMISSION_ASSIGNMENT", "assignment not found");
    }
    const assignment = await tx.assignment.findUniqueOrThrow({ where: { id: input.assignmentId } });
    if (assignment.status !== "PUBLISHED") {
      throw new DomainError("SUBMISSION_ASSIGNMENT", "only PUBLISHED assignments accept submissions");
    }

    let snapshot: AssignmentSnapshot;
    if (input.socraticSessionId) {
      const lockedSession = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT id FROM socratic_sessions WHERE id = ${input.socraticSessionId}::uuid FOR UPDATE`,
      );
      if (lockedSession.length === 0) {
        throw new DomainError(
          "SUBMISSION_SESSION",
          "socraticSessionId must belong to the same student and assignment",
        );
      }
      const session = await tx.socraticSession.findUniqueOrThrow({
        where: { id: input.socraticSessionId },
      });
      if (session.studentId !== input.studentId || session.assignmentId !== input.assignmentId) {
        throw new DomainError(
          "SUBMISSION_SESSION",
          "socraticSessionId must belong to the same student and assignment",
        );
      }
      snapshot = assignmentSnapshotFromContext(session.contextSnapshot, session.createdAt);
      if (snapshot.assignmentId !== input.assignmentId) {
        throw new DomainError("SUBMISSION_SESSION", "session snapshot assignmentId mismatch");
      }
    } else {
      snapshot = buildAssignmentSnapshot(assignment, new Date());
    }

    return tx.submission.create({
      data: {
        studentId: input.studentId,
        assignmentId: input.assignmentId,
        socraticSessionId: input.socraticSessionId ?? null,
        text: input.text,
        contentHash: sha256Utf8(input.text),
        assignmentSnapshot: snapshot as Prisma.InputJsonValue,
        submittedAt: new Date(),
      },
    });
  });
}
