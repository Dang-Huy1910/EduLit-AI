'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import TeacherShell from '@/components/TeacherShell';
import { useAppStore } from '@/lib/store';
import { CENTRAL_ASSIGNMENT_ID } from '@/lib/mock/assignmentData';

export default function TeacherAssignmentsView() {
  const router = useRouter();
  const { assignments, rubrics, demoMilestone, addToast } = useAppStore();

  const [activeFilter, setActiveFilter] = useState<'all' | 'published' | 'draft' | 'blocked'>('all');
  const [showEmptyState, setShowEmptyState] = useState(false);
  const [showCallout, setShowCallout] = useState(true);

  const publishedCount = assignments.filter((a) => a.status === 'published').length;
  const draftCount = assignments.filter((a) => a.status === 'draft').length;
  const blockedCount = assignments.filter((a) => a.status === 'blocked').length;

  const hasCentralAssignment = assignments.some((a) => a.id === CENTRAL_ASSIGNMENT_ID);
  const totalAssessedCount = assignments.reduce((sum, a) => sum + (a.assessedSubmissions || 0), 0);

  const filteredAssignments = showEmptyState
    ? []
    : assignments.filter((a) => {
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
              href="/assignments/new"
              className="px-4 py-2 rounded-lg bg-primary-container text-on-primary-container hover:brightness-95 text-sm font-semibold flex items-center gap-2 transition-all shadow-sm"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              <span>Tạo bài tập mới</span>
            </Link>
          </div>
        </div>

        {/* Class Selector & Metric Banner */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs text-on-surface-variant font-medium">Lớp phụ trách</span>
              <div className="text-base font-bold text-on-surface mt-0.5">
                Lớp 11A14 • THPT Đan Phượng (41 HS)
              </div>
              <span className="text-[11px] text-secondary font-semibold">Học kỳ I • Năm học 2026-2027</span>
            </div>
            <div className="w-10 h-10 rounded-full bg-surface-container-low flex items-center justify-center text-primary">
              <span className="material-symbols-outlined">school</span>
            </div>
          </div>

          <div className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs text-on-surface-variant font-medium">Trạng thái bài tập</span>
              <div className="text-base font-bold text-on-surface mt-0.5">
                {!hasCentralAssignment
                  ? '02 bài đã hoàn thành'
                  : demoMilestone === 'start'
                  ? '01 bài đang mở nộp'
                  : '01 bài đã hoàn thành'}
              </div>
              <span className="text-[11px] text-tertiary font-semibold">
                {!hasCentralAssignment
                  ? 'Chưa giao bài tập mới'
                  : demoMilestone === 'start'
                  ? '40/41 học sinh đã nộp'
                  : '41/41 học sinh đã nộp'}
              </span>
            </div>
            <div className="w-10 h-10 rounded-full bg-tertiary-container/30 text-tertiary flex items-center justify-center font-bold text-xs">
              {!hasCentralAssignment ? '2 đã xong' : demoMilestone === 'start' ? 'Đang mở' : '100%'}
            </div>
          </div>

          <div className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs text-on-surface-variant font-medium">Tiến độ chấm Rubric AI</span>
              <div className="text-base font-bold text-on-surface mt-0.5">
                {hasCentralAssignment ? `${totalAssessedCount} bài đã chấm` : '80 bài học kỳ I'}
              </div>
              <span className="text-[11px] text-[#CA8A04] font-semibold">
                {hasCentralAssignment ? 'Đạt chuẩn thang điểm 4,0đ' : 'Chờ giao đề số 3'}
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
                <p className="font-semibold text-secondary">
                  {!hasCentralAssignment
                    ? 'Quy trình khởi tạo bài tập mới (GDPT 2018):'
                    : 'Nguyên tắc triển khai GDPT 2018:'}
                </p>
                <p className="text-on-surface-variant mt-0.5">
                  {!hasCentralAssignment
                    ? 'Lớp 11A14 hiện đã hoàn thành 2 bài tập trước. Cô giáo hãy bấm "Tạo bài tập mới" ở góc trên bên phải để nạp ngữ liệu "Màu tự do của đất", cấu hình Barem Rubric 4.0đ và giao đề cho học sinh.'
                    : 'Mỗi bài viết cần gắn với ít nhất 01 học liệu chuẩn và Barem Rubric đã xác nhận. Trợ lý Socratic sẽ đồng hành hướng dẫn học sinh lập dàn ý thông qua các câu hỏi mở mà không viết hộ.'}
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
              onClick={() => {
                setShowEmptyState(false);
                setActiveFilter('all');
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                !showEmptyState && activeFilter === 'all'
                  ? 'bg-primary-container text-on-primary-container shadow-sm'
                  : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container border border-outline-variant/40'
              }`}
            >
              Tất cả ({assignments.length})
            </button>
            <button
              onClick={() => {
                setShowEmptyState(false);
                setActiveFilter('published');
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                !showEmptyState && activeFilter === 'published'
                  ? 'bg-primary-container text-on-primary-container shadow-sm'
                  : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container border border-outline-variant/40'
              }`}
            >
              Đã giao ({publishedCount})
            </button>
            <button
              onClick={() => {
                setShowEmptyState(false);
                setActiveFilter('draft');
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                !showEmptyState && activeFilter === 'draft'
                  ? 'bg-primary-container text-on-primary-container shadow-sm'
                  : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container border border-outline-variant/40'
              }`}
            >
              Bản nháp ({draftCount})
            </button>
            <button
              onClick={() => {
                setShowEmptyState(false);
                setActiveFilter('blocked');
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                !showEmptyState && activeFilter === 'blocked'
                  ? 'bg-primary-container text-on-primary-container shadow-sm'
                  : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container border border-outline-variant/40'
              }`}
            >
              Chưa đủ học liệu ({blockedCount})
            </button>
          </div>
        </div>

        {/* Empty State */}
        {showEmptyState || filteredAssignments.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-xl p-12 text-center border border-outline-variant/30 shadow-sm max-w-md mx-auto my-8">
            <div className="w-16 h-16 rounded-full bg-surface-container-low flex items-center justify-center text-on-surface-variant mx-auto mb-4">
              <span className="material-symbols-outlined text-3xl">assignment_late</span>
            </div>
            <h3 className="text-base font-bold text-on-surface mb-1">Lớp này chưa có bài tập nào</h3>
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
          /* Assignment Cards Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filteredAssignments.map((assignment) => {
              const isCentral = assignment.id === CENTRAL_ASSIGNMENT_ID;
              return (
                <div
                  key={assignment.id}
                  className={`bg-surface-container-lowest rounded-xl p-5 border shadow-sm transition-all flex flex-col justify-between ${
                    isCentral
                      ? 'border-2 border-primary/50 shadow-md ring-1 ring-primary/20'
                      : 'border-outline-variant/30 hover:border-outline-variant/80'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <span
                        className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                          isCentral
                            ? 'bg-primary-container text-on-primary-container font-bold'
                            : assignment.status === 'published'
                            ? 'bg-tertiary-container/30 text-tertiary'
                            : assignment.status === 'draft'
                            ? 'bg-surface-container-high text-on-surface-variant'
                            : 'bg-[#FEF9C3] text-[#CA8A04]'
                        }`}
                      >
                        {isCentral ? 'Đang mở nộp bài (Trọng tâm)' : assignment.statusLabel}
                      </span>
                      <span className="text-[11px] text-on-surface-variant font-medium">
                        Hạn: {assignment.deadline}
                      </span>
                    </div>

                    <h3 className="font-headline-sm text-base font-bold text-on-surface font-merriweather mb-1 leading-snug">
                      {assignment.title}
                    </h3>
                  <p className="text-xs text-on-surface-variant line-clamp-2 mb-4 leading-relaxed">
                    {assignment.instructions}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-on-surface-variant mb-4 p-2.5 bg-surface-container-low/40 rounded-lg">
                    <div>
                      <span className="text-[10px] text-outline block">Mã truy cập:</span>
                      <span className="font-mono font-semibold text-secondary">{assignment.code}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-outline block">Barem áp dụng:</span>
                      <span className="font-semibold text-primary truncate block" title={rubrics?.find((r) => r.id === assignment.rubricId)?.name}>
                        {rubrics?.find((r) => r.id === assignment.rubricId)?.shortTitle || 'Barem GDPT 2018'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-outline block">Bài đã chấm:</span>
                      <span className="font-semibold text-on-surface">
                        {assignment.assessedSubmissions}/{assignment.totalSubmissions || 41}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-outline-variant/20 flex items-center justify-between gap-2">
                  {assignment.status === 'published' ? (
                    <>
                      <Link
                        href="/reports"
                        className="px-3 py-1.5 rounded-lg bg-secondary text-white text-xs font-semibold hover:bg-secondary/90 transition-all flex items-center gap-1.5 shadow-sm"
                      >
                        <span className="material-symbols-outlined text-[16px]">analytics</span>
                        <span>Xem báo cáo lớp</span>
                      </Link>
                      <Link
                        href={`/assignments/${assignment.id}`}
                        className="px-3 py-1.5 rounded-lg border border-outline-variant/50 text-xs text-on-surface font-medium hover:bg-surface-container transition-all"
                      >
                        Chi tiết đề &amp; Rubric
                      </Link>
                    </>
                  ) : assignment.status === 'draft' ? (
                    <>
                      <Link
                        href={`/assignments/${assignment.id}`}
                        className="px-3 py-1.5 rounded-lg bg-primary-container text-on-primary-container text-xs font-semibold hover:brightness-95 transition-all flex items-center gap-1.5 shadow-sm"
                      >
                        <span className="material-symbols-outlined text-[16px]">edit</span>
                        <span>Tiếp tục soạn đề</span>
                      </Link>
                      <button
                        onClick={() => addToast('Bản nháp đã được lưu trong bộ nhớ tạm.', 'info')}
                        className="px-3 py-1.5 rounded-lg text-xs text-error hover:bg-error-container/30 transition-all font-medium"
                      >
                        Xóa bản nháp
                      </button>
                    </>
                  ) : (
                    <>
                      <Link
                        href="/materials"
                        className="px-3 py-1.5 rounded-lg bg-[#CA8A04] text-white text-xs font-semibold hover:brightness-95 transition-all flex items-center gap-1.5 shadow-sm"
                      >
                        <span className="material-symbols-outlined text-[16px]">upload_file</span>
                        <span>Bổ sung học liệu ngay</span>
                      </Link>
                      <Link
                        href={`/assignments/${assignment.id}`}
                        className="px-3 py-1.5 rounded-lg border border-outline-variant/50 text-xs text-on-surface font-medium hover:bg-surface-container transition-all"
                      >
                        Cài đặt rubric
                      </Link>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        )}
      </div>
    </TeacherShell>
  );
}

