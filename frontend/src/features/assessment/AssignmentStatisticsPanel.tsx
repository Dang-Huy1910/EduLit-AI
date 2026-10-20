'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { assessmentApi } from './api';
import type { ClassReport, StatsMode } from './types';
import StatsModeToggle from './StatsModeToggle';
import ScoreDistributionChart from './ScoreDistributionChart';
import InsightPanel from './InsightPanel';
import { CriteriaBars, FormulaNote, HeroScore, PipelineStrip, StatTile } from './StatsBlocks';
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
  const assigned = stats?.assignedStudents ?? stats?.assigned ?? 0;

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
          <FormulaNote mode={report.mode} description={stats.scoreFormula?.description} />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.35fr_1fr_1fr] gap-4">
            <div className="sm:col-span-2 lg:col-span-1">
              <HeroScore
                mean={stats.meanScoreScale10}
                min={stats.minScoreScale10}
                max={stats.maxScoreScale10}
                count={scored}
                mode={report.mode}
              />
            </div>
            <StatTile
              label="Đã nộp chính thức"
              value={stats.officialSubmitted}
              total={assigned}
              hint="Đã xác nhận bản chép để chấm"
            />
            <StatTile label="Đã công bố" value={stats.published} total={assigned} hint="Học sinh đã xem được kết quả" />
          </div>
          <PipelineStrip
            items={[
              { label: 'Đang xử lý OCR', count: stats.processing ?? 0, icon: 'document_scanner' },
              { label: 'Chờ / đang chấm', count: stats.grading ?? 0, icon: 'hourglass_top' },
              { label: 'Chấm xong, chờ rà soát', count: stats.awaitingReview ?? 0, icon: 'rate_review' },
              { label: 'Lỗi xử lý', count: stats.failed ?? 0, icon: 'error', tone: 'error' },
            ]}
          />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-6 space-y-6">
              <ScoreDistributionChart
                bins={stats.distribution || []}
                scoredCount={scored}
                mode={report.mode}
                mean={stats.meanScoreScale10}
              />
              <CriteriaBars criteria={stats.criteria || []} />
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
        </>
      ) : null}
    </div>
  );
}
