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
  weight: number; // max score
  levels?: RubricLevel[];
  requiredElements?: string[];
  penaltyPerError?: number;
  antiPatterns?: string[];
}

export interface Rubric {
  id: string;
  version: string;
  topicTitle: string;
  gradeLevel: number;
  maxScore: number;
  criteria: RubricCriterion[];
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
}

export interface OutlineSection {
  id: string;
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

export interface SubmissionResult {
  id: string;
  assignmentId: string;
  studentId: string;
  studentName: string;
  studentCode: string;
  totalScore: number;
  maxScore: number;
  gradeLevel: string;
  ocrConfidence: number;
  flaggedSegmentsCount: number;
  submissionDate: string;
  evaluations: GradingEvaluation[];
  transcription: string[];
  pedagogicalTasks: {
    id: string;
    title: string;
    description: string;
    actionLabel: string;
  }[];
}

