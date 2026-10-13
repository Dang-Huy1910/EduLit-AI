import { randomUUID } from "node:crypto";
import { DomainError } from "../../../core/errors.js";
import type { WritingObservationAiPort } from "../../../infrastructure/ai/writing-observation-ai.port.js";
import type { EduLitPrisma } from "../../../infrastructure/database/prisma.client.js";
import type { AssessmentActor } from "../../assessment/domain/actor.js";
import { extractPublishedObservations, loadPublishedSourceForTeacher } from "./extract-published-observations.js";

export async function getProfileExtractionJob(prisma: EduLitPrisma, teacherId: string, assessmentId: string) {
  await loadPublishedSourceForTeacher(prisma, teacherId, assessmentId);
  const [job, observations, assessment] = await Promise.all([
    prisma.profileExtractionJob.findUnique({ where: { assessmentId } }),
    prisma.writingObservation.findMany({ where: { assessmentId }, orderBy: { observedAt: "desc" } }),
    prisma.assessment.findUniqueOrThrow({ where: { id: assessmentId }, select: { studentId: true } }),
  ]);
  const profile = await prisma.writingProfile.findUnique({ where: { studentId: assessment.studentId }, select: { version: true } });
  const base = job
    ? serialize(job)
    : { assessmentId, status: "PENDING" as const, attempts: 0, errorCode: null, noObservations: false, updatedAt: null };
  return {
    ...base,
    profileVersion: profile?.version ?? 0,
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

export async function processProfileExtraction(
  prisma: EduLitPrisma, ai: WritingObservationAiPort, actor: AssessmentActor, assessmentId: string,
) {
  if (actor.role !== "TEACHER") throw new DomainError("ACTOR_FORBIDDEN", "only teachers may extract profiles");
  await loadPublishedSourceForTeacher(prisma, actor.userId, assessmentId);
  const job = await prisma.profileExtractionJob.upsert({ where: { assessmentId }, create: { assessmentId }, update: {} });
  if (job.status === "COMPLETED") return getProfileExtractionJob(prisma, actor.userId, assessmentId);
  const stale = job.status === "PROCESSING" && !!job.leaseUntil && job.leaseUntil.getTime() < Date.now();
  if (job.status === "PROCESSING" && !stale) throw new DomainError("PROFILE_EXTRACTION_BUSY", "profile extraction is already processing");
  const token = randomUUID();
  const claimed = await prisma.profileExtractionJob.updateMany({
    where: { id: job.id, status: job.status },
    data: { status: "PROCESSING", leaseToken: token, leaseUntil: new Date(Date.now() + 90_000), attempts: { increment: 1 }, errorCode: null },
  });
  if (claimed.count !== 1) throw new DomainError("PROFILE_EXTRACTION_BUSY", "profile extraction was claimed by another request");
  try {
    const result = await extractPublishedObservations(prisma, ai, actor, { assessmentId });
    const done = await prisma.profileExtractionJob.updateMany({
      where: { id: job.id, leaseToken: token, status: "PROCESSING" },
      data: { status: "COMPLETED", leaseToken: null, leaseUntil: null, errorCode: null, noObservations: result.outcome === "no_observations" },
    });
    if (done.count !== 1) throw new DomainError("PROFILE_EXTRACTION_BUSY", "profile extraction lease expired");
  } catch (error) {
    await prisma.profileExtractionJob.updateMany({
      where: { id: job.id, leaseToken: token, status: "PROCESSING" },
      data: { status: "FAILED", leaseToken: null, leaseUntil: null, errorCode: error instanceof DomainError ? error.code : "PROFILE_EXTRACTION_FAILED" },
    });
    if (error instanceof DomainError && error.code === "PROFILE_EXTRACTION_BUSY") throw error;
  }
  return getProfileExtractionJob(prisma, actor.userId, assessmentId);
}

function serialize(row: { assessmentId: string; status: string; attempts: number; errorCode: string | null; noObservations: boolean; updatedAt: Date }) {
  return { assessmentId: row.assessmentId, status: row.status, attempts: row.attempts, errorCode: row.errorCode, noObservations: row.noObservations, updatedAt: row.updatedAt.toISOString() };
}
