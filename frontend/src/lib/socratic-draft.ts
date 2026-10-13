import type { ApiOutline } from './api/types';

export type PendingTurn = {
  requestId: string;
  message: string;
  expectedLastSequence: number;
};

export type SocraticDraft = {
  outline: ApiOutline;
  outlineRevision: number;
  dirty: boolean;
  inputMessage: string;
  pending: PendingTurn | null;
};

const DRAFT_PREFIX = 'edulit-socratic-draft:';

function keyFor(userId: string, sessionId: string): string {
  return `${DRAFT_PREFIX}${userId}:${sessionId}`;
}

export function loadSocraticDraft(userId: string, sessionId: string): SocraticDraft | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = sessionStorage.getItem(keyFor(userId, sessionId));
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as SocraticDraft;
  } catch {
    return null;
  }
}

export function saveSocraticDraft(userId: string, sessionId: string, draft: SocraticDraft): void {
  if (typeof window === 'undefined') {
    return;
  }
  sessionStorage.setItem(keyFor(userId, sessionId), JSON.stringify(draft));
}

export function clearSocraticDraft(userId: string, sessionId: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  sessionStorage.removeItem(keyFor(userId, sessionId));
}

export function clearSocraticLocalState(userId?: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  const keys: string[] = [];
  for (let i = 0; i < sessionStorage.length; i += 1) {
    const key = sessionStorage.key(i);
    if (!key) continue;
    if (key.startsWith(DRAFT_PREFIX) && (!userId || key.startsWith(`${DRAFT_PREFIX}${userId}:`))) {
      keys.push(key);
    }
  }
  keys.forEach((key) => sessionStorage.removeItem(key));
}
