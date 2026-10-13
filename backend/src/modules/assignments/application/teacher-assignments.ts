import { randomBytes } from "node:crypto";
import { Prisma } from "../../../generated/prisma/client.js";
import { DomainError } from "../../../core/errors.js";
import type { DecimalInput } from "../../../core/decimal.js";
import type { EduLitPrisma } from "../../../infrastructure/database/prisma.client.js";
import { createAssignment } from "./create-assignment.js";
import { canonicalizeRubric, validateRubric } from "../domain/rubric.js";

export type TeacherAssignmentInput = {
  code?: string;
  title: string;
  instructions: string;
  genre: "NLXH" | "NLVH";
  gradeLevel: number;
  learningMaterialText: string;
  rubric: unknown;
  maxScore?: DecimalInput;
  scoreStep?: DecimalInput;
  dueAt?: string | null;
};

export async function createTeacherAssignment(prisma: EduLitPrisma, teacherId: string, input: TeacherAssignmentInput) {
  const code = normalizeCode(input.code) ?? (await nextAssignmentCode(prisma));
  return createAssignment(prisma, {
    teacherId,
    code,
    title: requiredText(input.title, "title"),
    instructions: requiredText(input.instructions, "instructions"),
    genre: validateGenre(input.genre),
    gradeLevel: input.gradeLevel,
    learningMaterialText: requiredText(input.learningMaterialText, "learningMaterialText"),
    rubric: input.rubric,
    maxScore: input.maxScore ?? "10.00",
    scoreStep: input.scoreStep ?? "0.25",
    dueAt: parseDueAt(input.dueAt),
    status: "DRAFT",
  });
}

export async function updateTeacherDraft(
  prisma: EduLitPrisma,
  teacherId: string,
  assignmentId: string,
  expectedUpdatedAt: string,
  input: TeacherAssignmentInput,
) {
  const current = await loadOwnedAssignment(prisma, teacherId, assignmentId);
  if (current.status !== "DRAFT") throw new DomainError("ASSIGNMENT_STATUS", "only DRAFT assignments can be edited");
  const expected = new Date(expectedUpdatedAt);
  if (Number.isNaN(expected.getTime())) throw new DomainError("ASSIGNMENT_CONFLICT", "expectedUpdatedAt must be an ISO date");
  const rubric = canonicalizeRubric(validateRubric(input.rubric, input.maxScore ?? current.maxScore, input.scoreStep ?? current.scoreStep));
  const updated = await prisma.assignment.updateMany({
    where: { id: assignmentId, teacherId, status: "DRAFT", updatedAt: expected },
    data: {
      ...(input.code !== undefined ? { code: normalizeCode(input.code) } : {}),
      title: requiredText(input.title, "title"),
      instructions: requiredText(input.instructions, "instructions"),
      genre: validateGenre(input.genre),
      gradeLevel: input.gradeLevel,
      learningMaterialText: requiredText(input.learningMaterialText, "learningMaterialText"),
      rubric: rubric as Prisma.InputJsonValue,
      maxScore: input.maxScore ?? current.maxScore,
      scoreStep: input.scoreStep ?? current.scoreStep,
      dueAt: parseDueAt(input.dueAt),
    },
  });
  if (updated.count !== 1) throw new DomainError("ASSIGNMENT_CONFLICT", "assignment changed while editing");
  return prisma.assignment.findUniqueOrThrow({ where: { id: assignmentId } });
}

export async function publishTeacherAssignment(prisma: EduLitPrisma, teacherId: string, assignmentId: string) {
  return changeAssignmentStatus(prisma, teacherId, assignmentId, "PUBLISHED");
}

export async function closeTeacherAssignment(prisma: EduLitPrisma, teacherId: string, assignmentId: string) {
  return changeAssignmentStatus(prisma, teacherId, assignmentId, "CLOSED");
}

export async function listTeacherAssignments(prisma: EduLitPrisma, teacherId: string) {
  const rows = await prisma.assignment.findMany({
    where: { teacherId },
    include: {
      _count: { select: { submissions: true, socraticSessions: true, progress: true } },
      submissions: { include: { assessment: { select: { status: true } } } },
    },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map((row) => ({
    ...serializeTeacherAssignment(row),
    worklist: {
      opened: row._count.socraticSessions,
      read: row._count.progress,
      submitted: row._count.submissions,
      aiDraft: row.submissions.filter((submission) => submission.assessment?.status === "AI_DRAFT").length,
      published: row.submissions.filter((submission) => submission.assessment?.status === "PUBLISHED").length,
    },
  }));
}

export async function getTeacherAssignment(prisma: EduLitPrisma, teacherId: string, assignmentId: string) {
  return serializeTeacherAssignment(await loadOwnedAssignment(prisma, teacherId, assignmentId));
}

export async function markAssignmentRead(prisma: EduLitPrisma, studentId: string, assignmentId: string) {
  const assignment = await prisma.assignment.findUnique({ where: { id: assignmentId }, select: { status: true } });
  if (!assignment || assignment.status !== "PUBLISHED") throw new DomainError("ASSIGNMENT_NOT_FOUND", "published assignment not found");
  return prisma.assignmentProgress.upsert({
    where: { studentId_assignmentId: { studentId, assignmentId } },
    create: { studentId, assignmentId, readAt: new Date() },
    update: { readAt: new Date() },
  });
}

export async function loadOwnedAssignment(prisma: EduLitPrisma, teacherId: string, assignmentId: string) {
  const row = await prisma.assignment.findUnique({ where: { id: assignmentId } });
  if (!row || row.teacherId !== teacherId) throw new DomainError("ASSIGNMENT_OWNERSHIP", "assignment is not owned by this teacher");
  return row;
}

function serializeTeacherAssignment(row: {
  id: string; code: string; title: string; instructions: string; genre: string; gradeLevel: number;
  learningMaterialText: string; rubric: unknown; maxScore: { toString(): string }; scoreStep: { toString(): string };
  status: "DRAFT" | "PUBLISHED" | "CLOSED"; dueAt: Date | null; publishedAt: Date | null; createdAt: Date; updatedAt: Date;
}) {
  return {
    id: row.id, code: row.code, title: row.title, instructions: row.instructions, genre: row.genre,
    gradeLevel: row.gradeLevel, learningMaterialText: row.learningMaterialText, rubric: row.rubric,
    maxScore: row.maxScore.toString(), scoreStep: row.scoreStep.toString(), status: row.status,
    dueAt: row.dueAt?.toISOString() ?? null, publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  };
}

async function changeAssignmentStatus(prisma: EduLitPrisma, teacherId: string, assignmentId: string, status: "PUBLISHED" | "CLOSED") {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM assignments WHERE id = ${assignmentId}::uuid FOR UPDATE`,
    );
    if (rows.length === 0) throw new DomainError("ASSIGNMENT_NOT_FOUND", "assignment not found");
    const assignment = await tx.assignment.findUniqueOrThrow({ where: { id: assignmentId } });
    if (assignment.teacherId !== teacherId) throw new DomainError("ASSIGNMENT_OWNERSHIP", "assignment is not owned by this teacher");
    if (status === "PUBLISHED" && assignment.status === "DRAFT") {
      validateRubric(assignment.rubric, assignment.maxScore, assignment.scoreStep);
      return tx.assignment.update({ where: { id: assignmentId }, data: { status, publishedAt: new Date() } });
    }
    if (status === "CLOSED" && assignment.status === "PUBLISHED") {
      return tx.assignment.update({ where: { id: assignmentId }, data: { status } });
    }
    if (assignment.status === status) return assignment;
    throw new DomainError("ASSIGNMENT_STATUS", `cannot change ${assignment.status} to ${status}`);
  });
}

async function nextAssignmentCode(prisma: EduLitPrisma): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = `EDU-${randomBytes(4).toString("hex").toUpperCase()}`;
    const exists = await prisma.assignment.findUnique({ where: { code }, select: { id: true } });
    if (!exists) return code;
  }
  throw new DomainError("ASSIGNMENT_CODE", "could not allocate an assignment code");
}

function normalizeCode(value: string | undefined): string | undefined {
  if (value === undefined || !value.trim()) return undefined;
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z0-9-]{4,32}$/.test(normalized)) throw new DomainError("ASSIGNMENT_CODE", "code must contain 4-32 uppercase letters, digits, or hyphens");
  return normalized;
}
function requiredText(value: string, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new DomainError("ASSIGNMENT_INPUT", `${field} is required`);
  return value.trim();
}
function validateGenre(value: string): "NLXH" | "NLVH" {
  if (value !== "NLXH" && value !== "NLVH") throw new DomainError("ASSIGNMENT_INPUT", "genre must be NLXH or NLVH");
  return value;
}
function parseDueAt(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new DomainError("ASSIGNMENT_INPUT", "dueAt must be an ISO date");
  return parsed;
}
