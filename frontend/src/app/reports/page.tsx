'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import TeacherShell from '@/components/TeacherShell';
import { assessmentApi } from '@/features/assessment/api';
import type { ClassReport, ClassReportAssignment } from '@/features/assessment/types';
import { AuthApiError } from '@/lib/auth-types';

const PAGE_SIZE = 5;

function formatScore(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toFixed(digits);
}

function rowStatusLabel(status: string): string {
  const map: Record<string, string> = {
    not_submitted: 'Chưa nộp',
    processing: 'Đang xử lý',
    ocr_review: 'Đang rà OCR',
    ocr_failed: 'Lỗi OCR',
    grading: 'Đang chấm',
    awaiting_review: 'Chờ rà soát',
    published: 'Đã công bố',
    grading_failed: 'Lỗi chấm',
    revising: 'Đang sửa bản chép',
    new_version_grading: 'Bản mới đang chấm',
    new_version_review: 'Bản mới chờ công bố',
    new_version_failed: 'Bản mới lỗi chấm',
  };
  return map[status] || status;
}

function insightStatusLabel(status: string, stale: boolean): string {
  if (status === 'QUEUED' || status === 'PROCESSING') return 'Đang phân tích...';
  if (status === 'FAILED') return 'Phân tích lỗi';
  if (status === 'READY' && stale) return 'Cần cập nhật';
  if (status === 'READY') return 'Đã có phân tích';
  return 'Chưa có phân tích';
}

function ReportsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const assignmentFromUrl = searchParams.get('assignmentId') || '';

  const [assignments, setAssignments] = useState<ClassReportAssignment[]>([]);
  const [assignmentId, setAssignmentId] = useState(assignmentFromUrl);
  const [report, setReport] = useState<ClassReport | null>(null);
  const [error, setError] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [busyInsight, setBusyInsight] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortOrder, setSortOrder] = useState<'default' | 'score_desc' | 'score_asc'>('default');
  const [currentPage, setCurrentPage] = useState(1);
  const [unavailableHint, setUnavailableHint] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await assessmentApi.listAssignments();
        if (cancelled) return;
        setAssignments(data.items || []);
        if (!assignmentFromUrl && data.items?.length) {
          setAssignmentId(data.items[0].id);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof AuthApiError ? err.message : 'Không tải được danh sách bài tập.');
        }
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadReport = useCallback(
    async (id: string, page = currentPage, search = studentSearch, status = filterStatus, sort = sortOrder) => {
      if (!id) return;
      setLoadingReport(true);
      setError('');
      try {
        const data = await assessmentApi.classReport(id, {
          search,
          status,
          sort,
          page,
          pageSize: PAGE_SIZE,
        });
        setReport(data);
      } catch (err) {
        setError(err instanceof AuthApiError ? err.message : 'Không tải được báo cáo lớp.');
        setReport(null);
      } finally {
        setLoadingReport(false);
      }
    },
    [currentPage, studentSearch, filterStatus, sortOrder]
  );

  useEffect(() => {
    if (!assignmentId) return;
    void loadReport(assignmentId, currentPage, studentSearch, filterStatus, sortOrder);
  }, [assignmentId, currentPage, studentSearch, filterStatus, sortOrder, loadReport]);

  useEffect(() => {
    const insightStatus = report?.insight?.status;
    if (insightStatus !== 'QUEUED' && insightStatus !== 'PROCESSING') return;
    if (!assignmentId) return;
    const timer = window.setInterval(() => {
      void assessmentApi
        .classReport(assignmentId, {
          search: studentSearch,
          status: filterStatus,
          sort: sortOrder,
          page: currentPage,
          pageSize: PAGE_SIZE,
        })
        .then(setReport)
        .catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [assignmentId, report?.insight?.status, studentSearch, filterStatus, sortOrder, currentPage]);

  const handleSelectAssignment = (id: string) => {
    setAssignmentId(id);
    setCurrentPage(1);
    router.replace(`/reports?assignmentId=${encodeURIComponent(id)}`);
  };

  const handleToggleSortScore = () => {
    setCurrentPage(1);
    setSortOrder((prev) => {
      if (prev === 'default') return 'score_desc';
      if (prev === 'score_desc') return 'score_asc';
      return 'default';
    });
  };

  const handleInsight = async () => {
    if (!assignmentId) return;
    setBusyInsight(true);
    try {
      const data = await assessmentApi.enqueueInsight(assignmentId);
      setReport(data);
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : 'Không tạo được phân tích lớp.');
    } finally {
      setBusyInsight(false);
    }
  };

  const stats = report?.stats;
  const students = report?.students;
  const totalPages = students?.totalPages || 1;
  const safePage = Math.min(Math.max(currentPage, 1), totalPages);
  const startIndex = students && students.total ? (students.page - 1) * students.pageSize : 0;
  const maxScore = stats?.maxScore ?? report?.assignment.maxScore ?? 0;
  const selected = useMemo(
    () => assignments.find((item) => item.id === assignmentId) || assignments[0],
    [assignments, assignmentId]
  );
  const insight = report?.insight;
  const distMax = Math.max(...(stats?.distribution || []).map((d) => d.count), 0);

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
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="text-xs bg-secondary-fixed/50 text-secondary font-bold px-2 py-0.5 rounded-full">
                Báo cáo sư phạm GDPT 2018
              </span>
              <span className="text-xs text-on-surface-variant font-medium">
                {report?.assignment.classroomName || selected?.classroomName || 'Chưa gắn lớp'}
              </span>
            </div>
            <h1 className="font-headline-lg text-2xl sm:text-3xl font-bold text-on-surface font-merriweather">
              Báo cáo năng lực: {report?.assignment.title || selected?.title || 'Chọn bài tập'}
            </h1>
            <div className="mt-2">
              <select
                value={assignmentId}
                onChange={(e) => handleSelectAssignment(e.target.value)}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-outline-variant/60 bg-surface text-on-surface"
              >
                {assignments.length === 0 ? <option value="">Chưa có bài tập đã giao</option> : null}
                {assignments.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.code} — {item.title}
                    {item.classroomName ? ` (${item.classroomName})` : ''}
                  </option>
                ))}
              </select>
            </div>
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
        {error ? <p className="text-sm text-error">{error}</p> : null}
        {loadingList || loadingReport ? (
          <p className="text-sm text-on-surface-variant">Đang tải báo cáo lớp...</p>
        ) : null}

        {report && stats ? (
          <>
            <div className="p-4 bg-surface-container-low/80 rounded-xl border border-outline-variant/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-4 text-on-surface">
                <span>
                  Được giao: <strong>{stats.assigned} học sinh</strong>
                </span>
                <span>•</span>
                <span>
                  Đã nộp chính thức: <strong>{stats.officialSubmitted} bài</strong>
                </span>
                <span>•</span>
                <span className="text-tertiary font-semibold">
                  Đã công bố: <strong>{stats.published} bài</strong>
                </span>
                <span>•</span>
                <span>Đang xử lý: {stats.processing}</span>
                <span>•</span>
                <span>Chờ rà soát: {stats.awaitingReview}</span>
                <span>•</span>
                <span>Lỗi xử lý: {stats.failed}</span>
              </div>
              <div className="flex items-center gap-2 text-primary bg-primary-fixed/30 px-3 py-1 rounded-full font-medium text-[11px]">
                <span className="material-symbols-outlined text-sm">assignment_turned_in</span>
                <span>
                  Giáo viên: {report.assignment.teacherName} · Barem {formatScore(maxScore)}đ
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm">
                <span className="text-xs text-on-surface-variant block">Đã nộp chính thức</span>
                <span className="text-2xl font-bold text-on-surface font-merriweather mt-1 block">
                  {stats.officialSubmitted} / {stats.assigned}
                </span>
                <span className="text-[11px] text-on-surface-variant mt-1 block">Kể cả bài đang chờ công bố</span>
              </div>
              <div className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm">
                <span className="text-xs text-on-surface-variant block">Điểm trung bình (barem {formatScore(maxScore)}đ)</span>
                <span className="text-2xl font-bold text-secondary font-merriweather mt-1 block font-mono">
                  {stats.meanScore === null ? 'Chưa có dữ liệu' : `${formatScore(stats.meanScore)} / ${formatScore(maxScore)}đ`}
                </span>
                <span className="text-[11px] text-secondary font-semibold mt-1 block">
                  {stats.meanScoreScale10 === null
                    ? 'Chỉ tính bài đã công bố'
                    : `Quy đổi: ${formatScore(stats.meanScoreScale10)} / 10.0đ`}
                </span>
              </div>
              <div className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm">
                <span className="text-xs text-on-surface-variant block">
                  Phân bố thang 10 (n={stats.publishedCount})
                </span>
                <div className="text-xs font-semibold text-on-surface mt-1.5 space-y-0.5">
                  {stats.publishedCount === 0 ? (
                    <span className="text-on-surface-variant block">Chưa có dữ liệu</span>
                  ) : (
                    stats.distribution.map((item) => (
                      <span key={item.range} className="block">
                        {item.range}: {item.count} bài
                      </span>
                    ))
                  )}
                </div>
              </div>
              <div className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm">
                <span className="text-xs text-on-surface-variant block">Trạng thái công bố</span>
                <span className="text-2xl font-bold text-primary font-merriweather mt-1 block">
                  {stats.published} / {stats.assigned}
                </span>
                <span className="text-[11px] text-on-surface-variant mt-1 block">Đã hiển thị phía học sinh</span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-6 bg-surface-container-lowest p-5 rounded-xl border border-outline-variant/30 shadow-sm space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
                  <span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm">bar_chart</span>
                    <span>Phổ điểm (thang 10 quy đổi)</span>
                  </span>
                  <span className="text-[11px] text-on-surface-variant font-medium">n = {stats.publishedCount} bài</span>
                </div>
                <div className="space-y-3 pt-2">
                  {stats.publishedCount === 0 ? (
                    <p className="text-xs text-on-surface-variant">Chưa có dữ liệu</p>
                  ) : (
                    stats.distribution.map((item) => {
                      const percent = distMax ? (item.count / distMax) * 100 : 0;
                      return (
                        <div key={item.range} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-mono font-medium text-on-surface">{item.range}</span>
                            <span className="font-bold text-secondary font-mono">{item.count} bài</span>
                          </div>
                          <div className="w-full bg-surface-container-low h-2.5 rounded-full overflow-hidden">
                            <div className="bg-primary h-full rounded-full" style={{ width: `${percent}%` }} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="lg:col-span-6 bg-surface-container-lowest p-5 rounded-xl border border-outline-variant/30 shadow-sm space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
                  <span className="text-xs font-bold uppercase tracking-wider text-secondary flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm">psychology_alt</span>
                    <span>Gợi ý điều chỉnh giáo án</span>
                  </span>
                  <button
                    type="button"
                    disabled={busyInsight}
                    onClick={() => void handleInsight()}
                    className="px-2.5 py-1 rounded-lg border text-[11px] font-semibold"
                  >
                    {insight?.status === 'READY' ? 'Cập nhật phân tích' : 'Tạo phân tích'}
                  </button>
                </div>
                <p className="text-[11px] text-on-surface-variant">
                  {insightStatusLabel(insight?.status || '', Boolean(insight?.stale))}. GET/tải lại trang không gọi AI.
                </p>
                {insight?.error ? <p className="text-[11px] text-error">{insight.error}</p> : null}
                {insight?.payload?.priorities?.length ? (
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
                ) : (
                  <p className="text-xs text-on-surface-variant">Chưa có gợi ý. Bấm tạo phân tích sau khi có bài đã công bố.</p>
                )}
                <div className="pt-2 border-t border-outline-variant/20 space-y-2">
                  <span className="text-[11px] font-bold uppercase text-on-surface-variant">Lỗi phổ biến (từ bài đã công bố)</span>
                  {stats.issues.length === 0 ? (
                    <p className="text-xs text-on-surface-variant">Chưa có dữ liệu</p>
                  ) : (
                    stats.issues.map((issue) => (
                      <div key={issue.code} className="p-3 bg-surface-container-low/60 rounded-xl border text-xs space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold">{issue.label}</span>
                          <span className="text-[10px] font-bold text-error bg-error-container/40 px-2 py-0.5 rounded-full">
                            {issue.studentCount}/{issue.denominator} HS
                          </span>
                        </div>
                        <p className="text-[11px] text-on-surface-variant font-mono">{issue.code}</p>
                        <p className="text-[11px] text-on-surface-variant">
                          {issue.occurrenceCount} lần xuất hiện · {issue.studentCount} học sinh
                          {issue.studentRate !== null ? ` (${Math.round(issue.studentRate * 100)}% / ${issue.denominator} bài đã công bố)` : ''}
                        </p>
                        <p className="text-[11px] text-on-surface-variant">
                          {issue.teacherConfirmed
                            ? 'Giáo viên đã điều chỉnh/xác nhận'
                            : issue.source === 'mixed'
                              ? 'Gồm cả AI và giáo viên; không coi cả nhóm là đã xác nhận'
                              : 'AI phát hiện, chưa coi là giáo viên xác nhận'}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant/30 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-outline-variant/20">
                <div>
                  <h3 className="font-bold text-sm text-on-surface font-merriweather">
                    Danh sách học sinh được giao ({students?.total ?? 0} học sinh)
                  </h3>
                  <p className="text-[11px] text-on-surface-variant">
                    Gồm cả chưa nộp. Điểm chính thức chỉ hiện khi đã công bố. Bấm xem chi tiết để rà soát.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    placeholder="Tìm theo tên hoặc mã HS..."
                    value={studentSearch}
                    onChange={(e) => {
                      setStudentSearch(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="px-3 py-1.5 text-xs rounded-lg border border-outline-variant/60 bg-surface text-on-surface focus:outline-none focus:border-secondary w-44 sm:w-52"
                  />
                  <select
                    value={filterStatus}
                    onChange={(e) => {
                      setFilterStatus(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="px-2.5 py-1.5 text-xs rounded-lg border border-outline-variant/60 bg-surface text-on-surface"
                  >
                    <option value="all">Tất cả trạng thái</option>
                    <option value="not_submitted">Chưa nộp</option>
                    <option value="processing">Đang xử lý</option>
                    <option value="awaiting_review">Chờ rà soát</option>
                    <option value="published">Đã công bố</option>
                    <option value="pending">Chưa công bố</option>
                    <option value="grading_failed">Lỗi chấm</option>
                    <option value="revising">Đang sửa bản chép</option>
                  </select>
                  <select
                    value={sortOrder}
                    onChange={(e) => {
                      setSortOrder(e.target.value as 'default' | 'score_desc' | 'score_asc');
                      setCurrentPage(1);
                    }}
                    className="px-2.5 py-1.5 text-xs rounded-lg border border-outline-variant/60 bg-surface text-on-surface font-medium"
                  >
                    <option value="default">Sắp xếp: Tên</option>
                    <option value="score_desc">Điểm: Cao nhất → Thấp</option>
                    <option value="score_asc">Điểm: Thấp nhất → Cao</option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-surface-container-low text-on-surface-variant uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3 rounded-l-lg">Họ và tên học sinh</th>
                      <th className="py-2.5 px-3">Mã học sinh</th>
                      <th className="py-2.5 px-3">Số trang ảnh</th>
                      <th
                        onClick={handleToggleSortScore}
                        className="py-2.5 px-3 cursor-pointer select-none hover:text-primary"
                      >
                        Điểm (barem {formatScore(maxScore)}đ)
                      </th>
                      <th className="py-2.5 px-3">Quy đổi thang 10</th>
                      <th className="py-2.5 px-3">Trạng thái</th>
                      <th className="py-2.5 px-3 rounded-r-lg text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/20">
                    {(students?.items || []).length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-on-surface-variant italic">
                          Chưa có học sinh trong bộ lọc này.
                        </td>
                      </tr>
                    ) : (
                      (students?.items || []).map((st) => (
                        <tr key={st.studentId} className="hover:bg-surface-container-low/40">
                          <td className="py-3 px-3">
                            <span className="font-bold text-on-surface block">{st.name}</span>
                          </td>
                          <td className="py-3 px-3 font-mono text-outline">{st.code}</td>
                          <td className="py-3 px-3 font-mono">{st.pageCount ? `${st.pageCount} trang` : '—'}</td>
                          <td className="py-3 px-3">
                            <span className="font-bold text-primary font-mono text-sm">
                              {st.score === null ? '—' : `${formatScore(st.score)} / ${formatScore(maxScore)}đ`}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <span className="font-semibold text-secondary font-mono">
                              {st.scoreScale10 === null ? '—' : `${formatScore(st.scoreScale10)} / 10.0đ`}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                st.isPublished
                                  ? 'bg-tertiary-container/40 text-tertiary'
                                  : 'bg-[#FEF9C3] text-[#CA8A04]'
                              }`}
                            >
                              {rowStatusLabel(st.status)}
                            </span>
                            {st.hasNewUnpublishedVersion ? (
                              <span className="block text-[10px] text-[#854D0E] mt-1">Có bản nộp mới chưa công bố</span>
                            ) : null}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <Link
                              href={`/reports/${report.assignment.id}/students/${st.studentId}`}
                              className="px-3 py-1 bg-secondary text-white rounded text-xs font-semibold hover:bg-secondary/90 inline-flex items-center gap-1"
                            >
                              <span>Xem chi tiết chấm</span>
                              <span className="material-symbols-outlined text-xs">visibility</span>
                            </Link>
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
                    <button type="button" onClick={() => setCurrentPage(1)} disabled={safePage === 1} className="p-1.5 rounded-lg border disabled:opacity-30">
                      <span className="material-symbols-outlined text-[16px]">first_page</span>
                    </button>
                    <button type="button" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={safePage === 1} className="px-2.5 py-1 rounded-lg border disabled:opacity-30">
                      Trước
                    </button>
                    <span className="px-2 font-semibold text-on-surface">
                      {safePage}/{totalPages}
                    </span>
                    <button type="button" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} className="px-2.5 py-1 rounded-lg border disabled:opacity-30">
                      Sau
                    </button>
                    <button type="button" onClick={() => setCurrentPage(totalPages)} disabled={safePage === totalPages} className="p-1.5 rounded-lg border disabled:opacity-30">
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

export default function ReportsPage() {
  return (
    <React.Suspense fallback={<div className="p-8 text-sm text-on-surface-variant">Đang tải báo cáo...</div>}>
      <ReportsPageInner />
    </React.Suspense>
  );
}
