import { DomainError } from "../../core/errors.js";
import { ASSESSMENT_MODEL_NAME } from "../../modules/assessment/domain/output.js";
import { SOCRATIC_MODEL_NAME } from "../../modules/socratic/domain/output.js";
import { WRITING_PROFILE_MODEL_NAME } from "../../modules/writing-profile/domain/output.js";

export const SOCRATIC_TIMEOUT_MS = 20_000;
export const SOCRATIC_RETRY_BUDGET_MS = 35_000;
export const SOCRATIC_MAX_OUTPUT_TOKENS = 1024;
export const SOCRATIC_THINKING_BUDGET = 256;
export const SOCRATIC_MAX_INPUT_CHARS = 80_000;
export const SOCRATIC_MAX_REQUIRED_CHARS = 60_000;
export const SOCRATIC_MAX_STUDENT_MESSAGE_CHARS = 4_000;
export const SOCRATIC_MAX_HISTORY_MESSAGES = 12;
export const SOCRATIC_MAX_OBSERVATIONS = 5;

export const ASSESSMENT_TIMEOUT_MS = 45_000;
export const ASSESSMENT_RETRY_BUDGET_MS = 70_000;
export const ASSESSMENT_MAX_OUTPUT_TOKENS = 4096;
export const ASSESSMENT_THINKING_BUDGET = 512;

export const WRITING_PROFILE_TIMEOUT_MS = 30_000;
export const WRITING_PROFILE_RETRY_BUDGET_MS = 50_000;
export const WRITING_PROFILE_MAX_OUTPUT_TOKENS = 2048;
export const WRITING_PROFILE_THINKING_BUDGET = 256;

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
  return resolveFixedGeminiModel(SOCRATIC_MODEL_NAME, env);
}

export function resolveAssessmentModel(env: NodeJS.ProcessEnv = process.env): string {
  return resolveFixedGeminiModel(ASSESSMENT_MODEL_NAME, env);
}

export function resolveWritingProfileModel(env: NodeJS.ProcessEnv = process.env): string {
  return resolveFixedGeminiModel(WRITING_PROFILE_MODEL_NAME, env);
}

function resolveFixedGeminiModel(expected: string, env: NodeJS.ProcessEnv): string {
  const configured = env.GEMINI_MODEL?.trim();
  if (configured && configured !== expected) {
    throw new DomainError(
      "AI_NOT_CONFIGURED",
      `GEMINI_MODEL must be ${expected}; refusing to switch model`,
    );
  }
  return expected;
}
