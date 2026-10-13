import { DomainError } from "../../core/errors.js";
import { FakeSocraticAi } from "./fake-socratic.adapter.js";
import { GeminiSocraticAdapter } from "./gemini-socratic.adapter.js";
import { resolveAiRuntimeMode } from "./ai-config.js";
import type { SocraticAiPort } from "./socratic-ai.port.js";

export function createSocraticAiFromEnv(env: NodeJS.ProcessEnv = process.env): SocraticAiPort {
  if (resolveAiRuntimeMode(env) === "mock") {
    return new FakeSocraticAi();
  }
  if (!env.GEMINI_API_KEY?.trim()) {
    throw new DomainError("AI_NOT_CONFIGURED", "GEMINI_API_KEY is required unless AI_MODE=mock");
  }
  return new GeminiSocraticAdapter();
}
