export const ASSESSMENT_PROMPT_VERSION = "assessment-system.v1";
export const ASSESSMENT_SCHEMA_VERSION = "assessment-output.v1";

export type AssessmentEvidenceSpan = {
  quote: string;
  start: number;
  end: number;
};

export type AssessmentCriterionOutput = {
  criterionId: string;
  awardedScore: string;
  comment: string;
  strengths: string[];
  weaknesses: string[];
  evidence: AssessmentEvidenceSpan[];
  missingElements: string[];
};

export type AssessmentModelOutput = {
  detailedEvaluations: AssessmentCriterionOutput[];
  totalScore: string;
};
