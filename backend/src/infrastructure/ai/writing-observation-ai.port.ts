import type { WritingObservationModelOutput } from "../../modules/writing-profile/domain/output.js";
import type { ExtractionInput } from "../../modules/writing-profile/domain/extraction-input.js";

export type WritingObservationAiUsage = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  totalTokenCount?: number;
};

export type WritingObservationAiRequest = {
  systemInstruction: string;
  userPayload: string;
  responseJsonSchema: Record<string, unknown>;
  promptVersion: string;
  extractionInput: ExtractionInput;
};

export type WritingObservationAiSuccess = {
  output: WritingObservationModelOutput;
  rawText: string;
  finishReason: string;
  usage?: WritingObservationAiUsage;
  latencyMs: number;
  provider: "gemini" | "openai" | "mock";
  model: string;
  promptVersion: string;
};

export interface WritingObservationAiPort {
  extract(request: WritingObservationAiRequest, signal?: AbortSignal): Promise<WritingObservationAiSuccess>;
}
