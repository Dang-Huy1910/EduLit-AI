import type { ObservationStatus } from "../../../generated/prisma/client.js";
import { DomainError } from "../../../core/errors.js";
import type { EduLitPrisma } from "../../../infrastructure/database/prisma.client.js";
import type { AssessmentActor } from "../../assessment/domain/actor.js";
import { assertActiveActor } from "../../assessment/application/assert-actor.js";
import { lockStudentThenAssignment, lockTeacherRow } from "../../assessment/application/lock-assessment.js";
import { setObservationStatusInTransaction } from "./save-observations.js";

const ALLOWED: Record<string, ObservationStatus[]> = {
  PROVISIONAL: ["SUPPORTED", "INVALIDATED", "RESOLVED"],
  SUPPORTED: ["INVALIDATED", "RESOLVED"],
};

export async function reviewObservationStatus(
  prisma: EduLitPrisma,
  actor: AssessmentActor,
  input: { observationId: string; status: ObservationStatus; expectedProfileVersion: number },
) {
  const teacher = await assertActiveActor(prisma, actor, "TEACHER");
  if (!Number.isInteger(input.expectedProfileVersion) || input.expectedProfileVersion < 0) {
    throw new DomainError("VERSION_CONFLICT", "expectedProfileVersion must be an integer >= 0");
  }

  const observation = await prisma.writingObservation.findUnique({ where: { id: input.observationId } });
  if (!observation) {
    throw new DomainError("OBSERVATION_MISSING", "observation not found");
  }
  const assessment = await prisma.assessment.findUnique({ where: { id: observation.assessmentId } });
  if (!assessment) {
    throw new DomainError("OBSERVATION_MISSING", "observation not found");
  }
  const submission = await prisma.submission.findUnique({ where: { id: assessment.submissionId } });
  if (!submission) {
    throw new DomainError("OBSERVATION_MISSING", "observation not found");
  }
  const assignment = await prisma.assignment.findUnique({ where: { id: submission.assignmentId } });
  if (!assignment || assignment.teacherId !== teacher.id) {
    throw new DomainError("ASSESSMENT_OWNERSHIP", "assignment is not owned by this teacher");
  }

  return prisma.$transaction(async (tx) => {
    await lockStudentThenAssignment(tx, observation.studentId, submission.assignmentId);
    const teacherRow = await lockTeacherRow(tx, teacher.id);
    if (teacherRow.role !== "TEACHER") {
      throw new DomainError("ACTOR_FORBIDDEN", "only TEACHER actors may review observations");
    }
    if (teacherRow.status !== "ACTIVE") {
      throw new DomainError("ACTOR_INACTIVE", "account is INACTIVE");
    }
    const liveAssignment = await tx.assignment.findUniqueOrThrow({ where: { id: submission.assignmentId } });
    if (liveAssignment.teacherId !== teacher.id) {
      throw new DomainError("ASSESSMENT_OWNERSHIP", "assignment is not owned by this teacher");
    }
    const live = await tx.writingObservation.findUniqueOrThrow({ where: { id: observation.id } });
    const allowed = ALLOWED[live.status] ?? [];
    if (!allowed.includes(input.status)) {
      throw new DomainError(
        "OBSERVATION_STATUS",
        `cannot transition observation from ${live.status} to ${input.status}`,
      );
    }
    return setObservationStatusInTransaction(tx, {
      studentId: live.studentId,
      observationId: live.id,
      status: input.status,
      expectedProfileVersion: input.expectedProfileVersion,
    });
  });
}
