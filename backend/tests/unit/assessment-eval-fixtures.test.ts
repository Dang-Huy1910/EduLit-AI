import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("grading evaluation fixtures include teacher reference and schema checks", () => {
  const filePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../evaluations/grading/cases.v1.json",
  );
  const cases = JSON.parse(fs.readFileSync(filePath, "utf8")) as Array<{
    id: string;
    essay: string;
    teacherReference: { notes: string };
    schemaChecks: string[];
  }>;
  assert.ok(cases.length >= 6);
  for (const item of cases) {
    assert.ok(item.id);
    assert.ok(item.essay);
    assert.ok(item.teacherReference.notes);
    assert.ok(item.schemaChecks.length > 0);
  }
});
