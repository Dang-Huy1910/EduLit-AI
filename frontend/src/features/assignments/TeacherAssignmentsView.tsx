'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import TeacherShell from '@/components/TeacherShell';
import { useAppStore } from '@/lib/store';
import { AuthApiError } from '@/lib/auth-types';
import { catalogApi } from '@/features/catalog/api';
import { beginNewAssignmentDraft, pickPromptHref } from '@/features/catalog/draft';
import type { ClassroomSummary, TeacherAssignment } from '@/features/catalog/types';

export default function TeacherAssignmentsView() {
  const { addToast, currentUser } = useAppStore();
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [classrooms, setClassrooms] = useState<ClassroomSummary[]>([]);
  const [classroomId, setClassroomId] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'PUBLISHED' | 'DRAFT'>('all');
  const [loading, setLoading] = useState(true);
  const [retryingId, setRetryingId] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const [assignmentRes, classroomRes] = await Promise.all([
          catalogApi.listTeacherAssignments(),
          catalogApi.listClassrooms(),
        ]);
        setAssignments(assignmentRes.items);
        setClassrooms(classroomRes.items);
        if (classroomRes.items[0]) setClassroomId(classroomRes.items[0].id);
      } catch (err) {
        addToast(err instanceof AuthApiError ? err.message : 'Không tải được danh sách bài tập.', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [addToast]);

  const hasActivePrep = assignments.some(
    (item) => (item.outlinePrep?.queued ?? 0) + (item.outlinePrep?.processing ?? 0) > 0
  );
  useEffect(() => {
    if (!hasActivePrep) return;
    const timer = window.setInterval(() => {
      void catalogApi.listTeacherAssignments().then((res) => setAssignments(res.items)).catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [hasActivePrep]);

  const selectedClassroom = classrooms.find((item) => item.id === classroomId);
  const filtered = assignments.filter((item) => {
    if (classroomId && item.classroomId && item.classroomId !== classroomId) return false;
    if (activeFilter === 'all') return true;
    return item.status === activeFilter;
  });
  const publishedCount = assignments.filter((item) => item.status === 'PUBLISHED').length;
  const draftCount = assignments.filter((item) => item.status === 'DRAFT').length;
  const createHref = pickPromptHref({ classroomId });

  const handleRetryOutlinePreps = async (assignmentId: string) => {
    setRetryingId(assignmentId);
    try {
      const updated = await catalogApi.retryFailedOutlinePreps(assignmentId);
      setAssignments((current) => current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
      const retried = updated.retried ?? 0;
      addToast(
        retried > 0
          ? `Đã đưa ${retried} dàn ý lỗi hoặc cần làm rõ vào hàng đợi để soạn lại.`
          : 'Không có dàn ý lỗi hoặc cần làm rõ để thử lại.',
        retried > 0 ? 'success' : 'info'
      );
    } catch (err) {
      addToast(err instanceof AuthApiError ? err.message : 'Không thử lại được dàn ý lỗi.', 'error');
    } finally {
      setRetryingId('');
    }
  };

  return (
    <TeacherShell>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-headline-lg text-2xl sm:text-3xl font-bold text-on-surface font-merriweather">
              Quản lý Bài tập theo Lớp
            </h1>
            <p className="text-sm text-on-surface-variant mt-1">
              Giao đề từ kho ngữ liệu, chọn barem tại màn tạo bài, theo dõi bài đã phát hành.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/materials"
              className="px-4 py-2 rounded-lg border border-outline-variant/60 bg-surface-container-lowest text-sm font-medium flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">menu_book</span>
              Quản lý Kho học liệu
            </Link>
            <Link
              href={createHref}
              onClick={() => beginNewAssignmentDraft({ classroomId }, { userId: currentUser?.id })}
              className="px-4 py-2 rounded-lg bg-primary-container text-on-primary-container text-sm font-semibold flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              Tạo bài tập mới
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-surface-container-lowest rounded-xl border">
            <span className="text-xs text-on-surface-variant font-medium">Lớp phụ trách</span>
            <select
              value={classroomId}
              onChange={(e) => {
                setClassroomId(e.target.value);
                beginNewAssignmentDraft({ classroomId: e.target.value }, { userId: currentUser?.id });
              }}
              className="mt-1 w-full text-sm font-bold bg-transparent"
            >
              {classrooms.map((classroom) => (
                <option key={classroom.id} value={classroom.id}>
                  {classroom.name}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-secondary font-semibold">
              {selectedClassroom
                ? `${selectedClassroom.studentCount} học sinh • ${selectedClassroom.academicYear}`
                : 'Chưa có lớp'}
            </span>
          </div>
          <div className="p-4 bg-surface-container-lowest rounded-xl border">
            <span className="text-xs text-on-surface-variant">Đã giao</span>
            <div className="text-base font-bold">{publishedCount} bài</div>
          </div>
          <div className="p-4 bg-surface-container-lowest rounded-xl border">
            <span className="text-xs text-on-surface-variant">Bản nháp</span>
            <div className="text-base font-bold">{draftCount} bài</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {(['all', 'PUBLISHED', 'DRAFT'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
                activeFilter === filter
                  ? 'bg-primary-container text-on-primary-container'
                  : 'bg-surface-container-lowest border border-outline-variant/40'
              }`}
            >
              {filter === 'all' ? `Tất cả (${assignments.length})` : filter === 'PUBLISHED' ? `Đã giao (${publishedCount})` : `Bản nháp (${draftCount})`}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm text-on-surface-variant">Đang tải bài tập...</div>
        ) : filtered.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-xl p-12 text-center border max-w-md mx-auto">
            <h3 className="text-base font-bold mb-1">Lớp này chưa có bài tập nào</h3>
            <p className="text-xs text-on-surface-variant mb-6">
              Chọn đề nguồn từ kho, rồi chọn barem, người nhận và hạn nộp.
            </p>
            <Link
              href={createHref}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-container text-on-primary-container rounded-lg text-xs font-semibold"
            >
              Tạo bài tập đầu tiên
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filtered.map((assignment) => (
              <div key={assignment.id} className="bg-surface-container-lowest rounded-xl p-5 border flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <span
                      className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                        assignment.status === 'PUBLISHED'
                          ? 'bg-tertiary-container/30 text-tertiary'
                          : 'bg-surface-container-high text-on-surface-variant'
                      }`}
                    >
                      {assignment.status === 'PUBLISHED' ? 'Đã giao' : 'Bản nháp'}
                    </span>
                    <span className="text-[11px] text-on-surface-variant">
                      {assignment.dueAt ? `Hạn: ${new Date(assignment.dueAt).toLocaleString('vi-VN')}` : 'Chưa đặt hạn'}
                    </span>
                  </div>
                  <h3 className="font-headline-sm text-base font-bold font-merriweather mb-1">{assignment.title}</h3>
                  <p className="text-xs text-on-surface-variant line-clamp-2 mb-4">
                    {assignment.sourcePromptTitle || assignment.extraInstructions}
                  </p>
                  {assignment.status === 'PUBLISHED' && assignment.outlinePrep && assignment.outlinePrep.total > 0 && (
                    <div className="mb-3 p-2.5 rounded-lg bg-secondary/5 border border-secondary/15 text-xs">
                      <p className="font-semibold text-on-surface">
                        Dàn ý sẵn sàng {assignment.outlinePrep.ready}/{assignment.outlinePrep.total} học sinh
                      </p>
                      {assignment.outlinePrep.failed > 0 && (
                        <p className="text-error mt-0.5">{assignment.outlinePrep.failed} trường hợp thất bại</p>
                      )}
                      {(assignment.outlinePrep.needsClarification ?? 0) > 0 && (
                        <p className="text-amber-800 dark:text-amber-400 mt-0.5">
                          {assignment.outlinePrep.needsClarification} trường hợp cần làm rõ đề hoặc ngữ liệu
                        </p>
                      )}
                      {assignment.outlinePrep.queued + assignment.outlinePrep.processing > 0 && (
                        <p className="text-on-surface-variant mt-0.5">
                          Đang soạn {assignment.outlinePrep.queued + assignment.outlinePrep.processing} dàn ý
                        </p>
                      )}
                    </div>
                  )}
                  {assignment.status === 'PUBLISHED' && assignment.submissionProgress ? (
                    <div className="mb-3 p-2.5 rounded-lg bg-surface-container-low/50 border border-outline-variant/20 text-xs">
                      <p className="font-semibold text-on-surface">
                        Đã nộp {assignment.submissionProgress.officialSubmitted}/{assignment.submissionProgress.assigned}
                        {' · '}Chờ rà soát {assignment.submissionProgress.awaitingReview}
                        {' · '}Đã công bố {assignment.submissionProgress.published}
                      </p>
                    </div>
                  ) : null}
                  <div className="grid grid-cols-3 gap-2 text-xs p-2.5 bg-surface-container-low/40 rounded-lg">
                    <div>
                      <span className="text-[10px] text-outline block">Mã truy cập</span>
                      <span className="font-mono font-semibold text-secondary">{assignment.code}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-outline block">Lớp</span>
                      <span className="font-semibold">{assignment.classroomCode || '—'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-outline block">Người nhận</span>
                      <span className="font-semibold">{assignment.recipientCount}</span>
                    </div>
                  </div>
                </div>
                <div className="pt-3 border-t mt-4 flex items-center justify-between gap-2">
                  <Link
                    href={
                      assignment.status === 'DRAFT'
                        ? `/assignments/${assignment.id}`
                        : `/assignments/${assignment.id}?tab=details`
                    }
                    className="px-3 py-1.5 rounded-lg bg-primary-container text-on-primary-container text-xs font-semibold"
                  >
                    {assignment.status === 'DRAFT' ? 'Tiếp tục soạn đề' : 'Chi tiết bài tập'}
                  </Link>
                  {assignment.status === 'PUBLISHED' &&
                    ((assignment.outlinePrep?.failed ?? 0) > 0 ||
                      (assignment.outlinePrep?.needsClarification ?? 0) > 0) && (
                    <button
                      type="button"
                      onClick={() => void handleRetryOutlinePreps(assignment.id)}
                      disabled={retryingId === assignment.id}
                      className="px-3 py-1.5 rounded-lg border border-error/30 text-error text-xs font-semibold disabled:opacity-50"
                    >
                      {retryingId === assignment.id ? 'Đang thử lại...' : 'Thử lại dàn ý lỗi / cần làm rõ'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </TeacherShell>
  );
}
