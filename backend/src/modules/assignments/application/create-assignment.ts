import type { Prisma } from "../../../generated/prisma/client.js";
import { DomainError } from "../../../core/errors.js";
import { decimalString, type DecimalInput } from "../../../core/decimal.js";
import type { EduLitPrisma } from "../../../infrastructure/database/prisma.client.js";
import {
  assertGradeLevel,
  canonicalizeRubric,
  validateRubric,
} from "../domain/rubric.js";

export type CreateAssignmentInput = {
  teacherId: string;
  code: string;
  title: string;
  instructions: string;
  genre: string;
  gradeLevel: number;
  learningMaterialText: string;
  rubric: unknown;
  maxScore: DecimalInput;
  scoreStep: DecimalInput;
  status?: "DRAFT" | "PUBLISHED" | "CLOSED";
  publishedAt?: Date | null;
  dueAt?: Date | null;
};

export async function createAssignment(prisma: EduLitPrisma, input: CreateAssignmentInput) {
  const teacher = await prisma.user.findUnique({ where: { id: input.teacherId } });
  if (!teacher || teacher.role !== "TEACHER" || teacher.status !== "ACTIVE") {
    throw new DomainError("ASSIGNMENT_OWNER", "Assignment teacherId must be an active TEACHER");
  }
  assertGradeLevel(input.gradeLevel);
  const rubric = canonicalizeRubric(validateRubric(input.rubric, input.maxScore, input.scoreStep));
  const status = input.status ?? "DRAFT";
  const publishedAt = status === "PUBLISHED" ? (input.publishedAt ?? new Date()) : (input.publishedAt ?? null);

  if (status === "PUBLISHED" && !publishedAt) {
    throw new DomainError("ASSIGNMENT_STATUS", "PUBLISHED assignments require publishedAt");
  }

  return prisma.assignment.create({
    data: {
      teacherId: input.teacherId,
      code: input.code,
      title: input.title,
      instructions: input.instructions,
      genre: input.genre,
      gradeLevel: input.gradeLevel,
      learningMaterialText: input.learningMaterialText,
      rubric: rubric as Prisma.InputJsonValue,
      maxScore: decimalString(input.maxScore),
      scoreStep: decimalString(input.scoreStep),
      status,
      publishedAt,
      dueAt: input.dueAt ?? null,
    },
  });
}
