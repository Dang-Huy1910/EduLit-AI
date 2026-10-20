'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import TeacherShell from '@/components/TeacherShell';
import { useAppStore } from '@/lib/store';
import { SCHOOL_CONTEXT } from '@/lib/school-context';
import { AuthApiError } from '@/lib/auth-types';
import { catalogApi } from '@/features/catalog/api';
import { beginNewAssignmentDraft, clearAssignmentDraft, pickPromptHref } from '@/features/catalog/draft';
import type { ClassroomSummary, TeacherAssignment } from '@/features/catalog/types';
import InlineDeleteButton from '@/components/InlineDeleteButton';

export default function TeacherAssignmentsView() {
  const { addToast, currentUser } = useAppStore();
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [classrooms, setClassrooms] = useState<ClassroomSummary[]>([]);
  const [classroomId, setClassroomId] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'PUBLISHED' | 'DRAFT'>('all');
  const [loading, setLoading] = useState(true);
  const [retryingId, setRetryingId] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const deletedIds = useRef(new Set<string>());

  useEffect(() => {
    void (async () => {
      try {
        const [assignmentRes, classroomRes] = await Promise.all([
          catalogApi.listTeacherAssignments(),
          catalogApi.listClassrooms(),
        ]);
        setAssignments(assignmentRes.items.filter((item) => !deletedIds.current.has(item.id)));
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
      void catalogApi.listTeacherAssignments()
        .then((res) => setAssignments(res.items.filter((item) => !deletedIds.current.has(item.id))))
        .catch(() => undefined);
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

  const handleDeleteAssignment = async (assignment: TeacherAssignment) => {
    if (deletingId) return;
    setDeletingId(assignment.id);
    try {
      await catalogApi.deleteAssignment(assignment.id);
      deletedIds.current.add(assignment.id);
      setAssignments((current) => current.filter((item) => item.id !== assignment.id));
      clearAssignmentDraft({ userId: currentUser?.id, assignmentId: assignment.id });
      addToast('Đã xóa bài tập.', 'success');
    } catch (err) {
      addToast(err instanceof AuthApiError ? err.message : 'Không xóa được bài tập. Hãy thử lại.', 'error');
    } finally {
      setDeletingId('');
    }
  };

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

        {/* Class Selector & Metric Banner */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="glass-card p-4 rounded-xl border border-outline-variant/30 flex items-center justify-between">
            <div className="flex-1 mr-2">
              <span className="text-xs text-on-surface-variant font-medium block">Lớp phụ trách</span>
              <select
                value={classroomId}
                onChange={(e) => {
                  setClassroomId(e.target.value);
                  beginNewAssignmentDraft({ classroomId: e.target.value }, { userId: currentUser?.id });
                }}
                className="mt-0.5 w-full text-base font-bold bg-transparent text-on-surface font-merriweather focus:outline-none cursor-pointer"
              >
                {classrooms.map((classroom) => (
                  <option key={classroom.id} value={classroom.id}>
                    {classroom.name} • THPT Đan Phượng
                  </option>
                ))}
              </select>
              <span className="text-[11px] text-secondary font-semibold block mt-0.5">
                {selectedClassroom
                  ? `${selectedClassroom.studentCount} học sinh • ${selectedClassroom.academicYear || SCHOOL_CONTEXT.academicYear}`
                  : 'Chưa có lớp'}
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-primary-container/30 text-primary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined">school</span>
            </div>
          </div>

          <div className="glass-card p-4 rounded-xl border border-outline-variant/30 flex items-center justify-between">
            <div>
              <span className="text-xs text-on-surface-variant font-medium block">Trạng thái bài tập</span>
              <div className="text-xl font-bold text-on-surface font-merriweather mt-0.5">
                {publishedCount} bài đã giao
              </div>
              <span className="text-[11px] text-tertiary font-semibold block mt-0.5">
                {draftCount > 0 ? `${draftCount} bài đang soạn bản nháp` : 'Đã phát hành tới học sinh'}
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-tertiary-container/30 text-tertiary flex items-center justify-center font-bold text-xs shrink-0">
              <span className="material-symbols-outlined">task_alt</span>
            </div>
          </div>

          <div className="glass-card p-4 rounded-xl border border-outline-variant/30 flex items-center justify-between">
            <div>
              <span className="text-xs text-on-surface-variant font-medium block">Tiến độ chấm Rubric AI</span>
              <div className="text-xl font-bold text-primary font-merriweather mt-0.5">
                Barem GDPT 2018
              </div>
              <span className="text-[11px] text-[#CA8A04] font-semibold block mt-0.5">
                Thang 4,0đ • 4 tiêu chí chuẩn
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-secondary-fixed/50 text-secondary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined">auto_awesome</span>
            </div>
          </div>
        </div>

        {/* Pedagogical Guideline Callout */}
        <div className="p-4 bg-surface-container-low/70 border border-secondary/20 rounded-xl flex items-start gap-3 text-xs leading-relaxed">
          <span className="material-symbols-outlined text-secondary text-xl mt-0.5 shrink-0">lightbulb</span>
          <div className="text-on-surface">
            <span className="font-semibold text-secondary">Nguyên tắc triển khai sư phạm GDPT 2018:</span>
            <span className="text-on-surface-variant ml-1">
              Mỗi bài viết cần gắn với ít nhất <strong>01 học liệu chuẩn</strong> và <strong>Barem Rubric đã xác nhận</strong>.
              Trợ lý Socratic đồng hành gợi mở câu hỏi để học sinh tự lập dàn ý cá nhân mà không viết thay.
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {(['all', 'PUBLISHED', 'DRAFT'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeFilter === filter
                  ? 'bg-primary text-white shadow-sm ring-2 ring-primary/20'
                  : 'bg-surface-container-lowest text-on-surface-variant border border-outline-variant/40 hover:bg-surface-container'
              }`}
            >
              {filter === 'all'
                ? `Tất cả (${assignments.length})`
                : filter === 'PUBLISHED'
                ? `Đã giao (${publishedCount})`
                : `Bản nháp (${draftCount})`}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="p-16 text-center text-sm text-on-surface-variant flex flex-col items-center justify-center gap-3">
            <span className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin"></span>
            <span>Đang tải danh sách bài tập...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="glass-panel rounded-2xl p-12 text-center border max-w-md mx-auto space-y-3">
            <span className="material-symbols-outlined text-4xl text-outline">assignment_late</span>
            <h3 className="text-base font-bold font-merriweather">Lớp này chưa có bài tập nào</h3>
            <p className="text-xs text-on-surface-variant">
              Chọn đề nguồn từ kho, rồi cấu hình barem, học sinh nhận bài và hạn nộp.
            </p>
            <Link
              href={createHref}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-xs font-semibold shadow-sm hover:bg-primary/90 transition-all"
            >
              Tạo bài tập đầu tiên
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filtered.map((assignment) => (
              <div
                key={assignment.id}
                className="glass-card rounded-2xl p-5 sm:p-6 border border-outline-variant/30 flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2.5">
                    <span
                      className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 ${
                        assignment.status === 'PUBLISHED'
                          ? 'bg-tertiary-container/30 text-tertiary'
                          : 'bg-surface-container-high text-on-surface-variant'
                      }`}
                    >
                      {assignment.status === 'PUBLISHED' ? (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse"></span>
                          Đã giao
                        </>
                      ) : (
                        'Bản nháp'
                      )}
                    </span>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <span className="text-[11px] text-on-surface-variant font-mono">
                        {assignment.dueAt ? `Hạn: ${new Date(assignment.dueAt).toLocaleString('vi-VN')}` : 'Chưa đặt hạn'}
                      </span>
                      <InlineDeleteButton
                        label={`Xóa bài tập ${assignment.title}`}
                        title="Xóa bài tập này?"
                        description="Bài tập sẽ được gỡ khỏi danh sách và học sinh không thể tiếp tục truy cập."
                        busy={deletingId === assignment.id}
                        disabled={Boolean(deletingId)}
                        onConfirm={() => handleDeleteAssignment(assignment)}
                      />
                    </div>
                  </div>

                  <h3 className="font-headline-sm text-base font-bold font-merriweather text-on-surface mb-1.5 leading-snug">
                    {assignment.title}
                  </h3>
                  <p className="text-xs text-on-surface-variant line-clamp-2 mb-3 leading-relaxed">
                    {assignment.sourcePromptTitle || assignment.extraInstructions || 'Đề bài chưa có mô tả chi tiết.'}
                  </p>

                  {assignment.status === 'PUBLISHED' && assignment.outlinePrep && assignment.outlinePrep.total > 0 && (
                    <div className="mb-3 p-2.5 rounded-xl bg-secondary/5 border border-secondary/15 text-xs space-y-1">
                      <div className="flex items-center justify-between font-semibold text-on-surface">
                        <span className="flex items-center gap-1 text-secondary">
                          <span className="material-symbols-outlined text-[15px]">psychology</span>
                          Dàn ý Socratic sẵn sàng:
                        </span>
                        <span className="font-mono text-secondary">
                          {assignment.outlinePrep.ready}/{assignment.outlinePrep.total} học sinh
                        </span>
                      </div>
                      {assignment.outlinePrep.failed > 0 && (
                        <p className="text-error text-[11px]">{assignment.outlinePrep.failed} trường hợp lỗi khởi tạo</p>
                      )}
                      {(assignment.outlinePrep.needsClarification ?? 0) > 0 && (
                        <p className="text-amber-800 dark:text-amber-400 text-[11px]">
                          {assignment.outlinePrep.needsClarification} trường hợp cần làm rõ đề hoặc ngữ liệu
                        </p>
                      )}
                      {assignment.outlinePrep.queued + assignment.outlinePrep.processing > 0 && (
                        <p className="text-on-surface-variant text-[11px] flex items-center gap-1">
                          <span className="w-2.5 h-2.5 border-2 border-secondary border-t-transparent rounded-full animate-spin"></span>
                          Đang soạn {assignment.outlinePrep.queued + assignment.outlinePrep.processing} dàn ý...
                        </p>
                      )}
                    </div>
                  )}

                  {assignment.status === 'PUBLISHED' && assignment.submissionProgress ? (
                    <div className="mb-3 p-2.5 rounded-xl bg-surface-container-low/60 border border-outline-variant/20 text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-on-surface">Tiến độ nộp bài:</span>
                        <span className="font-mono font-bold text-primary">
                          {assignment.submissionProgress.officialSubmitted}/{assignment.submissionProgress.assigned} HS
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-surface-container-high rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-300"
                          style={{
                            width: `${
                              assignment.submissionProgress.assigned > 0
                                ? (assignment.submissionProgress.officialSubmitted / assignment.submissionProgress.assigned) * 100
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-on-surface-variant mt-1.5">
                        <span>Chờ rà soát: {assignment.submissionProgress.awaitingReview}</span>
                        <span>Đã công bố: {assignment.submissionProgress.published}</span>
                      </div>
                    </div>
                  ) : null}

                  <div className="grid grid-cols-3 gap-2 text-xs p-2.5 bg-surface-container-low/40 rounded-xl border border-outline-variant/20">
                    <div>
                      <span className="text-[10px] text-outline block">Mã đề thi</span>
                      <span className="font-mono font-semibold text-secondary">{assignment.code}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-outline block">Lớp</span>
                      <span className="font-semibold">{assignment.classroomCode || SCHOOL_CONTEXT.classroomCode}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-outline block">Học sinh</span>
                      <span className="font-semibold">{assignment.recipientCount || 'Toàn lớp'}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-outline-variant/20 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {assignment.status === 'PUBLISHED' ? (
                      <>
                        <Link
                          href={`/assignments/${assignment.id}?tab=submissions`}
                          className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-all shadow-xs flex items-center gap-1 active:scale-95"
                        >
                          <span className="material-symbols-outlined text-[15px]">assignment_turned_in</span>
                          <span>Chấm bài</span>
                        </Link>
                        <Link
                          href={`/assignments/${assignment.id}?tab=statistics`}
                          className="px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-semibold transition-all border border-outline-variant/40 flex items-center gap-1"
                        >
                          <span className="material-symbols-outlined text-[15px]">bar_chart</span>
                          <span>Thống kê</span>
                        </Link>
                      </>
                    ) : (
                      <Link
                        href={`/assignments/${assignment.id}`}
                        className="px-3.5 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-all shadow-xs"
                      >
                        Tiếp tục soạn đề
                      </Link>
                    )}
                  </div>

                  {assignment.status === 'PUBLISHED' && (
                    <Link
                      href={`/assignments/${assignment.id}?tab=details`}
                      className="text-[11px] font-semibold text-secondary hover:underline flex items-center gap-0.5"
                    >
                      <span>Xem cấu hình &amp; Barem</span>
                      <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                    </Link>
                  )}

                  {assignment.status === 'PUBLISHED' &&
                    ((assignment.outlinePrep?.failed ?? 0) > 0 ||
                      (assignment.outlinePrep?.needsClarification ?? 0) > 0) && (
                    <button
                      type="button"
                      onClick={() => void handleRetryOutlinePreps(assignment.id)}
                      disabled={retryingId === assignment.id}
                      className="px-3 py-1 rounded-lg border border-error/30 text-error text-xs font-semibold hover:bg-error/5 transition-all disabled:opacity-50"
                    >
                      {retryingId === assignment.id ? 'Đang thử lại...' : 'Thử lại dàn ý lỗi'}
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

