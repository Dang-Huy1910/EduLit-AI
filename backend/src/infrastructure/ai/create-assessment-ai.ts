import { FakeAssessmentAi } from "./fake-assessment.adapter.js";
import { GeminiAssessmentAdapter } from "./gemini-assessment.adapter.js";
import { resolveAiConfig } from "./ai-config.js";
import { OpenAiAssessmentAdapter } from "./openai-assessment.adapter.js";
import type { AssessmentAiPort } from "./assessment-ai.port.js";

export function createAssessmentAiFromEnv(env: NodeJS.ProcessEnv = process.env): AssessmentAiPort {
  const config = resolveAiConfig("assessment", env);
  if (config.mode === "mock") {
    return new FakeAssessmentAi();
  }
  if (config.provider === "gemini") {
    return new GeminiAssessmentAdapter({ apiKey: config.apiKey, model: config.model });
  }
  return new OpenAiAssessmentAdapter({ apiKey: config.apiKey, model: config.model });
}
