import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const script = path.join(backendRoot, "scripts/assessment-live-smoke.ts");
const tsxCli = path.join(backendRoot, "node_modules/tsx/dist/cli.mjs");

function spawnLiveSmoke(cwd: string, args: string[] = []): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.GEMINI_API_KEY;
    delete env.ASSESSMENT_LIVE;
    delete env.GEMINI_MODEL;
    delete env.OPENAI_API_KEY;
    delete env.OPENAI_MODEL;
    delete env.AI_PROVIDER;
    delete env.AI_MODEL;
    const child = spawn(process.execPath, [tsxCli, script, ...args], {
      cwd,
      env,
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer | string) => {
      output += String(chunk);
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      output += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 1, output });
    });
  });
}

test("assessment live smoke loads ASSESSMENT_LIVE and GEMINI_API_KEY from cwd .env", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "assessment-live-"));
  try {
    fs.writeFileSync(
      path.join(tmp, ".env"),
      [
        "ASSESSMENT_LIVE=1",
        "GEMINI_API_KEY=synthetic-review-key",
        "GEMINI_MODEL=gemini-1.5-pro",
        "",
      ].join("\n"),
      "utf8",
    );
    const result = await spawnLiveSmoke(tmp);
    assert.equal(result.code, 1);
    assert.match(result.output, /AI_NOT_CONFIGURED/);
    assert.doesNotMatch(result.output, /thiếu GEMINI_API_KEY/);
    assert.doesNotMatch(result.output, /live smoke chưa chạy/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("assessment live smoke --live reads GEMINI_API_KEY from cwd .env", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "assessment-live-flag-"));
  try {
    fs.writeFileSync(
      path.join(tmp, ".env"),
      ["GEMINI_API_KEY=synthetic-review-key", "GEMINI_MODEL=not-gemini-3.8-flash", ""].join("\n"),
      "utf8",
    );
    const result = await spawnLiveSmoke(tmp, ["--live"]);
    assert.equal(result.code, 1);
    assert.match(result.output, /AI_NOT_CONFIGURED/);
    assert.doesNotMatch(result.output, /thiếu GEMINI_API_KEY/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
