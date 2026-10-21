import { apiGet, apiSend } from '@/lib/api/http';
import type { ClassroomDetail, ClassroomSummary, Term } from '@/features/catalog/types';

type ClassroomInput = {
  termId: string;
  code: string;
  gradeLevel: number;
  name?: string;
  subject?: string;
};

type ClassroomUpdate = {
  name?: string;
  code?: string;
  gradeLevel?: number;
  joinEnabled?: boolean;
  archived?: boolean;
};

function query(params?: Record<string, string | boolean | undefined>): string {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
}

export const classroomsApi = {
  listTerms: () => apiGet<{ items: Term[] }>('/api/terms'),
  listTeacherClassrooms: (params?: { termId?: string; includeArchived?: boolean }) =>
    apiGet<{ items: ClassroomSummary[] }>(`/api/teacher/classrooms${query(params)}`),
  getClassroom: (id: string) => apiGet<ClassroomDetail>(`/api/teacher/classrooms/${encodeURIComponent(id)}`),
  createClassroom: (body: ClassroomInput) => apiSend<ClassroomSummary>('/api/teacher/classrooms', 'POST', body),
  updateClassroom: (id: string, body: ClassroomUpdate) =>
    apiSend<ClassroomSummary>(`/api/teacher/classrooms/${encodeURIComponent(id)}`, 'PATCH', body),
  rotateJoinCode: (id: string) =>
    apiSend<ClassroomSummary>(`/api/teacher/classrooms/${encodeURIComponent(id)}/join-code/rotate`, 'POST', {}),
  removeMember: (id: string, userId: string) =>
    apiSend<void>(
      `/api/teacher/classrooms/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`,
      'DELETE'
    ),
};
