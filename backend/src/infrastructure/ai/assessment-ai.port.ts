import type { AssessmentModelOutput } from "../../modules/assessment/domain/output.js";
import type { ScoringInput } from "../../modules/assessment/domain/scoring-input.js";

export type AssessmentAiUsage = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  totalTokenCount?: number;
};

export type AssessmentAiRequest = {
  systemInstruction: string;
  userPayload: string;
  responseJsonSchema: Record<string, unknown>;
  promptVersion: string;
  scoringInput: ScoringInput;
};

export type AssessmentAiSuccess = {
  output: AssessmentModelOutput;
  rawText: string;
  finishReason: string;
  usage?: AssessmentAiUsage;
  latencyMs: number;
  model: string;
  promptVersion: string;
};

export interface AssessmentAiPort {
  grade(request: AssessmentAiRequest, signal?: AbortSignal): Promise<AssessmentAiSuccess>;
}
