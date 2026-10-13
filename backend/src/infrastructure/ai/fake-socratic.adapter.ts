import { DomainError } from "../../core/errors.js";
import { SOCRATIC_MODEL_NAME, SOCRATIC_PROMPT_VERSION, type SocraticModelOutput } from "../../modules/socratic/domain/output.js";
import type { SocraticAiPort, SocraticAiRequest, SocraticAiSuccess, SocraticAiUsage } from "./socratic-ai.port.js";

export const DEFAULT_FAKE_OUTPUT: SocraticModelOutput = {
  replySentences: [
    "Em đang đi đúng hướng khi tự đặt vấn đề, chưa cần đoạn văn mẫu.",
    "Hãy chọn một ý em thực sự quan sát được từ ngữ liệu hoặc đời sống liên quan đề.",
    "Em muốn làm rõ luận điểm nào trước?",
  ],
  focusCriterionIds: [],
};

export class FakeSocraticAi implements SocraticAiPort {
  readonly calls: SocraticAiRequest[] = [];
  nextOutput: SocraticModelOutput | null = null;
  nextRawText: string | null = null;
  nextFinishReason = "STOP";
  nextError: unknown = null;
  latencyMs = 0;
  usage: SocraticAiUsage | undefined;
  hold: Promise<void> | null = null;

  async generateTurn(request: SocraticAiRequest): Promise<SocraticAiSuccess> {
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
    const output = this.nextOutput ?? DEFAULT_FAKE_OUTPUT;
    return {
      output,
      rawText: this.nextRawText ?? JSON.stringify(output),
      finishReason: this.nextFinishReason,
      usage: this.usage,
      latencyMs: this.latencyMs,
      model: SOCRATIC_MODEL_NAME,
      promptVersion: request.promptVersion || SOCRATIC_PROMPT_VERSION,
    };
  }
}

export function fakeProviderError(code: string, message: string): DomainError {
  return new DomainError(code, message);
}
