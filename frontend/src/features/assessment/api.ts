import { apiBlob, apiGet, apiSend } from '@/lib/api/http';
import { reportExportPath } from './report-query';
import type {
  ClassReport,
  CompetencyReport,
  ReportMeta,
  StatsMode,
  RoundsView,
  StudentAssessmentResponse,
  TeacherAssessmentDetail,
} from './types';

export interface ClassReportQuery {
  search?: string;
  status?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
  mode?: StatsMode | string;
  from?: string;
  to?: string;
  studentId?: string;
}

export interface CompetencyReportQuery {
  classroomId?: string;
  assignmentIds?: string[];
  studentId?: string;
  from?: string;
  to?: string;
  mode?: StatsMode | string;
  search?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}

function withQuery(path: string, params: Record<string, string | number | undefined | null>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.set(key, String(value));
  });
  const q = search.toString();
  return q ? `${path}?${q}` : path;
}

export const assessmentApi = {
  student: (assignmentId: string) =>
    apiGet<StudentAssessmentResponse>(`/api/assignments/${encodeURIComponent(assignmentId)}/assessment`),
  studentRounds: (assignmentId: string) =>
    apiGet<RoundsView>(`/api/assignments/${encodeURIComponent(assignmentId)}/assessment/rounds`),
  listAssignments: (classroomId?: string) =>
    apiGet<ReportMeta>(withQuery('/api/teacher/reports', { classroomId })),
  classReport: (assignmentId: string, params?: ClassReportQuery) => {
    const search = new URLSearchParams();
    if (params?.search) search.set('search', params.search);
    if (params?.status) search.set('status', params.status);
    if (params?.sort) search.set('sort', params.sort);
    if (params?.page) search.set('page', String(params.page));
    if (params?.pageSize) search.set('pageSize', String(params.pageSize));
    if (params?.mode) search.set('mode', params.mode);
    if (params?.from) search.set('from', params.from);
    if (params?.to) search.set('to', params.to);
    if (params?.studentId) search.set('studentId', params.studentId);
    const q = search.toString();
    return apiGet<ClassReport>(
      `/api/teacher/reports/${encodeURIComponent(assignmentId)}${q ? `?${q}` : ''}`
    );
  },
  exportReport: (assignmentId: string, params?: ClassReportQuery) => apiBlob(reportExportPath(assignmentId, params)),
  enqueueInsight: (assignmentId: string, body?: { mode?: StatsMode | string }) =>
    apiSend<ClassReport>(
      `/api/teacher/reports/${encodeURIComponent(assignmentId)}/insights`,
      'POST',
      body || {}
    ),
  competencyReport: (params?: CompetencyReportQuery) => {
    const search = new URLSearchParams();
    if (params?.classroomId) search.set('classroomId', params.classroomId);
    (params?.assignmentIds || []).forEach((id) => search.append('assignmentId', id));
    if (params?.studentId) search.set('studentId', params.studentId);
    if (params?.from) search.set('from', params.from);
    if (params?.to) search.set('to', params.to);
    if (params?.mode) search.set('mode', params.mode);
    if (params?.search) search.set('search', params.search);
    if (params?.sort) search.set('sort', params.sort);
    if (params?.page) search.set('page', String(params.page));
    if (params?.pageSize) search.set('pageSize', String(params.pageSize));
    const q = search.toString();
    return apiGet<CompetencyReport>(`/api/teacher/competency-reports${q ? `?${q}` : ''}`);
  },
  enqueueCompetencyInsight: (body: {
    classroomId?: string;
    assignmentIds?: string[];
    studentId?: string;
    from?: string;
    to?: string;
    mode?: StatsMode | string;
  }) => apiSend<CompetencyReport>('/api/teacher/competency-reports/insights', 'POST', body),
  teacherDetail: (assignmentId: string, studentId: string) =>
    apiGet<TeacherAssessmentDetail>(
      `/api/teacher/assignments/${encodeURIComponent(assignmentId)}/students/${encodeURIComponent(studentId)}/assessment`
    ),
  teacherRounds: (assignmentId: string, studentId: string) =>
    apiGet<RoundsView>(
      `/api/teacher/assignments/${encodeURIComponent(assignmentId)}/students/${encodeURIComponent(studentId)}/rounds`
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
  setDueExtension: (assignmentId: string, studentId: string, dueAt: string | null) =>
    apiSend<TeacherAssessmentDetail>(
      `/api/teacher/assignments/${encodeURIComponent(assignmentId)}/students/${encodeURIComponent(studentId)}/due-extension`,
      'PUT', { dueAt }
    ),
  grantReopen: (assignmentId: string, studentId: string) =>
    apiSend<TeacherAssessmentDetail>(
      `/api/teacher/assignments/${encodeURIComponent(assignmentId)}/students/${encodeURIComponent(studentId)}/assessment/grant-reopen`,
      'POST',
      {}
    ),
};
