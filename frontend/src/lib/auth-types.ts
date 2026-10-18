export type AuthRole = 'TEACHER' | 'STUDENT';

export interface PublicUser {
  id: string;
  loginId: string;
  email: string;
  displayName: string;
  role: AuthRole;
  emailVerified: boolean;
}

export interface AuthErrorBody {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
  };
}

export type AuthStatus = 'initializing' | 'authenticated' | 'unauthenticated' | 'error';

export interface SessionItem {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  persistent: boolean;
  isCurrent: boolean;
  userAgent?: string | null;
  ipAddress?: string | null;
}

export class AuthApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string>;
  readonly retryAfter?: number;

  constructor(
    status: number,
    code: string,
    message: string,
    fields?: Record<string, string>,
    retryAfter?: number
  ) {
    super(message);
    this.name = 'AuthApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.retryAfter = retryAfter;
  }
}
