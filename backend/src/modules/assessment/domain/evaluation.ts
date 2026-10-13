import { DomainError } from "../../../core/errors.js";
import {
  assertNonNegativeDecimal,
  decimal,
  decimalString,
  isMultipleOfStep,
  type DecimalInput,
} from "../../../core/decimal.js";
import { assertEvidenceQuote } from "../../../core/utf16.js";
import { rubricsEqual, type Rubric, validateRubric } from "../../assignments/domain/rubric.js";
import {
  EVALUATION_COMMENT_MAX,
  EVALUATION_EVIDENCE_MAX_ITEMS,
  EVALUATION_LIST_ITEM_MAX,
  EVALUATION_LIST_MAX_ITEMS,
  EVALUATION_MISSING_MAX_ITEMS,
  EVALUATION_QUOTE_MAX,
} from "./limits.js";

/** Only used by legacy callers that have no adapter provenance. */
export const LEGACY_MODEL_NAME = "legacy/unknown";

export type EvidenceSpan = {
  quote: string;
  start: number;
  end: number;
};

export type CriterionEvaluation = {
  criterionId: string;
  awardedScore: string;
  comment?: string;
  strengths?: string[];
  weaknesses?: string[];
  evidence?: EvidenceSpan[];
  missingElements?: string[];
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
  submissionText?: string;
  requireEvidenceContract?: boolean;
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
    if (input.requireEvidenceContract) {
      if (typeof row.comment !== "string") {
        throw new DomainError("EVALUATION_SHAPE", `comment is required for ${row.criterionId}`);
      }
      if (!Array.isArray(row.strengths) || !row.strengths.every((v) => typeof v === "string")) {
        throw new DomainError("EVALUATION_SHAPE", `strengths must be a string array for ${row.criterionId}`);
      }
      if (!Array.isArray(row.weaknesses) || !row.weaknesses.every((v) => typeof v === "string")) {
        throw new DomainError("EVALUATION_SHAPE", `weaknesses must be a string array for ${row.criterionId}`);
      }
      if (!Array.isArray(row.evidence)) {
        throw new DomainError("EVALUATION_SHAPE", `evidence is required for ${row.criterionId}`);
      }
      if (!Array.isArray(row.missingElements) || !row.missingElements.every((v) => typeof v === "string")) {
        throw new DomainError(
          "EVALUATION_SHAPE",
          `missingElements must be a string array for ${row.criterionId}`,
        );
      }
    }
    if (typeof row.comment === "string") {
      assertBoundedString(row.comment, "comment", EVALUATION_COMMENT_MAX);
      evaluation.comment = row.comment;
    }
    if (Array.isArray(row.strengths) && row.strengths.every((v) => typeof v === "string")) {
      evaluation.strengths = boundedStringList(row.strengths, "strengths", EVALUATION_LIST_MAX_ITEMS);
    }
    if (Array.isArray(row.weaknesses) && row.weaknesses.every((v) => typeof v === "string")) {
      evaluation.weaknesses = boundedStringList(row.weaknesses, "weaknesses", EVALUATION_LIST_MAX_ITEMS);
    }
    if (row.evidence !== undefined) {
      evaluation.evidence = parseEvidence(row.evidence, input.submissionText);
    }
    if (row.missingElements !== undefined) {
      if (!Array.isArray(row.missingElements) || row.missingElements.some((v) => typeof v !== "string")) {
        throw new DomainError("EVALUATION_SHAPE", "missingElements must be a string array");
      }
      evaluation.missingElements = boundedStringList(
        row.missingElements,
        "missingElements",
        EVALUATION_MISSING_MAX_ITEMS,
      );
    }
    if (input.requireEvidenceContract) {
      assertEvidenceContract(evaluation, awarded);
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

function parseEvidence(value: unknown, submissionText: string | undefined): EvidenceSpan[] {
  if (!Array.isArray(value)) {
    throw new DomainError("EVALUATION_SHAPE", "evidence must be an array");
  }
  if (value.length > EVALUATION_EVIDENCE_MAX_ITEMS) {
    throw new DomainError("EVALUATION_SHAPE", "evidence has too many items");
  }
  return value.map((item) => {
    if (!item || typeof item !== "object") {
      throw new DomainError("EVALUATION_SHAPE", "each evidence item must be an object");
    }
    const row = item as Record<string, unknown>;
    if (typeof row.quote !== "string" || !row.quote) {
      throw new DomainError("EVIDENCE_QUOTE", "evidence quote must be a nonempty string");
    }
    if (row.quote.length > EVALUATION_QUOTE_MAX) {
      throw new DomainError("EVALUATION_SHAPE", "evidence quote exceeds the length limit");
    }
    if (!Number.isInteger(row.start) || !Number.isInteger(row.end)) {
      throw new DomainError("EVIDENCE_OFFSET", "Evidence offsets must be integers");
    }
    const span: EvidenceSpan = {
      quote: row.quote,
      start: row.start as number,
      end: row.end as number,
    };
    if (submissionText !== undefined) {
      assertEvidenceQuote(submissionText, span.start, span.end, span.quote);
    } else if (span.start < 0 || span.end <= span.start) {
      throw new DomainError("EVIDENCE_OFFSET", "Evidence offsets must satisfy start < end");
    }
    return span;
  });
}

function assertEvidenceContract(evaluation: CriterionEvaluation, awarded: ReturnType<typeof decimal>): void {
  const evidence = evaluation.evidence ?? [];
  const missing = evaluation.missingElements ?? [];
  const hasPresentClaim =
    Boolean(evaluation.comment?.trim()) ||
    (evaluation.strengths?.some((item) => item.trim()) ?? false) ||
    (evaluation.weaknesses?.some((item) => item.trim()) ?? false);
  if (awarded.gt(0) && evidence.length === 0) {
    throw new DomainError(
      "EVALUATION_EVIDENCE",
      `awardedScore for ${evaluation.criterionId} requires evidence from the submission`,
    );
  }
  if (awarded.eq(0) && evidence.length === 0 && missing.length === 0) {
    throw new DomainError(
      "EVALUATION_EVIDENCE",
      `zero score for ${evaluation.criterionId} requires missingElements or evidence`,
    );
  }
  if (hasPresentClaim && awarded.gt(0) && evidence.length === 0) {
    throw new DomainError(
      "EVALUATION_EVIDENCE",
      `comments about present text for ${evaluation.criterionId} require evidence`,
    );
  }
}

function boundedStringList(items: string[], field: string, maxItems: number): string[] {
  if (items.length > maxItems) {
    throw new DomainError("EVALUATION_SHAPE", `${field} has too many items`);
  }
  return items.map((item) => assertBoundedString(item, field, EVALUATION_LIST_ITEM_MAX));
}

function assertBoundedString(value: string, field: string, max: number): string {
  if (value.length > max) {
    throw new DomainError("EVALUATION_SHAPE", `${field} exceeds the length limit`);
  }
  return value;
}
