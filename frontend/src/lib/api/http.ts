import { AuthApiError } from '@/lib/auth-types';

const API_ROOT = (process.env.NEXT_PUBLIC_API_BASE_URL || '').replace(/\/$/, '');

export function apiUrl(path: string): string {
  return `${API_ROOT}${path.startsWith('/api') ? path : `/api${path}`}`;
}

export function mutationHeaders(): HeadersInit {
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
    const data = (await response.json()) as {
      error?: { code?: string; message?: string; fields?: Record<string, string> };
    };
    if (data?.error?.code) code = data.error.code;
    if (data?.error?.message) message = data.error.message;
    fields = data.error?.fields;
  } catch {
    /* keep defaults */
  }
  const retryAfterHeader = response.headers.get('Retry-After');
  const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : undefined;
  return new AuthApiError(
    response.status,
    code,
    message,
    fields,
    Number.isFinite(retryAfter) ? retryAfter : undefined
  );
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      ...init,
      credentials: 'include',
    });
  } catch {
    throw new AuthApiError(0, 'NETWORK', 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.');
  }
  if (!response.ok) {
    throw await parseError(response);
  }
  if (response.status === 204) {
    return {} as T;
  }
  const text = await response.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: 'GET', headers: { Accept: 'application/json' } });
}

export function apiSend<T>(path: string, method: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, {
    method,
    headers: mutationHeaders(),
    body: JSON.stringify(body ?? {}),
  });
}

export function apiUpload<T>(path: string, form: FormData): Promise<T> {
  return apiRequest<T>(path, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'X-Edulit-CSRF': '1',
    },
    body: form,
  });
}

function filenameFromDisposition(header: string | null): string {
  if (!header) return 'tai-lieu';
  const utf = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf?.[1]) {
    try {
      return decodeURIComponent(utf[1]);
    } catch {
      return utf[1];
    }
  }
  const ascii = /filename="([^"]+)"/i.exec(header);
  return ascii?.[1] || 'tai-lieu';
}

export async function apiBlob(path: string): Promise<{ blob: Blob; filename: string }> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), { method: 'GET', credentials: 'include' });
  } catch {
    throw new AuthApiError(0, 'NETWORK', 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.');
  }
  if (!response.ok) {
    throw await parseError(response);
  }
  return {
    blob: await response.blob(),
    filename: filenameFromDisposition(response.headers.get('Content-Disposition')),
  };
}
