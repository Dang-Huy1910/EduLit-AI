import { CHAT_REQUEST_TIMEOUT_MS } from '../data-mode';
import { apiRequest } from './http';
import type { ApiOutline, ApiSession, ApiTurnResult } from './types';

export async function openOrResumeSession(assignmentId: string): Promise<ApiSession> {
  return apiRequest<ApiSession>(`/assignments/${assignmentId}/socratic-sessions`, {
    method: 'POST',
    body: {},
  });
}

export async function getSocraticSession(sessionId: string): Promise<ApiSession> {
  return apiRequest<ApiSession>(`/socratic-sessions/${sessionId}`);
}

export async function saveOutline(
  sessionId: string,
  outline: ApiOutline,
  expectedOutlineRevision: number,
): Promise<{ sessionId: string; outline: ApiOutline; outlineRevision: number }> {
  return apiRequest(`/socratic-sessions/${sessionId}/outline`, {
    method: 'PUT',
    body: { outline, expectedOutlineRevision },
  });
}

export async function sendTurn(
  sessionId: string,
  input: { requestId: string; expectedLastSequence: number; message: string },
): Promise<ApiTurnResult> {
  return apiRequest<ApiTurnResult>(`/socratic-sessions/${sessionId}/turns`, {
    method: 'POST',
    body: input,
    timeoutMs: CHAT_REQUEST_TIMEOUT_MS,
  });
}
