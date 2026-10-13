import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("evaluation fixture has at least 12 Vietnamese cases with expected behavior", () => {
  const filePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../evaluations/socratic/cases.v1.json",
  );
  const cases = JSON.parse(fs.readFileSync(filePath, "utf8")) as Array<{
    id: string;
    studentMessage: string;
    expectedBehavior: string;
    rubric: string;
  }>;
  assert.ok(cases.length >= 12);
  for (const item of cases) {
    assert.ok(item.id);
    assert.ok(item.studentMessage);
    assert.ok(item.expectedBehavior);
    assert.ok(item.rubric);
  }
});
