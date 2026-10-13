import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { requireTestDatabaseUrl } from "../src/infrastructure/database/env.js";
import { sanitizeErrorMessage } from "../src/core/sanitize.js";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function run(command: string, args: string[], extraEnv: NodeJS.ProcessEnv): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: backendRoot,
      stdio: "inherit",
      env: { ...process.env, ...extraEnv },
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
      }
    });
  });
}

async function main(): Promise<void> {
  const testUrl = requireTestDatabaseUrl();
  await run("npx", ["prisma", "generate"], { DATABASE_URL: testUrl });
  await run("npx", ["prisma", "migrate", "deploy"], { DATABASE_URL: testUrl });
  await run(
    "npx",
    [
      "tsx",
      "--test",
      "--test-concurrency=1",
      "tests/integration/constraints.test.ts",
      "tests/integration/persistence.test.ts",
      "tests/integration/e2e-data-layer.test.ts",
      "tests/integration/seed.test.ts",
      "tests/integration/review-fixes.test.ts",
      "tests/integration/socratic.test.ts",
      "tests/integration/http-auth.test.ts",
      "tests/integration/http-socratic.test.ts",
      "tests/integration/http-shutdown.test.ts",
    ],
    { DATABASE_URL: testUrl, DATABASE_URL_TEST: testUrl },
  );
}

try {
  await main();
} catch (error) {
  console.error(sanitizeErrorMessage(error));
  process.exit(1);
}
