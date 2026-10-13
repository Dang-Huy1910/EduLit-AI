import { createRequire } from "node:module";
import { DomainError } from "../../../core/errors.js";
import { assertEvidenceQuote } from "../../../core/utf16.js";
import type { ObservationInput } from "../domain/profile.js";
import { loadWritingProfilePromptBundle } from "../prompt-assets.js";
import {
  WRITING_PROFILE_DESCRIPTION_MAX,
  WRITING_PROFILE_MAX_OBSERVATIONS,
  assertTraitKind,
  buildFeatureKey,
} from "../domain/taxonomy.js";
import type { WritingObservationModelOutput } from "../domain/output.js";

const require = createRequire(import.meta.url);
const AjvModule = require("ajv") as {
  default?: new (options?: object) => { compile: (schema: object) => (data: unknown) => boolean };
} & (new (options?: object) => {
  compile: (schema: object) => (data: unknown) => boolean;
});
const Ajv = AjvModule.default ?? AjvModule;
const ajv = new Ajv({ allErrors: true, strict: false });
const validator = ajv.compile(loadWritingProfilePromptBundle().outputSchema);

export function parseWritingObservationOutput(
  raw: unknown,
  submissionText: string,
  genre: string,
): ObservationInput[] {
  if (!validator(raw)) {
    throw new DomainError("AI_INVALID_OUTPUT", "writing-profile output failed local JSON schema validation");
  }
  const value = raw as WritingObservationModelOutput;
  if (value.observations.length > WRITING_PROFILE_MAX_OBSERVATIONS) {
    throw new DomainError("OBSERVATION_LIMIT", "at most 6 observations per source assessment");
  }
  const seen = new Set<string>();
  const observations: ObservationInput[] = [];
  for (const item of value.observations) {
    assertTraitKind(item.traitId, item.kind);
    if (item.description.length > WRITING_PROFILE_DESCRIPTION_MAX) {
      throw new DomainError("OBSERVATION_SHAPE", "description exceeds the length limit");
    }
    assertEvidenceQuote(submissionText, item.evidence.start, item.evidence.end, item.evidence.quote);
    const featureKey = buildFeatureKey(genre, item.kind, item.traitId);
    if (seen.has(featureKey)) {
      throw new DomainError("OBSERVATION_DUPLICATE", `duplicate featureKey ${featureKey} in one extraction batch`);
    }
    seen.add(featureKey);
    observations.push({
      kind: item.kind,
      featureKey,
      description: item.description,
      genre,
      evidenceQuote: item.evidence.quote,
      evidenceStart: item.evidence.start,
      evidenceEnd: item.evidence.end,
      status: "PROVISIONAL",
    });
  }
  return observations;
}
