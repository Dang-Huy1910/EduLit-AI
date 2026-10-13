import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

test("dist writing-profile prompt loader works from another cwd", async () => {
  const backendRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
  const distLoader = path.join(backendRoot, "dist/modules/writing-profile/prompt-assets.js");
  const distAsset = path.join(backendRoot, "dist/modules/writing-profile/assets/system.v1.md");
  assert.equal(fs.existsSync(distLoader), true, "run npm run build before this test");
  assert.equal(fs.existsSync(distAsset), true, "build must copy writing-profile prompt assets");
  const previous = process.cwd();
  process.chdir("/tmp");
  try {
    const mod = (await import(pathToFileURL(distLoader).href)) as {
      loadWritingProfilePromptBundle: () => { promptVersion: string; systemInstruction: string };
    };
    const bundle = mod.loadWritingProfilePromptBundle();
    assert.equal(bundle.promptVersion, "writing-profile-system.v1");
    assert.match(bundle.systemInstruction, /TAXONOMY/);
  } finally {
    process.chdir(previous);
  }
});
