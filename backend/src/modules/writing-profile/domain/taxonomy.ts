import { DomainError } from "../../../core/errors.js";
import type { ObservationKind } from "../../../generated/prisma/client.js";

export const WRITING_PROFILE_TAXONOMY_VERSION = "writing-traits.v1";
export const WRITING_PROFILE_MAX_OBSERVATIONS = 6;
export const WRITING_PROFILE_DESCRIPTION_MAX = 400;

export const WRITING_TRAITS = {
  SENTENCE_STRUCTURE: {
    traitId: "SENTENCE_STRUCTURE",
    kinds: ["STRENGTH", "WEAKNESS", "STYLE"],
  },
  TRANSITIONS: {
    traitId: "TRANSITIONS",
    kinds: ["STRENGTH", "WEAKNESS"],
  },
  ARGUMENT_ORGANIZATION: {
    traitId: "ARGUMENT_ORGANIZATION",
    kinds: ["STRENGTH", "WEAKNESS"],
  },
  EVIDENCE_LINKING: {
    traitId: "EVIDENCE_LINKING",
    kinds: ["STRENGTH", "WEAKNESS"],
  },
  WORD_CHOICE: {
    traitId: "WORD_CHOICE",
    kinds: ["STRENGTH", "WEAKNESS", "STYLE"],
  },
  SENTENCE_RHYTHM: {
    traitId: "SENTENCE_RHYTHM",
    kinds: ["STRENGTH", "WEAKNESS", "STYLE"],
  },
  PARAGRAPH_UNITY: {
    traitId: "PARAGRAPH_UNITY",
    kinds: ["STRENGTH", "WEAKNESS"],
  },
  COHESION: {
    traitId: "COHESION",
    kinds: ["STRENGTH", "WEAKNESS", "STYLE"],
  },
} as const;

export type WritingTraitId = keyof typeof WRITING_TRAITS;

const TRAIT_IDS = new Set(Object.keys(WRITING_TRAITS));

export function isWritingTraitId(value: string): value is WritingTraitId {
  return TRAIT_IDS.has(value);
}

export function assertTraitKind(traitId: string, kind: string): asserts kind is ObservationKind {
  if (!isWritingTraitId(traitId)) {
    throw new DomainError("OBSERVATION_TRAIT", `traitId ${traitId} is not in writing-traits.v1`);
  }
  const allowed = WRITING_TRAITS[traitId].kinds as readonly string[];
  if (!allowed.includes(kind)) {
    throw new DomainError(
      "OBSERVATION_KIND",
      `kind ${kind} is not allowed for trait ${traitId}`,
    );
  }
}

export function buildFeatureKey(genre: string, kind: string, traitId: string): string {
  if (!genre || genre.includes("|")) {
    throw new DomainError("OBSERVATION_GENRE", "genre from the assignment snapshot is required");
  }
  assertTraitKind(traitId, kind);
  return `${genre}|${kind}|${traitId}`;
}

export function parseFeatureKey(featureKey: string): { genre: string; kind: string; traitId: string } {
  const parts = featureKey.split("|");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    throw new DomainError("OBSERVATION_SHAPE", "featureKey must be genre|kind|traitId");
  }
  return { genre: parts[0], kind: parts[1], traitId: parts[2] };
}
