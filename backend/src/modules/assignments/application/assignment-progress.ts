import type { EduLitPrisma } from "../../../infrastructure/database/prisma.client.js";
import { ApiHttpException, ERROR_MESSAGES } from "../../../http/api-error.js";
import { isBlankOutline, type StudentOutline } from "../../socratic/domain/outline.js";

export type WorkflowStepState = "not_started" | "in_progress" | "waiting_teacher" | "complete";

export type AssignmentProgressView = {
  assignmentId: string;
  assignmentStatus: "PUBLISHED" | "CLOSED";
  readAt: string | null;
  socratic: { sessionId: string; status: "ACTIVE" | "COMPLETED"; outlineRevision: number; outlineSaved: boolean } | null;
  draft: { id: string; status: string; revision: number } | null;
  submission: { id: string; source: string } | null;
  assessment: { status: "PENDING" } | { status: "PUBLISHED"; id: string } | null;
  profile: { status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"; noObservations?: boolean } | null;
  steps: Record<"reading" | "socratic" | "submit" | "ocr" | "result", WorkflowStepState>;
};

export async function getStudentAssignmentProgress(
  prisma: EduLitPrisma,
  studentId: string,
  assignmentId: string,
): Promise<AssignmentProgressView> {
  const assignment = await prisma.assignment.findUnique({ where: { id: assignmentId }, select: { id: true, status: true } });
  if (!assignment || (assignment.status !== "PUBLISHED" && assignment.status !== "CLOSED")) {
    throw new ApiHttpException(404, "NOT_FOUND", ERROR_MESSAGES.NOT_FOUND);
  }
  const [progress, session, draft, submission] = await Promise.all([
    prisma.assignmentProgress.findUnique({ where: { studentId_assignmentId: { studentId, assignmentId } } }),
    prisma.socraticSession.findUnique({ where: { studentId_assignmentId: { studentId, assignmentId } } }),
    prisma.submissionDraft.findUnique({ where: { studentId_assignmentId: { studentId, assignmentId } } }),
    prisma.submission.findUnique({ where: { studentId_assignmentId: { studentId, assignmentId } }, include: { assessment: { include: { profileExtractionJob: true } } } }),
  ]);
  if (assignment.status === "CLOSED" && !progress && !session && !draft && !submission) {
    throw new ApiHttpException(404, "NOT_FOUND", ERROR_MESSAGES.NOT_FOUND);
  }

  const outlineSaved = session ? !isBlankOutline(session.outline as StudentOutline) || session.outlineRevision > 1 : false;
  const assessmentView = submission
    ? submission.assessment?.status === "PUBLISHED"
      ? { status: "PUBLISHED" as const, id: submission.assessment.id }
      : { status: "PENDING" as const }
    : null;
  const profile = submission?.assessment?.status === "PUBLISHED"
    ? {
        status: submission.assessment.profileExtractionJob?.status ?? "PENDING",
        noObservations: submission.assessment.profileExtractionJob?.noObservations,
      }
    : null;

  const draftStatus = draft?.status;
  const submitState: WorkflowStepState = !draft
    ? "not_started"
    : draftStatus === "DRAFT" || draftStatus === "PRIVACY_RETURNED"
      ? "in_progress"
      : draftStatus === "AWAITING_PRIVACY_REVIEW"
        ? "waiting_teacher"
        : "complete";
  const ocrState: WorkflowStepState =
    !draft || draftStatus === "DRAFT" || draftStatus === "PRIVACY_RETURNED" || draftStatus === "AWAITING_PRIVACY_REVIEW"
      ? "not_started"
      : draftStatus === "OCR_PROCESSING"
        ? "in_progress"
        : draftStatus === "CONFIRMED"
          ? "complete"
          : "waiting_teacher";
  const resultState: WorkflowStepState = !submission
    ? "not_started"
    : assessmentView?.status === "PUBLISHED"
      ? "complete"
      : "waiting_teacher";

  return {
    assignmentId,
    assignmentStatus: assignment.status,
    readAt: progress?.readAt?.toISOString() ?? null,
    socratic: session
      ? { sessionId: session.id, status: session.status, outlineRevision: session.outlineRevision, outlineSaved }
      : null,
    draft: draft ? { id: draft.id, status: draft.status, revision: draft.revision } : null,
    submission: submission ? { id: submission.id, source: submission.source } : null,
    assessment: assessmentView,
    profile,
    steps: {
      reading: progress?.readAt ? "complete" : "not_started",
      socratic: !session ? "not_started" : outlineSaved ? "complete" : "in_progress",
      submit: submitState,
      ocr: ocrState,
      result: resultState,
    },
  };
}
