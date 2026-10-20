'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import TeacherShell from '@/components/TeacherShell';
import { assessmentApi } from './api';
import type { ClassReportAssignment, CompetencyReport, StatsMode } from './types';
import { formatPercent, formatScore } from './labels';
import StatsModeToggle from './StatsModeToggle';
import ScoreDistributionChart from './ScoreDistributionChart';
import { FormulaNote, HeroScore, PipelineStrip, StatTile } from './StatsBlocks';
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
  const classrooms = report?.available.classrooms || [];
  const selectedClassroom = classrooms.find((item) => item.id === classroomId);
  const stats = report?.stats;
  const scored = stats?.scoredCount ?? 0;
  const students = report?.students;
  const totalPages = students?.totalPages || 1;
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const startIndex = students && students.total ? (students.page - 1) * students.pageSize : 0;
  const fieldClass =
    'w-full h-8 box-border px-2.5 text-xs leading-none rounded-lg border border-outline-variant/60 bg-surface-container-lowest text-on-surface focus:outline-none focus:border-secondary';

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
          <span className="text-on-surface font-semibold">Báo cáo năng lực lớp &amp; Gợi ý dạy học</span>
        </div>
      }
    >
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs bg-secondary-fixed/50 text-secondary font-bold px-2 py-0.5 rounded-full">
                Báo cáo sư phạm GDPT 2018 (thang 10 quy đổi)
              </span>
              <span className="text-xs text-on-surface-variant font-medium">
                {selectedClassroom?.name || 'Tất cả lớp phụ trách'}
              </span>
            </div>
            <h1 className="font-headline-lg text-2xl sm:text-3xl font-bold text-on-surface font-merriweather">
              Báo cáo năng lực
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setUnavailableHint('Xuất PDF / Excel chưa khả dụng trong phiên bản này.')}
              className="px-3.5 py-2 rounded-lg border border-outline-variant/60 bg-surface-container-lowest text-xs font-medium text-on-surface hover:bg-surface-container transition-all flex items-center gap-1.5 shadow-sm"
            >
              <span className="material-symbols-outlined text-[16px]">file_download</span>
              <span>Xuất PDF / Excel</span>
            </button>
            <button
              type="button"
              onClick={() => setUnavailableHint('Gửi phản hồi chung chưa khả dụng trong phiên bản này.')}
              className="px-4 py-2 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-all flex items-center gap-1.5 shadow-sm"
            >
              <span className="material-symbols-outlined text-[16px]">send</span>
              <span>Gửi phản hồi chung</span>
            </button>
          </div>
        </div>

        {unavailableHint ? (
          <p className="text-xs text-on-surface-variant bg-surface-container-low px-3 py-2 rounded-lg">{unavailableHint}</p>
        ) : null}

        {/* z-30 lifts the filter card above the panels below it, so the
            assignment picker dropdown is not painted under them. */}
        <div className="glass-panel relative z-30 p-4 rounded-2xl shadow-xs space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-3 items-end">
            <label className="text-xs space-y-1 xl:col-span-2">
              <span className="font-semibold text-on-surface">Lớp phụ trách</span>
              <select
                value={classroomId}
                onChange={(e) => {
                  setClassroomId(e.target.value);
                  setAssignmentIds([]);
                  setStudentId('');
                  setPage(1);
                }}
                className={fieldClass}
              >
                <option value="">Tất cả lớp</option>
                {classrooms.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs space-y-1 xl:col-span-4">
              <span className="font-semibold text-on-surface">Bài tập đưa vào tổng hợp</span>
              <AssignmentPicker
                assignments={availableAssignments}
                selectedIds={assignmentIds}
                onChange={(ids) => {
                  setAssignmentIds(ids);
                  setPage(1);
                }}
              />
            </label>
            <label className="text-xs space-y-1 xl:col-span-2">
              <span className="font-semibold text-on-surface">Học sinh</span>
              <select
                value={studentId}
                onChange={(e) => {
                  setStudentId(e.target.value);
                  setPage(1);
                }}
                className={fieldClass}
              >
                <option value="">Toàn lớp</option>
                {(report?.available.students || []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.code})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs space-y-1 xl:col-span-2">
              <span className="font-semibold text-on-surface">Từ ngày nộp</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                className={fieldClass}
              />
            </label>
            <label className="text-xs space-y-1 xl:col-span-2">
              <span className="font-semibold text-on-surface">Đến ngày nộp</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                className={fieldClass}
              />
            </label>
          </div>
          <p className="text-[11px] text-on-surface-variant">
            Mặc định lấy tất cả bài đã giao trong phạm vi lọc. Thời điểm theo nộp chính thức của phiên bản đang thống kê.
          </p>
        </div>

        {error ? <p className="text-sm text-error">{error}</p> : null}
        {loading ? <p className="text-sm text-on-surface-variant">Đang tải báo cáo năng lực...</p> : null}

        {report && stats ? (
          <>
            <div className="glass-panel p-4 rounded-2xl shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-4 text-on-surface">
                <span>
                  Số bài tập: <strong>{stats.assignmentCount ?? 0}</strong>
                </span>
                <span>•</span>
                <span>
                  Học sinh: <strong>{stats.assignedStudents ?? 0}</strong>
                </span>
                <span>•</span>
                <span>
                  Bài được giao: <strong>{stats.assignedPapers ?? 0}</strong>
                </span>
                <span>•</span>
                <span className="text-tertiary font-semibold">
                  Đã nộp chính thức: <strong>{stats.officialSubmitted}</strong>
                </span>
              </div>
              <StatsModeToggle
                compact
                mode={mode || report.suggestedMode || 'provisional'}
                onChange={(next) => {
                  userPickedMode.current = true;
                  setMode(next);
                }}
                hasProvisionalData={report.hasProvisionalData}
                hasOfficialData={report.hasOfficialData}
              />
            </div>
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
                total={stats.assignedPapers ?? stats.assigned}
                hint={`${stats.assignedStudents ?? 0} học sinh · ${stats.assignmentCount ?? 0} bài tập`}
              />
              <StatTile
                label="Đã công bố"
                value={stats.published}
                total={stats.assignedStudents ?? stats.assigned}
                hint="Đã hiển thị phía học sinh"
              />
            </div>
            <PipelineStrip
              items={[
                { label: 'Đang xử lý', count: stats.processing ?? 0, icon: 'hourglass_top' },
                { label: 'Chấm xong, chờ rà soát', count: stats.awaitingReview ?? 0, icon: 'rate_review' },
                { label: 'Lỗi xử lý', count: stats.failed ?? 0, icon: 'error', tone: 'error' },
              ]}
            />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-6 space-y-4">
                <ScoreDistributionChart
                  bins={stats.distribution || []}
                  scoredCount={scored}
                  mode={report.mode}
                  mean={stats.meanScoreScale10}
                />
                <div className="glass-panel p-5 rounded-2xl shadow-xs space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
                    <span className="text-xs font-bold uppercase tracking-wider text-primary">Diễn biến qua các bài</span>
                  </div>
                  {(report.trend || []).length === 0 ? (
                    <p className="text-xs text-on-surface-variant">Chưa có dữ liệu</p>
                  ) : (
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {(report.trend || []).map((item) => (
                        <div key={item.id} className="flex items-center justify-between text-xs gap-3">
                          <Link href={`/assignments/${item.id}?tab=statistics`} className="font-semibold hover:text-primary truncate">
                            {item.title}
                          </Link>
                          <span className="shrink-0 tabular-nums text-on-surface-variant">
                            <strong className="font-semibold text-on-surface">
                              {item.meanScoreScale10 == null ? '—' : formatScore(item.meanScoreScale10)}
                            </strong>{' '}
                            · {item.scoredCount} bài
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {(report.trend || []).filter((item) => item.scoredCount > 0).length < 2 ? (
                    <p className="text-[11px] text-on-surface-variant">Một bài không đủ để kết luận tiến bộ.</p>
                  ) : null}
                </div>
              </div>
              <div className="lg:col-span-6">
                <InsightPanel
                  heading="Gợi ý điều chỉnh giáo án (Căn cứ lỗi phổ biến)"
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
                <div className="p-4 rounded-2xl glass-card shadow-xs space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-primary">Điểm mạnh khi có căn cứ</h3>
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
                <div className="p-4 rounded-2xl glass-card shadow-xs space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-secondary">Vấn đề lặp lại</h3>
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

            <div className="glass-panel p-5 rounded-2xl shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-outline-variant/20">
                <div>
                  <h3 className="font-bold text-sm text-on-surface font-merriweather">
                    Theo học sinh ({students?.total ?? 0})
                  </h3>
                  <p className="text-[11px] text-on-surface-variant">
                    Mỗi dòng là một học sinh trên các bài đã lọc. Một bài không đủ để kết luận tiến bộ. Bấm mã bài để mở chi tiết chấm.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Tìm theo tên hoặc mã HS..."
                    className="px-3 py-1.5 text-xs rounded-lg border border-outline-variant/60 bg-surface text-on-surface focus:outline-none focus:border-secondary w-44 sm:w-52"
                  />
                  <select
                    value={sortOrder}
                    onChange={(e) => {
                      setSortOrder(e.target.value as 'default' | 'score_desc' | 'score_asc');
                      setPage(1);
                    }}
                    className="px-2.5 py-1.5 text-xs rounded-lg border border-outline-variant/60 bg-surface text-on-surface focus:outline-none font-medium"
                  >
                    <option value="default">Sắp xếp: Tên</option>
                    <option value="score_desc">Điểm TB: Cao nhất → Thấp</option>
                    <option value="score_asc">Điểm TB: Thấp nhất → Cao</option>
                  </select>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-surface-container-low text-on-surface-variant uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3 rounded-l-lg">Họ và tên học sinh</th>
                      <th className="py-2.5 px-3">Mã học sinh</th>
                      <th className="py-2.5 px-3">Số bài có kết quả</th>
                      <th className="py-2.5 px-3">Điểm TB / 10</th>
                      <th className="py-2.5 px-3">Xu hướng</th>
                      <th className="py-2.5 px-3 rounded-r-lg">Từng bài</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/20">
                    {(students?.items || []).length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-on-surface-variant italic">
                          Chưa có học sinh trong bộ lọc này.
                        </td>
                      </tr>
                    ) : (
                      (students?.items || []).map((row) => (
                        <tr key={row.studentId} className="hover:bg-surface-container-low/40 transition-colors">
                          <td className="py-3 px-3">
                            <span className="font-bold text-on-surface block">{row.name}</span>
                          </td>
                          <td className="py-3 px-3 font-mono text-outline">{row.code}</td>
                          <td className="py-3 px-3 font-mono">
                            {row.resultCount}/{row.assignedCount}
                          </td>
                          <td className="py-3 px-3">
                            <span className="font-bold text-secondary font-mono">
                              {row.meanScoreScale10 == null ? '—' : `${formatScore(row.meanScoreScale10)} / 10`}
                            </span>
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
                            <div className="flex gap-1.5 overflow-x-auto max-w-[280px] pb-0.5">
                              {row.assignments.map((item) => (
                                <Link
                                  key={item.assignmentId}
                                  href={`/assignments/${item.assignmentId}/students/${row.studentId}/assessment`}
                                  title={item.title}
                                  className="px-2 py-0.5 rounded-full bg-surface-container-low border border-outline-variant/30 text-[10px] hover:text-primary whitespace-nowrap"
                                >
                                  {item.code}: {item.scoreScale10 == null ? '—' : formatScore(item.scoreScale10)}
                                </Link>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {(students?.total || 0) > 0 ? (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-outline-variant/20 text-xs text-on-surface-variant">
                  <div>
                    Hiển thị{' '}
                    <span className="font-semibold text-on-surface">
                      {startIndex + 1}–{Math.min(startIndex + (students?.pageSize || PAGE_SIZE), students?.total || 0)}
                    </span>{' '}
                    trên tổng số <span className="font-semibold text-on-surface">{students?.total}</span> học sinh
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button type="button" onClick={() => setPage(1)} disabled={safePage === 1} className="p-1.5 rounded-lg border border-outline-variant/40 hover:bg-surface-container disabled:opacity-30 disabled:pointer-events-none">
                      <span className="material-symbols-outlined text-[16px]">first_page</span>
                    </button>
                    <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1} className="px-2.5 py-1 rounded-lg border border-outline-variant/40 hover:bg-surface-container disabled:opacity-30 disabled:pointer-events-none font-medium">
                      Trước
                    </button>
                    <span className="px-2 font-semibold text-on-surface">
                      {safePage}/{totalPages}
                    </span>
                    <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} className="px-2.5 py-1 rounded-lg border border-outline-variant/40 hover:bg-surface-container disabled:opacity-30 disabled:pointer-events-none font-medium">
                      Sau
                    </button>
                    <button type="button" onClick={() => setPage(totalPages)} disabled={safePage === totalPages} className="p-1.5 rounded-lg border border-outline-variant/40 hover:bg-surface-container disabled:opacity-30 disabled:pointer-events-none">
                      <span className="material-symbols-outlined text-[16px]">last_page</span>
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

function AssignmentPicker({
  assignments,
  selectedIds,
  onChange,
}: {
  assignments: ClassReportAssignment[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const allIds = assignments.map((item) => item.id);
  const allSelected = selectedIds.length === 0;
  const selectedCount = allSelected ? assignments.length : selectedIds.length;
  const filtered = assignments.filter((item) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return item.title.toLowerCase().includes(needle) || item.code.toLowerCase().includes(needle);
  });
  const label =
    assignments.length === 0
      ? 'Chưa có bài đã giao'
      : allSelected
        ? `Tất cả bài đã giao (${assignments.length})`
        : `${selectedCount}/${assignments.length} bài đã chọn`;

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = (id: string, checked: boolean) => {
    const current = allSelected ? allIds : selectedIds;
    if (checked) {
      const next = Array.from(new Set([...current, id]));
      onChange(next.length === allIds.length ? [] : next);
      return;
    }
    onChange(current.filter((item) => item !== id));
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={assignments.length === 0}
        onClick={() => setOpen((value) => !value)}
        className="w-full h-8 box-border px-2.5 text-xs leading-none rounded-lg border border-outline-variant/60 bg-surface-container-lowest text-on-surface focus:outline-none focus:border-secondary inline-flex items-center justify-between gap-2 disabled:opacity-60"
      >
        <span className="truncate text-left leading-none">{label}</span>
        <span className="material-symbols-outlined text-[16px] leading-none text-on-surface-variant shrink-0">
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>
      {open ? (
        <div className="absolute z-30 mt-1 w-full min-w-[280px] max-w-lg rounded-xl border border-outline-variant/40 bg-surface-container-lowest shadow-lg p-2 space-y-2">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm mã hoặc tên bài..."
            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-outline-variant/60 bg-surface focus:outline-none focus:border-secondary"
          />
          <div className="flex items-center justify-between px-1">
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-[11px] font-semibold text-secondary hover:underline"
            >
              Chọn tất cả
            </button>
            <span className="text-[11px] text-on-surface-variant">
              {selectedCount}/{assignments.length}
            </span>
          </div>
          <div className="max-h-64 overflow-y-auto space-y-0.5">
            {filtered.length === 0 ? (
              <p className="text-[11px] text-on-surface-variant px-2 py-3">Không khớp bài nào.</p>
            ) : (
              filtered.map((item) => {
                const checked = allSelected || selectedIds.includes(item.id);
                return (
                  <label
                    key={item.id}
                    className="flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-container-low/70 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={checked}
                      onChange={(e) => toggle(item.id, e.target.checked)}
                    />
                    <span className="min-w-0">
                      <span className="block font-mono text-[10px] text-outline">{item.code}</span>
                      <span className="block text-xs text-on-surface leading-snug">{item.title}</span>
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
