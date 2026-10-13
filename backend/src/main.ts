import "reflect-metadata";
import "dotenv/config";
import { createSocraticAiFromEnv } from "./infrastructure/ai/create-socratic-ai.js";
import { createPrismaHandle, disconnectPrismaHandle } from "./infrastructure/database/prisma.client.js";
import { loadHttpConfig } from "./http/config.js";
import { createHttpApp } from "./http/create-http-app.js";
import { sanitizeErrorMessage } from "./core/sanitize.js";

async function bootstrap(): Promise<void> {
  const config = loadHttpConfig();
  const handle = createPrismaHandle();
  const ai = createSocraticAiFromEnv();
  const app = await createHttpApp({
    prisma: handle.prisma,
    ai,
    config,
    shutdown: () => disconnectPrismaHandle(handle),
    enableShutdownHooks: false,
  });
  await app.listen(config.port);
  console.log(`EduLit-AI API listening on http://localhost:${config.port}/api`);

  const onSignal = () => {
    void app.close().then(
      () => process.exit(0),
      (error) => {
        console.error(sanitizeErrorMessage(error));
        process.exit(1);
      },
    );
  };
  process.once("SIGTERM", onSignal);
  process.once("SIGINT", onSignal);
}

try {
  await bootstrap();
} catch (error) {
  console.error(sanitizeErrorMessage(error));
  process.exit(1);
}
