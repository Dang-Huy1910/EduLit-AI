import { ASSESSMENT_PROMPT_VERSION, type AssessmentModelOutput } from "../../modules/assessment/domain/output.js";
import { ASSESSMENT_MAX_OUTPUT_TOKENS, ASSESSMENT_RETRY_BUDGET_MS, ASSESSMENT_TIMEOUT_MS } from "./ai-config.js";
import { generateOpenAiJson, type OpenAiJsonOptions } from "./openai-json.js";
import type { AssessmentAiPort, AssessmentAiRequest, AssessmentAiSuccess } from "./assessment-ai.port.js";

export class OpenAiAssessmentAdapter implements AssessmentAiPort {
  constructor(private readonly options: Omit<OpenAiJsonOptions, "maxOutputTokens"> = {}) {}
  async grade(request: AssessmentAiRequest, signal?: AbortSignal): Promise<AssessmentAiSuccess> {
    const result = await generateOpenAiJson({ ...this.options, maxOutputTokens: ASSESSMENT_MAX_OUTPUT_TOKENS, timeoutMs: this.options.timeoutMs ?? ASSESSMENT_TIMEOUT_MS, retryBudgetMs: this.options.retryBudgetMs ?? ASSESSMENT_RETRY_BUDGET_MS }, request, signal);
    return { ...result, output: result.parsed as AssessmentModelOutput, promptVersion: request.promptVersion || ASSESSMENT_PROMPT_VERSION };
  }
}
