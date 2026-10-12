import assert from "node:assert/strict";
import { test } from "node:test";
import { DomainError } from "../../src/core/errors.js";
import { validateAssessmentScores } from "../../src/modules/assessment/domain/evaluation.js";

const rubric = {
  criteria: [
    { criterionId: "C1", name: "Bố cục", weight: "4.00" },
    { criterionId: "C2", name: "Luận điểm", weight: "6.00" },
  ],
};

test("accepts scores that follow scoreStep and sum to totalScore", () => {
  const result = validateAssessmentScores({
    rubric,
    maxScore: "10.00",
    scoreStep: "0.25",
    evaluations: [
      { criterionId: "C1", awardedScore: "3.25" },
      { criterionId: "C2", awardedScore: "5.00" },
    ],
    totalScore: "8.25",
  });
  assert.equal(result.totalScore, "8.25");
});

test("rejects out-of-range, wrong total, unknown criterion and mismatched snapshot totals", () => {
  assert.throws(
    () =>
      validateAssessmentScores({
        rubric,
        maxScore: "10.00",
        scoreStep: "0.25",
        evaluations: [
          { criterionId: "C1", awardedScore: "5.00" },
          { criterionId: "C2", awardedScore: "1.00" },
        ],
        totalScore: "6.00",
      }),
    DomainError,
  );
  assert.throws(
    () =>
      validateAssessmentScores({
        rubric,
        maxScore: "10.00",
        scoreStep: "0.25",
        evaluations: [
          { criterionId: "C1", awardedScore: "2.00" },
          { criterionId: "C2", awardedScore: "2.00" },
        ],
        totalScore: "5.00",
      }),
    (error: unknown) => error instanceof DomainError && error.code === "EVALUATION_TOTAL",
  );
  assert.throws(
    () =>
      validateAssessmentScores({
        rubric,
        maxScore: "10.00",
        scoreStep: "0.25",
        evaluations: [
          { criterionId: "C1", awardedScore: "2.00" },
          { criterionId: "CX", awardedScore: "2.00" },
        ],
        totalScore: "4.00",
      }),
    DomainError,
  );
});
