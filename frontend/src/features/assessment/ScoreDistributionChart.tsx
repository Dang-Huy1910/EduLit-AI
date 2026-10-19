'use client';

import React from 'react';
import type { ScoreBin, StatsMode } from './types';
import { formatPercent, modeShort } from './labels';

interface ScoreDistributionChartProps {
  bins: ScoreBin[];
  scoredCount: number;
  mode: StatsMode | string | undefined;
}

export default function ScoreDistributionChart({ bins, scoredCount, mode }: ScoreDistributionChartProps) {
  const distMax = Math.max(...bins.map((item) => item.count), 0);
  return (
    <div className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant/30 shadow-sm space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
        <span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
          <span className="material-symbols-outlined text-sm">bar_chart</span>
          <span>Phổ điểm (thang 10 quy đổi)</span>
        </span>
        <span className="text-[11px] text-on-surface-variant font-medium">
          {modeShort(mode)} · n = {scoredCount} bài
        </span>
      </div>
      {scoredCount === 0 ? (
        <p className="text-xs text-on-surface-variant">Chưa có dữ liệu</p>
      ) : (
        <div className="space-y-3 pt-1">
          {bins.map((item) => {
            const percent = distMax ? (item.count / distMax) * 100 : 0;
            return (
              <div key={item.range} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono font-medium text-on-surface">{item.range}</span>
                  <span className="font-bold text-secondary font-mono">
                    {item.count} bài
                    {item.rate != null ? ` · ${formatPercent(item.rate)}` : ''}
                  </span>
                </div>
                <div className="w-full bg-surface-container-low h-2.5 rounded-full overflow-hidden">
                  <div className="bg-primary h-full rounded-full" style={{ width: `${percent}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
