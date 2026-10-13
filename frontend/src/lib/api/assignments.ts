import { apiRequest } from './http';
import type { ApiAssignment, ApiAssignmentProgress } from './types';

export async function listAssignments(): Promise<ApiAssignment[]> {
  return apiRequest<ApiAssignment[]>('/assignments');
}

export async function getAssignment(assignmentId: string): Promise<ApiAssignment> {
  return apiRequest<ApiAssignment>(`/assignments/${assignmentId}`);
}

export async function getAssignmentByCode(code: string): Promise<ApiAssignment> {
  return apiRequest<ApiAssignment>(`/assignments/code/${encodeURIComponent(code.trim().toUpperCase())}`);
}

export async function markAssignmentRead(assignmentId: string): Promise<void> {
  await apiRequest(`/assignments/${assignmentId}/read`, { method: 'POST', body: {} });
}

export async function getAssignmentProgress(assignmentId: string): Promise<ApiAssignmentProgress> {
  return apiRequest<ApiAssignmentProgress>(`/assignments/${assignmentId}/progress`);
}
