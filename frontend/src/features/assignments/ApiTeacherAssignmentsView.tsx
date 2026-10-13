'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import TeacherShell from '@/components/TeacherShell';
import { listTeacherAssignments, closeTeacherAssignment } from '@/lib/api/teacher-assignments';
import { ApiError, type ApiTeacherAssignment } from '@/lib/api/types';

const statusLabel: Record<ApiTeacherAssignment['status'], string> = {
  DRAFT: 'Bản nháp',
  PUBLISHED: 'Đang giao',
  CLOSED: 'Đã đóng',
};

export default function ApiTeacherAssignmentsView() {
  const [rows, setRows] = useState<ApiTeacherAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'PUBLISHED' | 'DRAFT' | 'CLOSED'>('all');
  const [showCallout, setShowCallout] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listTeacherAssignments();
      setRows(data);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Không tải được danh sách đề.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleClose = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      await closeTeacherAssignment(id);
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Không thể đóng đề.');
    } finally {
      setBusy(null);
    }
  };

  const publishedCount = rows.filter((a) => a.status === 'PUBLISHED').length;
  const draftCount = rows.filter((a) => a.status === 'DRAFT').length;
  const closedCount = rows.filter((a) => a.status === 'CLOSED').length;

  const totalActionQueue = rows.reduce(
    (sum, r) =>
      sum +
      (r.worklist?.awaitingPrivacy || 0) +
      (r.worklist?.ocrQueue || 0) +
      (r.worklist?.waitingGrade || 0),
    0,
  );

  const filteredAssignments = rows.filter((a) => {
    if (activeFilter === 'all') return true;
    return a.status === activeFilter;
  });

  return (
    <TeacherShell>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-headline-lg text-2xl sm:text-3xl font-bold text-on-surface font-merriweather">
              Quản lý Bài tập theo Lớp
            </h1>
            <p className="text-sm text-on-surface-variant mt-1">
              Theo dõi chu trình giao đề, nạp học liệu, giám sát Socratic và kiểm soát kết quả chấm Rubric.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/materials"
              className="px-4 py-2 rounded-lg border border-outline-variant/60 bg-surface-container-lowest hover:bg-surface-container text-sm font-medium text-on-surface flex items-center gap-2 transition-all shadow-sm"
            >
              <span className="material-symbols-outlined text-[18px]">menu_book</span>
              <span>Quản lý Kho học liệu</span>
            </Link>
            <Link
              data-testid="create-assignment"
              href="/assignments/new"
              className="px-4 py-2 rounded-lg bg-primary-container text-on-primary-container hover:brightness-95 text-sm font-semibold flex items-center gap-2 transition-all shadow-sm"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              <span>+ Tạo bài tập mới</span>
            </Link>
          </div>
        </div>

        {/* Class Selector & Metric Banner */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs text-on-surface-variant font-medium">Lớp phụ trách</span>
              <div className="text-base font-bold text-on-surface mt-0.5">
                Lớp 12A1 • THPT Đan Phượng
              </div>
              <span className="text-[11px] text-secondary font-semibold">Tổ Ngữ văn • Năm học 2024-2025</span>
            </div>
            <div className="w-10 h-10 rounded-full bg-surface-container-low flex items-center justify-center text-primary">
              <span className="material-symbols-outlined">school</span>
            </div>
          </div>

          <div className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs text-on-surface-variant font-medium">Tổng số đề bài</span>
              <div className="text-base font-bold text-on-surface mt-0.5">
                {rows.length} đề bài ({publishedCount} đang giao)
              </div>
              <span className="text-[11px] text-tertiary font-semibold">
                {draftCount} bản nháp đang hoàn thiện
              </span>
            </div>
            <div className="w-10 h-10 rounded-full bg-tertiary-container/30 text-tertiary flex items-center justify-center font-bold text-xs">
              {rows.length}
            </div>
          </div>

          <div className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs text-on-surface-variant font-medium">Hàng đợi xử lý bài nộp</span>
              <div className="text-base font-bold text-on-surface mt-0.5">
                {totalActionQueue} tác vụ cần duyệt
              </div>
              <span className="text-[11px] text-[#CA8A04] font-semibold">
                Duyệt ảnh, kiểm tra OCR &amp; Chấm
              </span>
            </div>
            <div className="w-10 h-10 rounded-full bg-secondary-fixed/50 text-secondary flex items-center justify-center">
              <span className="material-symbols-outlined">auto_awesome</span>
            </div>
          </div>
        </div>

        {/* Dismissible Pedagogy Callout */}
        {showCallout && (
          <div className="p-4 bg-surface-container-low/70 border border-secondary/20 rounded-xl flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-secondary text-xl mt-0.5">lightbulb</span>
              <div className="text-xs leading-relaxed text-on-surface">
                <p className="font-semibold text-secondary">Nguyên tắc triển khai GDPT 2018:</p>
                <p className="text-on-surface-variant mt-0.5">
                  Mỗi bài viết cần gắn với ít nhất <strong>01 học liệu chuẩn</strong> và <strong>Barem Rubric đã xác nhận</strong>.
                  Trợ lý Socratic sẽ đồng hành hướng dẫn học sinh lập dàn ý thông qua các câu hỏi mở mà không viết hộ.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowCallout(false)}
              className="text-on-surface-variant hover:text-on-surface p-1"
            >
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </div>
        )}

        {/* Toolbar & Filter Chips */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setActiveFilter('all')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                activeFilter === 'all'
                  ? 'bg-primary-container text-on-primary-container shadow-sm'
                  : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container border border-outline-variant/40'
              }`}
            >
              Tất cả ({rows.length})
            </button>
            <button
              onClick={() => setActiveFilter('PUBLISHED')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                activeFilter === 'PUBLISHED'
                  ? 'bg-primary-container text-on-primary-container shadow-sm'
                  : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container border border-outline-variant/40'
              }`}
            >
              Đang giao ({publishedCount})
            </button>
            <button
              onClick={() => setActiveFilter('DRAFT')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                activeFilter === 'DRAFT'
                  ? 'bg-primary-container text-on-primary-container shadow-sm'
                  : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container border border-outline-variant/40'
              }`}
            >
              Bản nháp ({draftCount})
            </button>
            <button
              onClick={() => setActiveFilter('CLOSED')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                activeFilter === 'CLOSED'
                  ? 'bg-primary-container text-on-primary-container shadow-sm'
                  : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container border border-outline-variant/40'
              }`}
            >
              Đã đóng ({closedCount})
            </button>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 rounded-lg border border-error/30 bg-error-container/40 p-3 text-sm text-error"
          >
            <span>{error}</span>
            <button className="font-semibold underline" onClick={() => void load()}>
              Thử lại
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-on-surface-variant">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            Đang tải danh sách đề từ máy chủ...
          </div>
        ) : filteredAssignments.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-xl p-12 text-center border border-outline-variant/30 shadow-sm max-w-md mx-auto my-8">
            <div className="w-16 h-16 rounded-full bg-surface-container-low flex items-center justify-center text-on-surface-variant mx-auto mb-4">
              <span className="material-symbols-outlined text-3xl">assignment_late</span>
            </div>
            <h3 className="text-base font-bold text-on-surface mb-1">Chưa có bài tập nào</h3>
            <p className="text-xs text-on-surface-variant mb-6 leading-relaxed">
              Hãy khởi tạo bài viết đầu tiên, nạp ngữ liệu và thiết lập thang điểm Rubric GDPT 2018 cho học sinh.
            </p>
            <Link
              href="/assignments/new"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-container text-on-primary-container rounded-lg text-xs font-semibold hover:brightness-95 transition-all shadow-sm"
            >
              <span className="material-symbols-outlined text-base">add</span>
              <span>Tạo bài tập đầu tiên</span>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filteredAssignments.map((row) => (
              <article
                key={row.id}
                data-testid={`teacher-assignment-${row.code}`}
                className="bg-surface-container-lowest rounded-xl p-5 border border-outline-variant/30 shadow-sm hover:border-outline-variant/80 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <span
                      className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                        row.status === 'PUBLISHED'
                          ? 'bg-tertiary-container/30 text-tertiary'
                          : row.status === 'DRAFT'
                          ? 'bg-surface-container-high text-on-surface-variant'
                          : 'bg-[#FEF9C3] text-[#CA8A04]'
                      }`}
                    >
                      {statusLabel[row.status]}
                    </span>
                    <span className="text-[11px] text-on-surface-variant font-mono font-semibold">
                      Mã: {row.code}
                    </span>
                  </div>

                  <h3 className="font-headline-sm text-base font-bold text-on-surface font-merriweather mb-1 leading-snug">
                    {row.title}
                  </h3>
                  <p className="text-xs text-on-surface-variant line-clamp-2 mb-4 leading-relaxed">
                    {row.instructions}
                  </p>

                  {/* Worklist / Submissions mini dashboard */}
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-xs text-on-surface-variant mb-4 p-2.5 bg-surface-container-low/40 rounded-lg">
                    <div>
                      <span className="text-[10px] text-outline block">Đã đọc:</span>
                      <span className="font-semibold text-on-surface">{row.worklist?.read ?? 0}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-outline block">Đã nộp:</span>
                      <span className="font-semibold text-on-surface">{row.worklist?.submitted ?? 0}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-outline block">Duyệt ảnh:</span>
                      <span className={`font-semibold ${(row.worklist?.awaitingPrivacy ?? 0) > 0 ? 'text-[#CA8A04]' : 'text-on-surface'}`}>
                        {row.worklist?.awaitingPrivacy ?? 0}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-outline block">Hàng OCR:</span>
                      <span className="font-semibold text-on-surface">{row.worklist?.ocrQueue ?? 0}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-outline block">Chờ chấm:</span>
                      <span className="font-semibold text-on-surface">{row.worklist?.waitingGrade ?? 0}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-outline block">Đã ra điểm:</span>
                      <span className="font-semibold text-tertiary">{row.worklist?.published ?? 0}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-outline-variant/20 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/assignments/${row.id}`}
                      className="px-3 py-1.5 rounded-lg border border-outline-variant/50 text-xs text-on-surface font-medium hover:bg-surface-container transition-all"
                    >
                      {row.status === 'DRAFT' ? 'Tiếp tục soạn đề' : 'Chi tiết đề & Rubric'}
                    </Link>
                    {row.status !== 'DRAFT' && (
                      <Link
                        data-testid={`teacher-worklist-${row.code}`}
                        href={`/reports/${row.id}`}
                        className="px-3 py-1.5 rounded-lg bg-secondary text-white text-xs font-semibold hover:bg-secondary/90 transition-all flex items-center gap-1.5 shadow-sm"
                      >
                        <span className="material-symbols-outlined text-[16px]">rule</span>
                        <span>Hàng chờ bài nộp</span>
                      </Link>
                    )}
                  </div>

                  {row.status === 'PUBLISHED' && (
                    <button
                      disabled={busy === row.id}
                      onClick={() => void handleClose(row.id)}
                      className="px-3 py-1.5 rounded-lg border border-error/30 text-xs text-error font-medium hover:bg-error-container/30 transition-all disabled:opacity-40"
                    >
                      {busy === row.id ? 'Đang đóng…' : 'Đóng đề'}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </TeacherShell>
  );
}
