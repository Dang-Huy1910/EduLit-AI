import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

test("dist prompt loader works from another cwd", async () => {
  const backendRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
  const distLoader = path.join(backendRoot, "dist/modules/socratic/prompt-assets.js");
  const distAsset = path.join(backendRoot, "dist/modules/socratic/assets/system.v1.md");
  assert.equal(fs.existsSync(distLoader), true, "run npm run build before this test");
  assert.equal(fs.existsSync(distAsset), true, "build must copy socratic prompt assets");
  const previous = process.cwd();
  process.chdir("/tmp");
  try {
    const mod = (await import(pathToFileURL(distLoader).href)) as {
      loadSocraticPromptBundle: () => { promptVersion: string; systemInstruction: string };
    };
    const bundle = mod.loadSocraticPromptBundle();
    assert.equal(bundle.promptVersion, "socratic-system.v1");
    assert.match(bundle.systemInstruction, /câu hỏi/);
  } finally {
    process.chdir(previous);
  }
});
