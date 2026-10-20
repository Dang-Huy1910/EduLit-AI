import type {
  ObservationKind,
  TraitLevel,
  WritingProfileObservation,
  WritingProfileResponse,
} from './types';

export type GenreFilter = 'ALL' | 'NLVH' | 'NLXH';
export type KindFilter = 'ALL' | ObservationKind;

export interface ObservationFilters {
  genre: GenreFilter;
  kind: KindFilter;
  traitId: string;
  query: string;
}

export const DEFAULT_FILTERS: ObservationFilters = {
  genre: 'ALL',
  kind: 'ALL',
  traitId: 'ALL',
  query: '',
};

export const AI_LABEL = 'AI nhận xét';
export const PUBLISHED_LABEL = 'Nhận xét đã công bố';

/** Steps of the level meter; a level is a recognition, never a percentage. */
export const LEVEL_STEPS: Record<TraitLevel, number> = {
  INSUFFICIENT: 0,
  EMERGING: 1,
  CONSISTENT: 2,
  STRONG: 3,
};

export function filterObservations(
  observations: WritingProfileObservation[],
  filters: ObservationFilters
): WritingProfileObservation[] {
  const query = filters.query.trim().toLocaleLowerCase('vi');
  return observations.filter((item) => {
    if (filters.genre !== 'ALL' && item.genre !== filters.genre) return false;
    if (filters.kind !== 'ALL' && item.kind !== filters.kind) return false;
    if (filters.traitId !== 'ALL' && item.traitId !== filters.traitId) return false;
    if (!query) return true;
    return [item.description, item.evidenceQuote, item.traitName, item.assignmentTitle, item.practiceTip]
      .some((text) => (text || '').toLocaleLowerCase('vi').includes(query));
  });
}

export interface ProfileStats {
  analyzedCount: number;
  strengthCount: number;
  weaknessCount: number;
  styleCount: number;
  evidenceCount: number;
}

/** Counts come from what the backend returned, never from defaults. */
export function profileStats(data: WritingProfileResponse | null): ProfileStats {
  const observations = data?.profile?.observations ?? [];
  const count = (kind: ObservationKind) => observations.filter((item) => item.kind === kind).length;
  return {
    analyzedCount: data?.profile?.sources.length ?? 0,
    strengthCount: count('STRENGTH'),
    weaknessCount: count('WEAKNESS'),
    styleCount: count('STYLE'),
    evidenceCount: observations.length,
  };
}

export function initialsOf(name: string): string {
  // Skip tokens such as "(12A1)" so only real name words give initials.
  const words = name.trim().split(/\s+/).filter((word) => /^\p{L}/u.test(word));
  if (words.length === 0) return '?';
  const picked = words.length === 1 ? [words[0]] : [words[words.length - 2], words[words.length - 1]];
  return picked.map((word) => word.charAt(0).toLocaleUpperCase('vi')).join('');
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/** Only links to a real published result page built from backend ids. */
export function resultHref(assignmentId: string): string {
  return `/assignments/${encodeURIComponent(assignmentId)}/result`;
}

export type ProfileView =
  | 'loading'
  | 'error'
  | 'empty'
  | 'not_analyzed'
  | 'stale'
  | 'insufficient'
  | 'ready';

export function profileView(state: {
  loading: boolean;
  error: string;
  data: WritingProfileResponse | null;
}): ProfileView {
  if (state.loading) return 'loading';
  if (state.error || !state.data) return 'error';
  const { status, profile } = state.data;
  if (status !== 'ready') return status;
  if (!profile) return 'not_analyzed';
  return profile.observations.length === 0 ? 'insufficient' : 'ready';
}

/** Drops responses that belong to a previous account or an older request. */
export function createRequestGuard() {
  let generation = 0;
  return {
    bump: () => ++generation,
    current: () => generation,
    isCurrent: (token: number) => token === generation,
  };
}
