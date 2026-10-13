import OpenAI from "openai";
import { DomainError } from "../../core/errors.js";
import { sanitizeErrorMessage } from "../../core/sanitize.js";

export type OpenAiJsonOptions = {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  retryBudgetMs?: number;
  maxOutputTokens: number;
  client?: Pick<OpenAI, "responses">;
};

export type OpenAiJsonResult = {
  parsed: unknown;
  rawText: string;
  finishReason: string;
  usage?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  latencyMs: number;
  provider: "openai";
  model: string;
};

const TRANSIENT_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);

export async function generateOpenAiJson(
  options: OpenAiJsonOptions,
  request: { systemInstruction: string; userPayload: string; responseJsonSchema: Record<string, unknown> },
  signal?: AbortSignal,
): Promise<OpenAiJsonResult> {
  if (!options.apiKey || !options.model) {
    throw new DomainError("AI_NOT_CONFIGURED", "OpenAI adapter requires a resolved API key and model");
  }
  const timeoutMs = options.timeoutMs ?? 30_000;
  const budgetMs = options.retryBudgetMs ?? timeoutMs;
  const started = Date.now();
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const remaining = budgetMs - (Date.now() - started);
    if (remaining <= 0) throw mapOpenAiError(lastError, true);
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, remaining));
    try {
      const client = options.client ?? new OpenAI({ apiKey: options.apiKey });
      const response = await client.responses.create(
        {
          model: options.model,
          input: [
            { role: "system", content: request.systemInstruction },
            { role: "user", content: request.userPayload },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "edulit_output",
              strict: true,
              schema: toOpenAiStrictSchema(request.responseJsonSchema),
            },
          },
          max_output_tokens: options.maxOutputTokens,
        },
        { signal: controller.signal },
      );
      const data = response as unknown as {
        status?: string;
        output_text?: string;
        output?: Array<{ type?: string; content?: Array<{ type?: string; refusal?: string; text?: string }> }>;
        usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
      };
      if (data.status && data.status !== "completed") {
        throw new DomainError("AI_INVALID_OUTPUT", `OpenAI response ended with ${data.status}`);
      }
      const refusal = data.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "refusal" || item.refusal)?.refusal;
      if (refusal) throw new DomainError("AI_INVALID_OUTPUT", "provider refused the request");
      const rawText = data.output_text?.trim() ?? data.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text?.trim() ?? "";
      if (!rawText) throw new DomainError("AI_INVALID_OUTPUT", "provider returned empty text");
      let parsed: unknown;
      try {
        parsed = normalizeOpenAiOptionalNulls(JSON.parse(rawText), request.responseJsonSchema);
      } catch {
        throw new DomainError("AI_INVALID_OUTPUT", "provider returned non-JSON text");
      }
      const usage = data.usage && {
        ...(typeof data.usage.input_tokens === "number" ? { promptTokenCount: data.usage.input_tokens } : {}),
        ...(typeof data.usage.output_tokens === "number" ? { candidatesTokenCount: data.usage.output_tokens } : {}),
        ...(typeof data.usage.total_tokens === "number" ? { totalTokenCount: data.usage.total_tokens } : {}),
      };
      return { parsed, rawText, finishReason: "completed", usage: usage && Object.keys(usage).length ? usage : undefined, latencyMs: Date.now() - started, provider: "openai", model: options.model };
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === 1) throw mapOpenAiError(error, false);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  }
  throw mapOpenAiError(lastError, true);
}

/**
 * OpenAI Structured Outputs in strict mode requires every object property to
 * be required. Optional local fields are represented as nullable on the wire,
 * then restored to absent fields before existing local validation runs.
 */
export function toOpenAiStrictSchema(schema: Record<string, unknown>): Record<string, unknown> {
  return strictifySchema(structuredClone(schema)) as Record<string, unknown>;
}

export function normalizeOpenAiOptionalNulls(value: unknown, schema: Record<string, unknown>): unknown {
  return removeOptionalNulls(value, schema);
}

function strictifySchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(strictifySchema);
  if (!isRecord(value)) return value;

  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    result[key] = strictifySchema(child);
  }
  const properties = isRecord(value.properties) ? value.properties : undefined;
  if (!properties) return result;

  const required = new Set(
    Array.isArray(value.required)
      ? value.required.filter((key): key is string => typeof key === "string")
      : [],
  );
  const strictProperties: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(properties)) {
    const strictChild = strictifySchema(child);
    strictProperties[key] = required.has(key) ? strictChild : { anyOf: [strictChild, { type: "null" }] };
  }
  result.properties = strictProperties;
  result.required = Object.keys(strictProperties);
  return result;
}

function removeOptionalNulls(value: unknown, schema: unknown): unknown {
  if (Array.isArray(value)) {
    const itemSchema = isRecord(schema) ? schema.items : undefined;
    return value.map((item) => removeOptionalNulls(item, itemSchema));
  }
  if (!isRecord(value) || !isRecord(schema)) return value;

  const properties = isRecord(schema.properties) ? schema.properties : undefined;
  if (!properties) return value;
  const required = new Set(
    Array.isArray(schema.required)
      ? schema.required.filter((key): key is string => typeof key === "string")
      : [],
  );
  const normalized: Record<string, unknown> = { ...value };
  for (const [key, propertySchema] of Object.entries(properties)) {
    if (!(key in normalized)) continue;
    if (normalized[key] === null && !required.has(key)) {
      delete normalized[key];
      continue;
    }
    normalized[key] = removeOptionalNulls(normalized[key], propertySchema);
  }
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isRetryable(error: unknown): boolean {
  if (error instanceof DomainError) return false;
  const status = typeof error === "object" && error && "status" in error ? Number((error as { status?: number }).status) : 0;
  return TRANSIENT_STATUS.has(status) || /fetch failed|econnreset|socket hang up/i.test(sanitizeErrorMessage(error));
}

function mapOpenAiError(error: unknown, exhausted: boolean): DomainError {
  if (error instanceof DomainError) return error;
  const status = typeof error === "object" && error && "status" in error ? Number((error as { status?: number }).status) : 0;
  if (status === 401 || status === 403) return new DomainError("AI_NOT_CONFIGURED", "OpenAI rejected the API key or permission");
  if (status === 404) return new DomainError("MODEL_UNAVAILABLE", "configured OpenAI model is unavailable");
  if (status === 429) return new DomainError("RATE_LIMITED", exhausted ? "OpenAI rate limited after retry" : "OpenAI rate limited");
  if (status === 408 || status === 504) return new DomainError("AI_TIMEOUT", "OpenAI request timed out");
  if (/abort|timeout/i.test(sanitizeErrorMessage(error))) return new DomainError("AI_TIMEOUT", "OpenAI request timed out");
  return new DomainError("MODEL_UNAVAILABLE", "OpenAI request failed");
}
