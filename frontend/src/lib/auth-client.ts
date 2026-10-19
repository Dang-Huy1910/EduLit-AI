import { AuthApiError, PublicUser, SessionItem } from './auth-types';

const API_ROOT = (process.env.NEXT_PUBLIC_API_BASE_URL || '').replace(/\/$/, '');

let requestGeneration = 0;

export function invalidateAuthRequests(): void {
  requestGeneration += 1;
}

function authUrl(path: string): string {
  return `${API_ROOT}/api/auth${path}`;
}

function mutationHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Edulit-CSRF': '1',
  };
}

async function parseError(response: Response): Promise<AuthApiError> {
  let code = 'INTERNAL';
  let message = 'Hệ thống gặp sự cố. Vui lòng thử lại sau.';
  let fields: Record<string, string> | undefined;
  try {
    const data = (await response.json()) as { error?: { code?: string; message?: string; fields?: Record<string, string> } };
    if (data?.error?.code) code = data.error.code;
    if (data?.error?.message) message = data.error.message;
    fields = data?.error?.fields;
  } catch {
    /* keep defaults; never echo body */
  }
  const retryAfterHeader = response.headers.get('Retry-After');
  const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : undefined;
  return new AuthApiError(response.status, code, message, fields, Number.isFinite(retryAfter) ? retryAfter : undefined);
}

async function request<T>(
  path: string,
  init: RequestInit,
  generation?: number
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(authUrl(path), {
      ...init,
      credentials: 'include',
    });
  } catch {
    throw new AuthApiError(0, 'NETWORK', 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.');
  }
  if (generation !== undefined && generation !== requestGeneration) {
    throw new AuthApiError(0, 'STALE', 'Yêu cầu đã hết hiệu lực.');
  }
  if (!response.ok) {
    throw await parseError(response);
  }
  if (response.status === 204) {
    return {} as T;
  }
  const text = await response.text();
  if (!text) {
    return {} as T;
  }
  return JSON.parse(text) as T;
}

export const authClient = {
  register(body: { loginId: string; email: string; displayName: string; password: string }) {
    return request<{ status: string; message: string; user: PublicUser }>('/register', {
      method: 'POST',
      headers: mutationHeaders(),
      body: JSON.stringify(body),
    });
  },
  verifyEmail(token: string) {
    return request<{ message: string }>('/verify-email', {
      method: 'POST',
      headers: mutationHeaders(),
      body: JSON.stringify({ token }),
    });
  },
  resendVerification(email: string) {
    return request<{ message: string }>('/resend-verification', {
      method: 'POST',
      headers: mutationHeaders(),
      body: JSON.stringify({ email }),
    });
  },
  login(body: { loginId: string; password: string; rememberMe: boolean }) {
    return request<{ user: PublicUser }>('/login', {
      method: 'POST',
      headers: mutationHeaders(),
      body: JSON.stringify(body),
    });
  },
  async me(): Promise<PublicUser> {
    const generation = requestGeneration;
    return request<PublicUser>('/me', { method: 'GET', headers: { Accept: 'application/json' } }, generation);
  },
  logout() {
    invalidateAuthRequests();
    return request<Record<string, never>>('/logout', {
      method: 'POST',
      headers: mutationHeaders(),
      body: '{}',
    });
  },
  forgotPassword(email: string) {
    return request<{ message: string }>('/forgot-password', {
      method: 'POST',
      headers: mutationHeaders(),
      body: JSON.stringify({ email }),
    });
  },
  resetPassword(token: string, newPassword: string) {
    return request<{ message: string }>('/reset-password', {
      method: 'POST',
      headers: mutationHeaders(),
      body: JSON.stringify({ token, newPassword }),
    });
  },
  changePassword(currentPassword: string, newPassword: string) {
    return request<{ message: string }>('/change-password', {
      method: 'POST',
      headers: mutationHeaders(),
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },
  listSessions() {
    return request<{ sessions: SessionItem[] }>('/sessions', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
  },
  revokeSession(sessionId: string) {
    return request<Record<string, never>>(`/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: mutationHeaders(),
    });
  },
  logoutAll() {
    invalidateAuthRequests();
    return request<Record<string, never>>('/logout-all', {
      method: 'POST',
      headers: mutationHeaders(),
      body: '{}',
    });
  },
};

export function isSafeReturnTo(value: string | null): value is string {
  if (!value) return false;
  if (!value.startsWith('/')) return false;
  if (value.startsWith('//') || value.includes('://')) return false;
  if (value.includes('\\')) return false;
  return /^\/[A-Za-z0-9/_?=&%.\-]*$/.test(value);
}
