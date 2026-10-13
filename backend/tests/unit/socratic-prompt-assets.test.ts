import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  loadSocraticOutlineInitBundle,
  loadSocraticPromptBundle,
  resolveSocraticAssetsDir,
} from "../../src/modules/socratic/prompt-assets.js";
import { SOCRATIC_OUTLINE_INIT_PROMPT_VERSION, SOCRATIC_PROMPT_VERSION } from "../../src/modules/socratic/domain/output.js";
import { socraticMessageId } from "../../src/modules/socratic/domain/message-ids.js";

test("prompt assets load independently of cwd and match prompts/socratic", () => {
  const previous = process.cwd();
  process.chdir("/tmp");
  try {
    const bundle = loadSocraticPromptBundle();
    assert.equal(bundle.promptVersion, SOCRATIC_PROMPT_VERSION);
    assert.match(bundle.systemInstruction, /BR-01/);
    assert.equal(bundle.outputSchema.type, "object");
    const assetsDir = resolveSocraticAssetsDir();
    const repoPrompt = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../prompts/socratic/system.v1.md",
    );
    assert.equal(fs.readFileSync(path.join(assetsDir, "system.v1.md"), "utf8").trim(), fs.readFileSync(repoPrompt, "utf8").trim());
    const init = loadSocraticOutlineInitBundle();
    assert.equal(init.promptVersion, SOCRATIC_OUTLINE_INIT_PROMPT_VERSION);
    assert.match(init.systemInstruction, /DÀN Ý GỢI Ý/);
    const repoInit = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../prompts/socratic/outline-init.v1.md",
    );
    assert.equal(
      fs.readFileSync(path.join(assetsDir, "outline-init.v1.md"), "utf8").trim(),
      fs.readFileSync(repoInit, "utf8").trim(),
    );
  } finally {
    process.chdir(previous);
  }
});

test("message ids are stable per session, request and role", () => {
  const a = socraticMessageId("session-1", "req-1", "USER");
  const b = socraticMessageId("session-1", "req-1", "USER");
  const c = socraticMessageId("session-1", "req-1", "ASSISTANT");
  const d = socraticMessageId("session-1", "req-2", "USER");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.notEqual(a, d);
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});
