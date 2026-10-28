import { apiGet, apiSend, apiUpload } from '@/lib/api/http';
import type { SubmissionPayload, TranscriptionPage } from './types';

function path(assignmentId: string, suffix: string): string {
  return `/api/assignments/${encodeURIComponent(assignmentId)}${suffix}`;
}

export const submissionApi = {
  get: (assignmentId: string) => apiGet<SubmissionPayload>(path(assignmentId, '/submission')),
  getOcr: (assignmentId: string) => apiGet<SubmissionPayload>(path(assignmentId, '/ocr')),
  uploadPage: (assignmentId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return apiUpload<SubmissionPayload>(path(assignmentId, '/submission/pages'), form);
  },
  updatePage: (
    assignmentId: string,
    pageId: string,
    body: { rotationDegrees?: number; maskRegions?: { x: number; y: number; width: number; height: number }[] }
  ) => apiSend<SubmissionPayload>(path(assignmentId, `/submission/pages/${pageId}`), 'PATCH', body),
  replacePage: (assignmentId: string, pageId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return apiUpload<SubmissionPayload>(
      path(assignmentId, `/submission/pages/${pageId}/replace`),
      form
    );
  },
  deletePage: (assignmentId: string, pageId: string) =>
    apiSend<SubmissionPayload>(path(assignmentId, `/submission/pages/${pageId}`), 'DELETE'),
  clearPages: (assignmentId: string) =>
    apiSend<SubmissionPayload>(path(assignmentId, '/submission/pages'), 'DELETE'),
  reorder: (assignmentId: string, pageIds: string[]) =>
    apiSend<SubmissionPayload>(path(assignmentId, '/submission/reorder'), 'POST', { pageIds }),
  submit: (assignmentId: string) =>
    apiSend<SubmissionPayload>(path(assignmentId, '/submission/submit'), 'POST', {}),
  retryOcr: (assignmentId: string) =>
    apiSend<SubmissionPayload>(path(assignmentId, '/submission/retry-ocr'), 'POST', {}),
  newAttempt: (assignmentId: string) =>
    apiSend<SubmissionPayload>(path(assignmentId, '/submission/new-attempt'), 'POST', {}),
  startRevision: (assignmentId: string) =>
    apiSend<SubmissionPayload>(path(assignmentId, '/submission/start-revision'), 'POST', {}),
  saveSegments: (
    assignmentId: string,
    body: { expectedRevision: number; pages: TranscriptionPage[] }
  ) => apiSend<SubmissionPayload>(path(assignmentId, '/ocr/segments'), 'PATCH', body),
  confirm: (assignmentId: string, body: { expectedRevision: number; pages?: TranscriptionPage[] }) =>
    apiSend<SubmissionPayload>(path(assignmentId, '/ocr/confirm'), 'POST', body),
  reopen: (assignmentId: string) =>
    apiSend<SubmissionPayload>(path(assignmentId, '/ocr/reopen'), 'POST', {}),
};
