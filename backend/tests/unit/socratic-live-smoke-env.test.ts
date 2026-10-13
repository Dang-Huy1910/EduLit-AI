import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const script = path.join(backendRoot, "scripts/socratic-live-smoke.ts");
const tsxCli = path.join(backendRoot, "node_modules/tsx/dist/cli.mjs");

function spawnLiveSmoke(cwd: string, args: string[] = []): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    for (const key of [
      "AI_MODE",
      "AI_PROVIDER",
      "AI_MODEL",
      "GEMINI_API_KEY",
      "GEMINI_MODEL",
      "OPENAI_API_KEY",
      "OPENAI_MODEL",
      "SOCRATIC_LIVE",
    ]) {
      delete env[key];
    }
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

test("live smoke loads SOCRATIC_LIVE and GEMINI_API_KEY from cwd .env", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "socratic-live-"));
  try {
    fs.writeFileSync(
      path.join(tmp, ".env"),
      [
        "SOCRATIC_LIVE=1",
        "GEMINI_API_KEY=synthetic-review-key",
        "GEMINI_MODEL=gemini-1.5-pro",
        "",
      ].join("\n"),
      "utf8",
    );
    const result = await spawnLiveSmoke(tmp, ["--dry-run"]);
    assert.equal(result.code, 0);
    assert.match(result.output, /"provider":"gemini"/);
    assert.match(result.output, /"model":"gemini-1.5-pro"/);
    assert.match(result.output, /"key":"configured"/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("live smoke --live reads GEMINI_API_KEY from cwd .env", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "socratic-live-flag-"));
  try {
    fs.writeFileSync(
      path.join(tmp, ".env"),
      ["GEMINI_API_KEY=synthetic-review-key", "GEMINI_MODEL=not-gemini-3.8-flash", ""].join("\n"),
      "utf8",
    );
    const result = await spawnLiveSmoke(tmp, ["--live", "--dry-run"]);
    assert.equal(result.code, 0);
    assert.match(result.output, /"provider":"gemini"/);
    assert.match(result.output, /"model":"not-gemini-3.8-flash"/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
