import { DomainError } from "../../core/errors.js";
import {
  WRITING_PROFILE_PROMPT_VERSION,
  type WritingObservationModelOutput,
} from "../../modules/writing-profile/domain/output.js";
import type {
  WritingObservationAiPort,
  WritingObservationAiRequest,
  WritingObservationAiSuccess,
  WritingObservationAiUsage,
} from "./writing-observation-ai.port.js";

export class FakeWritingObservationAi implements WritingObservationAiPort {
  readonly calls: WritingObservationAiRequest[] = [];
  nextOutput: WritingObservationModelOutput | null = null;
  nextRawText: string | null = null;
  nextFinishReason = "STOP";
  nextError: unknown = null;
  latencyMs = 0;
  usage: WritingObservationAiUsage | undefined;
  hold: Promise<void> | null = null;

  async extract(request: WritingObservationAiRequest): Promise<WritingObservationAiSuccess> {
    this.calls.push(request);
    if (this.hold) {
      await this.hold;
    }
    if (this.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    }
    if (this.nextError) {
      const error = this.nextError;
      this.nextError = null;
      throw error;
    }
    const output = this.nextOutput ?? defaultExtractOutput(request.extractionInput.submissionText);
    return {
      output,
      rawText: this.nextRawText ?? JSON.stringify(output),
      finishReason: this.nextFinishReason,
      usage: this.usage,
      latencyMs: this.latencyMs,
      provider: "mock",
      model: "mock/writing-profile",
      promptVersion: request.promptVersion || WRITING_PROFILE_PROMPT_VERSION,
    };
  }
}

export function fakeWritingObservationError(code: string, message: string): DomainError {
  return new DomainError(code, message);
}

export function defaultExtractOutput(text: string): WritingObservationModelOutput {
  if (!text.trim()) {
    return { observations: [] };
  }
  const end = Math.min(18, text.length);
  const quote = text.slice(0, end);
  return {
    observations: [
      {
        traitId: "WORD_CHOICE",
        kind: "STYLE",
        description: "Bài có cụm từ cụ thể có thể quan sát trong đoạn nguồn.",
        evidence: { quote, start: 0, end },
      },
    ],
  };
}
