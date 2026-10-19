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
  outlineInitStatus?: 'NONE' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'NEEDS_CLARIFICATION' | 'QUEUED' | 'READY' | string;
  outlinePrepStatus?: 'QUEUED' | 'PROCESSING' | 'READY' | 'FAILED' | 'NEEDS_CLARIFICATION' | string | null;
}

export interface OutlineInitResponse {
  status: 'NONE' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'NEEDS_CLARIFICATION' | 'QUEUED' | 'READY' | string;
  outline: OutlineResponse | null;
  message?: string | null;
  sessionState: string;
  outlineVersion: number;
  readiness?: 'READY' | 'NOT_READY' | 'INCONCLUSIVE' | null;
  outlinePrepStatus?: 'QUEUED' | 'PROCESSING' | 'READY' | 'FAILED' | 'NEEDS_CLARIFICATION' | string | null;
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
  clarificationReason?: string | null;
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
  /** Derived from `pointItems` — keep in lockstep via `withSectionItems`. */
  points: string[];
  /** Canonical point identity (id, text, source). */
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

const VALID_SECTION_IDS = new Set(['intro', 'body', 'conclusion']);

export function isValidOutlineProposal(item: OutlineProposal | null | undefined): item is OutlineProposal {
  if (!item) return false;
  const section = String(item.sectionId || '').trim();
  const text = String(item.text || '').trim();
  return VALID_SECTION_IDS.has(section) && text.length > 0;
}

export function structuredProposalsFromMessage(msg: MessageResponse): OutlineProposal[] {
  if (msg.role === 'STUDENT' || msg.status === 'FALLBACK' || msg.status === 'REJECTED') {
    return [];
  }
  if (msg.intent === 'EXPLAIN' || msg.intent === 'CLARIFY') {
    return [];
  }
  const raw = Array.isArray(msg.proposals) ? msg.proposals : [];
  return raw.filter(isValidOutlineProposal);
}

/**
 * Kept for refusal/fallback regression tests. Does not infer outline points
 * from keywords or inject assignment-specific copy.
 */
export function deriveOutlineSuggestion(
  _text: string,
  role?: string,
  _studentPrompt?: string,
  status?: string
): {
  canAddToOutline?: boolean;
  outlinePoint?: string;
  suggestedSectionId?: 'intro' | 'body' | 'conclusion';
} {
  if (role === 'STUDENT' || status === 'FALLBACK' || status === 'REJECTED') {
    return { canAddToOutline: false };
  }
  return { canAddToOutline: false };
}

function proposalsFromMessage(msg: MessageResponse): {
  canAddToOutline?: boolean;
  outlinePoint?: string;
  suggestedSectionId?: 'intro' | 'body' | 'conclusion';
  proposals?: OutlineProposal[];
} {
  const proposals = structuredProposalsFromMessage(msg);
  if (proposals.length === 0) {
    return { canAddToOutline: false, proposals: [] };
  }
  const first = proposals[0];
  return {
    canAddToOutline: true,
    outlinePoint: first.text,
    suggestedSectionId: first.sectionId as 'intro' | 'body' | 'conclusion',
    proposals,
  };
}

export function mapMessageToUI(msg: MessageResponse, studentPrompt?: string): UISocraticMessage {
  const isUser = msg.role === 'STUDENT';
  const date = new Date(msg.createdAt);
  const suggestion = !isUser ? proposalsFromMessage(msg) : {};
  void studentPrompt;

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
    clarificationReason: msg.clarificationReason ?? null,
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

export function itemsOfSection(section: UIOutlineSection): UIOutlinePoint[] {
  const points = Array.isArray(section.points) ? section.points : [];
  const items = Array.isArray(section.pointItems) ? section.pointItems : [];
  const count = Math.max(points.length, items.length);
  const result: UIOutlinePoint[] = [];
  for (let i = 0; i < count; i += 1) {
    const item = items[i];
    const text = (points[i] ?? item?.text ?? '').trim();
    if (!text && !item) continue;
    result.push({
      ...(item || {}),
      id: String(item?.id || `${section.id}-${i + 1}`),
      text: text || String(item?.text || ''),
      kind: item?.kind === 'evidence' || item?.kind === 'note' ? item.kind : item?.kind || 'claim',
      source_chunk_id: item?.source_chunk_id,
    });
  }
  return result;
}

export function withSectionItems(
  section: UIOutlineSection,
  items: UIOutlinePoint[]
): UIOutlineSection {
  return {
    ...section,
    pointItems: items,
    points: items.map((item) => item.text),
  };
}

export const CLARIFICATION_REASON_LABEL: Record<string, string> = {
  OUTLINE_VERSION_CONFLICT: 'Dàn ý đã đổi phiên bản nên thao tác chưa được áp dụng.',
  OUTLINE_OP_AMBIGUOUS: 'Chưa rõ ý cần thêm/sửa/xóa. Hãy chọn ý trên canvas hoặc nêu rõ vị trí.',
  OUTLINE_OP_INVALID: 'Thao tác dàn ý chưa hợp lệ nên chưa được áp dụng.',
};

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
    const items = itemsOfSection(sec);
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
    { id: 'intro', title: 'I. Mở bài — Đặt vấn đề', points: [], pointItems: [] },
    { id: 'body', title: 'II. Thân bài — Triển khai luận điểm', points: [], pointItems: [] },
    { id: 'conclusion', title: 'III. Kết bài — Đánh giá & Thông điệp', points: [], pointItems: [] },
  ],
  thesis: undefined,
  arguments: [],
  counterArguments: [],
};
