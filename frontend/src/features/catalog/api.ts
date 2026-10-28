import { apiBlob, apiGet, apiSend, apiUpload } from '@/lib/api/http';
import { classroomsApi } from '@/features/classrooms/api';
import type {
  CatalogMaterial,
  CatalogPrompt,
  CatalogRubric,
  CatalogTopic,
  StudentAssignment,
  StudentMaterial,
  TeacherAssignment,
  TeacherDocument,
} from './types';

export const catalogApi = {
  listTopics: () => apiGet<{ items: CatalogTopic[] }>('/api/teacher/topics'),
  createTopic: (body: unknown) => apiSend<CatalogTopic>('/api/teacher/topics', 'POST', body),
  listClassrooms: () => classroomsApi.listTeacherClassrooms(),
  getClassroom: (id: string) => classroomsApi.getClassroom(id),
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
  deletePrompt: (id: string) => apiSend<void>(`/api/teacher/prompts/${encodeURIComponent(id)}`, 'DELETE'),
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
  /** Safe edits of a published assignment: title, extra instructions, due date, adding students. */
  updatePublishedAssignment: (id: string, body: unknown) =>
    apiSend<TeacherAssignment>(`/api/teacher/assignments/${encodeURIComponent(id)}/settings`, 'PATCH', body),
  deleteAssignment: (id: string) => apiSend<void>(`/api/teacher/assignments/${encodeURIComponent(id)}`, 'DELETE'),
  publishAssignment: (id: string) =>
    apiSend<TeacherAssignment>(`/api/teacher/assignments/${id}/publish`, 'POST', {}),
  retryFailedOutlinePreps: (id: string) =>
    apiSend<TeacherAssignment & { retried: number }>(
      `/api/teacher/assignments/${id}/outline-prep/retry`,
      'POST',
      {}
    ),
  saveAsRubric: (id: string, body: unknown) =>
    apiSend<CatalogRubric>(`/api/teacher/assignments/${id}/save-as-rubric`, 'POST', body),
  listStudentAssignments: () => apiGet<{ items: StudentAssignment[] }>('/api/assignments'),
  getAssignment: (id: string) => apiGet<StudentAssignment>(`/api/assignments/${id}`),
  listDocuments: () => apiGet<{ items: TeacherDocument[] }>('/api/teacher/documents'),
  getDocument: (id: string) => apiGet<TeacherDocument>(`/api/teacher/documents/${id}`),
  uploadDocument: (form: FormData) => apiUpload<TeacherDocument>('/api/teacher/documents', form),
  ocrDocument: (id: string) =>
    apiSend<TeacherDocument>(`/api/teacher/documents/${encodeURIComponent(id)}/ocr`, 'POST', {}),
  analyzeDocument: (id: string, body?: unknown) =>
    apiSend<TeacherDocument>(`/api/teacher/documents/${id}/analyze`, 'POST', body ?? {}),
  saveDocumentDraft: (id: string, body: unknown) =>
    apiSend<TeacherDocument>(`/api/teacher/documents/${id}/draft`, 'POST', body),
  confirmDocument: (id: string, body?: unknown) =>
    apiSend<TeacherDocument>(`/api/teacher/documents/${id}/confirm`, 'POST', body ?? {}),
  downloadDocumentOriginal: (id: string) => apiBlob(`/api/teacher/documents/${id}/original`),
};

/** Student materials are read-only: list and read, nothing else. */
export const studentMaterialsApi = {
  list: () => apiGet<{ items: StudentMaterial[] }>('/api/student/materials'),
  get: (id: string) => apiGet<StudentMaterial>(`/api/student/materials/${encodeURIComponent(id)}`),
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
