import { DomainError } from "../../core/errors.js";

export const SOCRATIC_TIMEOUT_MS = 60_000;
export const SOCRATIC_RETRY_BUDGET_MS = 80_000;
export const SOCRATIC_MAX_ATTEMPTS = 4;
export const SOCRATIC_RETRY_BASE_DELAY_MS = 1_000;
export const SOCRATIC_RETRY_MAX_DELAY_MS = 8_000;
export const SOCRATIC_MAX_OUTPUT_TOKENS = 2048;

export const SOCRATIC_MAX_INPUT_CHARS = 80_000;
export const SOCRATIC_MAX_REQUIRED_CHARS = 60_000;
export const SOCRATIC_MAX_STUDENT_MESSAGE_CHARS = 4_000;
export const SOCRATIC_MAX_HISTORY_MESSAGES = 12;
export const SOCRATIC_MAX_OBSERVATIONS = 5;

export const ASSESSMENT_TIMEOUT_MS = 45_000;
export const ASSESSMENT_RETRY_BUDGET_MS = 70_000;
export const ASSESSMENT_MAX_OUTPUT_TOKENS = 4096;


export const WRITING_PROFILE_TIMEOUT_MS = 30_000;
export const WRITING_PROFILE_RETRY_BUDGET_MS = 50_000;
export const WRITING_PROFILE_MAX_OUTPUT_TOKENS = 2048;


export type AiRuntimeMode = "live" | "mock";
export type AiProvider = "gemini" | "openai";
export type AiTask = "socratic" | "assessment" | "writingProfile" | "ocr";

export type ResolvedAiConfig = {
  mode: AiRuntimeMode;
  provider: AiProvider;
  model: string;
  apiKey?: string;
};

const TASK_MODEL_ENV: Record<AiTask, string> = {
  socratic: "SOCRATIC_MODEL",
  assessment: "ASSESSMENT_MODEL",
  writingProfile: "WRITING_PROFILE_MODEL",
  ocr: "OCR_MODEL",
};

export function resolveAiRuntimeMode(env: NodeJS.ProcessEnv = process.env): AiRuntimeMode {
  const value = env.AI_MODE?.trim();
  if (!value) return "live";
  if (value === "live" || value === "mock") return value;
  throw new DomainError("AI_NOT_CONFIGURED", "AI_MODE must be live or mock");
}

export function resolveAiProvider(env: NodeJS.ProcessEnv = process.env): AiProvider {
  const value = env.AI_PROVIDER?.trim();
  if (!value) return "gemini";
  if (value === "gemini" || value === "openai") return value;
  throw new DomainError("AI_NOT_CONFIGURED", "AI_PROVIDER must be gemini or openai");
}

/** Resolve at composition time; provider adapters must not reread process.env. */
export function resolveAiConfig(task: AiTask, env: NodeJS.ProcessEnv = process.env): ResolvedAiConfig {
  const mode = resolveAiRuntimeMode(env);
  const provider = resolveAiProvider(env);
  const providerModel = provider === "gemini" ? env.GEMINI_MODEL : env.OPENAI_MODEL;
  const model = firstNonBlank(
    env[TASK_MODEL_ENV[task]],
    providerModel,
    env.AI_MODEL,
    provider === "gemini" ? "gemini-3.8-flash" : undefined,
  );
  if (!model) {
    throw new DomainError("AI_NOT_CONFIGURED", "OPENAI_MODEL or AI_MODEL is required when AI_PROVIDER=openai");
  }
  if (mode === "mock") return { mode, provider, model: `mock/${task}` };
  const apiKey = provider === "gemini" ? env.GEMINI_API_KEY?.trim() : env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new DomainError(
      "AI_NOT_CONFIGURED",
      `${provider === "gemini" ? "GEMINI_API_KEY" : "OPENAI_API_KEY"} is required for live ${provider} calls`,
    );
  }
  return { mode, provider, model, apiKey };
}

export function requireGeminiApiKey(env: NodeJS.ProcessEnv = process.env): string {
  const config = resolveAiConfig("socratic", env);
  if (config.provider !== "gemini" || !config.apiKey) {
    throw new DomainError("AI_NOT_CONFIGURED", "GEMINI_API_KEY is required for live Gemini calls");
  }
  return config.apiKey;
}

export function resolveSocraticModel(env: NodeJS.ProcessEnv = process.env): string {
  return resolveAiConfig("socratic", env).model;
}

export function resolveAssessmentModel(env: NodeJS.ProcessEnv = process.env): string {
  return resolveAiConfig("assessment", env).model;
}

export function resolveWritingProfileModel(env: NodeJS.ProcessEnv = process.env): string {
  return resolveAiConfig("writingProfile", env).model;
}

function firstNonBlank(...values: Array<string | undefined>): string | undefined {
  return values.map((value) => value?.trim()).find((value): value is string => Boolean(value));
}
