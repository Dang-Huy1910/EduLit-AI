import { apiGet, apiSend } from '@/lib/api/http';
import type { WritingProfileResponse } from './types';

/** The student is always the signed-in session; no student id is sent. */
export const writingProfileApi = {
  get: () => apiGet<WritingProfileResponse>('/api/student/writing-profile'),
  refresh: () => apiSend<WritingProfileResponse>('/api/student/writing-profile/refresh', 'POST'),
};
