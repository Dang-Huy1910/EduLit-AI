import type { DeadlineFields } from '../assignments/deadline';
import { formatScore, revisionBlockedLabel } from './labels';
import type { AssessmentEvaluation, AssessmentPayload } from './types';

export interface RevisionActionInput {
  maxRevisions?: number | null;
  revisionRound?: number | null;
  canStartRevision?: boolean;
  startRevisionBlockedReason?: string | null;
  currentPublishedRound?: number | null;
  revisionDueAt?: string | null;
  /** False while the rounds request has not succeeded, so a missing published round is not an open rewrite. */
  roundsKnown?: boolean;
}

export interface RevisionAction {
  kind: 'start' | 'continue' | 'blocked' | 'hidden';
  round: number;
  label: string;
  reason: string;
}

export interface RoundSnapshot {
  round: number;
  publishedAt?: string | null;
  isPublished?: boolean;
  totalScore?: number | null;
  scoreScale10?: number | null;
  evaluations?: {
    criterionId: string;
    criterionName?: string;
    awardedScore?: number | null;
    maxScore?: number | null;
  }[];
}

export interface CriterionDelta {
  criterionId: string;
  criterionName: string;
  previousScore: number | null;
  currentScore: number | null;
  delta: number | null;
  status: 'matched' | 'added' | 'removed';
}

export interface RoundComparison {
  previousRound: number;
  currentRound: number;
  totalScoreDelta: number | null;
  scoreScale10Delta: number | null;
  criteria: CriterionDelta[];
}

export type ScoreChangeKind = 'up' | 'down' | 'flat' | 'none';

export interface ScoreChange {
  kind: ScoreChangeKind;
  text: string;
  word: string;
}

export function roundLabel(round: number | null | undefined): string {
  const value = round && round > 0 ? Math.trunc(round) : 1;
  return `Bản ${value}`;
}

export function roundVisibilityLabel(visibleToStudent: boolean): string {
  return visibleToStudent ? 'Học sinh xem được' : 'Bản bị ẩn với học sinh';
}

export function sortRounds<T extends { round: number }>(rounds: readonly T[]): T[] {
  return [...rounds].sort((left, right) => left.round - right.round);
}

/** The selector opens on the round currently published for the student. */
export function defaultRound(rounds: readonly RoundSnapshot[], currentPublishedRound: number | null | undefined): number | null {
  const ordered = sortRounds(rounds);
  if (ordered.length === 0) return null;
  if (currentPublishedRound != null && ordered.some((item) => item.round === currentPublishedRound)) {
    return currentPublishedRound;
  }
  const published = [...ordered].reverse().find((item) => item.isPublished || item.publishedAt);
  return (published || ordered[ordered.length - 1]).round;
}

export function scoreDelta(previous: number | null | undefined, current: number | null | undefined): number | null {
  if (previous == null || current == null || Number.isNaN(previous) || Number.isNaN(current)) return null;
  return Math.round((current - previous) * 10000) / 10000;
}

export function scoreChange(delta: number | null | undefined): ScoreChange {
  if (delta == null || Number.isNaN(delta)) return { kind: 'none', text: '—', word: '' };
  const rounded = Math.round(delta * 10000) / 10000;
  if (rounded > 0) return { kind: 'up', text: `+${formatScore(rounded)}`, word: 'tăng' };
  if (rounded < 0) return { kind: 'down', text: `−${formatScore(Math.abs(rounded))}`, word: 'giảm' };
  return { kind: 'flat', text: formatScore(0), word: 'không đổi' };
}

export function criterionChangeWord(item: { status: string; delta: number | null }): string {
  if (item.status === 'added') return 'Chỉ có ở bản này';
  if (item.status === 'removed') return 'Chỉ có ở bản trước';
  return scoreChange(item.delta).word;
}

/** Same pairing as the backend: the immediately previous published round, matched by criterion id. */
export function compareRounds(previous: RoundSnapshot, current: RoundSnapshot): RoundComparison {
  const before = new Map((previous.evaluations || []).map((item) => [item.criterionId, item]));
  const after = new Map((current.evaluations || []).map((item) => [item.criterionId, item]));
  const ids: string[] = [];
  for (const id of before.keys()) if (!ids.includes(id)) ids.push(id);
  for (const id of after.keys()) if (!ids.includes(id)) ids.push(id);
  const criteria = ids.map((criterionId) => {
    const oldItem = before.get(criterionId);
    const newItem = after.get(criterionId);
    const status: CriterionDelta['status'] = oldItem && newItem ? 'matched' : newItem ? 'added' : 'removed';
    return {
      criterionId,
      criterionName: newItem?.criterionName || oldItem?.criterionName || criterionId,
      previousScore: oldItem ? oldItem.awardedScore ?? null : null,
      currentScore: newItem ? newItem.awardedScore ?? null : null,
      delta: oldItem && newItem ? scoreDelta(oldItem.awardedScore, newItem.awardedScore) : null,
      status,
    };
  });
  return {
    previousRound: previous.round,
    currentRound: current.round,
    totalScoreDelta: scoreDelta(previous.totalScore, current.totalScore),
    scoreScale10Delta: scoreDelta(previous.scoreScale10, current.scoreScale10),
    criteria,
  };
}

export function comparisonForRound(rounds: readonly RoundSnapshot[], selectedRound: number | null | undefined): RoundComparison | null {
  if (selectedRound == null) return null;
  const current = rounds.find((item) => item.round === selectedRound);
  const previous = rounds.find((item) => item.round === selectedRound - 1 && item.publishedAt);
  if (!current || !previous) return null;
  return compareRounds(previous, current);
}

export function revisionAction(input: RevisionActionInput): RevisionAction {
  const round = input.revisionRound && input.revisionRound > 0 ? input.revisionRound : 1;
  const published = input.currentPublishedRound ?? null;
  const openRewrite = input.roundsKnown !== false && round > 1 && (published == null || round > published);
  if (input.canStartRevision) {
    const next = round + 1;
    return { kind: 'start', round: next, label: `Viết lại bản ${next}`, reason: '' };
  }
  if (openRewrite) {
    const code = input.startRevisionBlockedReason;
    const reason = code === 'REVISION_CLOSED' || code === 'CLASSROOM_READ_ONLY' ? revisionBlockedLabel(code) : '';
    return { kind: 'continue', round, label: `Tiếp tục bản ${round}`, reason };
  }
  if ((input.maxRevisions ?? 0) <= 0 && round <= 1) {
    return { kind: 'hidden', round, label: '', reason: '' };
  }
  const reason = revisionBlockedLabel(input.startRevisionBlockedReason);
  if (!reason) return { kind: 'hidden', round, label: '', reason: '' };
  return { kind: 'blocked', round, label: '', reason };
}

/** Round 1 keeps the submission deadline. A rewrite uses only its own due date. */
export function revisionDeadlineFields(fields: DeadlineFields & { revisionRound?: number | null; revisionDueAt?: string | null }): DeadlineFields {
  if ((fields.revisionRound ?? 1) <= 1) {
    return {
      dueAt: fields.dueAt,
      effectiveDueAt: fields.effectiveDueAt,
      latePolicy: fields.latePolicy,
      hasExtension: fields.hasExtension,
      isClosed: fields.isClosed,
      isLate: fields.isLate,
    };
  }
  const due = fields.revisionDueAt ?? null;
  return {
    dueAt: due,
    effectiveDueAt: due,
    latePolicy: 'CLOSE_AT_DUE',
    hasExtension: false,
    isClosed: Boolean(fields.isClosed),
    isLate: false,
  };
}

export function revisionScoreTrail(row: {
  revisionRound?: number | null;
  publishedRound?: number | null;
  firstPublishedScore?: number | null;
  score?: number | null;
  publishedScore?: number | null;
}): string {
  const attemptRound = row.revisionRound ?? 1;
  const publishedRound = row.publishedRound ?? 1;
  if (attemptRound <= 1 && publishedRound <= 1) return '';
  if (row.firstPublishedScore == null) return '';
  const current = row.publishedScore ?? row.score;
  if (current == null) return '';
  return `Bản 1: ${formatScore(row.firstPublishedScore)} → hiện tại: ${formatScore(current)}`;
}

export function printRoundCopy(round: number | null | undefined, firstScore: number | null | undefined): { roundLine: string; previousLine: string | null } {
  const value = round && round > 0 ? Math.trunc(round) : 1;
  return {
    roundLine: `Bản ${value}`,
    previousLine: value > 1 && firstScore != null ? `${formatScore(firstScore)} điểm` : null,
  };
}

export function roundAsAssessment(round: {
  totalScore?: number | null;
  maxScore?: number | null;
  scoreStep?: number | null;
  scoreScale10?: number | null;
  overallComment?: string;
  improvementGuidance?: string[];
  evaluations?: AssessmentEvaluation[];
}): AssessmentPayload {
  return {
    evaluations: round.evaluations || [],
    overallComment: round.overallComment || '',
    improvementGuidance: round.improvementGuidance || [],
    totalScore: round.totalScore ?? Number.NaN,
    maxScore: round.maxScore ?? Number.NaN,
    scoreStep: round.scoreStep ?? 0.25,
    scoreScale10: round.scoreScale10 ?? Number.NaN,
  };
}
