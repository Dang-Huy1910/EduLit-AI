'use client';

import React, { useMemo, useState } from 'react';
import type { ScoreBin, StatsMode } from './types';
import { formatPercent, formatScore } from './labels';
import { meanPosition, parseBins } from './score-bins';
import { CHART_COLOR, ModeChip } from './StatsBlocks';

interface ScoreDistributionChartProps {
  bins: ScoreBin[];
  scoredCount: number;
  mode: StatsMode | string | undefined;
  mean?: number | null;
}

const PLOT_HEIGHT = 156;
const COLUMN_WIDTH = 24;

export default function ScoreDistributionChart({ bins, scoredCount, mode, mean }: ScoreDistributionChartProps) {
  const [active, setActive] = useState<number | null>(null);
  const parsed = useMemo(() => parseBins(bins), [bins]);
  const maxCount = Math.max(...bins.map((item) => item.count), 0);
  const meanAt = meanPosition(parsed, mean);
  const rows = bins.map((bin, index) => ({
    label: parsed[index]?.label || bin.range,
    count: bin.count,
    rate: bin.rate ?? (scoredCount ? bin.count / scoredCount : null),
  }));
  const columns = { gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` };

  return (
    <div className="glass-panel p-5 sm:p-6 rounded-2xl shadow-xs flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-on-surface">Phổ điểm</h3>
          <p className="text-xs text-on-surface-variant mt-0.5">Số bài theo khoảng điểm, thang 10 · {scoredCount} bài</p>
        </div>
        <ModeChip mode={mode} />
      </div>

      {scoredCount === 0 || bins.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-10 text-center gap-2">
          <span className="material-symbols-outlined text-3xl text-outline-variant" aria-hidden="true">
            bar_chart
          </span>
          <p className="text-xs text-on-surface-variant">Chưa có bài nào được tính điểm.</p>
        </div>
      ) : (
        <>
          <div className="relative mt-6 pt-7" aria-hidden="true">
            {meanAt !== null && (
              <div className="absolute top-0 bottom-0 pointer-events-none z-10" style={{ left: `${meanAt * 100}%` }}>
                <span className="absolute top-0 -translate-x-1/2 whitespace-nowrap px-2 py-0.5 rounded-full bg-on-surface text-white text-[10px] font-semibold">
                  TB {formatScore(mean)}
                </span>
                <span className="absolute top-5 bottom-0 -translate-x-1/2 w-px bg-on-surface/70" />
              </div>
            )}
            <div className="grid border-b border-outline-variant/60" style={columns}>
              {rows.map((row, index) => {
                const height = maxCount ? Math.round((row.count / maxCount) * PLOT_HEIGHT) : 0;
                const shown = row.count > 0 ? Math.max(height, 3) : 0;
                const isActive = active === index;
                return (
                  <div
                    key={row.label}
                    className="relative flex flex-col items-center justify-end"
                    style={{ height: PLOT_HEIGHT + 24 }}
                    onMouseEnter={() => setActive(index)}
                    onMouseLeave={() => setActive((current) => (current === index ? null : current))}
                  >
                    {isActive && (
                      <span
                        className="absolute z-20 -translate-y-2 whitespace-nowrap px-2.5 py-1.5 rounded-lg bg-surface-container-lowest shadow-lg ring-1 ring-black/5 text-[11px] text-on-surface"
                        style={{ bottom: shown + 22 }}
                      >
                        <strong className="font-semibold">{row.label} điểm</strong> · {row.count} bài · {formatPercent(row.rate)}
                      </span>
                    )}
                    <span className="mb-1 text-xs font-semibold text-on-surface tabular-nums">{row.count}</span>
                    <span
                      className="block rounded-t-[4px] transition-opacity"
                      style={{
                        width: COLUMN_WIDTH,
                        height: shown,
                        backgroundColor: CHART_COLOR,
                        opacity: active === null || isActive ? 1 : 0.45,
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Axis labels double as keyboard targets for the same tooltip */}
          <div className="grid mt-2" style={columns}>
            {rows.map((row, index) => (
              <button
                key={row.label}
                type="button"
                onFocus={() => setActive(index)}
                onBlur={() => setActive(null)}
                onMouseEnter={() => setActive(index)}
                onMouseLeave={() => setActive(null)}
                aria-label={`${row.label} điểm: ${row.count} bài, ${formatPercent(row.rate)}`}
                className="text-center rounded-md cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/40"
              >
                <span className="block text-xs font-medium text-on-surface tabular-nums">{row.label}</span>
                <span className="block text-[11px] text-on-surface-variant tabular-nums">{formatPercent(row.rate)}</span>
              </button>
            ))}
          </div>

          <div className="pt-4">
            <div className="pt-3 border-t border-outline-variant/20 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-on-surface-variant">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-[3px]" style={{ backgroundColor: CHART_COLOR }} aria-hidden="true" />
                Số bài trong khoảng điểm
              </span>
              {meanAt !== null && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-px h-3 bg-on-surface/70" aria-hidden="true" />
                  Điểm trung bình {formatScore(mean)}
                </span>
              )}
            </div>
          </div>

          <table className="sr-only">
            <caption>Phổ điểm thang 10</caption>
            <thead>
              <tr>
                <th scope="col">Khoảng điểm</th>
                <th scope="col">Số bài</th>
                <th scope="col">Tỉ lệ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  <td>{row.count}</td>
                  <td>{formatPercent(row.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
