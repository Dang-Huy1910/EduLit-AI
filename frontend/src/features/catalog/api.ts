import { apiGet, apiSend } from '@/lib/api/http';
import type {
  CatalogMaterial,
  CatalogPrompt,
  CatalogRubric,
  CatalogTopic,
  ClassroomDetail,
  ClassroomSummary,
  StudentAssignment,
  TeacherAssignment,
} from './types';

export const catalogApi = {
  listTopics: () => apiGet<{ items: CatalogTopic[] }>('/api/teacher/topics'),
  createTopic: (body: unknown) => apiSend<CatalogTopic>('/api/teacher/topics', 'POST', body),
  listClassrooms: () => apiGet<{ items: ClassroomSummary[] }>('/api/teacher/classrooms'),
  getClassroom: (id: string) => apiGet<ClassroomDetail>(`/api/teacher/classrooms/${id}`),
  listMaterials: (params?: Record<string, string | undefined>) =>
    apiGet<{ items: CatalogMaterial[] }>(`/api/teacher/materials${query(params)}`),
  getMaterial: (id: string) => apiGet<CatalogMaterial>(`/api/teacher/materials/${id}`),
  createMaterial: (body: unknown) => apiSend<CatalogMaterial>('/api/teacher/materials', 'POST', body),
  updateMaterial: (id: string, body: unknown) =>
    apiSend<CatalogMaterial>(`/api/teacher/materials/${id}`, 'PATCH', body),
  listPrompts: (params?: Record<string, string | boolean | undefined>) =>
    apiGet<{ items: CatalogPrompt[] }>(`/api/teacher/prompts${query(params)}`),
  getPrompt: (id: string) => apiGet<CatalogPrompt>(`/api/teacher/prompts/${id}`),
  createPrompt: (body: unknown) => apiSend<CatalogPrompt>('/api/teacher/prompts', 'POST', body),
  updatePrompt: (id: string, body: unknown) =>
    apiSend<CatalogPrompt>(`/api/teacher/prompts/${id}`, 'PATCH', body),
  listRubrics: () => apiGet<{ items: CatalogRubric[] }>('/api/teacher/rubrics'),
  getRubric: (id: string) => apiGet<CatalogRubric>(`/api/teacher/rubrics/${id}`),
  createRubric: (body: unknown) => apiSend<CatalogRubric>('/api/teacher/rubrics', 'POST', body),
  updateRubric: (id: string, body: unknown) =>
    apiSend<CatalogRubric>(`/api/teacher/rubrics/${id}`, 'PATCH', body),
  listTeacherAssignments: () => apiGet<{ items: TeacherAssignment[] }>('/api/teacher/assignments'),
  getTeacherAssignment: (id: string) => apiGet<TeacherAssignment>(`/api/teacher/assignments/${id}`),
  createAssignment: (body: unknown) =>
    apiSend<TeacherAssignment>('/api/teacher/assignments', 'POST', body),
  updateAssignment: (id: string, body: unknown) =>
    apiSend<TeacherAssignment>(`/api/teacher/assignments/${id}`, 'PATCH', body),
  publishAssignment: (id: string) =>
    apiSend<TeacherAssignment>(`/api/teacher/assignments/${id}/publish`, 'POST', {}),
  saveAsRubric: (id: string, body: unknown) =>
    apiSend<CatalogRubric>(`/api/teacher/assignments/${id}/save-as-rubric`, 'POST', body),
  listStudentAssignments: () => apiGet<{ items: StudentAssignment[] }>('/api/assignments'),
  getAssignment: (id: string) => apiGet<StudentAssignment>(`/api/assignments/${id}`),
};

function query(params?: Record<string, string | boolean | undefined>): string {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '' || value === false) continue;
    search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
}
