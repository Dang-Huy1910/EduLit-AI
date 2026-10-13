import OpenAI from "openai";
import { DomainError } from "../../core/errors.js";
import type { VisionTranscriptionOutput, VisionTranscriptionPort, VisionTranscriptionRequest, VisionTranscriptionSuccess } from "./vision-transcription.port.js";

export class OpenAiVisionAdapter implements VisionTranscriptionPort {
  constructor(private readonly options: { apiKey?: string; model?: string; timeoutMs?: number; client?: Pick<OpenAI, "responses"> } = {}) {}
  async transcribe(request: VisionTranscriptionRequest, signal?: AbortSignal): Promise<VisionTranscriptionSuccess> {
    if (!this.options.apiKey || !this.options.model) throw new DomainError("AI_NOT_CONFIGURED", "OpenAI vision requires a resolved API key and model");
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 60_000);
    if (signal?.aborted) controller.abort(); else signal?.addEventListener("abort", () => controller.abort(), { once: true });
    try {
      const client = this.options.client ?? new OpenAI({ apiKey: this.options.apiKey });
      const response = await client.responses.create({ model: this.options.model, input: [{ role: "system", content: request.systemInstruction }, { role: "user", content: [{ type: "input_text" as const, text: request.userPayload }, ...request.pages.map((page) => ({ type: "input_image" as const, image_url: `data:${page.mimeType};base64,${page.data.toString("base64")}`, detail: "high" as const }))] }], text: { format: { type: "json_schema", name: "edulit_ocr", strict: true, schema: request.responseJsonSchema } }, max_output_tokens: 8192 }, { signal: controller.signal });
      const data = response as unknown as { status?: string; output_text?: string; output?: Array<{ content?: Array<{ type?: string; refusal?: string; text?: string }> }> };
      if (data.status && data.status !== "completed") throw new DomainError("AI_INVALID_OUTPUT", `OpenAI OCR ended with ${data.status}`);
      if (data.output?.flatMap((item) => item.content ?? []).some((item) => item.type === "refusal" || item.refusal)) throw new DomainError("AI_INVALID_OUTPUT", "provider refused OCR request");
      const rawText = data.output_text?.trim() ?? ""; if (!rawText) throw new DomainError("AI_INVALID_OUTPUT", "provider returned empty OCR text");
      return { output: JSON.parse(rawText) as VisionTranscriptionOutput, rawText, finishReason: "completed", latencyMs: 0, provider: "openai", model: this.options.model, promptVersion: request.promptVersion };
    } catch (error) { if (controller.signal.aborted) throw new DomainError("AI_TIMEOUT", "OpenAI OCR timed out"); if (error instanceof DomainError) throw error; const status = typeof error === "object" && error && "status" in error ? Number((error as { status?: number }).status) : 0; if (status === 429) throw new DomainError("RATE_LIMITED", "OpenAI OCR rate limited"); if (status === 401 || status === 403) throw new DomainError("AI_NOT_CONFIGURED", "OpenAI OCR key rejected"); throw new DomainError("MODEL_UNAVAILABLE", "OpenAI OCR request failed"); }
    finally { clearTimeout(timer); }
  }
}
