import { DomainError } from "../../core/errors.js";
import { SOCRATIC_OUTLINE_INIT_PROMPT_VERSION, SOCRATIC_PROMPT_VERSION, type SocraticModelOutput } from "../../modules/socratic/domain/output.js";
import { SOCRATIC_MAX_OUTPUT_TOKENS, SOCRATIC_RETRY_BUDGET_MS, SOCRATIC_TIMEOUT_MS } from "./ai-config.js";
import { generateOpenAiJson, type OpenAiJsonOptions } from "./openai-json.js";
import type { SocraticAiPort, SocraticAiRequest, SocraticAiSuccess, SocraticOutlineInitSuccess } from "./socratic-ai.port.js";

export class OpenAiSocraticAdapter implements SocraticAiPort {
  constructor(private readonly options: Omit<OpenAiJsonOptions, "maxOutputTokens"> = {}) {}
  async generateTurn(request: SocraticAiRequest, signal?: AbortSignal): Promise<SocraticAiSuccess> {
    const result = await this.generate(request, signal);
    return { ...result, output: result.parsed as SocraticModelOutput, promptVersion: request.promptVersion || SOCRATIC_PROMPT_VERSION };
  }
  async generateOutline(request: SocraticAiRequest, signal?: AbortSignal): Promise<SocraticOutlineInitSuccess> {
    const result = await this.generate(request, signal);
    return { ...result, output: result.parsed as SocraticOutlineInitSuccess["output"], promptVersion: request.promptVersion || SOCRATIC_OUTLINE_INIT_PROMPT_VERSION };
  }
  private async generate(request: SocraticAiRequest, signal?: AbortSignal) {
    const result = await generateOpenAiJson({ ...this.options, maxOutputTokens: SOCRATIC_MAX_OUTPUT_TOKENS, timeoutMs: this.options.timeoutMs ?? SOCRATIC_TIMEOUT_MS, retryBudgetMs: this.options.retryBudgetMs ?? SOCRATIC_RETRY_BUDGET_MS }, request, signal);
    if (!result.model) throw new DomainError("AI_NOT_CONFIGURED", "OpenAI model is missing");
    return result;
  }
}
