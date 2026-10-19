import type { AssignmentDraftState } from './types';

const LEGACY_KEY = 'edulit.assignmentDraft';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isCatalogUuid(value: string | null | undefined): value is string {
  return Boolean(value && UUID_RE.test(value));
}

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
  const scopeId = scope.assignmentId || 'new';
  const assignmentId = isCatalogUuid(partial.assignmentId)
    ? partial.assignmentId
    : isCatalogUuid(scopeId)
      ? scopeId
      : scopeId === 'new'
        ? undefined
        : scopeId;
  const storageId = isCatalogUuid(assignmentId) ? assignmentId : scopeId;
  const previous = loadAssignmentDraft({ userId: scope.userId, assignmentId: storageId });
  const next: AssignmentDraftState = { ...previous, ...partial };
  if (storageId === 'new') {
    delete next.assignmentId;
  } else if (assignmentId) {
    next.assignmentId = assignmentId;
  }
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(draftStorageKey(scope.userId, storageId), JSON.stringify(next));
  }
  return next;
}

export function beginNewAssignmentDraft(
  partial: Pick<AssignmentDraftState, 'classroomId' | 'title' | 'extraInstructions' | 'dueAt'>,
  scope: { userId?: string } = {}
): AssignmentDraftState {
  const next: AssignmentDraftState = { ...partial };
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(draftStorageKey(scope.userId, 'new'), JSON.stringify(next));
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

export function catalogHref(
  opts: {
    mode?: string;
    classroomId?: string;
    assignmentId?: string;
    importId?: string;
    select?: string;
    kind?: string;
  } = {}
): string {
  const params = new URLSearchParams();
  if (opts.mode) params.set('mode', opts.mode);
  if (opts.classroomId) params.set('classroomId', opts.classroomId);
  if (isCatalogUuid(opts.assignmentId)) params.set('assignmentId', opts.assignmentId);
  if (isCatalogUuid(opts.importId)) params.set('importId', opts.importId);
  if (opts.select) params.set('select', opts.select);
  if (opts.kind) params.set('kind', opts.kind);
  const encoded = params.toString();
  return encoded ? `/materials?${encoded}` : '/materials';
}

export function pickPromptHref(draft: AssignmentDraftState = {}): string {
  return catalogHref({
    mode: 'pick-prompt',
    classroomId: draft.classroomId,
    assignmentId: draft.assignmentId,
  });
}

export function createAssignmentHref(promptId: string, draft: AssignmentDraftState = {}): string {
  const params = new URLSearchParams({ promptId });
  if (draft.classroomId) params.set('classroomId', draft.classroomId);
  if (isCatalogUuid(draft.assignmentId)) params.set('assignmentId', draft.assignmentId);
  return `/assignments/new?${params.toString()}`;
}

export function promptMissingLabels(missing: string[], labels: Record<string, string>): string {
  if (!missing.length) return '';
  return missing.map((item) => labels[item] || item).join(', ');
}
