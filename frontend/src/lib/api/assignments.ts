import { apiRequest } from './http';
import type { ApiAssignment } from './types';

export async function listAssignments(): Promise<ApiAssignment[]> {
  return apiRequest<ApiAssignment[]>('/assignments');
}

export async function getAssignment(assignmentId: string): Promise<ApiAssignment> {
  return apiRequest<ApiAssignment>(`/assignments/${assignmentId}`);
}
