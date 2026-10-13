import type { Prisma } from "../../../generated/prisma/client.js";
import { DomainError } from "../../../core/errors.js";
import type { EduLitPrisma } from "../../../infrastructure/database/prisma.client.js";
import { buildAssignmentSnapshot } from "../../assignments/domain/snapshot.js";

export type StartSocraticSessionInput = {
  studentId: string;
  assignmentId: string;
  outline?: Prisma.InputJsonValue;
};

export async function startSocraticSession(prisma: EduLitPrisma, input: StartSocraticSessionInput) {
  const student = await prisma.user.findUnique({ where: { id: input.studentId } });
  if (!student || student.role !== "STUDENT" || student.status !== "ACTIVE") {
    throw new DomainError("SESSION_STUDENT", "studentId must be an active STUDENT");
  }
  const assignment = await prisma.assignment.findUnique({ where: { id: input.assignmentId } });
  if (!assignment) {
    throw new DomainError("SESSION_ASSIGNMENT", "assignment not found");
  }

  const contextSnapshot = buildAssignmentSnapshot(assignment, new Date());

  return prisma.socraticSession.create({
    data: {
      studentId: input.studentId,
      assignmentId: input.assignmentId,
      contextSnapshot: contextSnapshot as Prisma.InputJsonValue,
      outline: (input.outline ?? { sections: [] }) as Prisma.InputJsonValue,
      status: "ACTIVE",
    },
  });
}
