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
  status: 'PUBLISHED';
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
  worklist?: { opened: number; read: number; submitted: number; aiDraft: number; published: number };
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
