import { apiGet, apiSend } from '@/lib/api/http';
import type { ClassReport, ClassReportAssignment, StudentAssessmentResponse, TeacherAssessmentDetail } from './types';

export const assessmentApi = {
  student: (assignmentId: string) =>
    apiGet<StudentAssessmentResponse>(`/api/assignments/${encodeURIComponent(assignmentId)}/assessment`),
  listAssignments: () => apiGet<{ items: ClassReportAssignment[] }>('/api/teacher/reports'),
  classReport: (
    assignmentId: string,
    params?: {
      search?: string;
      status?: string;
      sort?: string;
      page?: number;
      pageSize?: number;
    }
  ) => {
    const search = new URLSearchParams();
    if (params?.search) search.set('search', params.search);
    if (params?.status) search.set('status', params.status);
    if (params?.sort) search.set('sort', params.sort);
    if (params?.page) search.set('page', String(params.page));
    if (params?.pageSize) search.set('pageSize', String(params.pageSize));
    const q = search.toString();
    return apiGet<ClassReport>(
      `/api/teacher/reports/${encodeURIComponent(assignmentId)}${q ? `?${q}` : ''}`
    );
  },
  enqueueInsight: (assignmentId: string) =>
    apiSend<ClassReport>(`/api/teacher/reports/${encodeURIComponent(assignmentId)}/insights`, 'POST', {}),
  teacherDetail: (assignmentId: string, studentId: string) =>
    apiGet<TeacherAssessmentDetail>(
      `/api/teacher/assignments/${encodeURIComponent(assignmentId)}/students/${encodeURIComponent(studentId)}/assessment`
    ),
  saveReview: (assignmentId: string, studentId: string, body: unknown) =>
    apiSend<TeacherAssessmentDetail>(
      `/api/teacher/assignments/${encodeURIComponent(assignmentId)}/students/${encodeURIComponent(studentId)}/assessment`,
      'PATCH',
      body
    ),
  publish: (
    assignmentId: string,
    studentId: string,
    body: { resultId: string; transcriptionRevisionId: string; expectedVersion: number }
  ) =>
    apiSend<TeacherAssessmentDetail>(
      `/api/teacher/assignments/${encodeURIComponent(assignmentId)}/students/${encodeURIComponent(studentId)}/assessment/publish`,
      'POST',
      body
    ),
  unpublish: (
    assignmentId: string,
    studentId: string,
    body: { resultId: string; transcriptionRevisionId: string; expectedVersion: number }
  ) =>
    apiSend<TeacherAssessmentDetail>(
      `/api/teacher/assignments/${encodeURIComponent(assignmentId)}/students/${encodeURIComponent(studentId)}/assessment/unpublish`,
      'POST',
      body
    ),
  retry: (assignmentId: string, studentId: string) =>
    apiSend<TeacherAssessmentDetail>(
      `/api/teacher/assignments/${encodeURIComponent(assignmentId)}/students/${encodeURIComponent(studentId)}/assessment/retry`,
      'POST',
      {}
    ),
  grantReopen: (assignmentId: string, studentId: string) =>
    apiSend<TeacherAssessmentDetail>(
      `/api/teacher/assignments/${encodeURIComponent(assignmentId)}/students/${encodeURIComponent(studentId)}/assessment/grant-reopen`,
      'POST',
      {}
    ),
};
