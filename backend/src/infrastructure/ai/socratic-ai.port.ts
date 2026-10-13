import type { SocraticModelOutput } from "../../modules/socratic/domain/output.js";

export type SocraticAiUsage = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  totalTokenCount?: number;
};

export type SocraticAiRequest = {
  systemInstruction: string;
  userPayload: string;
  responseJsonSchema: Record<string, unknown>;
  promptVersion: string;
};

export type SocraticAiSuccess = {
  output: SocraticModelOutput;
  rawText: string;
  finishReason: string;
  usage?: SocraticAiUsage;
  latencyMs: number;
  model: string;
  promptVersion: string;
};

export interface SocraticAiPort {
  generateTurn(request: SocraticAiRequest, signal?: AbortSignal): Promise<SocraticAiSuccess>;
}
