import { GoogleGenAI } from "@google/genai";
import { DomainError } from "../../core/errors.js";
import type { VisionTranscriptionOutput, VisionTranscriptionPort, VisionTranscriptionRequest, VisionTranscriptionSuccess } from "./vision-transcription.port.js";

export class GeminiVisionAdapter implements VisionTranscriptionPort {
  constructor(private readonly options: { apiKey?: string; model?: string; timeoutMs?: number } = {}) {}
  async transcribe(request: VisionTranscriptionRequest, signal?: AbortSignal): Promise<VisionTranscriptionSuccess> {
    if (!this.options.apiKey || !this.options.model) throw new DomainError("AI_NOT_CONFIGURED", "Gemini vision requires a resolved API key and model");
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 60_000);
    if (signal?.aborted) controller.abort(); else signal?.addEventListener("abort", () => controller.abort(), { once: true });
    try {
      const response = await new GoogleGenAI({ apiKey: this.options.apiKey }).models.generateContent({
        model: this.options.model,
        contents: [{ role: "user", parts: [{ text: request.userPayload }, ...request.pages.map((page) => ({ inlineData: { mimeType: page.mimeType, data: page.data.toString("base64") } }))] }] as never,
        config: { systemInstruction: request.systemInstruction, responseMimeType: "application/json", responseJsonSchema: request.responseJsonSchema, maxOutputTokens: 8192, abortSignal: controller.signal },
      });
      const rawText = response.text?.trim() ?? ""; if (!rawText) throw new DomainError("AI_INVALID_OUTPUT", "provider returned empty OCR text");
      return { output: JSON.parse(rawText) as VisionTranscriptionOutput, rawText, finishReason: String(response.candidates?.[0]?.finishReason ?? "STOP"), latencyMs: 0, provider: "gemini", model: this.options.model, promptVersion: request.promptVersion };
    } catch (error) { if (controller.signal.aborted) throw new DomainError("AI_TIMEOUT", "Gemini OCR timed out"); if (error instanceof DomainError) throw error; throw new DomainError("MODEL_UNAVAILABLE", "Gemini OCR request failed"); }
    finally { clearTimeout(timer); }
  }
}
