'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { InsightState, IssueStat, StatsMode } from './types';
import { formatPercent, insightStatusLabel, modeShort } from './labels';

interface InsightPanelProps {
  insight: InsightState | null;
  scoredCount: number;
  canAnalyze?: boolean;
  mode?: StatsMode | string;
  issues: IssueStat[];
  busy: boolean;
  heading?: string;
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
  heading = 'Gợi ý điều chỉnh dạy học',
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
          <span>{heading}</span>
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
      <CommonIssues issues={issues} />
    </div>
  );
}

const VISIBLE_ISSUES = 3;

function issueSourceLabel(issue: IssueStat) {
  if (issue.teacherConfirmed) return 'Giáo viên đã điều chỉnh/xác nhận toàn bộ occurrence của mã này';
  if (issue.source === 'mixed') return 'Gồm cả AI và giáo viên; một occurrence xác nhận không biến cả nhóm thành đã xác nhận';
  return 'AI phát hiện, chưa coi là giáo viên xác nhận';
}

/** Collapsed by default: AI flags many minor issues, so teachers opt in to the details. */
function CommonIssues({ issues }: { issues: IssueStat[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? issues : issues.slice(0, VISIBLE_ISSUES);
  const hidden = issues.length - VISIBLE_ISSUES;

  return (
    <details className="group/issues pt-2 border-t border-outline-variant/20">
      <summary className="flex items-center justify-between gap-2 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
        <span className="text-[11px] font-bold uppercase text-on-surface-variant">
          Lỗi phổ biến{issues.length > 0 ? ` (${issues.length})` : ''}
        </span>
        <span className="flex items-center gap-1 text-[11px] text-on-surface-variant">
          <span className="group-open/issues:hidden">Xem</span>
          <span className="hidden group-open/issues:inline">Thu gọn</span>
          <span className="material-symbols-outlined text-sm transition-transform group-open/issues:rotate-180" aria-hidden="true">
            expand_more
          </span>
        </span>
      </summary>
      <div className="mt-2 space-y-1.5">
        {issues.length === 0 ? (
          <p className="text-xs text-on-surface-variant">Chưa có dữ liệu</p>
        ) : (
          <>
            <p className="text-[11px] text-on-surface-variant italic">
              Phần lớn do AI tự phát hiện, chỉ mang tính tham khảo. Bấm vào từng lỗi để xem chi tiết.
            </p>
            {visible.map((issue) => (
              <details
                key={issue.code}
                className="group/issue bg-surface-container-low/60 rounded-lg border border-outline-variant/30 text-xs"
              >
                <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
                  <span className="material-symbols-outlined text-sm text-on-surface-variant transition-transform group-open/issue:rotate-90" aria-hidden="true">
                    chevron_right
                  </span>
                  <span className="flex-1 min-w-0 font-semibold truncate group-open/issue:whitespace-normal" title={issue.label}>
                    {issue.label}
                  </span>
                  {issue.teacherConfirmed ? (
                    <span className="material-symbols-outlined text-sm text-primary" title="Giáo viên đã xác nhận" aria-label="Giáo viên đã xác nhận">
                      verified
                    </span>
                  ) : null}
                  <span className="shrink-0 whitespace-nowrap text-[10px] font-bold text-error bg-error-container/40 px-2 py-0.5 rounded-full">
                    {issue.studentCount}/{issue.denominator} HS
                  </span>
                </summary>
                <div className="px-3 pb-2 pl-8 space-y-1 text-[11px] text-on-surface-variant">
                  <p className="font-mono">{issue.code}</p>
                  <p>
                    {issue.occurrenceCount} lần xuất hiện · {issue.paperCount ?? issue.studentCount} bài · {issue.studentCount} học sinh
                    {issue.studentRate !== null ? ` (${formatPercent(issue.studentRate)} / ${issue.denominator} kết quả)` : ''}
                  </p>
                  <p>{issueSourceLabel(issue)}</p>
                </div>
              </details>
            ))}
            {hidden > 0 ? (
              <button
                type="button"
                onClick={() => setShowAll((value) => !value)}
                className="w-full py-1.5 text-[11px] font-semibold text-primary hover:underline"
              >
                {showAll ? 'Ẩn bớt' : `Xem thêm ${hidden} lỗi`}
              </button>
            ) : null}
          </>
        )}
      </div>
    </details>
  );
}
