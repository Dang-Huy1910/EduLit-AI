import assert from "node:assert/strict";
import { test } from "node:test";
import { DomainError } from "../../src/core/errors.js";
import { validateRubric } from "../../src/modules/assignments/domain/rubric.js";

test("accepts a valid rubric whose weights sum to maxScore", () => {
  const rubric = validateRubric(
    {
      criteria: [
        { criterionId: "C1", name: "Bố cục", weight: "2.00", descriptor: "Rõ 3 phần" },
        { criterionId: "C2", name: "Luận điểm", weight: "8.00", requiredElements: ["dẫn chứng"] },
      ],
    },
    "10.00",
    "0.25",
  );
  assert.equal(rubric.criteria.length, 2);
  assert.equal(rubric.criteria[0]?.weight, "2.00");
});

test("rejects duplicate criterion ids and weight sum mismatch", () => {
  assert.throws(
    () =>
      validateRubric(
        {
          criteria: [
            { criterionId: "C1", name: "A", weight: "5.00" },
            { criterionId: "C1", name: "B", weight: "5.00" },
          ],
        },
        "10.00",
        "0.25",
      ),
    DomainError,
  );
  assert.throws(
    () =>
      validateRubric(
        {
          criteria: [
            { criterionId: "C1", name: "A", weight: "3.00" },
            { criterionId: "C2", name: "B", weight: "5.00" },
          ],
        },
        "10.00",
        "0.25",
      ),
    (error: unknown) => error instanceof DomainError && error.code === "RUBRIC_WEIGHT_SUM",
  );
});

test("rejects non-positive maxScore, scoreStep and empty criteria", () => {
  assert.throws(() => validateRubric({ criteria: [{ criterionId: "C1", name: "A", weight: "1" }] }, "0", "0.25"));
  assert.throws(() => validateRubric({ criteria: [{ criterionId: "C1", name: "A", weight: "1" }] }, "1", "0"));
  assert.throws(() => validateRubric({ criteria: [] }, "1", "0.25"), DomainError);
});
