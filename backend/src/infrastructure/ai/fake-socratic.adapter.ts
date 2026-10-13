import { DomainError } from "../../core/errors.js";
import {
  SOCRATIC_OUTLINE_INIT_PROMPT_VERSION,
  SOCRATIC_PROMPT_VERSION,
  type SocraticModelOutput,
} from "../../modules/socratic/domain/output.js";
import type {
  SocraticAiPort,
  SocraticAiRequest,
  SocraticAiSuccess,
  SocraticAiUsage,
  SocraticOutlineInitOutput,
  SocraticOutlineInitSuccess,
} from "./socratic-ai.port.js";

export const DEFAULT_FAKE_OUTPUT: SocraticModelOutput = {
  replySentences: [
    "Em đang đi đúng hướng khi tự đặt vấn đề, chưa cần đoạn văn mẫu.",
    "Hãy chọn một ý em thực sự quan sát được từ ngữ liệu hoặc đời sống liên quan đề.",
    "Em muốn làm rõ luận điểm nào trước?",
  ],
  focusCriterionIds: [],
};

export const DEFAULT_FAKE_OUTLINE_INIT: SocraticOutlineInitOutput = {
  welcomeSentences: [
    "Thầy/Cô đã phác dàn ý gợi ý bằng các ý ngắn theo đề, chưa phải đoạn văn mẫu.",
    "Em xem cột bên phải, giữ ý hợp với suy nghĩ của mình và sửa những chỗ chưa ổn.",
    "Em muốn đào sâu luận điểm nào trước?",
  ],
  outline: {
    sections: [
      {
        id: "open",
        title: "Mở bài",
        points: [
          "Dẫn vào vấn đề từ một hiện tượng đời sống gắn với đề.",
          "Nêu hướng triển khai và thông điệp cá nhân.",
        ],
      },
      {
        id: "body",
        title: "Thân bài",
        points: [
          "Luận điểm 1: giải thích khái niệm then chốt của đề.",
          "Luận điểm 2: dẫn chứng từ ngữ liệu hoặc đời sống học đường.",
          "Phản đề: xem xét giới hạn của luận điểm khi phù hợp thể loại.",
        ],
      },
      {
        id: "close",
        title: "Kết bài",
        points: [
          "Khẳng định thông điệp đã chọn.",
          "Bài học hành động cụ thể cho người trẻ.",
        ],
      },
    ],
  },
};

export class FakeSocraticAi implements SocraticAiPort {
  readonly calls: SocraticAiRequest[] = [];
  readonly outlineCalls: SocraticAiRequest[] = [];
  nextOutput: SocraticModelOutput | null = null;
  nextOutlineOutput: SocraticOutlineInitOutput | null = null;
  nextRawText: string | null = null;
  nextFinishReason = "STOP";
  nextError: unknown = null;
  nextOutlineError: unknown = null;
  latencyMs = 0;
  usage: SocraticAiUsage | undefined;
  hold: Promise<void> | null = null;

  async generateTurn(request: SocraticAiRequest): Promise<SocraticAiSuccess> {
    this.calls.push(request);
    await this.waitForReady();
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
      provider: "mock",
      model: "mock/socratic",
      promptVersion: request.promptVersion || SOCRATIC_PROMPT_VERSION,
    };
  }

  async generateOutline(request: SocraticAiRequest): Promise<SocraticOutlineInitSuccess> {
    this.outlineCalls.push(request);
    await this.waitForReady();
    if (this.nextOutlineError) {
      const error = this.nextOutlineError;
      this.nextOutlineError = null;
      throw error;
    }
    if (this.nextError) {
      const error = this.nextError;
      this.nextError = null;
      throw error;
    }
    const output = this.nextOutlineOutput ?? DEFAULT_FAKE_OUTLINE_INIT;
    return {
      output,
      rawText: JSON.stringify(output),
      finishReason: this.nextFinishReason,
      usage: this.usage,
      latencyMs: this.latencyMs,
      provider: "mock",
      model: "mock/socratic",
      promptVersion: request.promptVersion || SOCRATIC_OUTLINE_INIT_PROMPT_VERSION,
    };
  }

  private async waitForReady(): Promise<void> {
    if (this.hold) {
      await this.hold;
    }
    if (this.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    }
  }
}

export function fakeProviderError(code: string, message: string): DomainError {
  return new DomainError(code, message);
}
