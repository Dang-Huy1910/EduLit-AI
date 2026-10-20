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
}

export interface WritingProfileStats {
  analyzedCount: number;
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
    promptVersion: string;
    multipleSources: boolean;
  };
  updatedAt: string | null;
  refreshed: boolean;
  profile: WritingProfilePayload | null;
}
