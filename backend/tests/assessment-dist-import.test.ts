import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

test("dist assessment prompt loader works from another cwd", async () => {
  const backendRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
  const distLoader = path.join(backendRoot, "dist/modules/assessment/prompt-assets.js");
  const distAsset = path.join(backendRoot, "dist/modules/assessment/assets/system.v1.md");
  assert.equal(fs.existsSync(distLoader), true, "run npm run build before this test");
  assert.equal(fs.existsSync(distAsset), true, "build must copy assessment prompt assets");
  const previous = process.cwd();
  process.chdir("/tmp");
  try {
    const mod = (await import(pathToFileURL(distLoader).href)) as {
      loadAssessmentPromptBundle: () => { promptVersion: string; systemInstruction: string };
    };
    const bundle = mod.loadAssessmentPromptBundle();
    assert.equal(bundle.promptVersion, "assessment-system.v1");
    assert.match(bundle.systemInstruction, /rubric/);
  } finally {
    process.chdir(previous);
  }
});
