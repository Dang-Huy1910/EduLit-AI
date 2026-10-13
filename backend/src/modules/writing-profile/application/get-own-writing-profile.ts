import type { EduLitPrisma } from "../../../infrastructure/database/prisma.client.js";
import type { AssessmentActor } from "../../assessment/domain/actor.js";
import { assertActiveActor } from "../../assessment/application/assert-actor.js";
import type { DeclaredGoals, ProfileSummary } from "../domain/profile.js";
import { emptySummary } from "../domain/profile.js";

export type OwnWritingProfileView = {
  profile: {
    id: string;
    version: number;
    declaredGoals: DeclaredGoals;
    summary: ProfileSummary;
    updatedAt: string;
  } | null;
  observations: Array<{
    id: string;
    kind: string;
    featureKey: string;
    description: string;
    genre: string;
    status: string;
    evidenceQuote: string;
    evidenceStart: number;
    evidenceEnd: number;
    assessmentId: string;
    observedAt: string;
  }>;
};

export async function getOwnWritingProfile(
  prisma: EduLitPrisma,
  actor: AssessmentActor,
): Promise<OwnWritingProfileView> {
  const student = await assertActiveActor(prisma, actor, "STUDENT");
  const profile = await prisma.writingProfile.findUnique({ where: { studentId: student.id } });
  const observations = await prisma.writingObservation.findMany({
    where: {
      studentId: student.id,
      status: { in: ["PROVISIONAL", "SUPPORTED", "RESOLVED"] },
      assessment: { status: "PUBLISHED", studentId: student.id },
    },
    orderBy: { observedAt: "desc" },
  });
  return {
    profile: profile
      ? {
          id: profile.id,
          version: profile.version,
          declaredGoals: profile.declaredGoals as DeclaredGoals,
          summary: (profile.summary as ProfileSummary) ?? emptySummary(),
          updatedAt: profile.updatedAt.toISOString(),
        }
      : null,
    observations: observations.map((row) => ({
      id: row.id,
      kind: row.kind,
      featureKey: row.featureKey,
      description: row.description,
      genre: row.genre,
      status: row.status,
      evidenceQuote: row.evidenceQuote,
      evidenceStart: row.evidenceStart,
      evidenceEnd: row.evidenceEnd,
      assessmentId: row.assessmentId,
      observedAt: row.observedAt.toISOString(),
    })),
  };
}
