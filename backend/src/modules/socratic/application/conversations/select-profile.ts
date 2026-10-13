import type { ProfileContext } from "../../../writing-profile/application/query-profile-context.js";
import { SOCRATIC_MAX_OBSERVATIONS } from "../../../../infrastructure/ai/ai-config.js";

export type CoachingObservation = {
  id: string;
  kind: string;
  featureKey: string;
  description: string;
  genre: string;
  status: string;
  cautious: boolean;
};

export type CoachingProfile = {
  declaredGoals: Array<{ id: string; text: string }>;
  observations: CoachingObservation[];
  hasProfile: boolean;
};

const KIND_RANK: Record<string, number> = {
  WEAKNESS: 0,
  STYLE: 1,
  STRENGTH: 2,
};

export function selectCoachingProfile(
  context: ProfileContext,
  genre: string,
  limit = SOCRATIC_MAX_OBSERVATIONS,
): CoachingProfile {
  const declaredGoals = context.profile?.declaredGoals.items ?? [];
  const ranked = [...context.recentObservations].sort((a, b) => {
    const genreDelta = Number(b.genre === genre) - Number(a.genre === genre);
    if (genreDelta !== 0) {
      return genreDelta;
    }
    return (KIND_RANK[a.kind] ?? 9) - (KIND_RANK[b.kind] ?? 9);
  });
  const observations = ranked.slice(0, limit).map((item) => ({
    id: item.id,
    kind: item.kind,
    featureKey: item.featureKey,
    description: item.description,
    genre: item.genre,
    status: item.status,
    cautious: item.status === "PROVISIONAL",
  }));
  return {
    declaredGoals,
    observations,
    hasProfile: context.profile !== null,
  };
}
