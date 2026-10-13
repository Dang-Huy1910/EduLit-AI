import { DomainError } from "../../core/errors.js";
import { FakeAssessmentAi } from "./fake-assessment.adapter.js";
import { GeminiAssessmentAdapter } from "./gemini-assessment.adapter.js";
import { resolveAiRuntimeMode } from "./ai-config.js";
import type { AssessmentAiPort } from "./assessment-ai.port.js";

export function createAssessmentAiFromEnv(env: NodeJS.ProcessEnv = process.env): AssessmentAiPort {
  if (resolveAiRuntimeMode(env) === "mock") {
    return new FakeAssessmentAi();
  }
  if (!env.GEMINI_API_KEY?.trim()) {
    throw new DomainError("AI_NOT_CONFIGURED", "GEMINI_API_KEY is required unless AI_MODE=mock");
  }
  return new GeminiAssessmentAdapter();
}
