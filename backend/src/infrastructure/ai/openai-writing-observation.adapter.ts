import { WRITING_PROFILE_PROMPT_VERSION, type WritingObservationModelOutput } from "../../modules/writing-profile/domain/output.js";
import { WRITING_PROFILE_MAX_OUTPUT_TOKENS, WRITING_PROFILE_RETRY_BUDGET_MS, WRITING_PROFILE_TIMEOUT_MS } from "./ai-config.js";
import { generateOpenAiJson, type OpenAiJsonOptions } from "./openai-json.js";
import type { WritingObservationAiPort, WritingObservationAiRequest, WritingObservationAiSuccess } from "./writing-observation-ai.port.js";

export class OpenAiWritingObservationAdapter implements WritingObservationAiPort {
  constructor(private readonly options: Omit<OpenAiJsonOptions, "maxOutputTokens"> = {}) {}
  async extract(request: WritingObservationAiRequest, signal?: AbortSignal): Promise<WritingObservationAiSuccess> {
    const result = await generateOpenAiJson({ ...this.options, maxOutputTokens: WRITING_PROFILE_MAX_OUTPUT_TOKENS, timeoutMs: this.options.timeoutMs ?? WRITING_PROFILE_TIMEOUT_MS, retryBudgetMs: this.options.retryBudgetMs ?? WRITING_PROFILE_RETRY_BUDGET_MS }, request, signal);
    return { ...result, output: result.parsed as WritingObservationModelOutput, promptVersion: request.promptVersion || WRITING_PROFILE_PROMPT_VERSION };
  }
}
