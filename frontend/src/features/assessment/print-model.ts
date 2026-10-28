import type { AssessmentPayload, StudentAssessmentResponse, TeacherAssessmentDetail } from './types';

export interface FeedbackSheetData {
  assignmentTitle: string;
  classroomName: string;
  studentName: string;
  studentCode: string;
  publishedAt: string | null;
  result: AssessmentPayload;
  revisionRound?: number | null;
  firstPublishedScore?: number | null;
}

export function applyPrintRound(sheet: FeedbackSheetData | null, round: number | null | undefined, firstScore: number | null | undefined): FeedbackSheetData | null {
  if (!sheet) return null;
  return { ...sheet, revisionRound: round && round > 0 ? round : 1, firstPublishedScore: firstScore ?? null };
}

/** Only the publication snapshot may enter the printable model. */
export function teacherFeedbackSheet(detail: TeacherAssessmentDetail): FeedbackSheetData | null {
  const assessment = detail.assessment;
  if (!assessment.isPublished || !assessment.publishedResult?.isPublished || !assessment.published) return null;
  return {
    assignmentTitle: detail.assignment.title,
    classroomName: detail.assignment.classroomName || '—',
    studentName: detail.student.displayName,
    studentCode: detail.student.loginId,
    publishedAt: assessment.publishedResult.publishedAt,
    result: assessment.published,
  };
}

export function studentFeedbackSheet(data: StudentAssessmentResponse, classroomName?: string | null): FeedbackSheetData | null {
  const { result, canViewResult } = data.assessment;
  if (!canViewResult || !result) return null;
  return {
    assignmentTitle: data.assignment.title,
    classroomName: classroomName || data.assignment.classroomName || '—',
    studentName: data.student.displayName,
    studentCode: data.student.loginId,
    publishedAt: result.publishedAt,
    result,
  };
}

export async function mapConcurrent<T, R>(items: T[], run: (item: T) => Promise<R>, concurrency = 4): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await run(items[index]);
    }
  }));
  return results;
}
