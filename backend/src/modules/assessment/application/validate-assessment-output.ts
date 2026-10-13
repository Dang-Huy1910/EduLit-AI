import { createRequire } from "node:module";
import { DomainError } from "../../../core/errors.js";
import type { AssignmentSnapshot } from "../../assignments/domain/rubric.js";
import { loadAssessmentPromptBundle } from "../prompt-assets.js";
import { validateAssessmentScores, type CriterionEvaluation } from "../domain/evaluation.js";
import type { AssessmentModelOutput } from "../domain/output.js";

const require = createRequire(import.meta.url);
const AjvModule = require("ajv") as {
  default?: new (options?: object) => { compile: (schema: object) => (data: unknown) => boolean };
} & (new (options?: object) => {
  compile: (schema: object) => (data: unknown) => boolean;
});
const Ajv = AjvModule.default ?? AjvModule;

const ajv = new Ajv({ allErrors: true, strict: false });
const validator = ajv.compile(loadAssessmentPromptBundle().outputSchema);

export function parseAssessmentModelOutput(
  raw: unknown,
  snapshot: AssignmentSnapshot,
  submissionText: string,
): { output: AssessmentModelOutput; evaluations: CriterionEvaluation[]; totalScore: string } {
  if (!validator(raw)) {
    throw new DomainError("AI_INVALID_OUTPUT", "assessment output failed local JSON schema validation");
  }
  const value = raw as AssessmentModelOutput;
  const scores = validateAssessmentScores({
    rubric: snapshot.rubric,
    maxScore: snapshot.maxScore,
    scoreStep: snapshot.scoreStep,
    evaluations: value.detailedEvaluations,
    totalScore: value.totalScore,
    submissionText,
    requireEvidenceContract: true,
  });
  return {
    output: {
      detailedEvaluations: scores.evaluations.map((item) => ({
        criterionId: item.criterionId,
        awardedScore: item.awardedScore,
        comment: item.comment ?? "",
        strengths: item.strengths ?? [],
        weaknesses: item.weaknesses ?? [],
        evidence: item.evidence ?? [],
        missingElements: item.missingElements ?? [],
      })),
      totalScore: scores.totalScore,
    },
    evaluations: scores.evaluations,
    totalScore: scores.totalScore,
  };
}
