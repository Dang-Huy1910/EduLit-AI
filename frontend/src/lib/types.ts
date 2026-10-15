export type Role = 'teacher' | 'student';

export interface User {
  id: string;
  name: string;
  role: Role;
  email: string;
  school: string;
  classId?: string;
  code?: string;
  avatarInitials: string;
}

export interface RubricLevel {
  score: number;
  descriptor: string;
}

export interface RubricCriterion {
  id: string;
  name: string;
  weight: number; // max score in 4.0 scale
  levels?: RubricLevel[];
  requiredElements?: string[];
  penaltyPerError?: number;
  antiPatterns?: string[];
  guideNote?: string;
}

export interface Rubric {
  id: string;
  version: string;
  topicTitle: string;
  gradeLevel: number;
  maxScore: number; // 4.0
  criteria: RubricCriterion[];
  originalDocxGuide?: string;
}

export interface Material {
  id: string;
  title: string;
  purpose: 'Ngữ liệu' | 'Giáo án' | 'Đề bài' | 'Barem';
  classId: string;
  version: string;
  status: 'READY' | 'PROCESSING' | 'FAILED';
  errorMessage?: string;
  excerpt?: string;
  fullContent?: string;
  sourceNotes?: string[];
  uploadedAt: string;
}

export interface Assignment {
  id: string;
  code: string;
  title: string;
  studentTitle: string;
  topic: string;
  instructions: string;
  gradeLevel: number;
  classId: string;
  className: string;
  status: 'published' | 'draft' | 'blocked';
  statusLabel: string;
  deadline: string;
  totalSubmissions: number;
  assessedSubmissions: number;
  flaggedSubmissions: number;
  rubricId: string;
  linkedMaterialIds: string[];
  learningGoals: {
    id: string;
    goal: string;
    criterionId: string;
  }[];
  poemSource?: {
    title: string;
    author: string;
    lines: string[];
    sourceDocxNotes?: string[];
  };
}

export interface OutlineSection {
  id: 'intro' | 'body' | 'conclusion' | string;
  title: string;
  points: string[];
}

export interface SocraticMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
  canAddToOutline?: boolean;
  outlinePoint?: string;
  suggestedSectionId?: 'intro' | 'body' | 'conclusion';
  requirementTag?: string;
  branchId?: string;
}

export interface GradingEvaluation {
  criterionId: string;
  criterionName: string;
  awardedScore: number;
  maxScore: number;
  strengths: string[];
  weaknesses: string[];
  missingElements?: string[];
  errors?: {
    lineRef: number;
    quote: string;
    issue: string;
    type: 'syntax' | 'spelling';
    penalty?: number;
  }[];
  comment?: string;
}

export interface SubmissionPageImage {
  pageIndex: number;
  imageUrl: string;
  size: string;
  caption: string;
  isCustomUpload?: boolean;
}

export interface SubmissionTranscriptionPage {
  pageIndex: number;
  lines: string[];
}

export interface StudentSubmission {
  id: string; // submissionId
  assignmentId: string;
  studentId: string;
  studentName: string;
  studentCode: string;
  submissionDate: string;
  status: 'submitted' | 'graded';
  pages: SubmissionPageImage[];
  transcriptionByPage: SubmissionTranscriptionPage[];
  evaluations: GradingEvaluation[];
  totalScore: number; // 4.0 scale
  maxScore: number; // 4.0
  scoreScale10: number; // (totalScore / 4.0) * 10
  gradeLevel: string;
  ocrConfidenceLabel: string; // e.g. "Mô phỏng rà soát OCR"
  flaggedSegmentsCount: number;
  isPublishedToStudent: boolean;
  teacherNotes?: string;
  pedagogicalTasks: {
    id: string;
    title: string;
    description: string;
    actionLabel: string;
  }[];
}

// Backwards compatibility alias for components expecting SubmissionResult
export type SubmissionResult = StudentSubmission;
