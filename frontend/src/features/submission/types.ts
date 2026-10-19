export type SubmissionStatus =
  | 'draft'
  | 'queued'
  | 'processing'
  | 'review'
  | 'failed'
  | 'confirmed';

export interface SubmissionAssignment {
  id: string;
  revisionId: string;
  code: string;
  title: string;
  dueAt: string | null;
  writingTask: string;
  extraInstructions: string;
}

export interface MaskRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SubmissionPage {
  id: string;
  pageIndex: number;
  filename: string;
  mimeType: string;
  size: string;
  byteSize: number;
  processedByteSize: number;
  width: number;
  height: number;
  rotationDegrees: number;
  maskRegions: MaskRegion[];
  originalImageUrl: string;
  imageUrl: string;
  processedSha256: string;
}

export interface TranscriptionSegment {
  segmentId: string;
  order: number;
  text: string;
  needsReview: boolean;
  reviewReason: string | null;
  confidence: number | null;
  confidenceSource: string;
}

export interface TranscriptionPage {
  pageId: string;
  pageIndex: number;
  needsReview: boolean;
  reviewReason: string | null;
  segments: TranscriptionSegment[];
}

export interface SubmissionPayload {
  assignment: SubmissionAssignment;
  student: { id: string; displayName: string; loginId: string };
  submissionId: string | null;
  attemptId: string | null;
  attemptNumber: number;
  state: string;
  status: SubmissionStatus;
  ocrStatus: string;
  ocrError: string | null;
  ocrPageErrors: Record<string, string>;
  submittedAt: string | null;
  ocrSubmittedAt?: string | null;
  officialSubmittedAt?: string | null;
  confirmedAt: string | null;
  pages: SubmissionPage[];
  ocrPages: TranscriptionPage[];
  transcriptionPages: TranscriptionPage[];
  expectedRevision: number;
  transcriptionStatus: string | null;
  confirmed: boolean;
  canEditPages: boolean;
  canSubmit: boolean;
  canRetryOcr: boolean;
  canConfirm: boolean;
  waitingForGrade: boolean;
  canReopenTranscription?: boolean;
}
