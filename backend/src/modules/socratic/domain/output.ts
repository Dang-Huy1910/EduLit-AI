export type SocraticSourceRef = {
  kind: "learningMaterial" | "instructions" | "rubricCriterion";
  criterionId?: string;
};

export type SocraticModelOutput = {
  replySentences: string[];
  focusCriterionIds: string[];
  sourceRefs?: SocraticSourceRef[];
};

export type SocraticResponseMode = "model" | "fallback" | "replay";

export const SOCRATIC_PROMPT_VERSION = "socratic-system.v1";
export const SOCRATIC_SCHEMA_VERSION = "socratic-output.v1";
export const SOCRATIC_OUTLINE_INIT_PROMPT_VERSION = "socratic-outline-init.v1";
export const SOCRATIC_OUTLINE_INIT_SCHEMA_VERSION = "socratic-outline-init.v1";
export const SCAFFOLD_INIT_REQUEST_ID = "scaffold-init";
