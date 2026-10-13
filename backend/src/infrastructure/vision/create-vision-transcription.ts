import { resolveAiConfig } from "../ai/ai-config.js";
import { FakeVisionAdapter } from "./fake-vision.adapter.js";
import { GeminiVisionAdapter } from "./gemini-vision.adapter.js";
import { OpenAiVisionAdapter } from "./openai-vision.adapter.js";
import type { VisionTranscriptionPort } from "./vision-transcription.port.js";
export function createVisionTranscriptionFromEnv(env: NodeJS.ProcessEnv = process.env): VisionTranscriptionPort {
  const config = resolveAiConfig("ocr", env);
  if (config.mode === "mock") return new FakeVisionAdapter();
  return config.provider === "gemini" ? new GeminiVisionAdapter({ apiKey: config.apiKey, model: config.model }) : new OpenAiVisionAdapter({ apiKey: config.apiKey, model: config.model });
}
