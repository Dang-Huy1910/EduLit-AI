import assert from "node:assert/strict";
import { test } from "node:test";
import { DomainError } from "../../src/core/errors.js";
import { assertExactScoreScale, assertPositiveDecimal } from "../../src/core/decimal.js";
import { validateRubric } from "../../src/modules/assignments/domain/rubric.js";

test("rejects score values that would round when stored as numeric(8,2)", () => {
  assert.throws(() => assertExactScoreScale("0.005", "weight"), DomainError);
  assert.throws(() => assertPositiveDecimal("0.005", "scoreStep"), (error: unknown) => {
    return error instanceof DomainError && error.code === "DECIMAL_SCALE";
  });
  assert.throws(
    () =>
      validateRubric(
        {
          criteria: [
            { criterionId: "C1", name: "A", weight: "0.005" },
            { criterionId: "C2", name: "B", weight: "0.005" },
          ],
        },
        "0.01",
        "0.005",
      ),
    (error: unknown) => error instanceof DomainError && error.code === "DECIMAL_SCALE",
  );
});

test("accepts values that already fit two decimal places", () => {
  assert.equal(assertExactScoreScale("0.25", "weight").toFixed(2), "0.25");
  assert.equal(assertExactScoreScale("10.00", "maxScore").toFixed(2), "10.00");
  const rubric = validateRubric(
    {
      criteria: [
        { criterionId: "C1", name: "A", weight: "0.25" },
        { criterionId: "C2", name: "B", weight: "0.75" },
      ],
    },
    "1.00",
    "0.25",
  );
  assert.equal(rubric.criteria[0]?.weight, "0.25");
  assert.equal(rubric.criteria[1]?.weight, "0.75");
});
