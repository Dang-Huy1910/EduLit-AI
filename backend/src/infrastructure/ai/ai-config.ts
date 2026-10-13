import { DomainError } from "../../core/errors.js";
import { SOCRATIC_MODEL_NAME } from "../../modules/socratic/domain/output.js";

export const SOCRATIC_TIMEOUT_MS = 20_000;
export const SOCRATIC_RETRY_BUDGET_MS = 35_000;
export const SOCRATIC_MAX_OUTPUT_TOKENS = 1024;
export const SOCRATIC_THINKING_BUDGET = 256;
export const SOCRATIC_MAX_INPUT_CHARS = 80_000;
export const SOCRATIC_MAX_REQUIRED_CHARS = 60_000;
export const SOCRATIC_MAX_STUDENT_MESSAGE_CHARS = 4_000;
export const SOCRATIC_MAX_HISTORY_MESSAGES = 12;
export const SOCRATIC_MAX_OBSERVATIONS = 5;

export type AiRuntimeMode = "live" | "mock";

export function resolveAiRuntimeMode(env: NodeJS.ProcessEnv = process.env): AiRuntimeMode {
  return env.AI_MODE === "mock" ? "mock" : "live";
}

export function requireGeminiApiKey(env: NodeJS.ProcessEnv = process.env): string {
  const key = env.GEMINI_API_KEY?.trim();
  if (!key) {
    throw new DomainError("AI_NOT_CONFIGURED", "GEMINI_API_KEY is required for live Gemini calls");
  }
  return key;
}

export function resolveSocraticModel(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.GEMINI_MODEL?.trim();
  if (configured && configured !== SOCRATIC_MODEL_NAME) {
    throw new DomainError(
      "AI_NOT_CONFIGURED",
      `GEMINI_MODEL must be ${SOCRATIC_MODEL_NAME}; refusing to switch model`,
    );
  }
  return SOCRATIC_MODEL_NAME;
}
