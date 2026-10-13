import { Prisma } from "../../../generated/prisma/client.js";
import { DomainError } from "../../../core/errors.js";

export async function lockStudentThenAssignment(
  tx: Prisma.TransactionClient,
  studentId: string,
  assignmentId: string,
): Promise<void> {
  const users = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT id FROM users WHERE id = ${studentId}::uuid FOR UPDATE`,
  );
  if (users.length === 0) {
    throw new DomainError("SUBMISSION_STUDENT", "student not found");
  }
  const assignment = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT id FROM assignments WHERE id = ${assignmentId}::uuid FOR UPDATE`,
  );
  if (assignment.length === 0) {
    throw new DomainError("SUBMISSION_ASSIGNMENT", "assignment not found");
  }
}

export async function lockTeacherRow(tx: Prisma.TransactionClient, teacherId: string): Promise<{
  id: string;
  role: string;
  status: string;
}> {
  const rows = await tx.$queryRaw<Array<{ id: string; role: string; status: string }>>(
    Prisma.sql`SELECT id, role::text, status::text FROM users WHERE id = ${teacherId}::uuid FOR UPDATE`,
  );
  const teacher = rows[0];
  if (!teacher) {
    throw new DomainError("ACTOR_INVALID", "authenticated user does not exist");
  }
  return teacher;
}
