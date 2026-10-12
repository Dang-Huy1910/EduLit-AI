import type { Prisma } from "../../../generated/prisma/client.js";
import { DomainError } from "../../../core/errors.js";
import { decimalString } from "../../../core/decimal.js";
import { sha256Utf8 } from "../../../core/hash.js";
import type { EduLitPrisma } from "../../../infrastructure/database/prisma.client.js";
import {
  canonicalizeRubric,
  type AssignmentSnapshot,
  validateRubric,
} from "../../assignments/domain/rubric.js";

export type SubmitAssignmentInput = {
  studentId: string;
  assignmentId: string;
  text: string;
  socraticSessionId?: string | null;
};

export async function submitAssignment(prisma: EduLitPrisma, input: SubmitAssignmentInput) {
  if (!input.text.trim()) {
    throw new DomainError("SUBMISSION_TEXT", "submission text must not be empty");
  }

  const student = await prisma.user.findUnique({ where: { id: input.studentId } });
  if (!student || student.role !== "STUDENT" || student.status !== "ACTIVE") {
    throw new DomainError("SUBMISSION_STUDENT", "studentId must be an active STUDENT");
  }

  const assignment = await prisma.assignment.findUnique({ where: { id: input.assignmentId } });
  if (!assignment) {
    throw new DomainError("SUBMISSION_ASSIGNMENT", "assignment not found");
  }
  if (assignment.status === "DRAFT") {
    throw new DomainError("SUBMISSION_ASSIGNMENT", "cannot submit a DRAFT assignment");
  }

  if (input.socraticSessionId) {
    const session = await prisma.socraticSession.findUnique({
      where: { id: input.socraticSessionId },
    });
    if (
      !session ||
      session.studentId !== input.studentId ||
      session.assignmentId !== input.assignmentId
    ) {
      throw new DomainError(
        "SUBMISSION_SESSION",
        "socraticSessionId must belong to the same student and assignment",
      );
    }
  }

  const rubric = canonicalizeRubric(
    validateRubric(assignment.rubric, assignment.maxScore, assignment.scoreStep),
  );
  const snapshot: AssignmentSnapshot = {
    assignmentId: assignment.id,
    code: assignment.code,
    title: assignment.title,
    instructions: assignment.instructions,
    genre: assignment.genre,
    gradeLevel: assignment.gradeLevel,
    learningMaterialText: assignment.learningMaterialText,
    rubric,
    maxScore: decimalString(assignment.maxScore),
    scoreStep: decimalString(assignment.scoreStep),
    status: assignment.status,
    publishedAt: assignment.publishedAt ? assignment.publishedAt.toISOString() : null,
    dueAt: assignment.dueAt ? assignment.dueAt.toISOString() : null,
    snapshottedAt: new Date().toISOString(),
  };

  return prisma.submission.create({
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
}
