import { FakeSocraticAi } from "./fake-socratic.adapter.js";
import { GeminiSocraticAdapter } from "./gemini-socratic.adapter.js";
import { resolveAiConfig } from "./ai-config.js";
import { OpenAiSocraticAdapter } from "./openai-socratic.adapter.js";
import type { SocraticAiPort } from "./socratic-ai.port.js";

export function createSocraticAiFromEnv(env: NodeJS.ProcessEnv = process.env): SocraticAiPort {
  const config = resolveAiConfig("socratic", env);
  if (config.mode === "mock") {
    return new FakeSocraticAi();
  }
  if (config.provider === "gemini") {
    return new GeminiSocraticAdapter({ apiKey: config.apiKey, model: config.model });
  }
  return new OpenAiSocraticAdapter({ apiKey: config.apiKey, model: config.model });
}
