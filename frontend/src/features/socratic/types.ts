/**
 * Socratic Session Types - Frontend type definitions for Socratic API
 *
 * Mapped from backend contract:
 * - Role: STUDENT / ASSISTANT
 * - Message status: PENDING / VALIDATED / REJECTED / FALLBACK
 * - FSM states: INIT / THESIS / OUTLINE / REVIEW
 * - Outline statuses: DRAFT / ACCEPTED / SUPERSEDED
 */

// API Request/Response types (camelCase)
export interface CreateSessionRequest {
  assignmentCode: string;
}

export interface CreateSessionResponse {
  id: string;
  studentId: string;
  assignmentRevisionId: string;
  state: string;
  version: number;
  outlineVersion: number;
  createdAt: string;
}

export interface MessageRequest {
  content: string;
}

// Role: STUDENT / ASSISTANT from backend
export type MessageRole = 'STUDENT' | 'ASSISTANT';

// Message status: PENDING / VALIDATED / REJECTED / FALLBACK
export type MessageStatus = 'PENDING' | 'VALIDATED' | 'REJECTED' | 'FALLBACK';

export interface SourceReference {
  chunk_id: string;
  quote: string;
  [key: string]: unknown;
}

export interface MessageResponse {
  id: string;
  turnId: number;
  role: MessageRole;
  content: string;
  sources?: SourceReference[];
  status: MessageStatus;
  createdAt: string;
}

export interface MessagesListResponse {
  messages: MessageResponse[];
  hasMore: boolean;
  nextBeforeTurn: number | null;
}

// Full outline content from backend - preserves thesis, arguments, counterArguments, section.content, and extra metadata
export interface OutlineSection {
  id: string;
  title: string;
  points: string[];
  content?: string;
  [key: string]: unknown;
}

export interface Argument {
  id: string;
  content: string;
  position: number;
  [key: string]: unknown;
}

export interface OutlineContent {
  sections: OutlineSection[];
  thesis?: string;
  arguments?: Argument[];
  counterArguments?: Argument[];
  [key: string]: unknown;
}

export interface UpdateOutlineRequest {
  content: OutlineContent;
  expectedVersion: number;
}

// Outline status: DRAFT / ACCEPTED / SUPERSEDED
export type OutlineReviewStatus = 'DRAFT' | 'ACCEPTED' | 'SUPERSEDED';

export interface OutlineResponse {
  id: string;           // UUID of the revision
  sessionId: string;
  revision: number;     // Revision number (for expectedVersion)
  content: OutlineContent;
  author: string;
  reviewStatus: OutlineReviewStatus;
  createdAt: string;
  readiness?: 'READY' | 'NOT_READY' | 'INCONCLUSIVE';
}

export interface ReviewOutlineRequest {
  revisionId: string;  // UUID, not revision number
}

// For find by assignment endpoint
export interface FindSessionResponse {
  session: SessionResponse | null;
  exists: boolean;
}

// FSM states: INIT / THESIS / OUTLINE / REVIEW
export type SocraticState = 'INIT' | 'THESIS' | 'OUTLINE' | 'REVIEW';

export interface SessionResponse {
  id: string;
  studentId: string;
  assignmentRevisionId: string;
  state: SocraticState;
  version: number;
  outlineVersion: number;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
  currentOutline?: OutlineResponse;
  readiness: 'READY' | 'NOT_READY' | 'INCONCLUSIVE';
}

// Frontend UI types
export interface UISocraticMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
  turnId?: number;
  status?: MessageStatus;
  role?: MessageRole;
  sources?: SourceReference[];
  canAddToOutline?: boolean;
  outlinePoint?: string;
  suggestedSectionId?: 'intro' | 'body' | 'conclusion';
  isFailed?: boolean;
  idempotencyKey?: string;
}

export interface UIOutlineSection {
  id: string;
  title: string;
  points: string[];
  content?: string;
  [key: string]: unknown;
}

// Store full outline content including thesis, arguments, counterArguments
export interface UIOutline {
  sections: UIOutlineSection[];
  thesis?: string;
  arguments?: Argument[];
  counterArguments?: Argument[];
  [key: string]: unknown;
}

// Helper to identify outline section and extract structured outline point from AI responses
export function deriveOutlineSuggestion(
  text: string,
  role?: string
): {
  canAddToOutline?: boolean;
  outlinePoint?: string;
  suggestedSectionId?: 'intro' | 'body' | 'conclusion';
} {
  if (role === 'STUDENT' || !text) {
    return { canAddToOutline: false };
  }

  const lower = text.toLowerCase().trim();

  // 1. Refusal check: nếu là câu từ chối viết hộ thì không gợi ý đưa vào dàn ý
  if (
    lower.includes('không thể viết thay') ||
    lower.includes('không viết thay') ||
    lower.includes('không cung cấp bài văn mẫu') ||
    lower.includes('không làm giúp')
  ) {
    return { canAddToOutline: false };
  }

  // 2. Nhận diện phần gợi ý: Mở bài, Thân bài, Kết bài
  let suggestedSectionId: 'intro' | 'body' | 'conclusion' = 'body';
  if (
    lower.includes('mở bài') ||
    lower.includes('đặt vấn đề') ||
    lower.includes('giới thiệu tác giả') ||
    lower.includes('yêu cầu đề bài')
  ) {
    suggestedSectionId = 'intro';
  } else if (
    lower.includes('kết bài') ||
    lower.includes('thông điệp') ||
    lower.includes('đóng góp của bài thơ') ||
    lower.includes('khép lại') ||
    lower.includes('khái quát')
  ) {
    suggestedSectionId = 'conclusion';
  }

  // 3. Khớp từ khóa theo nội dung ngữ liệu bài thơ "Màu tự do của đất" hoặc trích xuất nhận định của AI
  let outlinePoint: string | undefined = undefined;

  if (lower.includes('khói') || lower.includes('rơm rạ') || lower.includes('mùi') || lower.includes('khứu giác')) {
    outlinePoint = 'Khói rơm rạ và sự chuyển đổi cảm giác trong ‘hít thở mầu tự do’ khiến tự do được cảm nhận như hơi thở của quê hương.';
    suggestedSectionId = 'body';
  } else if (lower.includes('buộc') || lower.includes('neo') || lower.includes('cởi')) {
    outlinePoint = 'Chuỗi ‘buộc – neo – cởi’ nối cảm thức gắn bó với làng quê; ngọn khói đầu bài và mùi khói cuối bài tạo kết cấu vòng tròn.';
    suggestedSectionId = 'body';
  } else if (lower.includes('nghịch lí') || lower.includes('nghịch lý') || lower.includes('bùn đất') || lower.includes('mồ hôi')) {
    outlinePoint = 'Tự do vừa gắn với khát vọng thoát nhọc nhằn, vừa là có chỗ đứng trên mảnh đất thân thuộc và sống bằng sức lao động của mình.';
    suggestedSectionId = 'body';
  } else if (lower.includes('bếp lửa') || lower.includes('bằng việt')) {
    outlinePoint = 'Liên hệ ‘Bếp lửa’ qua kí ức và hình ảnh khói; làm rõ nét riêng của Trần Quang Quý ở suy tưởng về tự do trong sự gắn bó với đất và lao động.';
    suggestedSectionId = 'body';
  } else if (lower.includes('tế hanh') || lower.includes('quê hương')) {
    outlinePoint = 'Liên hệ ‘Quê hương’ (Tế Hanh) qua hình ảnh người lao động gắn bó với quê hương; làm nổi bật nét riêng của Trần Quang Quý ở độ lùi suy tưởng triết lý về tự do.';
    suggestedSectionId = 'body';
  } else if (suggestedSectionId === 'conclusion') {
    outlinePoint = 'Khẳng định cách nhìn riêng: tự do có ý nghĩa trong sự gắn bó với cội rễ, lao động và nhân nghĩa của làng quê.';
  } else if (suggestedSectionId === 'intro') {
    outlinePoint = 'Phân tích quan niệm về tự do qua hình ảnh làng quê; liên hệ một bài thơ khác để làm rõ nét riêng của Trần Quang Quý.';
  } else {
    // Trích xuất từ chính câu trả lời của AI: lấy các câu nhận định (loại bỏ câu hỏi cuối)
    const sentences = text
      .split(/(?<=[.?!])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const declarativeSentences = sentences.filter((s) => !s.endsWith('?'));
    const candidate = declarativeSentences.slice(0, 2).join(' ').trim();
    if (candidate.length >= 15) {
      outlinePoint = candidate;
    } else if (sentences.length > 0) {
      outlinePoint = sentences[0].replace(/\?+$/, '').trim();
    }
  }

  if (outlinePoint && outlinePoint.length >= 10) {
    return {
      canAddToOutline: true,
      outlinePoint,
      suggestedSectionId,
    };
  }

  return { canAddToOutline: false };
}

// Mapping functions
export function mapMessageToUI(msg: MessageResponse): UISocraticMessage {
  const isUser = msg.role === 'STUDENT';
  const date = new Date(msg.createdAt);
  const suggestion = !isUser ? deriveOutlineSuggestion(msg.content, msg.role) : {};

  return {
    id: msg.id,
    sender: isUser ? 'user' : 'ai',
    text: msg.content,
    timestamp: isNaN(date.getTime())
      ? new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
      : date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    turnId: msg.turnId,
    status: msg.status,
    role: msg.role,
    sources: Array.isArray(msg.sources) ? msg.sources : [],
    canAddToOutline: suggestion.canAddToOutline,
    outlinePoint: suggestion.outlinePoint,
    suggestedSectionId: suggestion.suggestedSectionId,
  };
}

export function mapOutlineToUI(outline: OutlineContent): UIOutline {
  // Handle sections from backend - preserve full content and extra properties
  if (outline.sections && outline.sections.length > 0) {
    return {
      ...outline,
      sections: outline.sections.map((section) => ({
        ...section,
        id: String(section.id || ''),
        title: String(section.title || ''),
        points: Array.isArray(section.points) ? section.points.map((p) => String(p)) : [],
        content: section.content !== undefined ? String(section.content) : undefined,
      })),
      thesis: outline.thesis,
      arguments: outline.arguments,
      counterArguments: outline.counterArguments,
    };
  }

  // Default sections if none exist
  return {
    ...DEFAULT_OUTLINE,
    thesis: outline.thesis,
    arguments: outline.arguments,
    counterArguments: outline.counterArguments,
  };
}

// Map UI outline to backend format - PRESERVES section.content, metadata, thesis, arguments
export function mapUIToOutlineContent(
  outline: UIOutline,
  originalOutline?: OutlineContent | null
): OutlineContent {
  const base: Partial<OutlineContent> = originalOutline || {};
  const baseSections: OutlineSection[] = base.sections || [];

  const mergedSections: OutlineSection[] = outline.sections.map((sec) => {
    const orig = baseSections.find((s: OutlineSection) => s.id === sec.id) || ({} as Partial<OutlineSection>);
    return {
      ...orig,
      ...sec,
      id: sec.id,
      title: sec.title,
      points: sec.points,
      ...(sec.content !== undefined ? { content: sec.content } : orig.content !== undefined ? { content: orig.content } : {}),
    };
  });

  return {
    ...base,
    ...outline,
    sections: mergedSections,
    thesis: outline.thesis !== undefined ? outline.thesis : base.thesis,
    arguments: outline.arguments !== undefined ? outline.arguments : base.arguments,
    counterArguments: outline.counterArguments !== undefined ? outline.counterArguments : base.counterArguments,
  };
}

// Default outline structure
export const DEFAULT_OUTLINE: UIOutline = {
  sections: [
    { id: 'intro', title: 'I. Mở bài — Đặt vấn đề', points: [] },
    { id: 'body', title: 'II. Thân bài — Triển khai luận điểm', points: [] },
    { id: 'conclusion', title: 'III. Kết bài — Đánh giá & Thông điệp', points: [] },
  ],
  thesis: undefined,
  arguments: [],
  counterArguments: [],
};
