import type { CriterionEvaluation } from "../../src/modules/assessment/domain/evaluation.js";
import type { AssessmentModelOutput } from "../../src/modules/assessment/domain/output.js";
import { SAMPLE_RUBRIC } from "./db.js";

export function evaluationsForText(
  text: string,
  scores: Array<{ criterionId: string; awardedScore: string }> = [
    { criterionId: "C1", awardedScore: "3.00" },
    { criterionId: "C2", awardedScore: "4.50" },
  ],
): CriterionEvaluation[] {
  const end = Math.min(12, text.length);
  const quote = text.slice(0, end);
  return scores.map((item) => ({
    criterionId: item.criterionId,
    awardedScore: item.awardedScore,
    comment: "Có ý liên quan tiêu chí trong đoạn đã nộp.",
    strengths: ["Có câu chữ làm căn cứ"],
    weaknesses: [],
    evidence: [{ quote, start: 0, end }],
    missingElements: [],
  }));
}

export function modelOutputForText(text: string, totalScore = "7.50"): AssessmentModelOutput {
  const detailedEvaluations = evaluationsForText(text).map((item) => ({
    criterionId: item.criterionId,
    awardedScore: item.awardedScore,
    comment: item.comment ?? "",
    strengths: item.strengths ?? [],
    weaknesses: item.weaknesses ?? [],
    evidence: item.evidence ?? [],
    missingElements: item.missingElements ?? [],
  }));
  return { detailedEvaluations, totalScore };
}

export { SAMPLE_RUBRIC };
