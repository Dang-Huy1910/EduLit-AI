import assert from "node:assert/strict";
import { test } from "node:test";
import { FakeSocraticAi } from "../../src/infrastructure/ai/fake-socratic.adapter.js";
import { generateScaffold } from "../../src/modules/socratic/application/generate-scaffold.js";
import type { AssignmentSnapshot } from "../../src/modules/assignments/domain/rubric.js";
import { isBlankOutline } from "../../src/modules/socratic/domain/outline.js";

const snapshot: AssignmentSnapshot = {
  assignmentId: "a",
  code: "T",
  title: "Bản lĩnh trước áp lực thành tích",
  instructions: "Viết nghị luận.",
  genre: "NLXH",
  gradeLevel: 12,
  learningMaterialText: "Thành tích cần đi cùng sự trung thực.",
  rubric: { criteria: [{ criterionId: "C1", name: "Bố cục", weight: "10.00" }] },
  maxScore: "10.00",
  scoreStep: "0.25",
  status: "PUBLISHED",
  publishedAt: null,
  dueAt: null,
  snapshottedAt: "2026-10-13T00:00:00.000Z",
};

test("fake outline init is accepted as a short suggested scaffold", async () => {
  const fake = new FakeSocraticAi();
  const result = await generateScaffold(fake, snapshot);
  assert.equal(result.responseMode, "model");
  assert.equal(isBlankOutline(result.outline), false);
  assert.match(result.welcomeText, /\?/);
  assert.equal(fake.outlineCalls.length, 1);
});

test("invalid output falls back, but provider failures remain retryable errors", async () => {
  const invalid = new FakeSocraticAi();
  invalid.nextOutlineOutput = {
    welcomeSentences: ["Chào em."],
    outline: { sections: [] },
  };
  const invalidResult = await generateScaffold(invalid, snapshot);
  assert.equal(invalidResult.responseMode, "fallback");
  assert.equal(invalidResult.outline.sections[0]?.id, "open");
  assert.match(invalidResult.welcomeText, /\?/);

  const failing = new FakeSocraticAi();
  failing.nextOutlineError = new Error("provider down");
  await assert.rejects(() => generateScaffold(failing, snapshot), /provider down/);
});
