'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import TeacherShell from '@/components/TeacherShell';
import { useAppStore } from '@/lib/store';
import { AuthApiError } from '@/lib/auth-types';
import { catalogApi } from '@/features/catalog/api';
import { beginNewAssignmentDraft, clearAssignmentDraft, pickPromptHref } from '@/features/catalog/draft';
import type { TeacherAssignment } from '@/features/catalog/types';
import InlineDeleteButton from '@/components/InlineDeleteButton';
import DueAtEditor from './DueAtEditor';
import { termLabel } from '@/features/classrooms/model';
import { useTeacherClassContext } from '@/features/classrooms/useClassContext';

export default function TeacherAssignmentsView() {
  const { addToast, currentUser } = useAppStore();
  const { term, classrooms, classroom, setClassroom } = useTeacherClassContext();
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [activeFilter, setActiveFilter] = useState<'all' | 'PUBLISHED' | 'DRAFT'>('all');
  const [loading, setLoading] = useState(true);
  const [retryingId, setRetryingId] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [savingDueId, setSavingDueId] = useState('');
  const deletedIds = useRef(new Set<string>());

  useEffect(() => {
    void (async () => {
      try {
        const assignmentRes = await catalogApi.listTeacherAssignments();
        setAssignments(assignmentRes.items.filter((item) => !deletedIds.current.has(item.id)));
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

  const classroomId = classroom?.id || '';
  const filtered = assignments.filter((item) => {
    if (term && item.termId !== term.id && !(item.termId == null && term.isCurrent)) return false;
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

  const handleSaveDueAt = async (assignment: TeacherAssignment, dueAt: string | null) => {
    setSavingDueId(assignment.id);
    try {
      const updated = await catalogApi.updateAssignmentDueAt(assignment.id, dueAt);
      setAssignments((current) =>
        current.map((item) => (item.id === assignment.id ? { ...item, dueAt: updated.dueAt } : item))
      );
      addToast(dueAt ? 'Đã cập nhật hạn nộp.' : 'Đã bỏ hạn nộp.', 'success');
      return true;
    } catch (err) {
      addToast(err instanceof AuthApiError ? err.message : 'Không đổi được hạn nộp. Hãy thử lại.', 'error');
      return false;
    } finally {
      setSavingDueId('');
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
            {classroom?.readOnly ? (
              <span
                title="Lớp này chỉ xem vì thuộc kỳ học đã kết thúc."
                className="px-4 py-2 rounded-lg bg-primary-container text-on-primary-container text-sm font-semibold flex items-center gap-2 opacity-40 cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-[18px]">add</span>
                Tạo bài tập mới
              </span>
            ) : (
              <Link
                href={createHref}
                onClick={() => beginNewAssignmentDraft({ classroomId }, { userId: currentUser?.id })}
                className="px-4 py-2 rounded-lg bg-primary-container text-on-primary-container text-sm font-semibold flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">add</span>
                Tạo bài tập mới
              </Link>
            )}
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
                  setClassroom(e.target.value);
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
                {classroom
                  ? `${classroom.studentCount} học sinh${term ? ` • ${termLabel(term)}` : ''}`
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
            {filtered.map((assignment) => {
              const isPublished = assignment.status === 'PUBLISHED';
              const due = describeDue(assignment.dueAt);
              const canEditDue = isPublished && !(classrooms.find((item) => item.id === assignment.classroomId)?.readOnly);
              const subtitle = [assignment.sourcePromptTitle, assignment.extraInstructions].find(
                (text) => text && text.trim() && text.trim() !== assignment.title.trim()
              );
              const prep = isPublished && assignment.outlinePrep && assignment.outlinePrep.total > 0 ? assignment.outlinePrep : null;
              const progress = isPublished ? assignment.submissionProgress : undefined;
              const preparing = prep ? prep.queued + prep.processing : 0;
              return (
                <article
                  key={assignment.id}
                  className="glass-card relative rounded-2xl border border-outline-variant/30 flex flex-col overflow-hidden"
                >
                  <span
                    aria-hidden="true"
                    className={`absolute inset-x-0 top-0 h-1 ${
                      isPublished ? 'bg-gradient-to-r from-primary via-primary-container to-secondary/70' : 'bg-outline-variant/70'
                    }`}
                  />
                  <div className="p-5 sm:p-6 flex-1 flex flex-col gap-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-[11px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 ${
                            isPublished
                              ? 'bg-tertiary-container/25 text-tertiary'
                              : 'bg-surface-container-high text-on-surface-variant'
                          }`}
                        >
                          {isPublished ? (
                            <>
                              <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse"></span>
                              Đã giao
                            </>
                          ) : (
                            <>
                              <span className="material-symbols-outlined text-[13px]" aria-hidden="true">edit_note</span>
                              Bản nháp
                            </>
                          )}
                        </span>
                        <DueAtEditor
                          dueAt={assignment.dueAt}
                          label={canEditDue ? `${due.full}. Bấm để gia hạn.` : due.full}
                          busy={savingDueId === assignment.id}
                          disabled={!canEditDue}
                          triggerClassName={`text-[11px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1 ${DUE_TONE[due.tone]}`}
                          onSave={(next) => handleSaveDueAt(assignment, next)}
                        >
                          <span className="material-symbols-outlined text-[14px]" aria-hidden="true">schedule</span>
                          <span>{due.label}</span>
                          {due.relative && <span className="font-bold">· {due.relative}</span>}
                        </DueAtEditor>
                      </div>
                      <InlineDeleteButton
                        label={`Xóa bài tập ${assignment.title}`}
                        title="Xóa bài tập này?"
                        description="Bài tập sẽ được gỡ khỏi danh sách và học sinh không thể tiếp tục truy cập."
                        busy={deletingId === assignment.id}
                        disabled={Boolean(deletingId)}
                        onConfirm={() => handleDeleteAssignment(assignment)}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <h3 className="text-lg font-bold font-merriweather text-on-surface leading-snug">
                        {assignment.title}
                      </h3>
                      {subtitle && (
                        <p className="text-xs text-on-surface-variant line-clamp-2 leading-relaxed flex items-start gap-1.5">
                          <span className="material-symbols-outlined text-[14px] text-outline mt-px" aria-hidden="true">menu_book</span>
                          <span>{subtitle}</span>
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 text-[11px]">
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-secondary/5 border border-secondary/15 text-secondary font-mono font-semibold">
                        <span className="material-symbols-outlined text-[14px]" aria-hidden="true">tag</span>
                        <span className="sr-only">Mã đề thi</span>
                        {assignment.code}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-container-low border border-outline-variant/30 text-on-surface font-semibold">
                        <span className="material-symbols-outlined text-[14px] text-outline" aria-hidden="true">school</span>
                        Lớp {assignment.classroomCode || 'Chưa gắn lớp'}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-container-low border border-outline-variant/30 text-on-surface font-semibold">
                        <span className="material-symbols-outlined text-[14px] text-outline" aria-hidden="true">group</span>
                        {assignment.recipientCount ? `${assignment.recipientCount} học sinh` : 'Toàn lớp'}
                      </span>
                    </div>

                    {(prep || progress) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {progress && (
                          <MetricTile
                            icon="assignment_turned_in"
                            label="Tiến độ nộp bài"
                            done={progress.officialSubmitted}
                            total={progress.assigned}
                            tone="primary"
                          >
                            <span>Chờ rà soát: <b className="text-on-surface">{progress.awaitingReview}</b></span>
                            <span>Đã công bố: <b className="text-on-surface">{progress.published}</b></span>
                          </MetricTile>
                        )}
                        {prep && (
                          <MetricTile
                            icon="psychology"
                            label="Dàn ý Socratic sẵn sàng"
                            done={prep.ready}
                            total={prep.total}
                            tone="secondary"
                          >
                            {prep.failed > 0 && <span className="text-error">{prep.failed} lỗi khởi tạo</span>}
                            {(prep.needsClarification ?? 0) > 0 && (
                              <span className="text-amber-800 dark:text-amber-400">
                                {prep.needsClarification} cần làm rõ đề/ngữ liệu
                              </span>
                            )}
                            {preparing > 0 && (
                              <span className="flex items-center gap-1">
                                <span className="w-2.5 h-2.5 border-2 border-secondary border-t-transparent rounded-full animate-spin"></span>
                                Đang soạn {preparing} dàn ý...
                              </span>
                            )}
                            {prep.failed === 0 && !(prep.needsClarification ?? 0) && preparing === 0 && (
                              <span>Học sinh có thể bắt đầu lập dàn ý</span>
                            )}
                          </MetricTile>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="px-5 sm:px-6 py-3.5 bg-surface-container-low/50 border-t border-outline-variant/20 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {isPublished ? (
                        <>
                          <Link
                            href={`/assignments/${assignment.id}?tab=submissions`}
                            className="px-3.5 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-all shadow-sm flex items-center gap-1.5 active:scale-95"
                          >
                            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">assignment_turned_in</span>
                            <span>Chấm bài</span>
                          </Link>
                          <Link
                            href={`/assignments/${assignment.id}?tab=statistics`}
                            className="px-3.5 py-2 rounded-xl bg-surface-container-lowest hover:bg-surface-container text-on-surface text-xs font-semibold transition-all border border-outline-variant/50 flex items-center gap-1.5"
                          >
                            <span className="material-symbols-outlined text-[16px] text-secondary" aria-hidden="true">bar_chart</span>
                            <span>Thống kê</span>
                          </Link>
                        </>
                      ) : (
                        <Link
                          href={`/assignments/${assignment.id}`}
                          className="px-3.5 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-all shadow-sm flex items-center gap-1.5"
                        >
                          <span className="material-symbols-outlined text-[16px]" aria-hidden="true">edit</span>
                          Tiếp tục soạn đề
                        </Link>
                      )}
                    </div>

                    {isPublished && (
                      <Link
                        href={`/assignments/${assignment.id}?tab=details`}
                        className="text-xs font-semibold text-secondary hover:underline flex items-center gap-1"
                      >
                        <span>Xem cấu hình &amp; Barem</span>
                        <span className="material-symbols-outlined text-[16px]" aria-hidden="true">arrow_forward</span>
                      </Link>
                    )}

                    {isPublished && prep && (prep.failed > 0 || (prep.needsClarification ?? 0) > 0) && (
                      <button
                        type="button"
                        onClick={() => void handleRetryOutlinePreps(assignment.id)}
                        disabled={retryingId === assignment.id}
                        className="px-3 py-1.5 rounded-xl border border-error/30 text-error text-xs font-semibold hover:bg-error/5 transition-all disabled:opacity-50"
                      >
                        {retryingId === assignment.id ? 'Đang thử lại...' : 'Thử lại dàn ý lỗi'}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </TeacherShell>
  );
}


const DUE_TONE = {
  none: 'bg-surface-container-high text-on-surface-variant',
  normal: 'bg-surface-container-low text-on-surface-variant border border-outline-variant/30',
  soon: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  overdue: 'bg-error-container/60 text-error',
} as const;

function describeDue(dueAt: string | null): {
  label: string;
  full: string;
  relative: string;
  tone: keyof typeof DUE_TONE;
} {
  if (!dueAt) return { label: 'Chưa đặt hạn', full: 'Chưa đặt hạn nộp', relative: '', tone: 'none' };
  const date = new Date(dueAt);
  if (Number.isNaN(date.getTime())) return { label: 'Chưa đặt hạn', full: 'Chưa đặt hạn nộp', relative: '', tone: 'none' };
  const time = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  const day = date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const diffMs = date.getTime() - Date.now();
  const hours = diffMs / 3_600_000;
  let relative: string;
  if (diffMs < 0) relative = 'Quá hạn';
  else if (hours < 1) relative = 'Dưới 1 giờ';
  else if (hours < 24) relative = `Còn ${Math.floor(hours)} giờ`;
  else relative = `Còn ${Math.ceil(hours / 24)} ngày`;
  return {
    label: `${time} · ${day}`,
    full: `Hạn nộp: ${time} ngày ${day}`,
    relative,
    tone: diffMs < 0 ? 'overdue' : hours < 48 ? 'soon' : 'normal',
  };
}

const METRIC_TONE = {
  primary: { icon: 'text-primary bg-primary-fixed/60', value: 'text-primary', bar: 'bg-primary' },
  secondary: { icon: 'text-secondary bg-secondary-fixed/60', value: 'text-secondary', bar: 'bg-secondary' },
} as const;

function MetricTile({
  icon,
  label,
  done,
  total,
  tone,
  children,
}: {
  icon: string;
  label: string;
  done: number;
  total: number;
  tone: keyof typeof METRIC_TONE;
  children?: React.ReactNode;
}) {
  const styles = METRIC_TONE[tone];
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div className="p-3.5 rounded-xl bg-surface-container-lowest border border-outline-variant/30 space-y-2.5">
      <div className="flex items-center gap-2.5">
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${styles.icon}`}>
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">{icon}</span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-on-surface-variant leading-tight">{label}</p>
          <p className="text-sm font-bold text-on-surface">
            <span className={`text-lg ${styles.value}`}>{done}</span>
            <span className="text-on-surface-variant font-semibold">/{total} HS</span>
          </p>
        </div>
        <span className={`text-xs font-bold font-mono ${styles.value}`}>{percent}%</span>
      </div>
      <div
        className="w-full h-1.5 bg-surface-container-high rounded-full overflow-hidden"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
      >
        <div className={`h-full rounded-full transition-all duration-300 ${styles.bar}`} style={{ width: `${percent}%` }} />
      </div>
      {children && (
        <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-[10px] text-on-surface-variant">{children}</div>
      )}
    </div>
  );
}
