import { Prisma } from "../../../generated/prisma/client.js";
import { DomainError } from "../../../core/errors.js";
import type { EduLitPrisma } from "../../../infrastructure/database/prisma.client.js";
import type { AssessmentActor } from "../domain/actor.js";
import { SUBMISSION_MAX_CHARS } from "../domain/limits.js";
import { assertActiveActor } from "./assert-actor.js";
import { submitAssignment } from "./submit-assignment.js";
import { toSubmissionDto, type SubmissionView } from "./serialize-assessment.js";

export type SubmitStudentTextInput = {
  assignmentId: string;
  socraticSessionId?: string | null;
  text: string;
};

export async function submitStudentText(
  prisma: EduLitPrisma,
  actor: AssessmentActor,
  input: SubmitStudentTextInput,
): Promise<{ submission: SubmissionView; replayed: boolean }> {
  const student = await assertActiveActor(prisma, actor, "STUDENT");
  if (typeof input.text !== "string") {
    throw new DomainError("SUBMISSION_TEXT", "submission text is required");
  }
  if (!input.text.trim()) {
    throw new DomainError("SUBMISSION_TEXT", "submission text must not be empty");
  }
  if (input.text.length > SUBMISSION_MAX_CHARS) {
    throw new DomainError(
      "SUBMISSION_TOO_LARGE",
      `submission text exceeds ${SUBMISSION_MAX_CHARS} UTF-16 code units`,
    );
  }

  try {
    const created = await submitAssignment(prisma, {
      studentId: student.id,
      assignmentId: input.assignmentId,
      text: input.text,
      socraticSessionId: input.socraticSessionId ?? null,
    });
    return { submission: toSubmissionDto(created, "teacher"), replayed: false };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
      throw error;
    }
    const existing = await prisma.submission.findUnique({
      where: {
        studentId_assignmentId: {
          studentId: student.id,
          assignmentId: input.assignmentId,
        },
      },
    });
    if (!existing) {
      throw new DomainError("SUBMISSION_CONFLICT", "a submission already exists for this assignment");
    }
    const sameSession = (existing.socraticSessionId ?? null) === (input.socraticSessionId ?? null);
    if (existing.text === input.text && sameSession) {
      return { submission: toSubmissionDto(existing, "teacher"), replayed: true };
    }
    throw new DomainError(
      "SUBMISSION_CONFLICT",
      "a different submission already exists for this student and assignment",
    );
  }
}
