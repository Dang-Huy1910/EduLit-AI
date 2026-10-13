import { DomainError } from "../../../core/errors.js";
import { decimalString, type DecimalInput } from "../../../core/decimal.js";
import { canonicalizeRubric, type AssignmentSnapshot, validateRubric } from "./rubric.js";

export type AssignmentSnapshotSource = {
  id: string;
  code: string;
  title: string;
  instructions: string;
  genre: string;
  gradeLevel: number;
  learningMaterialText: string;
  rubric: unknown;
  maxScore: DecimalInput;
  scoreStep: DecimalInput;
  status: string;
  publishedAt: Date | string | null;
  dueAt: Date | string | null;
};

export function buildAssignmentSnapshot(
  source: AssignmentSnapshotSource,
  snapshottedAt: Date,
): AssignmentSnapshot {
  const rubric = canonicalizeRubric(validateRubric(source.rubric, source.maxScore, source.scoreStep));
  return {
    assignmentId: source.id,
    code: source.code,
    title: source.title,
    instructions: source.instructions,
    genre: source.genre,
    gradeLevel: source.gradeLevel,
    learningMaterialText: source.learningMaterialText,
    rubric,
    maxScore: decimalString(source.maxScore),
    scoreStep: decimalString(source.scoreStep),
    status: source.status,
    publishedAt: toIso(source.publishedAt),
    dueAt: toIso(source.dueAt),
    snapshottedAt: snapshottedAt.toISOString(),
  };
}

export function assignmentSnapshotFromContext(
  context: unknown,
  snapshottedAt: Date,
): AssignmentSnapshot {
  if (!context || typeof context !== "object") {
    throw new DomainError("SESSION_SNAPSHOT", "socratic session is missing contextSnapshot");
  }
  const row = context as Record<string, unknown>;
  const assignmentId = asString(row.assignmentId, "assignmentId");
  return buildAssignmentSnapshot(
    {
      id: assignmentId,
      code: asString(row.code, "code"),
      title: asString(row.title, "title"),
      instructions: asString(row.instructions, "instructions"),
      genre: asString(row.genre, "genre"),
      gradeLevel: asGrade(row.gradeLevel),
      learningMaterialText: asString(row.learningMaterialText, "learningMaterialText"),
      rubric: row.rubric,
      maxScore: asDecimalField(row.maxScore, "maxScore"),
      scoreStep: asDecimalField(row.scoreStep, "scoreStep"),
      status: typeof row.status === "string" ? row.status : "PUBLISHED",
      publishedAt: (row.publishedAt as string | null | undefined) ?? null,
      dueAt: (row.dueAt as string | null | undefined) ?? null,
    },
    snapshottedAt,
  );
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : value;
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new DomainError("SESSION_SNAPSHOT", `contextSnapshot.${field} is required`);
  }
  return value;
}

function asGrade(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new DomainError("SESSION_SNAPSHOT", "contextSnapshot.gradeLevel is required");
  }
  return value;
}

function asDecimalField(value: unknown, field: string): DecimalInput {
  if (typeof value === "string" || typeof value === "number") {
    return value;
  }
  throw new DomainError("SESSION_SNAPSHOT", `contextSnapshot.${field} is required`);
}
