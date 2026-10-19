'use client';

import React, { useEffect, useRef } from 'react';
import type { InsightState, IssueStat, StatsMode } from './types';
import { formatPercent, insightStatusLabel, modeShort } from './labels';

interface InsightPanelProps {
  insight: InsightState | null;
  scoredCount: number;
  canAnalyze?: boolean;
  mode?: StatsMode | string;
  issues: IssueStat[];
  busy: boolean;
  onEnsure: () => void;
  onRetry: () => void;
}

export default function InsightPanel({
  insight,
  scoredCount,
  canAnalyze,
  mode,
  issues,
  busy,
  onEnsure,
  onRetry,
}: InsightPanelProps) {
  const ensuredKey = useRef('');
  const status = insight?.status || '';
  const stale = Boolean(insight?.stale);
  const key = `${insight?.updatedAt || 'none'}:${scoredCount}:${mode}:${status}:${stale}`;

  useEffect(() => {
    if (!canAnalyze || scoredCount <= 0) return;
    if (status === 'QUEUED' || status === 'PROCESSING') return;
    if (status === 'FAILED') return;
    if (status === 'READY' && !stale) return;
    if (status === 'READY' && stale) return;
    if (ensuredKey.current === key) return;
    ensuredKey.current = key;
    onEnsure();
  }, [canAnalyze, scoredCount, status, stale, key, onEnsure]);

  const label = insightStatusLabel(status, stale, scoredCount);
  const showRetry = status === 'FAILED';
  const showUpdate = status === 'READY' && stale;

  return (
    <div className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant/30 shadow-sm space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20 gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-secondary flex items-center gap-1.5">
          <span className="material-symbols-outlined text-sm">psychology_alt</span>
          <span>Gợi ý điều chỉnh dạy học</span>
        </span>
        <div className="flex items-center gap-2">
          {showUpdate ? (
            <button
              type="button"
              disabled={busy}
              onClick={onEnsure}
              className="px-2.5 py-1 rounded-lg border text-[11px] font-semibold"
            >
              {busy ? 'Đang cập nhật...' : 'Cập nhật phân tích'}
            </button>
          ) : null}
          {showRetry ? (
            <button
              type="button"
              disabled={busy}
              onClick={onRetry}
              className="px-2.5 py-1 rounded-lg border border-error/30 text-error text-[11px] font-semibold"
            >
              {busy ? 'Đang thử lại...' : 'Thử lại'}
            </button>
          ) : null}
          {!insight && scoredCount > 0 && status !== 'QUEUED' && status !== 'PROCESSING' ? (
            <button
              type="button"
              disabled={busy}
              onClick={onEnsure}
              className="px-2.5 py-1 rounded-lg border text-[11px] font-semibold"
            >
              {busy ? 'Đang phân tích...' : 'Tạo phân tích'}
            </button>
          ) : null}
        </div>
      </div>
      <p className="text-[11px] text-on-surface-variant">
        {label}
        {mode ? ` · ${modeShort(mode)}` : ''}
        {scoredCount > 0 ? ` · n=${scoredCount}` : ''}
      </p>
      {insight?.error ? <p className="text-[11px] text-error">{insight.error}</p> : null}
      {scoredCount <= 0 ? (
        <p className="text-xs text-on-surface-variant">Chưa đủ dữ liệu để phân tích.</p>
      ) : insight?.payload?.priorities?.length ? (
        <div className="space-y-3">
          {insight.payload.priorities.map((item, idx) => (
            <div key={idx} className="p-3 bg-surface-container-low/60 rounded-xl border border-outline-variant/30 space-y-1.5 text-xs">
              <span className="font-bold text-on-surface">{item.title}</span>
              <p className="text-[11px] text-on-surface-variant">{item.evidence}</p>
              {(item.suggestedActivities || []).map((act, actIdx) => (
                <p key={actIdx} className="text-[11px] text-primary bg-surface-container-lowest p-2 rounded-lg border border-outline-variant/20">
                  💡 {act}
                </p>
              ))}
            </div>
          ))}
          {insight.payload.notes ? (
            <p className="text-[11px] text-on-surface-variant italic">{insight.payload.notes}</p>
          ) : null}
        </div>
      ) : status === 'QUEUED' || status === 'PROCESSING' ? (
        <p className="text-xs text-on-surface-variant">Đang phân tích...</p>
      ) : (
        <p className="text-xs text-on-surface-variant">Chưa có gợi ý cho bộ lọc hiện tại.</p>
      )}
      <div className="pt-2 border-t border-outline-variant/20 space-y-2">
        <span className="text-[11px] font-bold uppercase text-on-surface-variant">Lỗi phổ biến</span>
        {issues.length === 0 ? (
          <p className="text-xs text-on-surface-variant">Chưa có dữ liệu</p>
        ) : (
          issues.map((issue) => (
            <div key={issue.code} className="p-3 bg-surface-container-low/60 rounded-xl border text-xs space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold">{issue.label}</span>
                <span className="text-[10px] font-bold text-error bg-error-container/40 px-2 py-0.5 rounded-full">
                  {issue.studentCount}/{issue.denominator} HS
                </span>
              </div>
              <p className="text-[11px] text-on-surface-variant font-mono">{issue.code}</p>
              <p className="text-[11px] text-on-surface-variant">
                {issue.occurrenceCount} lần xuất hiện · {issue.paperCount ?? issue.studentCount} bài · {issue.studentCount} học sinh
                {issue.studentRate !== null ? ` (${formatPercent(issue.studentRate)} / ${issue.denominator} kết quả)` : ''}
              </p>
              <p className="text-[11px] text-on-surface-variant">
                {issue.teacherConfirmed
                  ? 'Giáo viên đã điều chỉnh/xác nhận toàn bộ occurrence của mã này'
                  : issue.source === 'mixed'
                    ? 'Gồm cả AI và giáo viên; một occurrence xác nhận không biến cả nhóm thành đã xác nhận'
                    : 'AI phát hiện, chưa coi là giáo viên xác nhận'}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
