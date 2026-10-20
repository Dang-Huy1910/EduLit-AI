'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { assessmentApi } from './api';
import type { ClassReport, StatsMode } from './types';
import { formatPercent, formatScore, modeLabel } from './labels';
import StatsModeToggle from './StatsModeToggle';
import ScoreDistributionChart from './ScoreDistributionChart';
import InsightPanel from './InsightPanel';
import { AuthApiError } from '@/lib/auth-types';

export default function AssignmentStatisticsPanel({ assignmentId }: { assignmentId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const modeFromUrl = searchParams.get('mode') as StatsMode | null;
  const [mode, setMode] = useState<StatsMode | ''>(modeFromUrl || '');
  const [report, setReport] = useState<ClassReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyInsight, setBusyInsight] = useState(false);
  const userPickedMode = useRef(Boolean(modeFromUrl));

  const load = useCallback(async (nextMode?: string) => {
    setLoading(true);
    setError('');
    try {
      const data = await assessmentApi.classReport(assignmentId, {
        mode: nextMode || undefined,
        page: 1,
        pageSize: 1,
      });
      setReport(data);
      if (!userPickedMode.current) {
        setMode((data.mode as StatsMode) || (data.suggestedMode as StatsMode) || 'provisional');
        userPickedMode.current = true;
      }
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : 'Không tải được thống kê bài tập.');
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [assignmentId]);

  useEffect(() => {
    void load(mode || undefined);
  }, [load, mode]);

  useEffect(() => {
    const insightStatus = report?.insight?.status;
    if (insightStatus !== 'QUEUED' && insightStatus !== 'PROCESSING') return;
    const timer = window.setInterval(() => {
      void assessmentApi
        .classReport(assignmentId, { mode: mode || undefined, page: 1, pageSize: 1 })
        .then(setReport)
        .catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [assignmentId, mode, report?.insight?.status]);

  const handleMode = (next: StatsMode) => {
    userPickedMode.current = true;
    setMode(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', 'statistics');
    params.set('mode', next);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const enqueue = useCallback(async () => {
    if (!mode) return;
    setBusyInsight(true);
    try {
      setReport(await assessmentApi.enqueueInsight(assignmentId, { mode }));
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : 'Không tạo được phân tích.');
    } finally {
      setBusyInsight(false);
    }
  }, [assignmentId, mode]);

  const stats = report?.stats;
  const scored = stats?.scoredCount ?? 0;

  return (
    <div className="space-y-5">
      <StatsModeToggle
        mode={mode || report?.suggestedMode || 'provisional'}
        onChange={handleMode}
        hasProvisionalData={report?.hasProvisionalData}
        hasOfficialData={report?.hasOfficialData}
      />
      {error ? <p className="text-sm text-error">{error}</p> : null}
      {loading ? <p className="text-sm text-on-surface-variant">Đang tải thống kê...</p> : null}
      {report && stats ? (
        <>
          <div className="p-3.5 rounded-2xl glass-card border border-amber-500/30 bg-amber-500/10 text-xs text-amber-900 shadow-xs">
            {modeLabel(report.mode)}. {stats.scoreFormula?.description}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="Được giao" value={`${stats.assignedStudents ?? stats.assigned}`} hint="Học sinh được giao đề này" />
            <StatCard
              label="Đã nộp chính thức"
              value={`${stats.officialSubmitted} / ${stats.assignedStudents ?? stats.assigned}`}
              hint="Xác nhận bản chép OCR"
            />
            <StatCard
              label="Chờ / đang chấm"
              value={`${stats.grading ?? 0}`}
              hint={`Đang xử lý ${stats.processing ?? 0}`}
            />
            <StatCard
              label="Chấm xong, chờ rà soát"
              value={`${stats.awaitingReview}`}
              hint="Kết quả hợp lệ chưa công bố"
            />
            <StatCard
              label="Đã công bố"
              value={`${stats.published} / ${stats.assignedStudents ?? stats.assigned}`}
              hint="Snapshot học sinh đang xem"
            />
            <StatCard label="Lỗi xử lý" value={`${stats.failed}`} hint="OCR hoặc chấm thất bại" />
            <StatCard
              label="Kết quả dùng thống kê"
              value={`${scored}`}
              hint={report.mode === 'provisional' ? 'Tạm tính, gồm chưa công bố' : 'Chỉ snapshot đã công bố'}
            />
            <StatCard
              label="Điểm trung bình thang 10"
              value={stats.meanScoreScale10 == null ? 'Chưa có dữ liệu' : formatScore(stats.meanScoreScale10)}
              hint={
                stats.minScoreScale10 == null
                  ? `n=${scored} kết quả`
                  : `Thấp nhất ${formatScore(stats.minScoreScale10)} · Cao nhất ${formatScore(stats.maxScoreScale10)} · n=${scored}`
              }
            />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-6">
              <ScoreDistributionChart bins={stats.distribution || []} scoredCount={scored} mode={report.mode} />
            </div>
            <div className="lg:col-span-6">
              <InsightPanel
                insight={report.insight}
                scoredCount={scored}
                canAnalyze={report.canAnalyze}
                mode={report.mode}
                issues={stats.issues || []}
                busy={busyInsight}
                onEnsure={() => void enqueue()}
                onRetry={() => void enqueue()}
              />
            </div>
          </div>
          <div className="glass-panel p-5 rounded-2xl shadow-xs space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-primary">Kết quả theo tiêu chí</h3>
            {(stats.criteria || []).length === 0 ? (
              <p className="text-xs text-on-surface-variant">Chưa có dữ liệu</p>
            ) : (
              <div className="space-y-2">
                {(stats.criteria || []).map((item) => (
                  <div key={`${item.groupKey}-${item.criterionId}`} className="p-3 rounded-xl glass-card text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{item.criterionName}</span>
                      <span className="font-mono">
                        {formatScore(item.meanAwarded)} / {formatScore(item.meanMax)}
                        {item.meanRate != null ? ` · ${formatPercent(item.meanRate)}` : ''} · n={item.n}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="p-4 glass-card rounded-2xl shadow-xs space-y-1 hover:shadow-sm transition-all">
      <span className="text-xs text-on-surface-variant block">{label}</span>
      <span className="text-2xl font-bold text-on-surface font-merriweather mt-1 block">{value}</span>
      <span className="text-[11px] text-on-surface-variant mt-1 block">{hint}</span>
    </div>
  );
}
