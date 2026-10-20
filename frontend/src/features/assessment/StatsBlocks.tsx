'use client';

import React from 'react';
import type { CriterionStat, StatsMode } from './types';
import { formatPercent, formatScore, modeShort } from './labels';

/** Single-series chart color: brand teal, stepped up to pass the chroma floor. */
export const CHART_COLOR = '#007a99';

function ratio(value: number, total: number): number {
  if (!total || total <= 0) return 0;
  return Math.max(0, Math.min(1, value / total));
}

export function ModeChip({ mode }: { mode: StatsMode | string | undefined }) {
  const provisional = mode === 'provisional';
  return (
    <span
      className={`inline-flex shrink-0 whitespace-nowrap items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
        provisional ? 'bg-amber-100 text-amber-900' : 'bg-surface-container text-on-surface-variant'
      }`}
    >
      <span className="material-symbols-outlined text-[13px]" aria-hidden="true">
        {provisional ? 'pending' : 'verified'}
      </span>
      {modeShort(mode)}
    </span>
  );
}

/** The one number the view leads with: the mean on a 0–10 scale, with its range. */
export function HeroScore({
  mean,
  min,
  max,
  count,
  mode,
}: {
  mean: number | null | undefined;
  min?: number | null;
  max?: number | null;
  count: number;
  mode: StatsMode | string | undefined;
}) {
  const hasMean = mean !== null && mean !== undefined;
  const hasRange = hasMean && min !== null && min !== undefined && max !== null && max !== undefined;
  const pct = (value: number) => `${Math.max(0, Math.min(10, value)) * 10}%`;
  return (
    <div className="glass-panel rounded-2xl p-5 shadow-xs flex flex-col justify-between gap-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-on-surface-variant">Điểm trung bình</span>
        <ModeChip mode={mode} />
      </div>
      {hasMean ? (
        <div>
          <p className="flex items-baseline gap-1.5">
            <span className="text-5xl font-semibold tracking-tight text-on-surface">{formatScore(mean)}</span>
            <span className="text-base font-medium text-on-surface-variant">/ 10</span>
          </p>
          {hasRange && (
            <div className="mt-4" aria-hidden="true">
              <div className="relative h-2 rounded-full" style={{ backgroundColor: `${CHART_COLOR}1f` }}>
                <div
                  className="absolute inset-y-0 rounded-full"
                  style={{ left: pct(min as number), width: `${(Math.max(0, (max as number) - (min as number)) / 10) * 100}%`, backgroundColor: `${CHART_COLOR}59` }}
                />
                <span
                  className="absolute top-1/2 w-3.5 h-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white"
                  style={{ left: pct(mean as number), backgroundColor: CHART_COLOR }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-[11px] text-outline tabular-nums">
                <span>0</span>
                <span>10</span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-2xl font-semibold text-on-surface-variant">Chưa có dữ liệu</p>
      )}
      <p className="text-xs text-on-surface-variant leading-relaxed">
        {hasRange ? (
          <>
            Thấp nhất <strong className="font-semibold text-on-surface">{formatScore(min)}</strong> · Cao nhất{' '}
            <strong className="font-semibold text-on-surface">{formatScore(max)}</strong> ·{' '}
          </>
        ) : null}
        Tính trên {count} bài {mode === 'provisional' ? '(gồm kết quả chưa công bố)' : '(chỉ kết quả đã công bố)'}
      </p>
    </div>
  );
}

/** A count against its total, with a meter so progress reads at a glance. */
export function StatTile({
  label,
  value,
  total,
  hint,
}: {
  label: string;
  value: number;
  total?: number;
  hint: string;
}) {
  const hasTotal = total !== undefined && total !== null;
  const share = hasTotal ? ratio(value, total as number) : 0;
  return (
    <div className="glass-panel rounded-2xl p-5 shadow-xs flex flex-col justify-between gap-3">
      <span className="text-sm font-medium text-on-surface-variant">{label}</span>
      <div>
        <p className="flex items-baseline gap-1.5">
          <span className="text-3xl font-semibold tracking-tight text-on-surface">{value}</span>
          {hasTotal && <span className="text-sm font-medium text-on-surface-variant">/ {total}</span>}
          {hasTotal && (
            <span className="ml-auto text-xs font-semibold text-on-surface-variant tabular-nums">
              {formatPercent(share)}
            </span>
          )}
        </p>
        {hasTotal && (
          <div
            className="mt-3 h-1.5 rounded-full overflow-hidden"
            style={{ backgroundColor: `${CHART_COLOR}1f` }}
            role="meter"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={value}
          >
            <div className="h-full rounded-full" style={{ width: `${share * 100}%`, backgroundColor: CHART_COLOR }} />
          </div>
        )}
      </div>
      <span className="text-xs text-on-surface-variant">{hint}</span>
    </div>
  );
}

export interface PipelineItem {
  label: string;
  count: number;
  icon: string;
  tone?: 'pending' | 'error';
}

/** Processing states as one quiet strip; zero counts are not shown. */
export function PipelineStrip({ items }: { items: PipelineItem[] }) {
  const active = items.filter((item) => item.count > 0);
  if (active.length === 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface-container-low/70 text-xs text-on-surface-variant">
        <span className="material-symbols-outlined text-base text-tertiary" aria-hidden="true">
          task_alt
        </span>
        Không có bài đang chờ xử lý hoặc bị lỗi.
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {active.map((item) => (
        <span
          key={item.label}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium ${
            item.tone === 'error' ? 'bg-error-container/50 text-on-error-container' : 'bg-surface-container text-on-surface'
          }`}
        >
          <span
            className={`material-symbols-outlined text-base ${item.tone === 'error' ? 'text-error' : 'text-on-surface-variant'}`}
            aria-hidden="true"
          >
            {item.icon}
          </span>
          {item.label}
          <strong className="font-semibold tabular-nums">{item.count}</strong>
        </span>
      ))}
    </div>
  );
}

/** The scoring formula sits behind "Cách tính"; the mode toggle already explains the mode. */
export function FormulaNote({
  mode,
  description,
}: {
  mode: StatsMode | string | undefined;
  description?: string | null;
}) {
  return (
    <div className="space-y-2">
      {description && (
        <details className="group text-xs text-on-surface-variant">
          <summary className="inline-flex items-center gap-1 cursor-pointer select-none font-medium hover:text-on-surface list-none [&::-webkit-details-marker]:hidden">
            <span className="material-symbols-outlined text-sm" aria-hidden="true">
              info
            </span>
            Cách tính điểm thống kê
            <span className="material-symbols-outlined text-sm transition-transform group-open:rotate-180" aria-hidden="true">
              expand_more
            </span>
          </summary>
          <p className="mt-2 max-w-3xl leading-relaxed pl-5">{description}</p>
        </details>
      )}
    </div>
  );
}

/** Mean achievement per rubric criterion; the weakest one is flagged. */
export function CriteriaBars({ criteria }: { criteria: CriterionStat[] }) {
  const rated = criteria.filter((item) => item.meanRate !== null && item.meanRate !== undefined);
  const weakest =
    rated.length > 1 ? rated.reduce((low, item) => ((item.meanRate as number) < (low.meanRate as number) ? item : low)) : null;
  const n = criteria.reduce((most, item) => Math.max(most, item.n || 0), 0);
  return (
    <div className="glass-panel p-5 sm:p-6 rounded-2xl shadow-xs space-y-5">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-on-surface">Kết quả theo tiêu chí</h3>
          <p className="text-xs text-on-surface-variant mt-0.5">Tỉ lệ điểm đạt trung bình so với điểm tối đa của từng tiêu chí</p>
        </div>
        {n > 0 && <span className="text-xs text-on-surface-variant shrink-0">{n} bài</span>}
      </div>
      {criteria.length === 0 ? (
        <p className="text-xs text-on-surface-variant">Chưa có dữ liệu</p>
      ) : (
        <ul className="space-y-4">
          {criteria.map((item) => {
            const rate = item.meanRate ?? 0;
            const isWeakest = weakest !== null && item === weakest;
            return (
              <li key={`${item.groupKey}-${item.criterionId}`} className="space-y-1.5">
                <div className="flex items-start justify-between gap-3 text-sm">
                  <span className="min-w-0 flex flex-wrap items-center gap-2">
                    <span className="font-medium text-on-surface">{item.criterionName}</span>
                    {isWeakest && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[11px] font-semibold">
                        <span className="material-symbols-outlined text-[13px]" aria-hidden="true">
                          flag
                        </span>
                        Cần chú ý nhất
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="font-semibold text-on-surface tabular-nums">{formatPercent(item.meanRate)}</span>
                    <span className="block text-[11px] text-on-surface-variant tabular-nums">
                      {formatScore(item.meanAwarded)} / {formatScore(item.meanMax)} điểm
                    </span>
                  </span>
                </div>
                <div
                  className="h-2 rounded-full overflow-hidden"
                  style={{ backgroundColor: `${CHART_COLOR}1f` }}
                  role="meter"
                  aria-label={item.criterionName}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(rate * 100)}
                >
                  <div className="h-full rounded-full" style={{ width: `${Math.min(1, rate) * 100}%`, backgroundColor: CHART_COLOR }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
