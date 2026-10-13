export type DataMode = 'mock' | 'api';

export function getDataMode(): DataMode {
  return process.env.NEXT_PUBLIC_DATA_MODE === 'api' ? 'api' : 'mock';
}

export function isApiMode(): boolean {
  return getDataMode() === 'api';
}

export function getApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  return (raw || 'http://localhost:4000/api').replace(/\/$/, '');
}

/** Backend file paths are `/api/files/:id`; API base already ends with `/api`. */
export function resolveApiAssetUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const origin = getApiBaseUrl().replace(/\/api$/, '');
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
}

export const CHAT_REQUEST_TIMEOUT_MS = 90_000;
