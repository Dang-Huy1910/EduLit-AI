import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  loadAssessmentPromptBundle,
  resolveAssessmentAssetsDir,
} from "../../src/modules/assessment/prompt-assets.js";
import { ASSESSMENT_PROMPT_VERSION } from "../../src/modules/assessment/domain/output.js";

test("assessment prompt assets load independently of cwd and match prompts/assessment", () => {
  const previous = process.cwd();
  process.chdir("/tmp");
  try {
    const bundle = loadAssessmentPromptBundle();
    assert.equal(bundle.promptVersion, ASSESSMENT_PROMPT_VERSION);
    assert.match(bundle.systemInstruction, /UNTRUSTED/);
    assert.match(bundle.systemInstruction, /10 điểm/);
    assert.equal(bundle.outputSchema.type, "object");
    assert.equal(bundle.outputSchema.additionalProperties, false);
    const assetsDir = resolveAssessmentAssetsDir();
    const repoPrompt = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../prompts/assessment/system.v1.md",
    );
    assert.equal(
      fs.readFileSync(path.join(assetsDir, "system.v1.md"), "utf8").trim(),
      fs.readFileSync(repoPrompt, "utf8").trim(),
    );
  } finally {
    process.chdir(previous);
  }
});
