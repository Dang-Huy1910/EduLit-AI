import { apiGet, apiSend } from '@/lib/api/http';
import type { WritingProfileResponse } from './types';

/** The student is always the signed-in session; no student id is sent. */
export const writingProfileApi = {
  get: () => apiGet<WritingProfileResponse>('/api/student/writing-profile'),
  refresh: () => apiSend<WritingProfileResponse>('/api/student/writing-profile/refresh', 'POST'),
  /** Read-only view of a student in a class the teacher owns. Never refreshes. */
  getForTeacher: (classroomId: string, studentId: string) =>
    apiGet<WritingProfileResponse>(
      `/api/teacher/classrooms/${encodeURIComponent(classroomId)}/students/${encodeURIComponent(studentId)}/writing-profile`
    ),
};
