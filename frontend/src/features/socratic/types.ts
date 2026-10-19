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
  selectedPointId?: string;
  selectedSectionId?: string;
  expectedOutlineVersion?: number;
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

export type ConversationIntent = 'EXPLAIN' | 'PROPOSE' | 'EDIT' | 'MIXED' | 'CLARIFY';

export interface OutlineProposal {
  sectionId: string;
  text: string;
  kind?: 'claim' | 'evidence' | 'note';
  sourceChunkId?: string;
}

export interface OutlineAppliedOp {
  op: 'add' | 'update' | 'delete';
  targetId?: string | null;
  sectionId?: string | null;
  text?: string | null;
  kind?: string | null;
}

export interface MessageResponse {
  id: string;
  turnId: number;
  role: MessageRole;
  content: string;
  sources?: SourceReference[];
  status: MessageStatus;
  createdAt: string;
  intent?: ConversationIntent | string | null;
  proposals?: OutlineProposal[];
  appliedOps?: OutlineAppliedOp[];
  outlineChanged?: boolean;
  outlineVersion?: number | null;
  currentOutline?: OutlineResponse | null;
  clarificationReason?: string | null;
}

export interface MessagesListResponse {
  messages: MessageResponse[];
  hasMore: boolean;
  nextBeforeTurn: number | null;
}

// Full outline content from backend - preserves thesis, arguments, counterArguments, section.content, and extra metadata
export interface OutlinePoint {
  id: string;
  text: string;
  kind?: 'claim' | 'evidence' | 'note';
  source_chunk_id?: string;
  [key: string]: unknown;
}

export interface OutlineSection {
  id: string;
  title: string;
  points: Array<string | OutlinePoint>;
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
  outlineInitStatus?: 'NONE' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'NEEDS_CLARIFICATION' | string;
}

export interface OutlineInitResponse {
  status: 'NONE' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'NEEDS_CLARIFICATION' | string;
  outline: OutlineResponse | null;
  message?: string | null;
  sessionState: string;
  outlineVersion: number;
  readiness?: 'READY' | 'NOT_READY' | 'INCONCLUSIVE' | null;
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
  intent?: ConversationIntent | string | null;
  proposals?: OutlineProposal[];
  appliedOps?: OutlineAppliedOp[];
}

export interface UIOutlinePoint {
  id: string;
  text: string;
  kind?: 'claim' | 'evidence' | 'note';
  source_chunk_id?: string;
  [key: string]: unknown;
}

export interface UIOutlineSection {
  id: string;
  title: string;
  points: string[];
  pointItems?: UIOutlinePoint[];
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
  role?: string,
  studentPrompt?: string,
  status?: string
): {
  canAddToOutline?: boolean;
  outlinePoint?: string;
  suggestedSectionId?: 'intro' | 'body' | 'conclusion';
} {
  if (role === 'STUDENT' || !text || status === 'FALLBACK' || status === 'REJECTED') {
    return { canAddToOutline: false };
  }

  const lower = text.toLowerCase().trim();

  // 1. Refusal & Fallback check: từ chối viết hộ hoặc câu hỏi điều phối an toàn thì không bao giờ đưa vào dàn ý
  if (
    lower.includes('không thể viết thay') ||
    lower.includes('không viết thay') ||
    lower.includes('không cung cấp bài văn mẫu') ||
    lower.includes('không làm giúp') ||
    lower.includes('trước khi phát triển chi tiết') ||
    lower.includes('chia sẻ suy nghĩ đầu tiên') ||
    lower.includes('nói rõ hơn về hướng triển khai') ||
    lower.includes('dàn ý hiện tại đã sẵn sàng') ||
    lower.includes('thuộc phạm vi ngữ văn')
  ) {
    return { canAddToOutline: false };
  }

  // 2. Nhận diện phần gợi ý: Mở bài, Thân bài, Kết bài (kết hợp câu hỏi của học sinh và phản hồi của trợ lý)
  const combined = `${studentPrompt || ''} ${text}`.toLowerCase();
  let suggestedSectionId: 'intro' | 'body' | 'conclusion' = 'body';
  if (
    combined.includes('kết bài') ||
    combined.includes('kết luận') ||
    combined.includes('thông điệp') ||
    combined.includes('đóng góp của bài thơ') ||
    combined.includes('khép lại') ||
    combined.includes('khái quát') ||
    combined.includes('tổng kết') ||
    combined.includes('đánh giá chung')
  ) {
    suggestedSectionId = 'conclusion';
  } else if (
    combined.includes('mở bài') ||
    combined.includes('đặt vấn đề') ||
    combined.includes('giới thiệu tác giả') ||
    combined.includes('yêu cầu đề bài')
  ) {
    suggestedSectionId = 'intro';
  }

  // 3. Phân tách câu nhận định và câu hỏi
  const sentences = text
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const declarativeSentences = sentences.filter((s) => !s.endsWith('?'));
  const candidate = declarativeSentences.slice(0, 2).join(' ').trim();

  // 4. Xác định ý đưa vào dàn ý
  let outlinePoint: string | undefined = undefined;

  if (suggestedSectionId === 'conclusion') {
    if (candidate.length >= 15) {
      outlinePoint = candidate;
    } else {
      outlinePoint = 'Khẳng định cách nhìn riêng: tự do có ý nghĩa trong sự gắn bó với cội rễ, lao động và nhân nghĩa của làng quê.';
    }
  } else if (suggestedSectionId === 'intro') {
    if (candidate.length >= 15) {
      outlinePoint = candidate;
    } else {
      outlinePoint = 'Phân tích quan niệm về tự do qua hình ảnh làng quê; liên hệ một bài thơ khác để làm rõ nét riêng của Trần Quang Quý.';
    }
  } else {
    // Thân bài: kiểm tra theo từng khía cạnh ngữ liệu hoặc lấy nhận định từ AI
    if (lower.includes('khói') || lower.includes('rơm rạ') || lower.includes('mùi') || lower.includes('khứu giác')) {
      outlinePoint = 'Khói rơm rạ và sự chuyển đổi cảm giác trong ‘hít thở mầu tự do’ khiến tự do được cảm nhận như hơi thở của quê hương.';
    } else if (lower.includes('buộc') || lower.includes('neo') || lower.includes('cởi')) {
      outlinePoint = 'Chuỗi ‘buộc – neo – cởi’ nối cảm thức gắn bó với làng quê; ngọn khói đầu bài và mùi khói cuối bài tạo kết cấu vòng tròn.';
    } else if (lower.includes('nghịch lí') || lower.includes('nghịch lý') || lower.includes('bùn đất') || lower.includes('mồ hôi')) {
      outlinePoint = 'Tự do vừa gắn với khát vọng thoát nhọc nhằn, vừa là có chỗ đứng trên mảnh đất thân thuộc và sống bằng sức lao động của mình.';
    } else if (lower.includes('bếp lửa') || lower.includes('bằng việt')) {
      outlinePoint = 'Liên hệ ‘Bếp lửa’ qua kí ức và hình ảnh khói; làm rõ nét riêng của Trần Quang Quý ở suy tưởng về tự do trong sự gắn bó với đất và lao động.';
    } else if (lower.includes('tế hanh') || lower.includes('quê hương')) {
      outlinePoint = 'Liên hệ ‘Quê hương’ (Tế Hanh) qua hình ảnh người lao động gắn bó với quê hương; làm nổi bật nét riêng của Trần Quang Quý ở độ lùi suy tưởng triết lý về tự do.';
    } else if (candidate.length >= 15) {
      outlinePoint = candidate;
    }
  }

  // Tuyệt đối không đưa câu hỏi vào dàn ý: chỉ chấp nhận khi outlinePoint là câu khẳng định rõ ràng
  if (outlinePoint && outlinePoint.length >= 10 && !outlinePoint.endsWith('?')) {
    return {
      canAddToOutline: true,
      outlinePoint,
      suggestedSectionId,
    };
  }

  return { canAddToOutline: false };
}

// Mapping functions
function proposalsFromMessage(
  msg: MessageResponse,
  studentPrompt?: string
): {
  canAddToOutline?: boolean;
  outlinePoint?: string;
  suggestedSectionId?: 'intro' | 'body' | 'conclusion';
  proposals?: OutlineProposal[];
} {
  if (msg.status === 'FALLBACK' || msg.status === 'REJECTED') {
    return { canAddToOutline: false };
  }

  const proposals = Array.isArray(msg.proposals) ? msg.proposals : [];
  if (proposals.length > 0) {
    const first = proposals[0];
    const section = (first.sectionId === 'intro' || first.sectionId === 'conclusion' || first.sectionId === 'body')
      ? first.sectionId
      : (studentPrompt?.toLowerCase().includes('kết bài') ? 'conclusion' : studentPrompt?.toLowerCase().includes('mở bài') ? 'intro' : 'body');
    return {
      canAddToOutline: true,
      outlinePoint: first.text,
      suggestedSectionId: section,
      proposals,
    };
  }

  if (msg.intent === 'CLARIFY' || msg.intent === 'EDIT') {
    return { canAddToOutline: false, proposals };
  }

  return {
    ...deriveOutlineSuggestion(msg.content, msg.role, studentPrompt, msg.status),
    proposals,
  };
}

export function mapMessageToUI(msg: MessageResponse, studentPrompt?: string): UISocraticMessage {
  const isUser = msg.role === 'STUDENT';
  const date = new Date(msg.createdAt);
  const suggestion = !isUser ? proposalsFromMessage(msg, studentPrompt) : {};

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
    intent: msg.intent,
    proposals: suggestion.proposals,
    appliedOps: msg.appliedOps,
  };
}

export function mapMessagesWithContext(messages: MessageResponse[]): UISocraticMessage[] {
  return messages.map((msg, index) => {
    let studentPrompt: string | undefined;
    if (msg.role === 'ASSISTANT') {
      for (let i = index - 1; i >= 0; i--) {
        if (messages[i].role === 'STUDENT') {
          studentPrompt = messages[i].content;
          break;
        }
      }
    }
    return mapMessageToUI(msg, studentPrompt);
  });
}

function coercePoint(raw: string | OutlinePoint, fallbackId: string): UIOutlinePoint {
  if (typeof raw === 'string') {
    return { id: fallbackId, text: raw, kind: 'claim' };
  }
  const text = String(raw.text || raw.content || '').trim();
  return {
    id: String(raw.id || fallbackId),
    text,
    kind: raw.kind === 'evidence' || raw.kind === 'note' ? raw.kind : 'claim',
    source_chunk_id: raw.source_chunk_id ? String(raw.source_chunk_id) : undefined,
  };
}

export function mapOutlineToUI(outline: OutlineContent): UIOutline {
  // Handle sections from backend - preserve full content and extra properties
  if (outline.sections && outline.sections.length > 0) {
    return {
      ...outline,
      sections: outline.sections.map((section) => {
        const id = String(section.id || '');
        const items = Array.isArray(section.points)
          ? section.points.map((p, i) => coercePoint(p as string | OutlinePoint, `${id}-${i + 1}`))
          : [];
        return {
          ...section,
          id,
          title: String(section.title || ''),
          points: items.map((p) => p.text),
          pointItems: items,
          content: section.content !== undefined ? String(section.content) : undefined,
        };
      }),
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
    const items: UIOutlinePoint[] = (sec.pointItems && sec.pointItems.length === sec.points.length)
      ? sec.pointItems.map((item, i) => ({ ...item, text: sec.points[i] ?? item.text }))
      : sec.points.map((text, i) => ({
          id: sec.pointItems?.[i]?.id || `${sec.id}-${i + 1}`,
          text,
          kind: sec.pointItems?.[i]?.kind || 'claim',
          source_chunk_id: sec.pointItems?.[i]?.source_chunk_id,
        }));
    return {
      ...orig,
      ...sec,
      id: sec.id,
      title: sec.title,
      points: items,
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
