import { Prisma } from "../../../generated/prisma/client.js";
import { DomainError, VersionConflictError } from "../../../core/errors.js";
import { assertEvidenceQuote } from "../../../core/utf16.js";
import type { EduLitPrisma } from "../../../infrastructure/database/prisma.client.js";
import {
  buildProfileSummary,
  emptyDeclaredGoals,
  emptySummary,
  type ObservationInput,
} from "../domain/profile.js";

export type SaveObservationsInput = {
  studentId: string;
  assessmentId: string;
  observations: ObservationInput[];
  expectedProfileVersion?: number;
};

export async function saveObservationsAndRefreshProfile(
  prisma: EduLitPrisma,
  input: SaveObservationsInput,
) {
  if (input.observations.length === 0) {
    throw new DomainError("OBSERVATION_EMPTY", "at least one observation is required");
  }

  return prisma.$transaction(async (tx) => {
    const assessmentRows = await tx.$queryRaw<
      Array<{
        id: string;
        student_id: string;
        status: string;
        submission_id: string;
      }>
    >(
      Prisma.sql`SELECT id, student_id, status::text, submission_id
                 FROM assessments
                 WHERE id = ${input.assessmentId}::uuid
                 FOR UPDATE`,
    );
    const assessment = assessmentRows[0];
    if (!assessment) {
      throw new DomainError("OBSERVATION_ASSESSMENT", "assessment not found");
    }
    if (assessment.student_id !== input.studentId) {
      throw new DomainError(
        "OBSERVATION_STUDENT",
        "studentId must be the author of the assessed submission",
      );
    }
    if (assessment.status !== "PUBLISHED") {
      throw new DomainError(
        "OBSERVATION_STATUS",
        "observations require a PUBLISHED assessment",
      );
    }

    const submission = await tx.submission.findUnique({
      where: { id: assessment.submission_id },
    });
    if (!submission) {
      throw new DomainError("OBSERVATION_SUBMISSION", "submission not found");
    }
    if (submission.studentId !== input.studentId) {
      throw new DomainError(
        "OBSERVATION_STUDENT",
        "studentId must be the author of the assessed submission",
      );
    }

    const snapshot = submission.assignmentSnapshot as { genre?: string };
    const now = new Date();

    for (const observation of input.observations) {
      if (!observation.featureKey.trim() || !observation.description.trim()) {
        throw new DomainError("OBSERVATION_SHAPE", "featureKey and description are required");
      }
      assertEvidenceQuote(
        submission.text,
        observation.evidenceStart,
        observation.evidenceEnd,
        observation.evidenceQuote,
      );
      await tx.writingObservation.upsert({
        where: {
          studentId_assessmentId_featureKey: {
            studentId: input.studentId,
            assessmentId: input.assessmentId,
            featureKey: observation.featureKey,
          },
        },
        update: {
          kind: observation.kind,
          description: observation.description,
          genre: observation.genre || snapshot.genre || "",
          evidenceQuote: observation.evidenceQuote,
          evidenceStart: observation.evidenceStart,
          evidenceEnd: observation.evidenceEnd,
          status: observation.status ?? "PROVISIONAL",
          observedAt: now,
        },
        create: {
          studentId: input.studentId,
          assessmentId: input.assessmentId,
          kind: observation.kind,
          featureKey: observation.featureKey,
          description: observation.description,
          genre: observation.genre || snapshot.genre || "",
          evidenceQuote: observation.evidenceQuote,
          evidenceStart: observation.evidenceStart,
          evidenceEnd: observation.evidenceEnd,
          status: observation.status ?? "PROVISIONAL",
          observedAt: now,
        },
      });
    }

    return refreshProfileInTransaction(tx, input.studentId, input.expectedProfileVersion);
  });
}

export async function refreshWritingProfile(
  prisma: EduLitPrisma,
  studentId: string,
  expectedProfileVersion?: number,
) {
  return prisma.$transaction((tx) =>
    refreshProfileInTransaction(tx, studentId, expectedProfileVersion),
  );
}

async function refreshProfileInTransaction(
  tx: Prisma.TransactionClient,
  studentId: string,
  expectedProfileVersion?: number,
) {
  const locked = await tx.$queryRaw<Array<{ id: string; version: number }>>(
    Prisma.sql`SELECT id, version FROM writing_profiles WHERE student_id = ${studentId}::uuid FOR UPDATE`,
  );
  const current = locked[0];
  if (expectedProfileVersion !== undefined && current && current.version !== expectedProfileVersion) {
    throw new VersionConflictError();
  }

  const rows = await tx.writingObservation.findMany({
    where: {
      studentId,
      status: { not: "INVALIDATED" },
      assessment: { status: "PUBLISHED" },
    },
    include: { assessment: { include: { submission: true } } },
    orderBy: { observedAt: "desc" },
  });

  const built = buildProfileSummary(
    rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      featureKey: row.featureKey,
      description: row.description,
      status: row.status,
      assessmentId: row.assessmentId,
      assignmentId: row.assessment.submission.assignmentId,
      observedAt: row.observedAt,
    })),
  );

  if (!current) {
    return tx.writingProfile.create({
      data: {
        studentId,
        declaredGoals: emptyDeclaredGoals() as Prisma.InputJsonValue,
        summary: (built.summary ?? emptySummary()) as Prisma.InputJsonValue,
        observationIds: built.observationIds as Prisma.InputJsonValue,
        version: 1,
      },
    });
  }

  const updated = await tx.writingProfile.updateMany({
    where: { studentId, version: current.version },
    data: {
      summary: built.summary as Prisma.InputJsonValue,
      observationIds: built.observationIds as Prisma.InputJsonValue,
      version: current.version + 1,
    },
  });
  if (updated.count !== 1) {
    throw new VersionConflictError();
  }
  const profile = await tx.writingProfile.findUniqueOrThrow({ where: { studentId } });
  return profile;
}
