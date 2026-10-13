import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  loadWritingProfilePromptBundle,
  resolveWritingProfileAssetsDir,
} from "../../src/modules/writing-profile/prompt-assets.js";
import { WRITING_PROFILE_PROMPT_VERSION } from "../../src/modules/writing-profile/domain/output.js";

test("writing-profile prompt assets load independently of cwd and match prompts/writing-profile", () => {
  const previous = process.cwd();
  process.chdir("/tmp");
  try {
    const bundle = loadWritingProfilePromptBundle();
    assert.equal(bundle.promptVersion, WRITING_PROFILE_PROMPT_VERSION);
    assert.match(bundle.systemInstruction, /UNTRUSTED/);
    assert.match(bundle.systemInstruction, /TAXONOMY/);
    assert.equal(bundle.outputSchema.type, "object");
    assert.equal(bundle.outputSchema.additionalProperties, false);
    const assetsDir = resolveWritingProfileAssetsDir();
    const repoPrompt = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../prompts/writing-profile/system.v1.md",
    );
    assert.equal(
      fs.readFileSync(path.join(assetsDir, "system.v1.md"), "utf8").trim(),
      fs.readFileSync(repoPrompt, "utf8").trim(),
    );
  } finally {
    process.chdir(previous);
  }
});
