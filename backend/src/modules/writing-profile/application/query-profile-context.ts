import type { EduLitPrisma } from "../../../infrastructure/database/prisma.client.js";
import type { DeclaredGoals, ProfileSummary } from "../domain/profile.js";

export type ProfileContext = {
  studentId: string;
  profile: {
    id: string;
    version: number;
    declaredGoals: DeclaredGoals;
    summary: ProfileSummary;
    observationIds: string[];
    updatedAt: Date;
  } | null;
  recentObservations: Array<{
    id: string;
    kind: string;
    featureKey: string;
    description: string;
    genre: string;
    evidenceQuote: string;
    evidenceStart: number;
    evidenceEnd: number;
    status: string;
    assessmentId: string;
    observedAt: Date;
  }>;
};

export async function getProfileContextForSession(
  prisma: EduLitPrisma,
  studentId: string,
  limit = 10,
): Promise<ProfileContext> {
  const take = Math.max(1, Math.min(limit, 50));
  const profile = await prisma.writingProfile.findUnique({ where: { studentId } });
  const recentObservations = await prisma.writingObservation.findMany({
    where: {
      studentId,
      status: { not: "INVALIDATED" },
      assessment: { status: "PUBLISHED", studentId },
    },
    orderBy: { observedAt: "desc" },
    take,
    select: {
      id: true,
      kind: true,
      featureKey: true,
      description: true,
      genre: true,
      evidenceQuote: true,
      evidenceStart: true,
      evidenceEnd: true,
      status: true,
      assessmentId: true,
      observedAt: true,
    },
  });

  return {
    studentId,
    profile: profile
      ? {
          id: profile.id,
          version: profile.version,
          declaredGoals: profile.declaredGoals as DeclaredGoals,
          summary: profile.summary as ProfileSummary,
          observationIds: profile.observationIds as string[],
          updatedAt: profile.updatedAt,
        }
      : null,
    recentObservations,
  };
}
