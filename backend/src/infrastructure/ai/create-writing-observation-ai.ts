import { DomainError } from "../../core/errors.js";
import { FakeWritingObservationAi } from "./fake-writing-observation.adapter.js";
import { GeminiWritingObservationAdapter } from "./gemini-writing-observation.adapter.js";
import { resolveAiRuntimeMode } from "./ai-config.js";
import type { WritingObservationAiPort } from "./writing-observation-ai.port.js";

export function createWritingObservationAiFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): WritingObservationAiPort {
  if (resolveAiRuntimeMode(env) === "mock") {
    return new FakeWritingObservationAi();
  }
  if (!env.GEMINI_API_KEY?.trim()) {
    throw new DomainError("AI_NOT_CONFIGURED", "GEMINI_API_KEY is required unless AI_MODE=mock");
  }
  return new GeminiWritingObservationAdapter();
}
