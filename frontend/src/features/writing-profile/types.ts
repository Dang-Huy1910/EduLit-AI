export type WritingProfileStatus = 'empty' | 'not_analyzed' | 'ready' | 'stale';
export type ObservationKind = 'STRENGTH' | 'WEAKNESS' | 'STYLE';
export type TraitLevel = 'INSUFFICIENT' | 'EMERGING' | 'CONSISTENT' | 'STRONG';
export type GenreKind = 'NLVH' | 'NLXH' | '';

export interface WritingProfileTrait {
  traitId: string;
  traitName: string;
  level: TraitLevel;
  levelLabel: string;
  note: string;
  evidenceCount: number;
  /** Papers that back this group; "stable"/"strong" need at least two. */
  sourceCount?: number;
}

/** One AI observation; every quote was verified against the published copy. */
export interface WritingProfileObservation {
  id: string;
  label: string;
  traitId: string;
  traitName: string;
  kind: ObservationKind;
  kindLabel: string;
  description: string;
  practiceTip: string;
  evidenceQuote: string;
  evidenceStart: number;
  evidenceEnd: number;
  pageIndex: number;
  sourceId: string;
  assignmentId: string;
  assignmentTitle: string;
  genre: GenreKind;
  genreLabel: string;
  publishedAt: string | null;
  publishedOn: string | null;
  resultId: string;
  /** Empty when the student no longer has access to the assignment. */
  linkHref: string;
}

export interface WritingProfileSource {
  sourceId: string;
  assignmentId: string;
  assignmentTitle: string;
  genre: GenreKind;
  genreLabel: string;
  publishedAt: string | null;
  publishedOn: string | null;
  publishedComment: string;
  publishedLabel: string;
  evidenceCount: number;
  resultId: string;
  linkable?: boolean;
}

export interface WritingProfileStats {
  analyzedCount: number;
  newCount?: number;
  evidenceCount: number;
  strengthCount: number;
  weaknessCount: number;
  styleCount: number;
  traitsWithEvidence: number;
  droppedCount: number;
  multipleSources: boolean;
}

export interface WritingProfilePayload {
  label: string;
  summary: string;
  insufficient: boolean;
  traits: WritingProfileTrait[];
  observations: WritingProfileObservation[];
  sources: WritingProfileSource[];
  stats: WritingProfileStats;
  notice: string | null;
}

/** One successful refresh, oldest first, for the progress view. */
export interface WritingProfileVersion {
  version: number;
  analyzedAt: string | null;
  sourceCount: number;
  newSourceCount: number;
  evidenceCount: number;
  traits: { traitId: string; level: TraitLevel; evidenceCount: number }[];
}

export interface WritingProfileResponse {
  status: WritingProfileStatus;
  notice: string | null;
  student: {
    id: string;
    displayName: string;
    loginId: string;
    className: string;
    classCode: string;
    academicYear: string;
  };
  sourceSummary: {
    eligibleCount: number;
    analyzedCount: number;
    /** Published papers the profile has not read yet. */
    pendingCount?: number;
    promptVersion: string;
    multipleSources: boolean;
  };
  updatedAt: string | null;
  refreshed: boolean;
  profile: WritingProfilePayload | null;
  history?: WritingProfileVersion[];
}
