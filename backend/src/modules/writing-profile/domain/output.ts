export const WRITING_PROFILE_PROMPT_VERSION = "writing-profile-system.v1";
export const WRITING_PROFILE_SCHEMA_VERSION = "writing-profile-output.v1";
export const WRITING_PROFILE_MODEL_NAME = "gemini-2.5-flash";

export type WritingObservationModelItem = {
  traitId: string;
  kind: "STRENGTH" | "WEAKNESS" | "STYLE";
  description: string;
  evidence: {
    quote: string;
    start: number;
    end: number;
  };
};

export type WritingObservationModelOutput = {
  observations: WritingObservationModelItem[];
};
