export type AssessmentStatus =
  | 'none'
  | 'queued'
  | 'grading'
  | 'failed'
  | 'awaiting_review'
  | 'published'
  | 'revising'
  | 'new_version_grading'
  | 'new_version_review'
  | 'new_version_failed';

export interface AssessmentEvidence {
  pageId: string;
  pageIndex: number;
  segmentId: string;
  order: number;
  quote: string;
}

export interface AssessmentIssue {
  occurrenceId?: string;
  code: string;
  kind: 'located' | 'missing';
  message: string;
  source: string;
  evidence: AssessmentEvidence[];
}

export interface AssessmentEvaluation {
  criterionId: string;
  criterionName: string;
  awardedScore: number;
  maxScore: number;
  comment: string;
  strengths: string[];
  weaknesses: string[];
  missingElements: string[];
  issues: AssessmentIssue[];
  evidence: AssessmentEvidence[];
}

export interface AssessmentPayload {
  evaluations: AssessmentEvaluation[];
  overallComment: string;
  improvementGuidance: string[];
  totalScore: number;
  maxScore: number;
  scoreStep: number;
  scoreScale10: number;
}

export interface StudentAssessmentView {
  status: AssessmentStatus | string;
  jobStatus: string | null;
  jobError: string | null;
  canViewResult: boolean;
  result: (AssessmentPayload & {
    resultId: string;
    publishedAt: string | null;
    assignmentTitle: string;
    rubricTitle: string;
  }) | null;
}

export interface StudentAssessmentResponse {
  assignment: {
    id: string;
    revisionId: string;
    code: string;
    title: string;
    dueAt: string | null;
    writingTask: string;
    extraInstructions: string;
  };
  student: { id: string; displayName: string; loginId: string };
  submissionId: string | null;
  attemptId: string | null;
  status: string;
  officialSubmittedAt: string | null;
  ocrSubmittedAt: string | null;
  confirmedAt: string | null;
  canReopenTranscription: boolean;
  pages: {
    id: string;
    pageIndex: number;
    filename: string;
    size: string;
    imageUrl: string;
    originalImageUrl: string;
  }[];
  transcriptionPages: {
    pageId: string;
    pageIndex: number;
    segments: { segmentId: string; order: number; text: string }[];
  }[];
  assessment: StudentAssessmentView;
}

export interface AssessmentResultRef {
  id: string;
  transcriptionRevisionId: string;
  attemptId: string;
  version: number;
  isPublished: boolean;
  publishedAt: string | null;
}

export interface TeacherAssessmentDetail {
  assignment: {
    id: string;
    code: string;
    title: string;
    classroomName: string | null;
    teacherName: string;
    maxScore: number;
    scoreStep: number;
    writingTask: string;
    extraInstructions: string;
    rubric: {
      title: string;
      description?: string;
      maxScore: number;
      scoreStep: number;
      criteria: {
        id: string;
        name: string;
        weight: number;
        guideNote?: string;
      }[];
    };
  };
  student: { id: string; displayName: string; loginId: string };
  submission: {
    id: string | null;
    attemptId: string | null;
    attemptNumber: number;
    state: string | null;
    pageCount: number;
    ocrSubmittedAt: string | null;
    officialSubmittedAt: string | null;
    confirmedAt: string | null;
  };
  assessment: {
    status: AssessmentStatus | string;
    jobStatus: string | null;
    jobError: string | null;
    canRetry: boolean;
    canGrantReopen: boolean;
    reopenGranted: boolean;
    currentResult: AssessmentResultRef | null;
    publishedResult: AssessmentResultRef | null;
    version: number | null;
    isPublished: boolean;
    publishedAt: string | null;
    currentMatchesOfficial: boolean;
    publishedMatchesOfficial: boolean;
    historyLabel: string | null;
    ai: AssessmentPayload | null;
    working: AssessmentPayload | null;
    published: AssessmentPayload | null;
    provider: string | null;
    model: string | null;
    promptVersion: string | null;
  };
  pages: {
    id: string;
    pageIndex: number;
    filename: string;
    size: string;
    imageUrl: string;
    originalImageUrl: string;
    caption: string;
  }[];
  transcriptionPages: {
    pageId: string;
    pageIndex: number;
    segments: { segmentId: string; order: number; text: string }[];
  }[];
}

export interface ClassReportAssignment {
  id: string;
  code: string;
  title: string;
  classroomId: string | null;
  classroomName: string | null;
  classroomCode: string | null;
  maxScore: number;
  scoreStep: number;
  publishedAt: string | null;
}

export interface ClassReportRow {
  studentId: string;
  name: string;
  code: string;
  status: string;
  pageCount: number;
  officialSubmittedAt: string | null;
  ocrSubmittedAt: string | null;
  score: number | null;
  scoreScale10: number | null;
  isPublished: boolean;
  hasNewUnpublishedVersion: boolean;
}

export interface ClassReport {
  assignment: {
    id: string;
    code: string;
    title: string;
    teacherName: string;
    classroomId: string | null;
    classroomName: string | null;
    classroomCode: string | null;
    maxScore: number;
    scoreStep: number;
    rubricTitle: string;
  };
  stats: {
    assigned: number;
    officialSubmitted: number;
    processing: number;
    awaitingReview: number;
    published: number;
    failed: number;
    meanScore: number | null;
    meanScoreScale10: number | null;
    publishedCount: number;
    maxScore: number;
    scoreStep: number;
    distribution: { range: string; label: string; count: number }[];
    issues: {
      code: string;
      label: string;
      occurrenceCount: number;
      studentCount: number;
      studentRate: number | null;
      denominator: number;
      source: string;
      teacherConfirmed: boolean;
    }[];
  };
  insight: {
    status: string;
    stale: boolean;
    createdAt: string | null;
    updatedAt: string | null;
    error: string | null;
    payload: {
      priorities: { title: string; evidence: string; suggestedActivities: string[] }[];
      notes: string;
    } | null;
  } | null;
  students: {
    items: ClassReportRow[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
