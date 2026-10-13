import { DomainError } from "../../core/errors.js";
import { buildSourceHashCatalog, segmentsForFixture } from "./ocr-fixtures.js";
import type { VisionTranscriptionOutput, VisionTranscriptionPort, VisionTranscriptionRequest, VisionTranscriptionSuccess } from "./vision-transcription.port.js";

/** Deterministic fixture transport. Unknown images are rejected rather than given invented text. */
export class FakeVisionAdapter implements VisionTranscriptionPort {
  readonly calls: VisionTranscriptionRequest[] = [];
  private readonly outputsByContentHash = new Map<string, VisionTranscriptionOutput>();
  private catalog: Map<string, string> | null = null;
  private catalogTask: Promise<Map<string, string>> | null = null;
  constructor(fixtures = new Map<string, VisionTranscriptionOutput>(), private readonly loadBuiltinCatalog = true) {
    for (const [hash, output] of fixtures) this.outputsByContentHash.set(hash, output);
  }
  register(contentHash: string, output: VisionTranscriptionOutput): void { this.outputsByContentHash.set(contentHash, output); }
  async transcribe(request: VisionTranscriptionRequest): Promise<VisionTranscriptionSuccess> {
    this.calls.push(request);
    const first = request.pages[0];
    const registered = first && this.outputsByContentHash.get(first.contentHash);
    if (registered) {
      const pageIds = new Set(request.pages.map((page) => page.pageId));
      if (registered.pages.length !== pageIds.size || registered.pages.some((page) => !pageIds.has(page.pageId))) {
        throw new DomainError("AI_INVALID_OUTPUT", "mock OCR fixture pages do not match request");
      }
      return success(registered, request.promptVersion);
    }
    const catalog = await this.ensureCatalog();
    const pages = request.pages.map((page) => {
      const fixtureId = (page.sourceHash && catalog.get(page.sourceHash)) || catalog.get(page.contentHash);
      if (!fixtureId) throw new DomainError("OCR_FIXTURE_MISSING", "no mock OCR fixture matches the approved derivative");
      return { pageId: page.pageId, segments: segmentsForFixture(fixtureId).map((segment) => ({ ...segment, id: `${page.pageId}:${segment.id}` })) };
    });
    return success({ pages }, request.promptVersion);
  }
  private async ensureCatalog(): Promise<Map<string, string>> {
    if (!this.loadBuiltinCatalog) return new Map();
    if (this.catalog) return this.catalog;
    this.catalogTask ??= buildSourceHashCatalog();
    this.catalog = await this.catalogTask;
    return this.catalog;
  }
}

function success(output: VisionTranscriptionOutput, promptVersion: string): VisionTranscriptionSuccess {
  return { output, rawText: JSON.stringify(output), finishReason: "STOP", latencyMs: 0, provider: "mock", model: "mock/ocr", promptVersion };
}
