import { apiRequest } from './http';
import type { ApiAssignment } from './types';

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
