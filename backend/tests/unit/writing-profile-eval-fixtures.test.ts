import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("writing-profile evaluation fixtures include teacher quote/genre checks", () => {
  const filePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../evaluations/writing-profile/cases.v1.json",
  );
  const cases = JSON.parse(fs.readFileSync(filePath, "utf8")) as Array<{
    id: string;
    essay: string;
    genre: string;
    teacherReference: { notes: string; mustHaveEvidenceQuote?: string };
    schemaChecks: string[];
  }>;
  assert.ok(cases.length >= 6);
  for (const item of cases) {
    assert.ok(item.id);
    assert.ok(item.essay);
    assert.ok(item.genre);
    assert.ok(item.teacherReference.notes);
    assert.ok(item.schemaChecks.length > 0);
  }
});
