import { getApiBaseUrl } from '../data-mode';
import { ApiError, type ApiErrorBody } from './types';

type AuthBridge = {
  generation: () => number;
  onUnauthorized: () => void;
};

let authBridge: AuthBridge = {
  generation: () => 0,
  onUnauthorized: () => {},
};

export function setApiAuthBridge(bridge: AuthBridge): void {
  authBridge = bridge;
}

export type ApiRequestOptions = {
  method?: string;
  body?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
};

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const generation = authBridge.generation();
  const method = options.method ?? 'GET';
  const controller = new AbortController();
  const timer =
    options.timeoutMs && options.timeoutMs > 0
      ? setTimeout(() => controller.abort(), options.timeoutMs)
      : undefined;
  if (options.signal) {
    if (options.signal.aborted) {
      controller.abort();
    } else {
      options.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  const headers: Record<string, string> = {};
  let body: string | undefined;
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      method,
      headers,
      body,
      credentials: 'include',
      signal: controller.signal,
    });
  } catch (error) {
    if (timer) clearTimeout(timer);
    if (isAbortError(error)) {
      throw new ApiError(0, 'NETWORK_TIMEOUT', 'Yêu cầu quá thời gian chờ. Em có thể thử gửi lại.', true);
    }
    throw new ApiError(0, 'NETWORK', 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.', true);
  }
  if (timer) clearTimeout(timer);

  if (authBridge.generation() !== generation) {
    throw new ApiError(0, 'STALE', 'Phiên làm việc đã đổi, bỏ qua kết quả cũ.');
  }

  const json = await readJson(response);
  if (response.status === 401) {
    authBridge.onUnauthorized();
    throw toApiError(response.status, json, false);
  }
  if (!response.ok) {
    throw toApiError(response.status, json, isRetryableStatus(response.status));
  }
  return json as T;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 503 || status === 504;
}

function toApiError(status: number, json: unknown, retryable: boolean): ApiError {
  if (json && typeof json === 'object' && 'error' in json) {
    const error = (json as ApiErrorBody).error;
    if (error?.code && error?.message) {
      return new ApiError(status, error.code, error.message, retryable);
    }
  }
  return new ApiError(status, 'HTTP_ERROR', 'Máy chủ trả lỗi. Vui lòng thử lại.', retryable);
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: string }).name === 'AbortError';
}
