import { apiRequest } from './http';
import type { ApiTeacherAssignment, AssignmentDraftInput } from './types';

export const listTeacherAssignments = () => apiRequest<ApiTeacherAssignment[]>('/teacher/assignments');
export const getTeacherAssignment = (id: string) => apiRequest<ApiTeacherAssignment>(`/teacher/assignments/${id}`);
export const createTeacherAssignment = (input: AssignmentDraftInput) => apiRequest<ApiTeacherAssignment>('/teacher/assignments', { method: 'POST', body: input });
export const updateTeacherAssignment = (id: string, input: AssignmentDraftInput, expectedUpdatedAt: string) =>
  apiRequest<ApiTeacherAssignment>(`/teacher/assignments/${id}`, { method: 'PATCH', body: { ...input, expectedUpdatedAt } });
export const publishTeacherAssignment = (id: string) => apiRequest<ApiTeacherAssignment>(`/teacher/assignments/${id}/publish`, { method: 'POST', body: {} });
export const closeTeacherAssignment = (id: string) => apiRequest<ApiTeacherAssignment>(`/teacher/assignments/${id}/close`, { method: 'POST', body: {} });
