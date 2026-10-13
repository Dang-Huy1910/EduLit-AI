import "reflect-metadata";
import "dotenv/config";
import path from "node:path";
import { createSocraticAiFromEnv } from "./infrastructure/ai/create-socratic-ai.js";
import { createAssessmentAiFromEnv } from "./infrastructure/ai/create-assessment-ai.js";
import { createWritingObservationAiFromEnv } from "./infrastructure/ai/create-writing-observation-ai.js";
import { createPrismaHandle, disconnectPrismaHandle } from "./infrastructure/database/prisma.client.js";
import { LocalPrivateStorage } from "./infrastructure/storage/local-private-storage.js";
import { createVisionTranscriptionFromEnv } from "./infrastructure/vision/create-vision-transcription.js";
import { loadHttpConfig } from "./http/config.js";
import { createHttpApp } from "./http/create-http-app.js";
import { sanitizeErrorMessage } from "./core/sanitize.js";

async function bootstrap(): Promise<void> {
  const config = loadHttpConfig();
  const handle = createPrismaHandle();
  const ai = createSocraticAiFromEnv();
  const assessmentAi = createAssessmentAiFromEnv();
  const writingProfileAi = createWritingObservationAiFromEnv();
  const vision = createVisionTranscriptionFromEnv();
  const storage = new LocalPrivateStorage(path.resolve(config.localStoragePath));
  const app = await createHttpApp({
    prisma: handle.prisma,
    ai,
    assessmentAi,
    writingProfileAi,
    vision,
    storage,
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
