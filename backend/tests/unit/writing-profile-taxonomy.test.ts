import assert from "node:assert/strict";
import { test } from "node:test";
import { DomainError } from "../../src/core/errors.js";
import {
  WRITING_TRAITS,
  assertTraitKind,
  buildFeatureKey,
  parseFeatureKey,
} from "../../src/modules/writing-profile/domain/taxonomy.js";

test("featureKey is genre|kind|traitId without heuristic genre normalize", () => {
  assert.equal(buildFeatureKey("NLXH", "STYLE", "WORD_CHOICE"), "NLXH|STYLE|WORD_CHOICE");
  assert.equal(buildFeatureKey("nlxh", "STYLE", "WORD_CHOICE"), "nlxh|STYLE|WORD_CHOICE");
  assert.equal(
    buildFeatureKey("Nghị luận xã hội", "WEAKNESS", "TRANSITIONS"),
    "Nghị luận xã hội|WEAKNESS|TRANSITIONS",
  );
  assert.notEqual(buildFeatureKey("NLXH", "STYLE", "WORD_CHOICE"), buildFeatureKey("nlxh", "STYLE", "WORD_CHOICE"));
  assert.notEqual(
    buildFeatureKey("NLXH", "STRENGTH", "WORD_CHOICE"),
    buildFeatureKey("NLXH", "STYLE", "WORD_CHOICE"),
  );
  const parsed = parseFeatureKey("NLXH|STYLE|WORD_CHOICE");
  assert.deepEqual(parsed, { genre: "NLXH", kind: "STYLE", traitId: "WORD_CHOICE" });
});

test("taxonomy rejects unknown traits, disallowed kinds, and pipe in genre", () => {
  assert.equal(Object.keys(WRITING_TRAITS).length, 8);
  assert.throws(
    () => assertTraitKind("VOICE_CLONE", "STYLE"),
    (error: unknown) => error instanceof DomainError && error.code === "OBSERVATION_TRAIT",
  );
  assert.throws(
    () => buildFeatureKey("NLXH", "STYLE", "TRANSITIONS"),
    (error: unknown) => error instanceof DomainError && error.code === "OBSERVATION_KIND",
  );
  assert.throws(
    () => buildFeatureKey("NL|XH", "STYLE", "WORD_CHOICE"),
    (error: unknown) => error instanceof DomainError && error.code === "OBSERVATION_GENRE",
  );
});
