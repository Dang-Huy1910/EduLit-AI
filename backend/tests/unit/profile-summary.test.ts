import assert from "node:assert/strict";
import { test } from "node:test";
import { buildProfileSummary } from "../../src/modules/writing-profile/domain/profile.js";

test("RESOLVED weaknesses are history, not current practice needs", () => {
  const built = buildProfileSummary([
    {
      id: "o1",
      kind: "WEAKNESS",
      featureKey: "compound-sentence",
      description: "Câu ghép thiếu vế",
      status: "RESOLVED",
      assessmentId: "a1",
      assignmentId: "as1",
      observedAt: new Date("2026-10-01T00:00:00.000Z"),
    },
    {
      id: "o2",
      kind: "STRENGTH",
      featureKey: "evidence",
      description: "Có dẫn chứng",
      status: "SUPPORTED",
      assessmentId: "a2",
      assignmentId: "as2",
      observedAt: new Date("2026-10-02T00:00:00.000Z"),
    },
  ]);
  assert.deepEqual(built.summary.practiceNeeds, []);
  assert.deepEqual(built.summary.strengths, ["Có dẫn chứng"]);
  assert.equal(built.summary.resolvedItems.length, 1);
  assert.equal(built.summary.resolvedItems[0]?.featureKey, "compound-sentence");
  assert.deepEqual(built.observationIds, ["o2"]);
  assert.equal(built.summary.supportCountByFeature["compound-sentence"], undefined);
});
