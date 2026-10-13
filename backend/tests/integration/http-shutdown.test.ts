import assert from "node:assert/strict";
import { test } from "node:test";
import { FakeSocraticAi } from "../../src/infrastructure/ai/fake-socratic.adapter.js";
import { loadHttpConfig } from "../../src/http/config.js";
import { createHttpApp } from "../../src/http/create-http-app.js";
import {
  createPrismaHandle,
  disconnectPrismaHandle,
} from "../../src/infrastructure/database/prisma.client.js";
import { requireTestDatabaseUrl } from "../../src/infrastructure/database/env.js";
import { TEST_ORIGIN } from "../helpers/http.js";

test("Nest shutdown hook disconnects the Prisma handle and pool", async () => {
  const handle = createPrismaHandle(requireTestDatabaseUrl());
  const app = await createHttpApp({
    prisma: handle.prisma,
    ai: new FakeSocraticAi(),
    config: loadHttpConfig({
      NODE_ENV: "test",
      APP_ORIGIN: TEST_ORIGIN,
      SESSION_COOKIE_NAME: "edulit_session",
      COOKIE_SECURE: "false",
      PORT: "4000",
    }),
    shutdown: () => disconnectPrismaHandle(handle),
    logger: false,
    enableShutdownHooks: false,
  });
  await app.listen(0, "127.0.0.1");
  await handle.prisma.$queryRaw`SELECT 1`;
  await app.close();
  await assert.rejects(() => handle.prisma.$queryRaw`SELECT 1`);
});
