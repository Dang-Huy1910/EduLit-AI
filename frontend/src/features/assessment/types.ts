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

export type StatsMode = 'provisional' | 'official';

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
  dueAt?: string | null;
}

export interface ScoreBin {
  range: string;
  label: string;
  count: number;
  rate?: number | null;
}

export interface IssueStat {
  code: string;
  label: string;
  occurrenceCount: number;
  paperCount?: number;
  studentCount: number;
  studentRate: number | null;
  paperRate?: number | null;
  denominator: number;
  source: string;
  teacherConfirmed: boolean;
  assignmentCount?: number;
}

export interface CriterionStat {
  groupKey: string;
  groupLabel: string;
  criterionId: string;
  criterionName: string;
  meanAwarded: number;
  meanMax: number;
  meanRate: number | null;
  n: number;
}

export interface InsightPayload {
  priorities: { title: string; evidence: string; suggestedActivities: string[] }[];
  notes: string;
}

export interface InsightState {
  status: string;
  stale: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  error: string | null;
  payload: InsightPayload | null;
  mode?: string;
}

export interface ScoreFormula {
  scale: number;
  meanKind: string;
  description: string;
}

export interface ReportStats {
  assigned: number;
  assignedStudents?: number;
  assignedPapers?: number;
  assignmentCount?: number;
  officialSubmitted: number;
  processing: number;
  grading?: number;
  awaitingReview: number;
  published: number;
  failed: number;
  scoredCount?: number;
  meanScore: number | null;
  meanScoreScale10: number | null;
  minScoreScale10?: number | null;
  maxScoreScale10?: number | null;
  publishedCount: number;
  maxScore: number;
  scoreStep?: number;
  distribution: ScoreBin[];
  issues: IssueStat[];
  criteria?: CriterionStat[];
  weakCriteria?: CriterionStat[];
  strengths?: CriterionStat[];
  recurringIssues?: IssueStat[];
  trend?: AssignmentTrendPoint[];
  scoreFormula?: ScoreFormula;
  mode?: StatsMode | string;
}

export interface AssignmentTrendPoint {
  id: string;
  code: string;
  title: string;
  classroomName?: string | null;
  maxScore: number;
  rubricTitle?: string;
  genre?: string;
  publishedAt: string | null;
  assigned: number;
  officialSubmitted: number;
  scoredCount: number;
  meanScoreScale10: number | null;
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
  workingScore?: number | null;
  workingScoreScale10?: number | null;
  publishedScore?: number | null;
  publishedScoreScale10?: number | null;
  isPublished: boolean;
  hasNewUnpublishedVersion: boolean;
  scoreSource?: string | null;
}

export interface ClassReport {
  scope?: string;
  mode: StatsMode | string;
  suggestedMode?: StatsMode | string;
  hasProvisionalData?: boolean;
  hasOfficialData?: boolean;
  canAnalyze?: boolean;
  insightInputHash?: string;
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
    writingTask?: string;
    publishedAt?: string | null;
  };
  stats: ReportStats;
  insight: InsightState | null;
  students: {
    items: ClassReportRow[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface CompetencyStudentAssignment {
  assignmentId: string;
  code: string;
  title: string;
  score: number | null;
  scoreScale10: number | null;
  maxScore: number;
  status: string;
  isPublished: boolean;
  officialSubmittedAt: string | null;
}

export interface CompetencyStudentRow {
  studentId: string;
  name: string;
  code: string;
  assignedCount: number;
  resultCount: number;
  meanScoreScale10: number | null;
  trend: 'up' | 'down' | 'flat' | null;
  assignments: CompetencyStudentAssignment[];
}

export interface CompetencyReport {
  scope: 'competency';
  mode: StatsMode | string;
  suggestedMode?: StatsMode | string;
  hasProvisionalData?: boolean;
  hasOfficialData?: boolean;
  canAnalyze?: boolean;
  insightInputHash?: string;
  filters: {
    classroomId: string | null;
    assignmentIds: string[];
    studentId: string | null;
    from: string | null;
    to: string | null;
  };
  available: {
    classrooms: { id: string; code: string; name: string; gradeLevel: number; academicYear: string }[];
    assignments: ClassReportAssignment[];
    students: { id: string; name: string; code: string }[];
  };
  stats: ReportStats;
  trend: AssignmentTrendPoint[];
  insight: InsightState | null;
  students: {
    items: CompetencyStudentRow[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface ReportMeta {
  classrooms: { id: string; code: string; name: string; gradeLevel: number; academicYear: string }[];
  items: ClassReportAssignment[];
  students: { id: string; name: string; code: string }[];
}
