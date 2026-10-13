import { Logger } from "@nestjs/common";
import { ApiError, FinishReason, GoogleGenAI, ThinkingLevel, type Models } from "@google/genai";
import { DomainError } from "../../core/errors.js";
import { sanitizeErrorMessage } from "../../core/sanitize.js";
import { SOCRATIC_PROMPT_VERSION, type SocraticModelOutput } from "../../modules/socratic/domain/output.js";
import {
  SOCRATIC_MAX_ATTEMPTS,
  SOCRATIC_MAX_OUTPUT_TOKENS,
  SOCRATIC_RETRY_BASE_DELAY_MS,
  SOCRATIC_RETRY_BUDGET_MS,
  SOCRATIC_RETRY_MAX_DELAY_MS,
  SOCRATIC_TIMEOUT_MS,
} from "./ai-config.js";
import type {
  SocraticAiPort,
  SocraticAiRequest,
  SocraticAiSuccess,
  SocraticAiUsage,
  SocraticOutlineInitOutput,
  SocraticOutlineInitSuccess,
} from "./socratic-ai.port.js";

const TRANSIENT_STATUS = new Set([429, 500, 502, 503, 504]);
const RETRYABLE_DOMAIN_CODES = new Set(["RATE_LIMITED", "MODEL_UNAVAILABLE", "AI_TIMEOUT"]);
type GenerateGeminiContent = Models["generateContent"];

export class GeminiSocraticAdapter implements SocraticAiPort {
  private readonly logger = new Logger(GeminiSocraticAdapter.name);

  constructor(
    private readonly options: {
      apiKey?: string;
      model?: string;
      timeoutMs?: number;
      retryBudgetMs?: number;
      maxAttempts?: number;
      generateContent?: GenerateGeminiContent;
    } = {},
  ) {}

  async generateTurn(request: SocraticAiRequest, signal?: AbortSignal): Promise<SocraticAiSuccess> {
    const { parsed, ...generated } = await this.generateJson(request, signal);
    return {
      ...generated,
      output: parsed as SocraticModelOutput,
    };
  }

  async generateOutline(request: SocraticAiRequest, signal?: AbortSignal): Promise<SocraticOutlineInitSuccess> {
    const { parsed, ...generated } = await this.generateJson(request, signal);
    return {
      ...generated,
      output: parsed as SocraticOutlineInitOutput,
    };
  }

  private async generateJson(
    request: SocraticAiRequest,
    signal?: AbortSignal,
  ): Promise<Omit<SocraticAiSuccess, "output"> & { parsed: unknown }> {
    const apiKey = this.options.apiKey;
    const model = this.options.model;
    if (!apiKey || !model) throw new DomainError("AI_NOT_CONFIGURED", "Gemini adapter requires a resolved API key and model");
    const timeoutMs = this.options.timeoutMs ?? SOCRATIC_TIMEOUT_MS;
    const budgetMs = this.options.retryBudgetMs ?? SOCRATIC_RETRY_BUDGET_MS;
    const maxAttempts = this.options.maxAttempts ?? SOCRATIC_MAX_ATTEMPTS;
    const started = Date.now();
    let attempt = 0;
    let lastError: unknown;

    while (attempt < maxAttempts) {
      if (Date.now() - started >= budgetMs) {
        throw wrapGeminiError(lastError, Date.now() - started, true);
      }
      const remainingBudget = budgetMs - (Date.now() - started);
      const attemptTimeout = Math.min(timeoutMs, remainingBudget);
      try {
        const result = await this.callOnce(apiKey, model, request, attemptTimeout, signal);
        result.latencyMs = Date.now() - started;
        return result;
      } catch (error) {
        lastError = error;
        if (signal?.aborted || !isRetryable(error) || attempt === maxAttempts - 1) {
          throw wrapGeminiError(error, Date.now() - started, false);
        }
        const elapsedMs = Date.now() - started;
        const remainingBudgetMs = budgetMs - elapsedMs;
        const retryDelayMs = retryDelayFor(attempt);
        if (retryDelayMs >= remainingBudgetMs) {
          this.logRetry("retry_budget_exhausted", model, attempt + 1, error, elapsedMs, retryDelayMs);
          throw wrapGeminiError(error, elapsedMs, true);
        }
        this.logRetry("retrying", model, attempt + 1, error, elapsedMs, retryDelayMs);
        attempt += 1;
        await waitForRetry(retryDelayMs, signal);
      }
    }
    throw wrapGeminiError(lastError, Date.now() - started, true);
  }

  private logRetry(
    event: "retrying" | "retry_budget_exhausted",
    model: string,
    attempt: number,
    error: unknown,
    elapsedMs: number,
    retryDelayMs: number,
  ): void {
    // Deliberately omit the upstream error text: it may contain prompt content.
    this.logger.warn(JSON.stringify({
      event,
      provider: "gemini",
      model,
      attempt,
      status: statusFrom(error),
      code: error instanceof DomainError ? error.code : undefined,
      elapsedMs,
      retryDelayMs,
    }));
  }

  private async callOnce(
    apiKey: string,
    model: string,
    request: SocraticAiRequest,
    timeoutMs: number,
    externalSignal?: AbortSignal,
  ): Promise<Omit<SocraticAiSuccess, "output"> & { parsed: unknown }> {
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
    const generateContent = this.options.generateContent ?? new GoogleGenAI({ apiKey }).models.generateContent;
    try {
      const response = await generateContent({
        model,
        contents: request.userPayload,
        config: {
          systemInstruction: request.systemInstruction,
          abortSignal: controller.signal,
          httpOptions: { timeout: timeoutMs },
          responseMimeType: "application/json",
          responseJsonSchema: request.responseJsonSchema,
          maxOutputTokens: SOCRATIC_MAX_OUTPUT_TOKENS,
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.LOW,
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
        parsed,
        rawText,
        finishReason: finishReason || "STOP",
        usage: usageFrom(response.usageMetadata),
        latencyMs: 0,
        provider: "gemini",
        model,
        promptVersion: request.promptVersion || SOCRATIC_PROMPT_VERSION,
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
} | undefined): SocraticAiUsage | undefined {
  if (!meta) {
    return undefined;
  }
  const usage: SocraticAiUsage = {};
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
    return RETRYABLE_DOMAIN_CODES.has(error.code);
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

/** Exponential backoff with bounded jitter prevents simultaneous retries from becoming another burst. */
export function retryDelayFor(attempt: number, random = Math.random): number {
  const exponentialDelay = Math.min(
    SOCRATIC_RETRY_MAX_DELAY_MS,
    SOCRATIC_RETRY_BASE_DELAY_MS * 2 ** Math.max(0, attempt),
  );
  const jitterFloor = Math.floor(exponentialDelay / 2);
  const jitter = Math.min(1, Math.max(0, random()));
  return jitterFloor + Math.floor(jitter * (exponentialDelay - jitterFloor));
}

function statusFrom(error: unknown): number | undefined {
  if (error instanceof ApiError) return error.status;
  if (error && typeof error === "object" && "status" in error) {
    const status = Number((error as { status: unknown }).status);
    return Number.isFinite(status) ? status : undefined;
  }
  return undefined;
}

function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DomainError("AI_TIMEOUT", "gemini request was aborted"));
      return;
    }
    const timer = setTimeout(cleanupAndResolve, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      reject(new DomainError("AI_TIMEOUT", "gemini request was aborted"));
    };
    function cleanupAndResolve(): void {
      cleanup();
      resolve();
    }
    function cleanup(): void {
      signal?.removeEventListener("abort", onAbort);
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function wrapGeminiError(error: unknown, _latencyMs: number, exhausted: boolean): DomainError {
  if (error instanceof DomainError) {
    return error;
  }
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) {
      return new DomainError("AI_NOT_CONFIGURED", "gemini rejected the API key or permission");
    }
    if (error.status === 404) {
      return new DomainError("MODEL_UNAVAILABLE", "configured Gemini model is unavailable for this project");
    }
    if (error.status === 429) {
      return new DomainError("RATE_LIMITED", exhausted ? "gemini rate limited after retry" : "gemini rate limited");
    }
    if (error.status === 408 || error.status === 504) {
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
