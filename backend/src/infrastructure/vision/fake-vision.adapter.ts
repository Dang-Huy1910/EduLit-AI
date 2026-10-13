import { DomainError } from "../../core/errors.js";
import type { VisionTranscriptionOutput, VisionTranscriptionPort, VisionTranscriptionRequest, VisionTranscriptionSuccess } from "./vision-transcription.port.js";

/** Deterministic fixture transport. Unknown images are rejected rather than given invented text. */
export class FakeVisionAdapter implements VisionTranscriptionPort {
  readonly calls: VisionTranscriptionRequest[] = [];
  constructor(private readonly fixtures = new Map<string, VisionTranscriptionOutput>()) {}
  register(contentHash: string, output: VisionTranscriptionOutput): void { this.fixtures.set(contentHash, output); }
  async transcribe(request: VisionTranscriptionRequest): Promise<VisionTranscriptionSuccess> {
    this.calls.push(request);
    const first = request.pages[0];
    const fixture = first && this.fixtures.get(first.contentHash);
    if (!fixture) throw new DomainError("OCR_FIXTURE_MISSING", "no mock OCR fixture matches the approved derivative");
    const pageIds = new Set(request.pages.map((page) => page.pageId));
    if (fixture.pages.length !== pageIds.size || fixture.pages.some((page) => !pageIds.has(page.pageId))) throw new DomainError("AI_INVALID_OUTPUT", "mock OCR fixture pages do not match request");
    return { output: fixture, rawText: JSON.stringify(fixture), finishReason: "STOP", latencyMs: 0, provider: "mock", model: "mock/ocr", promptVersion: request.promptVersion };
  }
}
