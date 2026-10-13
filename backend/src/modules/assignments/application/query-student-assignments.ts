import { decimalString } from "../../../core/decimal.js";
import type { EduLitPrisma } from "../../../infrastructure/database/prisma.client.js";
import { ApiHttpException, ERROR_MESSAGES } from "../../../http/api-error.js";

const LIST_SELECT = {
  id: true,
  code: true,
  title: true,
  instructions: true,
  genre: true,
  gradeLevel: true,
  maxScore: true,
  scoreStep: true,
  status: true,
  publishedAt: true,
  dueAt: true,
  rubric: true,
} as const;

const DETAIL_SELECT = {
  ...LIST_SELECT,
  learningMaterialText: true,
  rubric: true,
} as const;

export type StudentAssignmentListItem = {
  id: string;
  code: string;
  title: string;
  instructions: string;
  genre: string;
  gradeLevel: number;
  maxScore: string;
  scoreStep: string;
  status: "PUBLISHED";
  publishedAt: string | null;
  dueAt: string | null;
  rubric: unknown;
  submission: { id: string; submittedAt: string } | null;
  socraticSession: { sessionId: string; status: "ACTIVE" | "COMPLETED" } | null;
};

export type StudentAssignmentDetail = StudentAssignmentListItem & {
  learningMaterialText: string;
  rubric: unknown;
};

export async function listPublishedAssignmentsForStudent(
  prisma: EduLitPrisma,
  studentId: string,
): Promise<StudentAssignmentListItem[]> {
  const assignments = await prisma.assignment.findMany({
    where: { status: "PUBLISHED" },
    select: LIST_SELECT,
    orderBy: [{ publishedAt: "desc" }, { code: "asc" }],
  });
  const ids = assignments.map((item) => item.id);
  const [submissions, sessions] = await Promise.all([
    prisma.submission.findMany({
      where: { studentId, assignmentId: { in: ids } },
      select: { id: true, assignmentId: true, submittedAt: true },
    }),
    prisma.socraticSession.findMany({
      where: { studentId, assignmentId: { in: ids } },
      select: { id: true, assignmentId: true, status: true },
    }),
  ]);
  const submissionByAssignment = new Map(submissions.map((row) => [row.assignmentId, row]));
  const sessionByAssignment = new Map(sessions.map((row) => [row.assignmentId, row]));
  return assignments.map((item) => {
    const submission = submissionByAssignment.get(item.id);
    const session = sessionByAssignment.get(item.id);
    return {
      id: item.id,
      code: item.code,
      title: item.title,
      instructions: item.instructions,
      genre: item.genre,
      gradeLevel: item.gradeLevel,
      maxScore: decimalString(item.maxScore),
      scoreStep: decimalString(item.scoreStep),
      status: "PUBLISHED",
      publishedAt: item.publishedAt?.toISOString() ?? null,
      dueAt: item.dueAt?.toISOString() ?? null,
      rubric: item.rubric,
      submission: submission
        ? { id: submission.id, submittedAt: submission.submittedAt.toISOString() }
        : null,
      socraticSession: session ? { sessionId: session.id, status: session.status } : null,
    };
  });
}

export async function getPublishedAssignmentForStudent(
  prisma: EduLitPrisma,
  studentId: string,
  assignmentId: string,
): Promise<StudentAssignmentDetail> {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: DETAIL_SELECT,
  });
  if (!assignment || assignment.status !== "PUBLISHED") {
    throw new ApiHttpException(404, "NOT_FOUND", ERROR_MESSAGES.NOT_FOUND);
  }
  const [submission, session] = await Promise.all([
    prisma.submission.findUnique({
      where: { studentId_assignmentId: { studentId, assignmentId } },
      select: { id: true, submittedAt: true },
    }),
    prisma.socraticSession.findUnique({
      where: { studentId_assignmentId: { studentId, assignmentId } },
      select: { id: true, status: true },
    }),
  ]);
  return {
    id: assignment.id,
    code: assignment.code,
    title: assignment.title,
    instructions: assignment.instructions,
    genre: assignment.genre,
    gradeLevel: assignment.gradeLevel,
    maxScore: decimalString(assignment.maxScore),
    scoreStep: decimalString(assignment.scoreStep),
    status: "PUBLISHED",
    publishedAt: assignment.publishedAt?.toISOString() ?? null,
    dueAt: assignment.dueAt?.toISOString() ?? null,
    learningMaterialText: assignment.learningMaterialText,
    rubric: assignment.rubric,
    submission: submission
      ? { id: submission.id, submittedAt: submission.submittedAt.toISOString() }
      : null,
    socraticSession: session ? { sessionId: session.id, status: session.status } : null,
  };
}

export async function loadAssignmentStatus(
  prisma: EduLitPrisma,
  assignmentId: string,
): Promise<{ id: string; status: "DRAFT" | "PUBLISHED" | "CLOSED" } | null> {
  return prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: { id: true, status: true },
  });
}
