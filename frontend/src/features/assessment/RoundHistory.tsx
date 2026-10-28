import { formatScore } from './labels';
import { roundLabel, roundVisibilityLabel, sortRounds } from './revision';
import type { PublishedRound } from './types';

export default function RoundHistory({ rounds }: { rounds: PublishedRound[] }) {
  const ordered = sortRounds(rounds);
  if (ordered.length === 0) return null;
  return <section aria-label="Lịch sử bản" className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-4 space-y-3">
    <h2 className="text-sm font-semibold text-on-surface">Lịch sử bản</h2>
    <ul className="space-y-2">
      {ordered.map((round) => <li key={`${round.round}-${round.resultId || round.status}`} className="rounded-lg border border-outline-variant/30 p-3 text-sm space-y-1">
        <p className="font-semibold">{roundLabel(round.round)}</p>
        <p>{roundVisibilityLabel(round.visibleToStudent)}</p>
        <p>Điểm: {formatScore(round.totalScore)}{round.maxScore != null ? ` / ${formatScore(round.maxScore)}` : ''}</p>
        <p className="text-on-surface-variant">{round.publishedAt ? `Công bố ${new Date(round.publishedAt).toLocaleString('vi-VN')}` : 'Chưa công bố'}</p>
      </li>)}
    </ul>
  </section>;
}
