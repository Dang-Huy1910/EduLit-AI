import type { SocraticModelOutput } from "../../modules/socratic/domain/output.js";
import type { StudentOutline } from "../../modules/socratic/domain/outline.js";

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
  provider: "gemini" | "openai" | "mock";
  model: string;
  promptVersion: string;
};

export type SocraticOutlineInitOutput = {
  welcomeSentences: string[];
  outline: StudentOutline;
};

export type SocraticOutlineInitSuccess = {
  output: SocraticOutlineInitOutput;
  rawText: string;
  finishReason: string;
  usage?: SocraticAiUsage;
  latencyMs: number;
  provider: "gemini" | "openai" | "mock";
  model: string;
  promptVersion: string;
};

export interface SocraticAiPort {
  generateTurn(request: SocraticAiRequest, signal?: AbortSignal): Promise<SocraticAiSuccess>;
  generateOutline(request: SocraticAiRequest, signal?: AbortSignal): Promise<SocraticOutlineInitSuccess>;
}
