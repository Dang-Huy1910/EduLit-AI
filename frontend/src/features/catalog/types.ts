export type CatalogKind = 'material' | 'prompt' | 'rubric' | 'topic';

export interface CatalogTopic {
  id: string;
  title: string;
  description: string;
  gradeLevel: number;
  genre: string;
  status: string;
  updatedAt?: string | null;
}

export interface CatalogChunk {
  chunkId: string;
  title: string;
  text: string;
  sortOrder?: number;
}

export interface CatalogMaterial {
  id: string;
  kind?: 'material';
  title: string;
  author: string;
  sourceInfo: string;
  gradeLevel: number;
  topicId?: string | null;
  status: string;
  missing: string[];
  version: number;
  excerpt: string;
  content?: string;
  sourceNotes?: string[];
  chunks?: CatalogChunk[];
  updatedAt?: string | null;
}

export interface CatalogPrompt {
  id: string;
  kind?: 'prompt';
  title: string;
  writingTask: string;
  extraGuidance: string;
  genre: string;
  gradeLevel: number;
  topicId?: string | null;
  status: string;
  ready: boolean;
  missing: string[];
  materialCount: number;
  materials: CatalogMaterial[];
  updatedAt?: string | null;
}

export interface CatalogRubricCriterion {
  id: string;
  name: string;
  weight: number;
  guideNote?: string;
  levels?: { score: number; descriptor: string }[];
  requiredElements?: string[];
  penaltyPerError?: number;
  antiPatterns?: string[];
}

export interface CatalogRubric {
  id: string;
  kind?: 'rubric';
  title: string;
  shortTitle: string;
  description: string;
  status: string;
  version: number;
  maxScore: number;
  scoreStep: number;
  criteriaCount: number;
  criteria?: CatalogRubricCriterion[];
  rubricVersionId?: string;
  updatedAt?: string | null;
}

export interface ClassroomSummary {
  id: string;
  code: string;
  name: string;
  gradeLevel: number;
  academicYear: string;
  studentCount: number;
}

export interface ClassroomMember {
  userId: string;
  loginId: string;
  displayName: string;
  role: string;
  email: string;
  status: string;
}

export interface ClassroomDetail extends ClassroomSummary {
  members: ClassroomMember[];
}

export interface TeacherAssignment {
  id: string;
  code: string;
  title: string;
  extraInstructions: string;
  status: string;
  dueAt: string | null;
  publishedAt: string | null;
  classroomId: string | null;
  classroomName: string | null;
  classroomCode: string | null;
  sourcePromptId: string;
  sourcePromptTitle: string | null;
  rubricId: string | null;
  maxScore: number;
  scoreStep: number;
  recipientCount: number;
  publishedRevisionId: string | null;
  updatedAt: string | null;
  assignmentRubric?: CatalogRubric & { criteria: CatalogRubricCriterion[] };
  recipientStudentIds?: string[];
  assignToWholeClass?: boolean;
  sourcePrompt?: CatalogPrompt;
}

export interface StudentAssignment {
  id: string;
  revisionId?: string;
  code: string;
  title: string;
  genre?: string;
  status: string;
  dueAt: string | null;
  writingTask?: string;
  extraInstructions?: string;
  instructions?: string;
  materials?: CatalogMaterial[];
  rubric?: {
    title?: string;
    maxScore?: number;
    scoreStep?: number;
    criteria?: CatalogRubricCriterion[];
    description?: string;
  };
  contextChunks?: { chunk_id?: string; chunkId?: string; title?: string; text?: string }[];
}

export interface AssignmentDraftState {
  assignmentId?: string;
  classroomId?: string;
  promptId?: string;
  title?: string;
  extraInstructions?: string;
  dueAt?: string;
  rubricId?: string;
  recipientStudentIds?: string[];
  assignToWholeClass?: boolean;
  maxScore?: number;
  scoreStep?: number;
  criteria?: CatalogRubricCriterion[];
}

export const PICK_PROMPT_NOTICE =
  'Chọn đề trước khi tạo bài tập.\nĐề trong kho cung cấp yêu cầu viết và ngữ liệu cho bài tập. Sau khi chọn đề, thầy/cô sẽ chọn barem, lớp nhận bài và hạn nộp.';

export const RUBRIC_IMPORT_SUCCESS =
  'Đã nhập barem vào kho. Thầy/cô có thể chọn barem này tại màn tạo đề.';

export const MISSING_LABELS: Record<string, string> = {
  title: 'tiêu đề',
  content: 'nội dung ngữ liệu',
  writingTask: 'yêu cầu viết',
  materials: 'ngữ liệu liên kết',
};
