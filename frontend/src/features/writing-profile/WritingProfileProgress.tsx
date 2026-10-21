'use client';

import { LEVEL_STEPS, formatDate, levelTrend } from './model';
import type { TraitLevel, WritingProfileTrait, WritingProfileVersion } from './types';

const MAX_COLUMNS = 6;

const LEVEL_TEXT: Record<TraitLevel, string> = {
  INSUFFICIENT: 'Chưa đủ dữ liệu',
  EMERGING: 'Bước đầu',
  CONSISTENT: 'Ổn định',
  STRONG: 'Nổi bật',
};

const TREND_STYLE = {
  up: { icon: 'trending_up', tone: 'text-tertiary', label: 'Tiến bộ' },
  down: { icon: 'trending_down', tone: 'text-amber-600', label: 'Giảm' },
  same: { icon: 'trending_flat', tone: 'text-outline', label: 'Giữ nguyên' },
  none: { icon: 'remove', tone: 'text-outline/70', label: 'Chưa đủ dữ liệu' },
} as const;

function LevelBars({ level }: { level: TraitLevel }) {
  const filled = LEVEL_STEPS[level] ?? 0;
  return (
    <span className="inline-flex items-end gap-0.5" title={LEVEL_TEXT[level]} aria-label={LEVEL_TEXT[level]}>
      {[1, 2, 3].map((step) => (
        <span
          key={step}
          className={`w-1.5 rounded-sm ${step <= filled ? 'bg-secondary' : 'bg-outline-variant/40'}`}
          style={{ height: `${4 + step * 3}px` }}
        />
      ))}
    </span>
  );
}

/** Levels of the eight groups across the last refreshes, oldest to newest. */
export default function WritingProfileProgress({
  history,
  traits,
}: {
  history: WritingProfileVersion[];
  traits: WritingProfileTrait[];
}) {
  if (history.length === 0) return null;
  const columns = history.slice(-MAX_COLUMNS);

  return (
    <div className="glass-panel p-5 sm:p-6 rounded-2xl shadow-xs space-y-4">
      <div>
        <h2 className="text-sm sm:text-base font-bold font-merriweather text-on-surface">Tiến bộ theo thời gian</h2>
        <p className="text-xs text-on-surface-variant">
          Mỗi cột là một lần cập nhật hồ sơ. Mức độ chỉ ghi nhận khi có câu trích làm minh chứng.
        </p>
      </div>

      {history.length === 1 ? (
        <p className="text-xs text-on-surface-variant p-3 rounded-xl bg-surface-container-low/50 border border-outline-variant/20">
          Đây là lần tổng hợp đầu tiên. Khi có thêm bài được công bố và hồ sơ được cập nhật, bảng này sẽ cho thấy
          từng nhóm diễn đạt thay đổi ra sao.
        </p>
      ) : (
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full min-w-[520px] text-xs">
            <thead>
              <tr className="text-[11px] text-on-surface-variant">
                <th className="text-left font-semibold py-2 pr-3">Nhóm diễn đạt</th>
                {columns.map((item) => (
                  <th key={item.version} className="font-semibold py-2 px-2 text-center whitespace-nowrap">
                    <span className="block">{formatDate(item.analyzedAt) || `Lần ${item.version}`}</span>
                    <span className="block font-normal text-outline">
                      {item.sourceCount} bài{item.newSourceCount ? ` · +${item.newSourceCount}` : ''}
                    </span>
                  </th>
                ))}
                <th className="font-semibold py-2 pl-2 text-right">Xu hướng</th>
              </tr>
            </thead>
            <tbody>
              {traits.map((trait) => {
                const levels = columns.map(
                  (item) => item.traits.find((entry) => entry.traitId === trait.traitId)?.level ?? 'INSUFFICIENT'
                );
                const trend = TREND_STYLE[levelTrend(levels)];
                return (
                  <tr key={trait.traitId} className="border-t border-outline-variant/20">
                    <td className="py-2 pr-3 font-medium text-on-surface">{trait.traitName}</td>
                    {levels.map((level, index) => (
                      <td key={columns[index].version} className="py-2 px-2 text-center">
                        <LevelBars level={level} />
                      </td>
                    ))}
                    <td className={`py-2 pl-2 text-right ${trend.tone}`}>
                      <span className="inline-flex items-center gap-0.5 font-semibold">
                        <span className="material-symbols-outlined text-sm" aria-hidden="true">{trend.icon}</span>
                        {trend.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
