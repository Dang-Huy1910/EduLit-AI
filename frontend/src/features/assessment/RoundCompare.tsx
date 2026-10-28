import { formatScore } from './labels';
import { criterionChangeWord, roundLabel, scoreChange, type ScoreChangeKind } from './revision';
import type { RoundComparisonView } from './types';

function changeClass(kind: ScoreChangeKind): string {
  if (kind === 'up') return 'text-tertiary';
  if (kind === 'down') return 'text-error';
  return 'text-on-surface-variant';
}

function ChangeText({ delta }: { delta: number | null }) {
  const change = scoreChange(delta);
  return <span className={`font-semibold ${changeClass(change.kind)}`}>{change.text}{change.word ? ` ${change.word}` : ''}</span>;
}

export default function RoundCompare({ comparison }: { comparison: RoundComparisonView }) {
  const total = scoreChange(comparison.totalScoreDelta);
  return <section aria-label="So với bản trước" className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-4 space-y-3">
    <h2 className="text-sm font-semibold text-on-surface">So với bản trước</h2>
    <p className="text-sm">
      {roundLabel(comparison.previousRound)} sang {roundLabel(comparison.currentRound)}. Tổng điểm <ChangeText delta={comparison.totalScoreDelta} />
      {total.kind !== 'none' && <span className="text-on-surface-variant"> · thang 10 </span>}
      {total.kind !== 'none' && <ChangeText delta={comparison.scoreScale10Delta} />}
    </p>
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-on-surface-variant">
        <tr><th className="py-1 pr-2">Tiêu chí</th><th className="py-1 pr-2">Bản trước</th><th className="py-1 pr-2">Bản này</th><th className="py-1">Chênh</th></tr>
      </thead>
      <tbody>
        {comparison.criteria.map((item) => {
          const change = scoreChange(item.delta);
          const word = criterionChangeWord(item);
          return <tr key={item.criterionId} className="border-t border-outline-variant/30">
            <td className="py-2 pr-2">{item.criterionName}</td>
            <td className="py-2 pr-2 tabular-nums">{formatScore(item.previousScore)}</td>
            <td className="py-2 pr-2 tabular-nums">{formatScore(item.currentScore)}</td>
            <td className={`py-2 font-semibold ${changeClass(item.status === 'matched' ? change.kind : 'none')}`}>
              {item.status === 'matched' ? `${change.text} ${word}` : word}
            </td>
          </tr>;
        })}
      </tbody>
    </table>
  </section>;
}
