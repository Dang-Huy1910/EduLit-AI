import { DomainError } from "../../../core/errors.js";
import {
  assertNonNegativeDecimal,
  decimal,
  decimalString,
  isMultipleOfStep,
  type DecimalInput,
} from "../../../core/decimal.js";
import { rubricsEqual, type Rubric, validateRubric } from "../../assignments/domain/rubric.js";

export const DEFAULT_MODEL_NAME = "gemini-2.5-flash";

export type CriterionEvaluation = {
  criterionId: string;
  awardedScore: string;
  comment?: string;
  strengths?: string[];
  weaknesses?: string[];
};

export type ValidatedAssessmentScores = {
  evaluations: CriterionEvaluation[];
  totalScore: string;
  maxScore: string;
  rubric: Rubric;
};

export function validateAssessmentScores(input: {
  rubric: unknown;
  maxScore: DecimalInput;
  scoreStep: DecimalInput;
  evaluations: unknown;
  totalScore: DecimalInput;
}): ValidatedAssessmentScores {
  const rubric = validateRubric(input.rubric, input.maxScore, input.scoreStep);
  const scoreStep = decimal(input.scoreStep);
  const maxScore = decimal(input.maxScore);

  if (!Array.isArray(input.evaluations) || input.evaluations.length !== rubric.criteria.length) {
    throw new DomainError(
      "EVALUATION_SHAPE",
      "detailedEvaluations must have exactly one entry per rubric criterion",
    );
  }

  const byId = new Map(rubric.criteria.map((criterion) => [criterion.criterionId, criterion]));
  const seen = new Set<string>();
  let awardedSum = decimal(0);
  const evaluations: CriterionEvaluation[] = [];

  for (const item of input.evaluations) {
    if (!item || typeof item !== "object") {
      throw new DomainError("EVALUATION_SHAPE", "each evaluation must be an object");
    }
    const row = item as Record<string, unknown>;
    if (typeof row.criterionId !== "string" || !row.criterionId) {
      throw new DomainError("EVALUATION_SHAPE", "criterionId is required");
    }
    if (seen.has(row.criterionId)) {
      throw new DomainError("EVALUATION_CRITERION", `duplicate criterionId ${row.criterionId}`);
    }
    seen.add(row.criterionId);
    const criterion = byId.get(row.criterionId);
    if (!criterion) {
      throw new DomainError("EVALUATION_CRITERION", `unknown criterionId ${row.criterionId}`);
    }
    const awarded = assertNonNegativeDecimal(asDecimalInput(row.awardedScore, "awardedScore"), "awardedScore");
    const weight = decimal(criterion.weight);
    if (awarded.lt(0) || awarded.gt(weight)) {
      throw new DomainError(
        "EVALUATION_SCORE_RANGE",
        `awardedScore for ${row.criterionId} must be between 0 and ${criterion.weight}`,
      );
    }
    if (!isMultipleOfStep(awarded, scoreStep)) {
      throw new DomainError(
        "EVALUATION_SCORE_STEP",
        `awardedScore for ${row.criterionId} must follow scoreStep`,
      );
    }
    awardedSum = awardedSum.plus(awarded);
    const evaluation: CriterionEvaluation = {
      criterionId: row.criterionId,
      awardedScore: decimalString(awarded),
    };
    if (typeof row.comment === "string") {
      evaluation.comment = row.comment;
    }
    if (Array.isArray(row.strengths) && row.strengths.every((v) => typeof v === "string")) {
      evaluation.strengths = row.strengths;
    }
    if (Array.isArray(row.weaknesses) && row.weaknesses.every((v) => typeof v === "string")) {
      evaluation.weaknesses = row.weaknesses;
    }
    evaluations.push(evaluation);
  }

  if (seen.size !== byId.size) {
    throw new DomainError("EVALUATION_CRITERION", "evaluations must cover every rubric criterion");
  }

  const totalScore = assertNonNegativeDecimal(input.totalScore, "totalScore");
  if (!totalScore.eq(awardedSum)) {
    throw new DomainError("EVALUATION_TOTAL", "totalScore must equal the sum of awardedScore");
  }
  if (totalScore.gt(maxScore)) {
    throw new DomainError("EVALUATION_TOTAL", "totalScore cannot exceed maxScore");
  }

  return {
    evaluations,
    totalScore: decimalString(totalScore),
    maxScore: decimalString(maxScore),
    rubric,
  };
}

export function assertRubricSnapshotMatchesAssignment(
  assignmentRubric: unknown,
  assessmentRubric: unknown,
  maxScore: DecimalInput,
  scoreStep: DecimalInput,
): void {
  const left = validateRubric(assignmentRubric, maxScore, scoreStep);
  const right = validateRubric(assessmentRubric, maxScore, scoreStep);
  if (!rubricsEqual(left, right)) {
    throw new DomainError(
      "SNAPSHOT_MISMATCH",
      "assessment rubricSnapshot must match the submission assignmentSnapshot rubric",
    );
  }
}

function asDecimalInput(value: unknown, field: string): DecimalInput {
  if (typeof value === "number" || typeof value === "string") {
    return value;
  }
  throw new DomainError("EVALUATION_SHAPE", `${field} must be a decimal number or string`);
}
