import { DomainError } from "../../core/errors.js";
import { decimal, decimalString } from "../../core/decimal.js";
import { ASSESSMENT_MODEL_NAME, ASSESSMENT_PROMPT_VERSION, type AssessmentModelOutput } from "../../modules/assessment/domain/output.js";
import type { ScoringInput } from "../../modules/assessment/domain/scoring-input.js";
import type {
  AssessmentAiPort,
  AssessmentAiRequest,
  AssessmentAiSuccess,
  AssessmentAiUsage,
} from "./assessment-ai.port.js";

export class FakeAssessmentAi implements AssessmentAiPort {
  readonly calls: AssessmentAiRequest[] = [];
  nextOutput: AssessmentModelOutput | null = null;
  nextRawText: string | null = null;
  nextFinishReason = "STOP";
  nextError: unknown = null;
  latencyMs = 0;
  usage: AssessmentAiUsage | undefined;
  hold: Promise<void> | null = null;

  async grade(request: AssessmentAiRequest): Promise<AssessmentAiSuccess> {
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
    const output = this.nextOutput ?? defaultFakeOutput(request.scoringInput);
    return {
      output,
      rawText: this.nextRawText ?? JSON.stringify(output),
      finishReason: this.nextFinishReason,
      usage: this.usage,
      latencyMs: this.latencyMs,
      model: ASSESSMENT_MODEL_NAME,
      promptVersion: request.promptVersion || ASSESSMENT_PROMPT_VERSION,
    };
  }
}

export function fakeAssessmentProviderError(code: string, message: string): DomainError {
  return new DomainError(code, message);
}

export function defaultFakeOutput(input: ScoringInput): AssessmentModelOutput {
  const text = input.submissionText;
  const quoteEnd = Math.min(16, text.length);
  const quote = text.slice(0, quoteEnd) || text;
  const step = decimal(input.assignmentSnapshot.scoreStep);
  let total = decimal(0);
  const detailedEvaluations = input.assignmentSnapshot.rubric.criteria.map((criterion) => {
    const weight = decimal(criterion.weight);
    const halfSteps = weight.div(step).mul("0.5").floor();
    let awarded = halfSteps.mul(step);
    if (awarded.gt(weight)) {
      awarded = weight;
    }
    total = total.plus(awarded);
    const hasEvidence = awarded.gt(0) && quote.length > 0;
    return {
      criterionId: criterion.criterionId,
      awardedScore: decimalString(awarded),
      comment: hasEvidence
        ? "Bài có ý liên quan tiêu chí, cần giáo viên đối chiếu chất lượng."
        : "Chưa thấy yếu tố bắt buộc của tiêu chí.",
      strengths: hasEvidence ? ["Có câu chữ liên quan tiêu chí"] : [],
      weaknesses: hasEvidence ? [] : ["Thiếu yếu tố bắt buộc"],
      evidence: hasEvidence ? [{ quote, start: 0, end: quote.length }] : [],
      missingElements: hasEvidence ? [] : ["Yếu tố bắt buộc của tiêu chí"],
    };
  });
  return {
    detailedEvaluations,
    totalScore: decimalString(total),
  };
}
