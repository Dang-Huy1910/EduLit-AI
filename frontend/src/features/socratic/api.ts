/**
 * Socratic API Client
 * Handles all HTTP communication with the Socratic backend
 */

import type {
  CreateSessionRequest,
  CreateSessionResponse,
  MessageRequest,
  MessageResponse,
  MessagesListResponse,
  OutlineResponse,
  SessionResponse,
  UpdateOutlineRequest,
  ReviewOutlineRequest,
  FindSessionResponse,
  OutlineInitResponse,
} from './types';

const API_BASE = '/api/socratic-sessions';

// Well-known API Error codes from backend
export const ApiErrorCode = {
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  AUTH_INVALID: 'AUTH_INVALID',
  FORBIDDEN: 'FORBIDDEN',
  STUDENT_REQUIRED: 'STUDENT_REQUIRED',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  OUTLINE_VERSION_CONFLICT: 'OUTLINE_VERSION_CONFLICT',
  TURN_IN_PROGRESS: 'TURN_IN_PROGRESS',
  OUTLINE_NOT_CURRENT: 'OUTLINE_NOT_CURRENT',
  OUTLINE_SUPERSEDED: 'OUTLINE_SUPERSEDED',
  OUTLINE_INIT_IN_PROGRESS: 'OUTLINE_INIT_IN_PROGRESS',
  ASSIGNMENT_CLOSED: 'ASSIGNMENT_CLOSED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  AI_UNAVAILABLE: 'AI_UNAVAILABLE',
  AI_INVALID_OUTPUT: 'AI_INVALID_OUTPUT',
  VALIDATION: 'VALIDATION',
  RATE_LIMIT: 'RATE_LIMIT',
  AUTH_RATE_LIMIT: 'AUTH_RATE_LIMIT',
  NETWORK: 'NETWORK',
  INTERNAL: 'INTERNAL',
} as const;

export type ApiErrorCode = typeof ApiErrorCode[keyof typeof ApiErrorCode] | string;

const STUDENT_ERROR_MESSAGES: Record<string, string> = {
  AI_INVALID_OUTPUT:
    'Hệ thống chưa soạn được dàn ý hợp lệ từ ngữ liệu lần này. Em bấm Thử lại; đề và ngữ liệu đã có sẵn, không cần nhập lại.',
  AI_UNAVAILABLE:
    'Trợ lý đang bận hoặc gián đoạn. Em bấm Thử lại sau một lát. Đề và ngữ liệu vẫn còn, không cần nhập lại.',
  SERVICE_UNAVAILABLE:
    'Trợ lý đang bận hoặc gián đoạn. Em bấm Thử lại sau một lát. Đề và ngữ liệu vẫn còn, không cần nhập lại.',
  AI_TIMEOUT:
    'Trợ lý phản hồi chậm. Em bấm Thử lại nhé; không cần nhập lại đề hay ngữ liệu.',
  OUTLINE_INIT_IN_PROGRESS: 'Đang soạn dàn ý gợi ý. Em chờ một chút rồi thử lại nếu chưa thấy kết quả.',
};

export function socraticStudentMessage(code: string | null | undefined, fallback?: string): string {
  if (code && STUDENT_ERROR_MESSAGES[code]) {
    return STUDENT_ERROR_MESSAGES[code];
  }
  if (fallback && fallback.trim()) {
    return fallback;
  }
  return 'Chưa tạo được dàn ý gợi ý lần này. Em bấm Thử lại; đề, ngữ liệu và rubric vẫn còn trên bài tập.';
}

export class SocraticApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly fields?: Record<string, string>;
  public readonly retryAfter?: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    fields?: Record<string, string>,
    retryAfter?: number,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'SocraticApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.retryAfter = retryAfter;
    this.details = details;
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorData: Record<string, unknown> | null = null;
    try {
      const parsed: unknown = await response.json();
      if (parsed && typeof parsed === 'object') errorData = parsed as Record<string, unknown>;
    } catch {
      // non-JSON response body
    }

    // Backend error contract: { error: { code: string, message: string, fields?: Record<string, string> } }
    const nested = errorData?.error;
    const errorObj =
      nested && typeof nested === 'object' ? (nested as Record<string, unknown>) : errorData || {};

    let code = typeof errorObj.code === 'string' ? errorObj.code : '';
    if (!code) {
      switch (response.status) {
        case 401:
          code = ApiErrorCode.AUTH_INVALID;
          break;
        case 403:
          code = ApiErrorCode.FORBIDDEN;
          break;
        case 404:
          code = ApiErrorCode.NOT_FOUND;
          break;
        case 409:
          code = ApiErrorCode.CONFLICT;
          break;
        case 429:
          code = ApiErrorCode.RATE_LIMIT;
          break;
        case 502:
          code = ApiErrorCode.AI_INVALID_OUTPUT;
          break;
        case 503:
          code = ApiErrorCode.SERVICE_UNAVAILABLE;
          break;
        default:
          code = ApiErrorCode.INTERNAL;
          break;
      }
    }

    const message =
      (typeof errorObj.message === 'string' && errorObj.message) ||
      (typeof errorObj.detail === 'string' && errorObj.detail) ||
      response.statusText ||
      'Đã xảy ra lỗi khi giao tiếp với máy chủ.';

    const rawFields = errorObj.fields;
    const fields =
      rawFields && typeof rawFields === 'object' && !Array.isArray(rawFields)
        ? (rawFields as Record<string, string>)
        : undefined;
    const retryAfterHeader = response.headers.get('Retry-After');
    const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;

    throw new SocraticApiError(
      response.status,
      code,
      message,
      fields,
      Number.isFinite(retryAfter) ? retryAfter : undefined,
      errorData ?? undefined
    );
  }

  return response.json();
}

async function safeFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    if (err instanceof SocraticApiError) {
      throw err;
    }
    throw new SocraticApiError(
      0,
      ApiErrorCode.NETWORK,
      'Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng và thử lại.'
    );
  }
}

function getHeaders(includeCsrf: boolean = false): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (includeCsrf) {
    headers['X-Edulit-CSRF'] = '1';
  }

  return headers;
}

/**
 * Find existing session for an assignment, or return None if not found
 */
export async function findSessionByAssignment(
  assignmentCode: string
): Promise<FindSessionResponse> {
  const params = new URLSearchParams({ assignmentCode });
  const response = await safeFetch(`${API_BASE}/by-assignment?${params}`, {
    method: 'GET',
    headers: getHeaders(false),
    credentials: 'include',
  });

  return handleResponse<FindSessionResponse>(response);
}

/**
 * Create a new Socratic session for an assignment
 */
export async function createSession(
  assignmentCode: string,
  includeCsrf: boolean = true
): Promise<CreateSessionResponse> {
  const body: CreateSessionRequest = { assignmentCode };

  const response = await safeFetch(API_BASE, {
    method: 'POST',
    headers: getHeaders(includeCsrf),
    credentials: 'include',
    body: JSON.stringify(body),
  });

  return handleResponse<CreateSessionResponse>(response);
}

/**
 * List all Socratic sessions for the current student
 */
export async function listSessions(): Promise<SessionResponse[]> {
  const response = await safeFetch(API_BASE, {
    method: 'GET',
    headers: getHeaders(false),
    credentials: 'include',
  });

  return handleResponse<SessionResponse[]>(response);
}

/**
 * Get a specific Socratic session by ID
 */
export async function getSession(sessionId: string): Promise<SessionResponse> {
  const response = await safeFetch(`${API_BASE}/${sessionId}`, {
    method: 'GET',
    headers: getHeaders(false),
    credentials: 'include',
  });

  return handleResponse<SessionResponse>(response);
}

/**
 * Get messages for a session with pagination
 */
export async function getMessages(
  sessionId: string,
  limit: number = 50,
  beforeTurn: number | null = null
): Promise<MessagesListResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (beforeTurn !== null) {
    params.set('beforeTurn', String(beforeTurn));
  }

  const response = await safeFetch(`${API_BASE}/${sessionId}/messages?${params}`, {
    method: 'GET',
    headers: getHeaders(false),
    credentials: 'include',
  });

  return handleResponse<MessagesListResponse>(response);
}

/**
 * Get the current outline for a session
 */
export async function getOutline(sessionId: string): Promise<OutlineResponse> {
  const response = await safeFetch(`${API_BASE}/${sessionId}/outline`, {
    method: 'GET',
    headers: getHeaders(false),
    credentials: 'include',
  });

  return handleResponse<OutlineResponse>(response);
}

/**
 * Send a message to the Socratic session
 */
export async function initOutline(
  sessionId: string,
  retry: boolean = false
): Promise<OutlineInitResponse> {
  const params = retry ? '?retry=true' : '';
  const response = await safeFetch(`${API_BASE}/${sessionId}/outline-init${params}`, {
    method: 'POST',
    headers: getHeaders(true),
    credentials: 'include',
  });
  return handleResponse<OutlineInitResponse>(response);
}

export async function getOutlineInit(sessionId: string): Promise<OutlineInitResponse> {
  const response = await safeFetch(`${API_BASE}/${sessionId}/outline-init`, {
    method: 'GET',
    headers: getHeaders(false),
    credentials: 'include',
  });
  return handleResponse<OutlineInitResponse>(response);
}

export async function sendMessage(
  sessionId: string,
  content: string,
  idempotencyKey?: string,
  extras?: {
    selectedPointId?: string;
    selectedSectionId?: string;
    expectedOutlineVersion?: number;
  }
): Promise<MessageResponse> {
  const body: MessageRequest = {
    content,
    selectedPointId: extras?.selectedPointId,
    selectedSectionId: extras?.selectedSectionId,
    expectedOutlineVersion: extras?.expectedOutlineVersion,
  };

  const headers = getHeaders(true) as Record<string, string>;
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }

  const response = await safeFetch(`${API_BASE}/${sessionId}/messages`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify(body),
  });

  return handleResponse<MessageResponse>(response);
}

/**
 * Update the outline for a session
 */
export async function updateOutline(
  sessionId: string,
  content: UpdateOutlineRequest['content'],
  expectedVersion: number
): Promise<OutlineResponse> {
  const body: UpdateOutlineRequest = {
    content,
    expectedVersion,
  };

  const response = await safeFetch(`${API_BASE}/${sessionId}/outline`, {
    method: 'PUT',
    headers: getHeaders(true),
    credentials: 'include',
    body: JSON.stringify(body),
  });

  return handleResponse<OutlineResponse>(response);
}

/**
 * Request a review of a specific outline revision
 */
export async function reviewOutline(
  sessionId: string,
  revisionId: string
): Promise<OutlineResponse> {
  const body: ReviewOutlineRequest = { revisionId };

  const response = await safeFetch(`${API_BASE}/${sessionId}/review`, {
    method: 'POST',
    headers: getHeaders(true),
    credentials: 'include',
    body: JSON.stringify(body),
  });

  return handleResponse<OutlineResponse>(response);
}
