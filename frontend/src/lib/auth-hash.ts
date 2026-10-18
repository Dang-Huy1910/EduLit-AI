import { authClient } from './auth-client';

/** Survives React Strict Mode remount after the fragment is stripped. */
let cachedToken: { value: string; at: number } | null = null;
const CACHE_MS = 30_000;

const inflightVerify = new Map<string, Promise<{ message: string }>>();

export function consumeAuthTokenFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  const rawHash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  const fromHash = new URLSearchParams(rawHash).get('token');
  const fromQuery = new URLSearchParams(window.location.search).get('token');
  const token = fromHash || fromQuery;
  if (token) {
    cachedToken = { value: token, at: Date.now() };
    const url = new URL(window.location.href);
    url.hash = '';
    url.searchParams.delete('token');
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
    return token;
  }
  if (cachedToken && Date.now() - cachedToken.at < CACHE_MS) {
    return cachedToken.value;
  }
  return null;
}

export function verifyEmailOnce(token: string): Promise<{ message: string }> {
  const existing = inflightVerify.get(token);
  if (existing) return existing;
  const pending = authClient.verifyEmail(token);
  inflightVerify.set(token, pending);
  pending.catch(() => {
    inflightVerify.delete(token);
  });
  return pending;
}
