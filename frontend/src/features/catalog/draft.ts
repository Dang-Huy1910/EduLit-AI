import type { AssignmentDraftState } from './types';

const LEGACY_KEY = 'edulit.assignmentDraft';

export function draftStorageKey(userId?: string, assignmentId?: string): string {
  return `edulit.assignmentDraft:${userId || 'anon'}:${assignmentId || 'new'}`;
}

function readKey(key: string): AssignmentDraftState {
  if (typeof window === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as AssignmentDraftState;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function loadAssignmentDraft(scope: { userId?: string; assignmentId?: string } = {}): AssignmentDraftState {
  const scoped = readKey(draftStorageKey(scope.userId, scope.assignmentId));
  if (Object.keys(scoped).length) return scoped;
  if (!scope.userId && (!scope.assignmentId || scope.assignmentId === 'new')) {
    return readKey(LEGACY_KEY);
  }
  return {};
}

export function saveAssignmentDraft(
  partial: AssignmentDraftState,
  scope: { userId?: string; assignmentId?: string } = {}
): AssignmentDraftState {
  const assignmentId = partial.assignmentId || scope.assignmentId;
  const next = { ...loadAssignmentDraft({ ...scope, assignmentId }), ...partial, assignmentId };
  if (typeof window !== 'undefined') {
    const key = draftStorageKey(scope.userId, assignmentId);
    sessionStorage.setItem(key, JSON.stringify(next));
    if (assignmentId && assignmentId !== 'new' && assignmentId !== scope.assignmentId) {
      sessionStorage.setItem(draftStorageKey(scope.userId, 'new'), JSON.stringify(next));
    }
  }
  return next;
}

export function clearAssignmentDraft(scope: { userId?: string; assignmentId?: string } = {}): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(draftStorageKey(scope.userId, scope.assignmentId));
  if (!scope.userId && (!scope.assignmentId || scope.assignmentId === 'new')) {
    sessionStorage.removeItem(LEGACY_KEY);
  }
}

export function pickPromptHref(draft: AssignmentDraftState = {}): string {
  const params = new URLSearchParams({ mode: 'pick-prompt' });
  if (draft.classroomId) params.set('classroomId', draft.classroomId);
  if (draft.assignmentId) params.set('assignmentId', draft.assignmentId);
  return `/materials?${params.toString()}`;
}

export function createAssignmentHref(promptId: string, draft: AssignmentDraftState = {}): string {
  const params = new URLSearchParams({ promptId });
  if (draft.classroomId) params.set('classroomId', draft.classroomId);
  if (draft.assignmentId) params.set('assignmentId', draft.assignmentId);
  return `/assignments/new?${params.toString()}`;
}

export function promptMissingLabels(missing: string[], labels: Record<string, string>): string {
  if (!missing.length) return '';
  return missing.map((item) => labels[item] || item).join(', ');
}
