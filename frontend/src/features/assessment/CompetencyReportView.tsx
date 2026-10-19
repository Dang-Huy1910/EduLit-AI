'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import TeacherShell from '@/components/TeacherShell';
import { assessmentApi } from './api';
import type { CompetencyReport, StatsMode } from './types';
import { formatPercent, formatScore, modeLabel } from './labels';
import StatsModeToggle from './StatsModeToggle';
import ScoreDistributionChart from './ScoreDistributionChart';
import InsightPanel from './InsightPanel';
import { AuthApiError } from '@/lib/auth-types';

const PAGE_SIZE = 20;

export default function CompetencyReportView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const assignmentFromUrl = searchParams.get('assignmentId') || '';

  useEffect(() => {
    if (!assignmentFromUrl) return;
    router.replace(`/assignments/${encodeURIComponent(assignmentFromUrl)}?tab=statistics`);
  }, [assignmentFromUrl, router]);

  const [classroomId, setClassroomId] = useState(searchParams.get('classroomId') || '');
  const [assignmentIds, setAssignmentIds] = useState<string[]>(
    (searchParams.get('assignmentIds') || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  );
  const [studentId, setStudentId] = useState(searchParams.get('studentId') || '');
  const [dateFrom, setDateFrom] = useState(searchParams.get('from') || '');
  const [dateTo, setDateTo] = useState(searchParams.get('to') || '');
  const modeFromUrl = searchParams.get('mode') as StatsMode | null;
  const [mode, setMode] = useState<StatsMode | ''>(modeFromUrl || '');
  const userPickedMode = useRef(Boolean(modeFromUrl));
  const [report, setReport] = useState<CompetencyReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyInsight, setBusyInsight] = useState(false);
  const [search, setSearch] = useState('');
  const [sortOrder, setSortOrder] = useState<'default' | 'score_desc' | 'score_asc'>('default');
  const [page, setPage] = useState(1);
  const [unavailableHint, setUnavailableHint] = useState('');

  const query = useMemo(
    () => ({
      classroomId: classroomId || undefined,
      assignmentIds: assignmentIds.length ? assignmentIds : undefined,
      studentId: studentId || undefined,
      from: dateFrom || undefined,
      to: dateTo || undefined,
      mode: mode || undefined,
      search,
      sort: sortOrder,
      page,
      pageSize: PAGE_SIZE,
    }),
    [classroomId, assignmentIds, studentId, dateFrom, dateTo, mode, search, sortOrder, page]
  );

  const load = useCallback(async () => {
    if (assignmentFromUrl) return;
    setLoading(true);
    setError('');
    try {
      const data = await assessmentApi.competencyReport(query);
      setReport(data);
      if (!userPickedMode.current) {
        setMode((data.mode as StatsMode) || (data.suggestedMode as StatsMode) || 'provisional');
        userPickedMode.current = true;
      }
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : 'Không tải được báo cáo năng lực.');
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [assignmentFromUrl, query]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (assignmentFromUrl) return;
    const params = new URLSearchParams();
    if (classroomId) params.set('classroomId', classroomId);
    if (assignmentIds.length) params.set('assignmentIds', assignmentIds.join(','));
    if (studentId) params.set('studentId', studentId);
    if (dateFrom) params.set('from', dateFrom);
    if (dateTo) params.set('to', dateTo);
    if (mode) params.set('mode', mode);
    const next = params.toString();
    const current = new URLSearchParams(searchParams.toString());
    current.delete('assignmentId');
    const same =
      (current.get('classroomId') || '') === classroomId &&
      (current.get('assignmentIds') || '') === assignmentIds.join(',') &&
      (current.get('studentId') || '') === studentId &&
      (current.get('from') || '') === dateFrom &&
      (current.get('to') || '') === dateTo &&
      (current.get('mode') || '') === mode;
    if (same) return;
    router.replace(next ? `/reports?${next}` : '/reports', { scroll: false });
  }, [assignmentFromUrl, classroomId, assignmentIds, studentId, dateFrom, dateTo, mode, router, searchParams]);

  useEffect(() => {
    const insightStatus = report?.insight?.status;
    if (insightStatus !== 'QUEUED' && insightStatus !== 'PROCESSING') return;
    const timer = window.setInterval(() => {
      void assessmentApi.competencyReport(query).then(setReport).catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [query, report?.insight?.status]);

  const enqueue = useCallback(async () => {
    setBusyInsight(true);
    try {
      setReport(
        await assessmentApi.enqueueCompetencyInsight({
          classroomId: classroomId || undefined,
          assignmentIds: assignmentIds.length ? assignmentIds : undefined,
          studentId: studentId || undefined,
          from: dateFrom || undefined,
          to: dateTo || undefined,
          mode: mode || undefined,
        })
      );
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : 'Không tạo được phân tích.');
    } finally {
      setBusyInsight(false);
    }
  }, [classroomId, assignmentIds, studentId, dateFrom, dateTo, mode]);

  const availableAssignments = report?.available.assignments || [];
  const stats = report?.stats;
  const scored = stats?.scoredCount ?? 0;
  const students = report?.students;
  const totalPages = students?.totalPages || 1;
  const safePage = Math.min(Math.max(page, 1), totalPages);

  if (assignmentFromUrl) {
    return <div className="p-8 text-sm text-on-surface-variant">Đang chuyển tới thống kê bài tập...</div>;
  }

  return (
    <TeacherShell
      breadcrumb={
        <div className="flex items-center gap-space-xs font-label-md text-sm text-on-surface-variant">
          <Link href="/assignments" className="hover:text-primary">
            Quản lý bài tập
          </Link>
          <span className="text-outline-variant">/</span>
          <span className="text-on-surface font-semibold">Báo cáo năng lực</span>
        </div>
      }
    >
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <span className="text-xs bg-secondary-fixed/50 text-secondary font-bold px-2 py-0.5 rounded-full">
              Tổng hợp nhiều bài tập
            </span>
            <h1 className="font-headline-lg text-2xl sm:text-3xl font-bold text-on-surface font-merriweather mt-2">
              Báo cáo năng lực
            </h1>
            <p className="text-xs text-on-surface-variant mt-1">
              Lọc theo lớp, bài tập, thời điểm nộp chính thức và học sinh. Điểm các bài khác thang được quy về 10 trước khi trung bình.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setUnavailableHint('Xuất PDF / Excel chưa khả dụng trong phiên bản này.')}
              className="px-3.5 py-2 rounded-lg border border-outline-variant/60 bg-surface-container-lowest text-xs font-medium text-on-surface-variant cursor-not-allowed flex items-center gap-1.5 shadow-sm"
            >
              <span className="material-symbols-outlined text-[16px]">file_download</span>
              <span>Xuất PDF / Excel</span>
            </button>
            <button
              type="button"
              onClick={() => setUnavailableHint('Gửi phản hồi chung chưa khả dụng trong phiên bản này.')}
              className="px-4 py-2 rounded-lg bg-primary/40 text-white text-xs font-semibold cursor-not-allowed flex items-center gap-1.5 shadow-sm"
            >
              <span className="material-symbols-outlined text-[16px]">send</span>
              <span>Gửi phản hồi chung</span>
            </button>
          </div>
        </div>

        {unavailableHint ? (
          <p className="text-xs text-on-surface-variant bg-surface-container-low px-3 py-2 rounded-lg">{unavailableHint}</p>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="text-xs space-y-1">
            <span className="font-semibold">Lớp phụ trách</span>
            <select
              value={classroomId}
              onChange={(e) => {
                setClassroomId(e.target.value);
                setAssignmentIds([]);
                setStudentId('');
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 rounded-lg border bg-surface"
            >
              <option value="">Tất cả lớp</option>
              {(report?.available.classrooms || []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs space-y-1">
            <span className="font-semibold">Học sinh</span>
            <select
              value={studentId}
              onChange={(e) => {
                setStudentId(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 rounded-lg border bg-surface"
            >
              <option value="">Toàn lớp</option>
              {(report?.available.students || []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.code})
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs space-y-1">
            <span className="font-semibold">Từ ngày nộp</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 rounded-lg border bg-surface"
            />
          </label>
          <label className="text-xs space-y-1">
            <span className="font-semibold">Đến ngày nộp</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 rounded-lg border bg-surface"
            />
          </label>
        </div>

        <div className="space-y-2">
          <span className="text-xs font-semibold">Bài tập đưa vào tổng hợp</span>
          <div className="flex flex-wrap gap-2">
            {availableAssignments.length === 0 ? (
              <p className="text-xs text-on-surface-variant">Chưa có bài đã giao trong phạm vi này.</p>
            ) : (
              availableAssignments.map((item) => {
                const checked = assignmentIds.length === 0 || assignmentIds.includes(item.id);
                return (
                  <label
                    key={item.id}
                    className={`px-2.5 py-1 rounded-full border text-[11px] cursor-pointer ${
                      checked ? 'bg-primary-container text-on-primary-container border-transparent' : 'bg-surface-container-lowest'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={checked}
                      onChange={(e) => {
                        setPage(1);
                        const all = availableAssignments.map((row) => row.id);
                        setAssignmentIds((current) => {
                          const selected = current.length === 0 ? all : current;
                          if (e.target.checked) return Array.from(new Set([...selected, item.id]));
                          return selected.filter((id) => id !== item.id);
                        });
                      }}
                    />
                    {item.code} — {item.title}
                  </label>
                );
              })
            )}
          </div>
          <p className="text-[11px] text-on-surface-variant">
            Không chọn ô nào nghĩa là lấy tất cả bài đã giao trong lớp. Thời điểm lọc theo nộp chính thức của phiên bản đang thống kê.
          </p>
        </div>

        <StatsModeToggle
          mode={mode || report?.suggestedMode || 'provisional'}
          onChange={(next) => {
            userPickedMode.current = true;
            setMode(next);
          }}
          hasProvisionalData={report?.hasProvisionalData}
          hasOfficialData={report?.hasOfficialData}
        />

        {error ? <p className="text-sm text-error">{error}</p> : null}
        {loading ? <p className="text-sm text-on-surface-variant">Đang tải báo cáo năng lực...</p> : null}

        {report && stats ? (
          <>
            <div className="p-3 rounded-xl bg-[#FEF9C3]/70 border border-[#CA8A04]/30 text-xs text-[#854D0E]">
              {modeLabel(report.mode)}. {stats.scoreFormula?.description}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard label="Số bài tập" value={`${stats.assignmentCount ?? 0}`} hint="Bài đã lọc" />
              <StatCard
                label="Học sinh / bài làm"
                value={`${stats.assignedStudents ?? 0} / ${stats.assignedPapers ?? 0}`}
                hint="Học sinh duy nhất và số bài được giao"
              />
              <StatCard
                label="Điểm TB thang 10"
                value={stats.meanScoreScale10 == null ? 'Chưa có dữ liệu' : formatScore(stats.meanScoreScale10)}
                hint={
                  stats.minScoreScale10 == null
                    ? `n=${scored}`
                    : `Thấp ${formatScore(stats.minScoreScale10)} · Cao ${formatScore(stats.maxScoreScale10)} · n=${scored}`
                }
              />
              <StatCard
                label="Nộp / công bố / lỗi"
                value={`${stats.officialSubmitted} / ${stats.published} / ${stats.failed}`}
                hint={`Chờ rà soát ${stats.awaitingReview} · Đang chấm ${stats.grading ?? 0}`}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-6 space-y-4">
                <ScoreDistributionChart bins={stats.distribution || []} scoredCount={scored} mode={report.mode} />
                <div className="bg-surface-container-lowest p-5 rounded-xl border space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-primary">Diễn biến qua các bài</h3>
                  {(report.trend || []).length === 0 ? (
                    <p className="text-xs text-on-surface-variant">Chưa có dữ liệu</p>
                  ) : (
                    (report.trend || []).map((item) => (
                      <div key={item.id} className="flex items-center justify-between text-xs gap-3">
                        <Link href={`/assignments/${item.id}?tab=statistics`} className="font-semibold hover:text-primary">
                          {item.title}
                        </Link>
                        <span className="font-mono">
                          {item.meanScoreScale10 == null ? '—' : formatScore(item.meanScoreScale10)} · n={item.scoredCount}
                        </span>
                      </div>
                    ))
                  )}
                  {(report.trend || []).filter((item) => item.scoredCount > 0).length < 2 ? (
                    <p className="text-[11px] text-on-surface-variant">Một bài không đủ để kết luận tiến bộ.</p>
                  ) : null}
                </div>
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

            {(stats.recurringIssues || []).length > 0 || (stats.strengths || []).length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border bg-surface-container-lowest space-y-2">
                  <h3 className="text-xs font-bold uppercase">Điểm mạnh khi có căn cứ</h3>
                  {(stats.strengths || []).length === 0 ? (
                    <p className="text-xs text-on-surface-variant">Chưa đủ dữ liệu so sánh.</p>
                  ) : (
                    (stats.strengths || []).map((item) => (
                      <p key={`${item.groupKey}-${item.criterionId}`} className="text-xs">
                        {item.criterionName}: {item.meanRate != null ? formatPercent(item.meanRate) : '—'} (n={item.n})
                      </p>
                    ))
                  )}
                </div>
                <div className="p-4 rounded-xl border bg-surface-container-lowest space-y-2">
                  <h3 className="text-xs font-bold uppercase">Vấn đề lặp lại</h3>
                  {(stats.recurringIssues || []).length === 0 ? (
                    <p className="text-xs text-on-surface-variant">Chưa thấy mã lỗi xuất hiện trên từ hai bài tập.</p>
                  ) : (
                    (stats.recurringIssues || []).map((item) => (
                      <p key={item.code} className="text-xs">
                        {item.label} · {item.assignmentCount} bài tập · {item.studentCount} HS
                      </p>
                    ))
                  )}
                </div>
              </div>
            ) : null}

            <div className="bg-surface-container-lowest p-5 rounded-xl border space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <h3 className="font-bold text-sm font-merriweather">Theo học sinh ({students?.total ?? 0})</h3>
                <div className="flex gap-2">
                  <input
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Tìm học sinh..."
                    className="px-3 py-1.5 text-xs rounded-lg border"
                  />
                  <select
                    value={sortOrder}
                    onChange={(e) => {
                      setSortOrder(e.target.value as 'default' | 'score_desc' | 'score_asc');
                      setPage(1);
                    }}
                    className="px-2.5 py-1.5 text-xs rounded-lg border"
                  >
                    <option value="default">Tên</option>
                    <option value="score_desc">Điểm TB cao → thấp</option>
                    <option value="score_asc">Điểm TB thấp → cao</option>
                  </select>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-surface-container-low text-[10px] uppercase text-on-surface-variant">
                    <tr>
                      <th className="py-2 px-3">Học sinh</th>
                      <th className="py-2 px-3">Số bài có kết quả</th>
                      <th className="py-2 px-3">Điểm TB / 10</th>
                      <th className="py-2 px-3">Xu hướng</th>
                      <th className="py-2 px-3">Từng bài</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/20">
                    {(students?.items || []).map((row) => (
                      <tr key={row.studentId}>
                        <td className="py-3 px-3">
                          <span className="font-bold block">{row.name}</span>
                          <span className="font-mono text-outline">{row.code}</span>
                        </td>
                        <td className="py-3 px-3 font-mono">
                          {row.resultCount}/{row.assignedCount}
                        </td>
                        <td className="py-3 px-3 font-mono font-bold">
                          {row.meanScoreScale10 == null ? '—' : formatScore(row.meanScoreScale10)}
                        </td>
                        <td className="py-3 px-3">
                          {row.trend == null
                            ? 'Chưa đủ so sánh'
                            : row.trend === 'up'
                              ? 'Tăng'
                              : row.trend === 'down'
                                ? 'Giảm'
                                : 'Ổn định'}
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex flex-wrap gap-1.5">
                            {row.assignments.map((item) => (
                              <Link
                                key={item.assignmentId}
                                href={`/assignments/${item.assignmentId}/students/${row.studentId}/assessment`}
                                className="px-2 py-0.5 rounded-full bg-surface-container-low border text-[10px] hover:text-primary"
                              >
                                {item.code}: {item.scoreScale10 == null ? '—' : formatScore(item.scoreScale10)}
                              </Link>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(students?.total || 0) > 0 ? (
                <div className="flex items-center justify-between text-xs">
                  <span>
                    Trang {safePage}/{totalPages}
                  </span>
                  <div className="flex gap-1">
                    <button type="button" disabled={safePage === 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="px-2 py-1 border rounded disabled:opacity-30">
                      Trước
                    </button>
                    <button type="button" disabled={safePage === totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="px-2 py-1 border rounded disabled:opacity-30">
                      Sau
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </TeacherShell>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm">
      <span className="text-xs text-on-surface-variant block">{label}</span>
      <span className="text-2xl font-bold text-on-surface font-merriweather mt-1 block">{value}</span>
      <span className="text-[11px] text-on-surface-variant mt-1 block">{hint}</span>
    </div>
  );
}
