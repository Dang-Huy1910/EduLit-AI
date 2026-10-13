export type ApiRole = 'TEACHER' | 'STUDENT';

export type ApiUser = {
  id: string;
  loginId: string;
  displayName: string;
  role: ApiRole;
};

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
  };
};

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;

  constructor(status: number, code: string, message: string, retryable = false) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

export type ApiAssignment = {
  id: string;
  code: string;
  title: string;
  instructions: string;
  genre: string;
  gradeLevel: number;
  maxScore: string;
  scoreStep: string;
  status: 'PUBLISHED' | 'CLOSED';
  publishedAt: string | null;
  dueAt: string | null;
  learningMaterialText?: string;
  rubric?: {
    criteria: Array<{
      criterionId: string;
      name: string;
      weight: string;
      descriptor?: string;
      requiredElements?: string[];
    }>;
  };
  submission: { id: string; submittedAt: string } | null;
  socraticSession: { sessionId: string; status: 'ACTIVE' | 'COMPLETED' } | null;
  progress: { readAt: string | null } | null;
};

export type ApiTeacherAssignment = {
  id: string;
  code: string;
  title: string;
  instructions: string;
  genre: 'NLXH' | 'NLVH';
  gradeLevel: number;
  learningMaterialText: string;
  rubric: NonNullable<ApiAssignment['rubric']>;
  maxScore: string;
  scoreStep: string;
  status: 'DRAFT' | 'PUBLISHED' | 'CLOSED';
  dueAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  worklist?: {
    opened: number;
    read: number;
    submitted: number;
    aiDraft: number;
    published: number;
    awaitingPrivacy: number;
    ocrQueue: number;
    waitingGrade: number;
  };
};

export type AssignmentDraftInput = {
  code?: string;
  title: string;
  instructions: string;
  genre: 'NLXH' | 'NLVH';
  gradeLevel: number;
  learningMaterialText: string;
  rubric: NonNullable<ApiAssignment['rubric']>;
  maxScore: string;
  scoreStep: string;
  dueAt?: string | null;
};

export type ApiOutline = {
  sections: Array<{ id: string; title: string; points: string[] }>;
};

export type ApiChatMessage = {
  id: string;
  sequence: number;
  role: 'USER' | 'ASSISTANT';
  content: string;
  requestId: string | null;
  createdAt: string;
};

export type ApiSession = {
  sessionId: string;
  studentId: string;
  assignmentId: string;
  status: 'ACTIVE' | 'COMPLETED';
  assignmentStatus: 'DRAFT' | 'PUBLISHED' | 'CLOSED';
  hasSubmission: boolean;
  snapshot: {
    assignmentId: string;
    code: string;
    title: string;
    instructions: string;
    genre: string;
    gradeLevel: number;
    learningMaterialText: string;
    rubric: NonNullable<ApiAssignment['rubric']>;
    maxScore: string;
    scoreStep: string;
    status: string;
    publishedAt: string | null;
    dueAt: string | null;
    snapshottedAt: string;
  };
  messages: ApiChatMessage[];
  outline: ApiOutline;
  outlineRevision: number;
  lastSequence: number;
  resumed?: boolean;
};

export type ApiTurnResult = {
  sessionId: string;
  requestId: string;
  userMessage: ApiChatMessage;
  assistantMessage: ApiChatMessage;
  responseMode: 'model' | 'fallback' | 'replay';
  lastSequence: number;
  outlineRevision: number;
};

export type WorkflowStepState = 'not_started' | 'in_progress' | 'waiting_teacher' | 'complete';
export type ApiAssignmentProgress = {
  assignmentId: string;
  assignmentStatus: 'PUBLISHED' | 'CLOSED';
  readAt: string | null;
  socratic: { sessionId: string; status: 'ACTIVE' | 'COMPLETED'; outlineRevision: number; outlineSaved: boolean } | null;
  draft: { id: string; status: string; revision: number } | null;
  submission: { id: string; source: string } | null;
  assessment: { status: 'PENDING' } | { status: 'PUBLISHED'; id: string } | null;
  profile: { status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'; noObservations?: boolean } | null;
  steps: Record<'reading' | 'socratic' | 'submit' | 'ocr' | 'result', WorkflowStepState>;
};
export type ApiDraftPage = { id: string; pageIndex: number; mimeType: string; masks: Array<{ x: number; y: number; width: number; height: number }>; derivativeUrl: string };
export type ApiSubmissionDraft = {
  id: string;
  assignmentId: string;
  studentId: string;
  student?: { id: string; displayName: string; loginId: string };
  status: 'DRAFT' | 'AWAITING_PRIVACY_REVIEW' | 'PRIVACY_RETURNED' | 'PRIVACY_APPROVED' | 'OCR_PROCESSING' | 'OCR_FAILED' | 'OCR_REVIEW' | 'CONFIRMED';
  revision: number;
  privacyReturnReason: string | null;
  ocrErrorCode: string | null;
  pages: ApiDraftPage[];
  ocr: null | { id: string; revision: number; sourceRevision: number; rawPages: { pages: Array<{ pageId: string; segments: Array<{ id: string; text: string; needsReview: boolean; reason?: string }> }> }; correctedText: string; issues: Array<{ id: string; pageId: string | null; segmentId: string | null; reportedText: string; note: string | null; status: string }> };
};
export type ApiWritingObservation = {
  id: string;
  kind: string;
  featureKey: string;
  description: string;
  genre: string;
  status: string;
  evidenceQuote: string;
  evidenceStart: number;
  evidenceEnd: number;
  assessmentId: string;
  observedAt: string;
};
export type ApiWritingProfile = {
  profile: { id: string; version: number; summary: unknown; updatedAt: string } | null;
  observations: ApiWritingObservation[];
};
export type ApiProfileExtractionJob = {
  assessmentId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  attempts: number;
  errorCode: string | null;
  noObservations: boolean;
  updatedAt: string | null;
  profileVersion: number;
  observations: ApiWritingObservation[];
};
export type ApiTeacherSubmission = { id: string; studentId: string; student: { displayName: string; loginId: string }; source: 'LEGACY_TEXT' | 'IMAGE_OCR'; submittedAt: string; ocrStatus: string | null; assessment: ApiTeacherAssessment | null };
export type ApiEvaluation = { criterionId: string; awardedScore: string; comment: string; strengths: string[]; weaknesses: string[]; evidence: Array<{ quote: string; start: number; end: number }>; missingElements: string[] };
export type ApiTeacherAssessment = { id: string; submissionId: string; studentId: string; status: 'AI_DRAFT' | 'PUBLISHED'; totalScore: string; maxScore: string; detailedEvaluations: ApiEvaluation[]; aiDetailedEvaluations: ApiEvaluation[] | null; aiTotalScore: string | null; reviewedById: string | null; reviewedAt: string | null; reviewReason: string | null; reviewRevision: number; rubricSnapshot: unknown; modelName: string; promptVersion: string; assessedAt: string; publishedAt: string | null; createdAt: string };
export type ApiStudentSubmission = { audience: 'student'; submission: { id: string; text: string; assignmentId: string; submittedAt: string }; assessment: { status: 'PENDING' } | { status: 'PUBLISHED'; id: string; totalScore: string; maxScore: string; detailedEvaluations: ApiEvaluation[]; publishedAt: string | null } };
