import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import argon2 from "argon2";
import { requireTestDatabaseUrl } from "../src/infrastructure/database/env.js";
import {
  createPrismaHandle,
  disconnectPrismaHandle,
} from "../src/infrastructure/database/prisma.client.js";
import { TEST_ORIGIN, TEST_PASSWORD, apiRequest } from "./helpers/http.js";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("dist HTTP server serves login and exits on SIGTERM", async () => {
  const distMain = path.join(backendRoot, "dist/main.js");
  assert.equal(fs.existsSync(distMain), true, "run npm run build before this test");
  const testUrl = requireTestDatabaseUrl();
  const handle = createPrismaHandle(testUrl);
  const loginId = `dist-${randomUUID()}`;
  try {
    const passwordHash = await argon2.hash(TEST_PASSWORD, { type: argon2.argon2id });
    await handle.prisma.user.create({
      data: {
        loginId,
        displayName: "Dist User",
        role: "STUDENT",
        status: "ACTIVE",
        passwordHash,
      },
    });
  } finally {
    await disconnectPrismaHandle(handle);
  }

  const port = 14000 + Math.floor(Math.random() * 1000);
  const child = spawn(process.execPath, [distMain], {
    cwd: backendRoot,
    env: {
      ...process.env,
      DATABASE_URL: testUrl,
      AI_MODE: "mock",
      PORT: String(port),
      APP_ORIGIN: TEST_ORIGIN,
      NODE_ENV: "test",
      COOKIE_SECURE: "false",
      SESSION_COOKIE_NAME: "edulit_session",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const logs: string[] = [];
  child.stdout?.on("data", (chunk: Buffer) => logs.push(chunk.toString("utf8")));
  child.stderr?.on("data", (chunk: Buffer) => logs.push(chunk.toString("utf8")));

  const ready = await waitForOutput(child, /listening on/i, 15_000);
  assert.equal(ready, true, `dist server did not start: ${logs.join("")}`);
  try {
    const login = await apiRequest(`http://127.0.0.1:${port}/api`, "/auth/login", {
      method: "POST",
      body: { loginId, password: TEST_PASSWORD },
      headers: { connection: "close" },
    });
    assert.equal(login.status, 200, JSON.stringify(login.json));
  } finally {
    child.kill("SIGTERM");
    const code = await waitExit(child, 10_000);
    assert.equal(code, 0, `dist server should exit 0 on SIGTERM: ${logs.join("")}`);
  }
});

function waitForOutput(
  child: ReturnType<typeof spawn>,
  pattern: RegExp,
  timeoutMs: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    const onData = (chunk: Buffer) => {
      if (pattern.test(chunk.toString("utf8"))) {
        clearTimeout(timer);
        child.stdout?.off("data", onData);
        child.stderr?.off("data", onData);
        resolve(true);
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("exit", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

function waitExit(child: ReturnType<typeof spawn>, timeoutMs: number): Promise<number | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve(null);
    }, timeoutMs);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}
