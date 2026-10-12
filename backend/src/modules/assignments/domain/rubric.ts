import { DomainError } from "../../../core/errors.js";
import {
  assertPositiveDecimal,
  decimal,
  decimalString,
  isMultipleOfStep,
  type DecimalInput,
} from "../../../core/decimal.js";

export type RubricCriterion = {
  criterionId: string;
  name: string;
  weight: string;
  descriptor?: string;
  requiredElements?: string[];
};

export type Rubric = {
  criteria: RubricCriterion[];
};

export type AssignmentSnapshot = {
  assignmentId: string;
  code: string;
  title: string;
  instructions: string;
  genre: string;
  gradeLevel: number;
  learningMaterialText: string;
  rubric: Rubric;
  maxScore: string;
  scoreStep: string;
  status: string;
  publishedAt: string | null;
  dueAt: string | null;
  snapshottedAt: string;
};

const GRADE_MIN = 10;
const GRADE_MAX = 12;

export function assertGradeLevel(gradeLevel: number): void {
  if (!Number.isInteger(gradeLevel) || gradeLevel < GRADE_MIN || gradeLevel > GRADE_MAX) {
    throw new DomainError("GRADE_LEVEL", "gradeLevel must be an integer from 10 to 12");
  }
}

export function validateRubric(
  input: unknown,
  maxScoreInput: DecimalInput,
  scoreStepInput: DecimalInput,
): Rubric {
  const maxScore = assertPositiveDecimal(maxScoreInput, "maxScore");
  const scoreStep = assertPositiveDecimal(scoreStepInput, "scoreStep");
  if (!input || typeof input !== "object") {
    throw new DomainError("RUBRIC_SHAPE", "rubric must be an object");
  }
  const criteria = (input as { criteria?: unknown }).criteria;
  if (!Array.isArray(criteria) || criteria.length === 0) {
    throw new DomainError("RUBRIC_SHAPE", "rubric.criteria must be a non-empty array");
  }

  const seen = new Set<string>();
  let weightSum = decimal(0);
  const normalized: RubricCriterion[] = [];

  for (const item of criteria) {
    if (!item || typeof item !== "object") {
      throw new DomainError("RUBRIC_SHAPE", "each criterion must be an object");
    }
    const row = item as Record<string, unknown>;
    const criterionId = asNonEmptyString(row.criterionId, "criterionId");
    if (seen.has(criterionId)) {
      throw new DomainError("RUBRIC_CRITERION", `duplicate criterionId ${criterionId}`);
    }
    seen.add(criterionId);
    const name = asNonEmptyString(row.name, "name");
    const weight = assertPositiveDecimal(asDecimalInput(row.weight, "weight"), "weight");
    if (!isMultipleOfStep(weight, scoreStep)) {
      throw new DomainError("RUBRIC_WEIGHT", `weight for ${criterionId} must follow scoreStep`);
    }
    weightSum = weightSum.plus(weight);

    const criterion: RubricCriterion = {
      criterionId,
      name,
      weight: decimalString(weight),
    };
    if (typeof row.descriptor === "string" && row.descriptor.trim()) {
      criterion.descriptor = row.descriptor;
    }
    if (row.requiredElements !== undefined) {
      if (!Array.isArray(row.requiredElements) || row.requiredElements.some((v) => typeof v !== "string")) {
        throw new DomainError("RUBRIC_SHAPE", "requiredElements must be a string array");
      }
      criterion.requiredElements = row.requiredElements;
    }
    normalized.push(criterion);
  }

  if (!weightSum.eq(maxScore)) {
    throw new DomainError(
      "RUBRIC_WEIGHT_SUM",
      "sum of criterion weights must equal maxScore; weight is max points, not a multiplier",
    );
  }

  return { criteria: normalized };
}

export function rubricsEqual(left: Rubric, right: Rubric): boolean {
  return JSON.stringify(canonicalizeRubric(left)) === JSON.stringify(canonicalizeRubric(right));
}

export function canonicalizeRubric(rubric: Rubric): Rubric {
  return {
    criteria: rubric.criteria.map((criterion) => ({
      criterionId: criterion.criterionId,
      name: criterion.name,
      weight: decimalString(criterion.weight),
      ...(criterion.descriptor ? { descriptor: criterion.descriptor } : {}),
      ...(criterion.requiredElements ? { requiredElements: [...criterion.requiredElements] } : {}),
    })),
  };
}

function asNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new DomainError("RUBRIC_SHAPE", `${field} must be a non-empty string`);
  }
  return value.trim();
}

function asDecimalInput(value: unknown, field: string): DecimalInput {
  if (typeof value === "number" || typeof value === "string") {
    return value;
  }
  throw new DomainError("RUBRIC_SHAPE", `${field} must be a decimal number or string`);
}
