import { FakeWritingObservationAi } from "./fake-writing-observation.adapter.js";
import { GeminiWritingObservationAdapter } from "./gemini-writing-observation.adapter.js";
import { resolveAiConfig } from "./ai-config.js";
import { OpenAiWritingObservationAdapter } from "./openai-writing-observation.adapter.js";
import type { WritingObservationAiPort } from "./writing-observation-ai.port.js";

export function createWritingObservationAiFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): WritingObservationAiPort {
  const config = resolveAiConfig("writingProfile", env);
  if (config.mode === "mock") {
    return new FakeWritingObservationAi();
  }
  if (config.provider === "gemini") {
    return new GeminiWritingObservationAdapter({ apiKey: config.apiKey, model: config.model });
  }
  return new OpenAiWritingObservationAdapter({ apiKey: config.apiKey, model: config.model });
}
