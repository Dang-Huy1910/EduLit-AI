import { ApiError, FinishReason, GoogleGenAI } from "@google/genai";
import { DomainError } from "../../core/errors.js";
import { sanitizeErrorMessage } from "../../core/sanitize.js";
import {
  ASSESSMENT_MODEL_NAME,
  ASSESSMENT_PROMPT_VERSION,
  type AssessmentModelOutput,
} from "../../modules/assessment/domain/output.js";
import {
  ASSESSMENT_MAX_OUTPUT_TOKENS,
  ASSESSMENT_RETRY_BUDGET_MS,
  ASSESSMENT_THINKING_BUDGET,
  ASSESSMENT_TIMEOUT_MS,
  requireGeminiApiKey,
  resolveAssessmentModel,
} from "./ai-config.js";
import type {
  AssessmentAiPort,
  AssessmentAiRequest,
  AssessmentAiSuccess,
  AssessmentAiUsage,
} from "./assessment-ai.port.js";

const TRANSIENT_STATUS = new Set([429, 500, 502, 503, 504]);

export class GeminiAssessmentAdapter implements AssessmentAiPort {
  constructor(
    private readonly options: {
      apiKey?: string;
      model?: string;
      timeoutMs?: number;
      retryBudgetMs?: number;
    } = {},
  ) {}

  async grade(request: AssessmentAiRequest, signal?: AbortSignal): Promise<AssessmentAiSuccess> {
    const apiKey = this.options.apiKey ?? requireGeminiApiKey();
    const model = this.options.model ?? resolveAssessmentModel();
    if (model !== ASSESSMENT_MODEL_NAME) {
      throw new DomainError("MODEL_UNAVAILABLE", `refusing to call model ${model}`);
    }
    const timeoutMs = this.options.timeoutMs ?? ASSESSMENT_TIMEOUT_MS;
    const budgetMs = this.options.retryBudgetMs ?? ASSESSMENT_RETRY_BUDGET_MS;
    const started = Date.now();
    let attempt = 0;
    let lastError: unknown;

    while (attempt < 2) {
      if (Date.now() - started >= budgetMs) {
        throw wrapGeminiError(lastError, true);
      }
      const remainingBudget = budgetMs - (Date.now() - started);
      const attemptTimeout = Math.min(timeoutMs, remainingBudget);
      try {
        const result = await this.callOnce(apiKey, model, request, attemptTimeout, signal);
        result.latencyMs = Date.now() - started;
        return result;
      } catch (error) {
        lastError = error;
        if (!isRetryable(error) || attempt === 1) {
          throw wrapGeminiError(error, false);
        }
        attempt += 1;
      }
    }
    throw wrapGeminiError(lastError, true);
  }

  private async callOnce(
    apiKey: string,
    model: string,
    request: AssessmentAiRequest,
    timeoutMs: number,
    externalSignal?: AbortSignal,
  ): Promise<AssessmentAiSuccess> {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener("abort", onAbort, { once: true });
      }
    }
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const client = new GoogleGenAI({ apiKey });
    try {
      const response = await client.models.generateContent({
        model,
        contents: request.userPayload,
        config: {
          systemInstruction: request.systemInstruction,
          abortSignal: controller.signal,
          httpOptions: { timeout: timeoutMs },
          responseMimeType: "application/json",
          responseJsonSchema: request.responseJsonSchema,
          maxOutputTokens: ASSESSMENT_MAX_OUTPUT_TOKENS,
          thinkingConfig: {
            thinkingBudget: ASSESSMENT_THINKING_BUDGET,
            includeThoughts: false,
          },
        },
      });

      const promptBlock = response.promptFeedback?.blockReason;
      if (promptBlock) {
        throw new DomainError("AI_INVALID_OUTPUT", "provider blocked the prompt");
      }
      const candidate = response.candidates?.[0];
      const finishReason = String(candidate?.finishReason ?? "");
      if (finishReason === FinishReason.MAX_TOKENS || finishReason === "MAX_TOKENS") {
        throw new DomainError("AI_INVALID_OUTPUT", "provider response was truncated");
      }
      if (
        finishReason === FinishReason.SAFETY ||
        finishReason === FinishReason.BLOCKLIST ||
        finishReason === FinishReason.PROHIBITED_CONTENT ||
        finishReason === FinishReason.RECITATION ||
        finishReason === "SAFETY" ||
        finishReason === "BLOCKLIST" ||
        finishReason === "PROHIBITED_CONTENT" ||
        finishReason === "RECITATION"
      ) {
        throw new DomainError("AI_INVALID_OUTPUT", "provider blocked or filtered the response");
      }
      const rawText = response.text?.trim() ?? "";
      if (!rawText) {
        throw new DomainError("AI_INVALID_OUTPUT", "provider returned empty text");
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        throw new DomainError("AI_INVALID_OUTPUT", "provider returned non-JSON text");
      }
      return {
        output: parsed as AssessmentModelOutput,
        rawText,
        finishReason: finishReason || "STOP",
        usage: usageFrom(response.usageMetadata),
        latencyMs: 0,
        model,
        promptVersion: request.promptVersion || ASSESSMENT_PROMPT_VERSION,
      };
    } catch (error) {
      if (controller.signal.aborted) {
        throw new DomainError("AI_TIMEOUT", "gemini request exceeded timeout");
      }
      throw error;
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener("abort", onAbort);
    }
  }
}

function usageFrom(meta: {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  totalTokenCount?: number;
} | undefined): AssessmentAiUsage | undefined {
  if (!meta) {
    return undefined;
  }
  const usage: AssessmentAiUsage = {};
  if (typeof meta.promptTokenCount === "number") {
    usage.promptTokenCount = meta.promptTokenCount;
  }
  if (typeof meta.candidatesTokenCount === "number") {
    usage.candidatesTokenCount = meta.candidatesTokenCount;
  }
  if (typeof meta.thoughtsTokenCount === "number") {
    usage.thoughtsTokenCount = meta.thoughtsTokenCount;
  }
  if (typeof meta.totalTokenCount === "number") {
    usage.totalTokenCount = meta.totalTokenCount;
  }
  return Object.keys(usage).length > 0 ? usage : undefined;
}

function isRetryable(error: unknown): boolean {
  if (error instanceof DomainError) {
    return error.code === "RATE_LIMITED" || error.code === "MODEL_UNAVAILABLE";
  }
  if (error instanceof ApiError) {
    return TRANSIENT_STATUS.has(error.status);
  }
  if (error && typeof error === "object" && "status" in error) {
    return TRANSIENT_STATUS.has(Number((error as { status: number }).status));
  }
  const message = sanitizeErrorMessage(error).toLowerCase();
  return message.includes("econnreset") || message.includes("socket hang up") || message.includes("fetch failed");
}

function wrapGeminiError(error: unknown, exhausted: boolean): DomainError {
  if (error instanceof DomainError) {
    return error;
  }
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) {
      return new DomainError("AI_NOT_CONFIGURED", "gemini rejected the API key or permission");
    }
    if (error.status === 404) {
      return new DomainError("MODEL_UNAVAILABLE", "gemini-2.5-flash is unavailable for this project");
    }
    if (error.status === 429) {
      return new DomainError("RATE_LIMITED", exhausted ? "gemini rate limited after retry" : "gemini rate limited");
    }
    if (error.status === 408) {
      return new DomainError("AI_TIMEOUT", "gemini request timed out");
    }
    if (error.status >= 500) {
      return new DomainError("MODEL_UNAVAILABLE", "gemini service error");
    }
    return new DomainError("MODEL_UNAVAILABLE", "gemini request failed");
  }
  const message = sanitizeErrorMessage(error).toLowerCase();
  if (message.includes("aborted") || message.includes("timeout")) {
    return new DomainError("AI_TIMEOUT", "gemini request exceeded timeout");
  }
  return new DomainError("MODEL_UNAVAILABLE", "gemini request failed");
}
