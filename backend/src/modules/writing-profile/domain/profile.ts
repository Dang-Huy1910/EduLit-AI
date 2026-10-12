import type { ObservationKind, ObservationStatus } from "../../../generated/prisma/client.js";

export type DeclaredGoals = {
  items: Array<{ id: string; text: string }>;
};

export type ProfileSummary = {
  strengths: string[];
  practiceNeeds: string[];
  expressionTendencies: string[];
  sourceAssessmentIds: string[];
  sourceAssignmentIds: string[];
  supportCountByFeature: Record<string, number>;
  observationCount: number;
  lastObservedAt: string | null;
  note: string;
};

export type ObservationInput = {
  kind: ObservationKind;
  featureKey: string;
  description: string;
  genre: string;
  evidenceQuote: string;
  evidenceStart: number;
  evidenceEnd: number;
  status?: ObservationStatus;
};

export const PROFILE_NOTE =
  "Hồ sơ mô tả tạm thời từ bài đã công bố; không khẳng định hội tụ và không dùng để chấm bài mới.";

export function emptyDeclaredGoals(): DeclaredGoals {
  return { items: [] };
}

export function emptySummary(): ProfileSummary {
  return {
    strengths: [],
    practiceNeeds: [],
    expressionTendencies: [],
    sourceAssessmentIds: [],
    sourceAssignmentIds: [],
    supportCountByFeature: {},
    observationCount: 0,
    lastObservedAt: null,
    note: PROFILE_NOTE,
  };
}

export function buildProfileSummary(
  observations: Array<{
    id: string;
    kind: ObservationKind;
    featureKey: string;
    description: string;
    status: ObservationStatus;
    assessmentId: string;
    assignmentId: string;
    observedAt: Date;
  }>,
): { summary: ProfileSummary; observationIds: string[] } {
  const active = observations.filter((item) => item.status !== "INVALIDATED");
  const supportCountByFeature: Record<string, number> = {};
  const featureAssessments = new Map<string, Set<string>>();
  const sourceAssessmentIds = new Set<string>();
  const sourceAssignmentIds = new Set<string>();
  const strengths: string[] = [];
  const practiceNeeds: string[] = [];
  const expressionTendencies: string[] = [];
  let lastObservedAt: Date | null = null;

  for (const item of active) {
    sourceAssessmentIds.add(item.assessmentId);
    sourceAssignmentIds.add(item.assignmentId);
    const assessments = featureAssessments.get(item.featureKey) ?? new Set<string>();
    assessments.add(item.assessmentId);
    featureAssessments.set(item.featureKey, assessments);
    if (!lastObservedAt || item.observedAt > lastObservedAt) {
      lastObservedAt = item.observedAt;
    }
    if (item.kind === "STRENGTH" && !strengths.includes(item.description)) {
      strengths.push(item.description);
    }
    if (item.kind === "WEAKNESS" && !practiceNeeds.includes(item.description)) {
      practiceNeeds.push(item.description);
    }
    if (item.kind === "STYLE" && !expressionTendencies.includes(item.description)) {
      expressionTendencies.push(item.description);
    }
  }

  for (const [featureKey, assessments] of featureAssessments) {
    supportCountByFeature[featureKey] = assessments.size;
  }

  return {
    observationIds: active.map((item) => item.id),
    summary: {
      strengths,
      practiceNeeds,
      expressionTendencies,
      sourceAssessmentIds: [...sourceAssessmentIds],
      sourceAssignmentIds: [...sourceAssignmentIds],
      supportCountByFeature,
      observationCount: active.length,
      lastObservedAt: lastObservedAt ? lastObservedAt.toISOString() : null,
      note: PROFILE_NOTE,
    },
  };
}
