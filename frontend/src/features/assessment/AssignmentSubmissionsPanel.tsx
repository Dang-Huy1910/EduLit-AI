'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { assessmentApi } from './api';
import type { ClassReport } from './types';
import { formatScore, rowStatusLabel } from './labels';
import { revisionScoreTrail, roundLabel } from './revision';
import DueAtEditor from '@/features/assignments/DueAtEditor';
import { downloadBlob } from '@/features/catalog/download';
import StatsModeToggle from './StatsModeToggle';
import { AuthApiError } from '@/lib/auth-types';

const PAGE_SIZE = 10;

export default function AssignmentSubmissionsPanel({ assignmentId, readOnly = false, reportView = false }: { assignmentId: string; readOnly?: boolean; reportView?: boolean }) {
  const loadSequence = useRef(0);
  const [report, setReport] = useState<ClassReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [studentSearch, setStudentSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortOrder, setSortOrder] = useState<'default' | 'score_desc' | 'score_asc'>('default');
  const [currentPage, setCurrentPage] = useState(1);
  const [busyStudent, setBusyStudent] = useState('');
  const [exporting, setExporting] = useState(false);
  const [mode, setMode] = useState(reportView ? '' : 'provisional');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setError('');
    try {
      const data = await assessmentApi.classReport(assignmentId, {
        search: studentSearch,
        status: filterStatus,
        sort: sortOrder,
        page: currentPage,
        pageSize: PAGE_SIZE,
        mode: mode || undefined,
        from: dateFrom,
        to: dateTo,
      });
      if (sequence === loadSequence.current) setReport(data);
    } catch (err) {
      if (sequence !== loadSequence.current) return;
      setError(err instanceof AuthApiError ? err.message : 'Không tải được danh sách bài nộp.');
      setReport(null);
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [assignmentId, studentSearch, filterStatus, sortOrder, currentPage, mode, dateFrom, dateTo]);

  useEffect(() => {
    const requests = loadSequence;
    void load();
    return () => { requests.current++; };
  }, [load]);

  const saveExtension = async (studentId: string, dueAt: string | null) => {
    setBusyStudent(studentId);
    setError('');
    try {
      await assessmentApi.setDueExtension(assignmentId, studentId, dueAt);
      await load();
      return true;
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : 'Không lưu được gia hạn.');
      return false;
    } finally { setBusyStudent(''); }
  };

  const exportReport = async () => {
    setExporting(true);
    setError('');
    try {
      downloadBlob(await assessmentApi.exportReport(assignmentId, {
        search: studentSearch, status: filterStatus, sort: sortOrder,
        mode: mode || report?.mode, from: dateFrom, to: dateTo,
      }));
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : 'Không xuất được Excel.');
    } finally { setExporting(false); }
  };

  const students = report?.students;
  const stats = report?.stats;
  const maxScore = stats?.maxScore ?? report?.assignment.maxScore ?? 0;
  const totalPages = students?.totalPages || 1;
  const safePage = Math.min(Math.max(currentPage, 1), totalPages);
  const startIndex = students && students.total ? (students.page - 1) * students.pageSize : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {reportView && <StatsModeToggle mode={mode || report?.mode || 'provisional'} onChange={(next) => { setMode(next); setCurrentPage(1); }} />}
        <button type="button" onClick={() => void exportReport()} disabled={exporting || loading || !report}
          className="px-3 py-2 rounded-lg border border-outline-variant/60 font-semibold hover:bg-surface-container focus-visible:ring-2 focus-visible:ring-secondary/40 disabled:opacity-40">
          {exporting ? 'Đang xuất...' : 'Xuất Excel'}
        </button>
        <Link href={`/reports/${assignmentId}/print`} className="font-semibold text-secondary hover:underline">In phiếu cả lớp</Link>
        {!reportView && <Link href={`/reports/${assignmentId}`} className="font-semibold text-secondary hover:underline">Báo cáo bài tập</Link>}
      </div>
      {reportView && <div className="flex flex-wrap gap-3 text-xs">
        <label>Từ ngày <input aria-label="Từ ngày" type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setCurrentPage(1); }} className="p-2 border rounded-lg" /></label>
        <label>Đến ngày <input aria-label="Đến ngày" type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setCurrentPage(1); }} className="p-2 border rounded-lg" /></label>
      </div>}
      {error ? <p className="text-sm text-error">{error}</p> : null}
      {stats ? (
        <div className="p-4 glass-panel rounded-2xl shadow-xs flex flex-wrap gap-4 text-xs">
          <span>
            Được giao: <strong>{stats.assignedStudents ?? stats.assigned}</strong>
          </span>
          <span>Đã nộp chính thức: <strong>{stats.officialSubmitted}</strong></span>
          <span>Chờ rà soát: <strong>{stats.awaitingReview}</strong></span>
          <span>Đã công bố: <strong>{stats.published}</strong></span>
          <span>Nộp muộn: <strong>{stats.late ?? 0}</strong></span>
          <span>Lỗi xử lý: <strong>{stats.failed}</strong></span>
        </div>
      ) : null}

      <div className="glass-panel p-5 rounded-2xl shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-outline-variant/20">
          <div>
            <h3 className="font-bold text-sm text-on-surface font-merriweather">
              Danh sách học sinh được giao ({students?.total ?? 0})
            </h3>
            <p className="text-[11px] text-on-surface-variant">
              Gồm cả chưa nộp. Tải ảnh chưa phải nộp chính thức. Bấm học sinh để rà soát bài chấm của đúng đề này.
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
              aria-label="Lọc trạng thái"
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-outline-variant/60 bg-surface text-on-surface"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="late">Nộp muộn</option>
              <option value="revised">Đã viết lại</option>
              <option value="not_submitted">Chưa nộp</option>
              <option value="processing">Đang xử lý</option>
              <option value="ocr_review">Đang rà OCR</option>
              <option value="ocr_failed">Lỗi OCR</option>
              <option value="grading">Đang chấm</option>
              <option value="awaiting_review">Chờ rà soát</option>
              <option value="published">Đã công bố</option>
              <option value="pending">Chưa công bố</option>
              <option value="grading_failed">Lỗi chấm</option>
              <option value="revising">Đang sửa bản chép</option>
              <option value="new_version_grading">Bản mới đang chấm</option>
              <option value="new_version_review">Bản mới chờ công bố</option>
              <option value="new_version_failed">Bản mới lỗi chấm</option>
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

        {loading ? <p className="text-sm text-on-surface-variant">Đang tải bài nộp...</p> : null}

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-surface-container-low text-on-surface-variant uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-2.5 px-3 rounded-l-lg">Họ và tên học sinh</th>
                <th className="py-2.5 px-3">Mã học sinh</th>
                <th className="py-2.5 px-3">Số trang ảnh</th>
                <th className="py-2.5 px-3">Điểm đang rà soát</th>
                <th className="py-2.5 px-3">Điểm đã công bố</th>
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
                    <td className="py-3 px-3 font-mono font-bold text-primary">
                      {st.workingScore == null ? '—' : `${formatScore(st.workingScore)} / ${formatScore(maxScore)}đ`}
                    </td>
                    <td className="py-3 px-3 font-mono font-semibold text-secondary">
                      {st.publishedScore == null ? '—' : `${formatScore(st.publishedScoreScale10)} / 10`}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          st.isPublished ? 'bg-tertiary-container/40 text-tertiary' : 'bg-[#FEF9C3] text-[#CA8A04]'
                        }`}
                      >
                        {rowStatusLabel(st.status)}
                      </span>
                      {st.isLate && <span className="block text-xs font-semibold text-error mt-1">Nộp muộn</span>}
                      <span className="block text-xs font-semibold mt-1">{roundLabel(st.revisionRound)}</span>
                      {revisionScoreTrail(st) && <span className="block text-xs mt-1">{revisionScoreTrail(st)}</span>}
                      {st.hasExtension && <span className="block text-xs mt-1">Đã được gia hạn</span>}
                      {st.effectiveDueAt && <span className="block text-xs text-on-surface-variant mt-1">Hạn: {new Date(st.effectiveDueAt).toLocaleString('vi-VN')}</span>}
                      {st.hasNewUnpublishedVersion ? (
                        <span className="block text-[10px] text-[#854D0E] mt-1">Có bản nộp mới chưa công bố</span>
                      ) : null}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <Link
                        href={`/assignments/${assignmentId}/students/${st.studentId}/assessment`}
                        className="px-3 py-1 bg-secondary text-white rounded text-xs font-semibold hover:bg-secondary/90 inline-flex items-center gap-1"
                      >
                        <span>Xem chi tiết chấm</span>
                        <span className="material-symbols-outlined text-xs">visibility</span>
                      </Link>
                      <div className="flex flex-wrap items-center justify-end gap-2 mt-2">
                        <DueAtEditor dueAt={st.hasExtension ? st.effectiveDueAt || null : null} extension label={`Gia hạn cho ${st.name}`}
                          busy={busyStudent === st.studentId} disabled={readOnly || busyStudent !== ''} triggerClassName="inline-flex items-center gap-1 text-secondary font-semibold"
                          onSave={(dueAt) => saveExtension(st.studentId, dueAt)}>Gia hạn</DueAtEditor>
                        {st.hasExtension && <button type="button" disabled={readOnly || busyStudent !== ''} onClick={() => void saveExtension(st.studentId, null)}
                          className="text-error hover:underline disabled:opacity-40">Gỡ gia hạn</button>}
                        {st.isPublished && <Link href={`/reports/${assignmentId}/students/${st.studentId}/print`} className="text-secondary font-semibold hover:underline">In phiếu</Link>}
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
    </div>
  );
}
