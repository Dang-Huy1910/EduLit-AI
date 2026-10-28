'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import StudentShell from '@/components/StudentShell';
import { useAppStore } from '@/lib/store';
import { AuthApiError } from '@/lib/auth-types';
import DeadlineNotice from './DeadlineNotice';
import { deadlineState } from './deadline';
import { catalogApi } from '@/features/catalog/api';
import { assessmentApi } from '@/features/assessment/api';
import { formatScore } from '@/features/assessment/labels';
import type { StudentAssignment } from '@/features/catalog/types';
import type { StudentAssessmentResponse } from '@/features/assessment/types';
import { filterAssignmentsByContext, termLabel } from '@/features/classrooms/model';
import { useStudentClassContext } from '@/features/classrooms/useClassContext';

const PENDING_ASSESSMENT_LABELS: Record<string, string> = {
  queued: 'Đang chờ chấm bài',
  grading: 'Hệ thống đang chấm bài',
  failed: 'Lượt chấm gặp lỗi',
  awaiting_review: 'Chờ giáo viên công bố',
  revising: 'Đang sửa bản chép',
  new_version_grading: 'Bản mới đang được chấm',
  new_version_review: 'Bản mới chờ giáo viên công bố',
  new_version_failed: 'Bản mới chấm lỗi',
};

export default function StudentAssignmentsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentUser, addToast } = useAppStore();
  const { term, classroom, classrooms, loading: classContextLoading } = useStudentClassContext();
  const activeTab = searchParams.get('tab') === 'submitted' ? 'submitted' : 'todo';
  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState(false);
  const [assignments, setAssignments] = useState<StudentAssignment[]>([]);
  const [assessmentMap, setAssessmentMap] = useState<Record<string, StudentAssessmentResponse>>({});
  const [expandedInstructions, setExpandedInstructions] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  const setActiveTab = (tab: 'todo' | 'submitted') => {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === 'submitted') params.set('tab', tab);
    else params.delete('tab');
    const query = params.toString();
    router.push(query ? `/assignments?${query}` : '/assignments', { scroll: false });
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await catalogApi.listStudentAssignments();
        if (cancelled) return;
        setAssignments(res.items);

        // Fetch assessment results for submitted status
        const map: Record<string, StudentAssessmentResponse> = {};
        await Promise.all(
          res.items.map(async (a) => {
            try {
              const assess = await assessmentApi.student(a.id);
              if (assess) map[a.id] = assess;
            } catch {
              // Not submitted or not found yet
            }
          })
        );
        if (!cancelled) setAssessmentMap(map);
      } catch (err) {
        if (!cancelled) {
          addToast(err instanceof AuthApiError ? err.message : 'Không tải được bài tập.', 'error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [addToast]);

  const handleOpenCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = codeInput.trim().toUpperCase();
    if (!clean) return;
    try {
      const matched = await catalogApi.getAssignment(clean);
      setCodeError(false);
      addToast(`Mở thành công: ${matched.title}`, 'success');
      router.push(`/assignments/${matched.id}/socratic`);
    } catch {
      setCodeError(true);
      addToast('Mã đề thi không tồn tại hoặc chưa được giao.', 'error');
    }
  };

  const toggleInstructions = (id: string) => {
    setExpandedInstructions((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const visibleAssignments = filterAssignmentsByContext(assignments, {
    termId: term?.id,
    classroomId: classroom?.id,
  });

  const classroomLabelFor = (assignment: StudentAssignment) => {
    if (!assignment.classroomCode) return '';
    const matchingClassroom = classrooms.find((item) => item.id === assignment.classroomId);
    const subject = matchingClassroom?.subject || assignment.classroomName;
    return subject ? `${assignment.classroomCode} • ${subject}` : assignment.classroomCode;
  };

  // Filter into todo and submitted
  const submittedAssignments = visibleAssignments.filter((a) => {
    const assess = assessmentMap[a.id];
    return assess && (assess.status === 'confirmed' || Boolean(assess.officialSubmittedAt) || assess.assessment.status === 'published');
  });

  const todoAssignments = visibleAssignments.filter((a) => {
    const assess = assessmentMap[a.id];
    return !(assess && (assess.status === 'confirmed' || Boolean(assess.officialSubmittedAt) || assess.assessment.status === 'published'));
  });

  // Average only visible, published results on the same scale across rubrics.
  const gradedList = visibleAssignments.flatMap((assignment) => {
    const assessment = assessmentMap[assignment.id];
    return assessment?.assessment.canViewResult && assessment.assessment.result ? [assessment.assessment.result] : [];
  });
  const avgScore = gradedList.length
    ? gradedList.reduce((sum, result) => sum + result.scoreScale10, 0) / gradedList.length
    : null;

  return (
    <StudentShell headerTitle="Không gian học sinh" headerSubtitle="Bài tập của em & Bài đã nộp">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Hero Section */}
        <div className="glass-panel p-6 rounded-2xl border border-white/60 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs bg-secondary-fixed/50 text-secondary font-bold px-2.5 py-0.5 rounded-full">
                Học sinh {currentUser?.name || 'Học sinh'}
              </span>
              <span className="text-xs bg-surface-container text-on-surface-variant font-medium px-2.5 py-0.5 rounded-full">
                {classroom ? classroom.name : 'Tất cả lớp'} • {term ? termLabel(term) : 'Đang tải kỳ học...'}
              </span>
            </div>
            <h1 className="font-headline-lg text-2xl sm:text-3xl font-bold text-on-surface font-merriweather tracking-tight">
              Không gian học tập &amp; Bài viết của em
            </h1>
            <p className="text-xs sm:text-sm text-on-surface-variant mt-1.5 max-w-2xl leading-relaxed">
              Quy trình phát triển năng lực GDPT 2018: Đọc hiểu văn bản &rarr; Lập dàn ý Socratic &rarr; Viết tay nộp ảnh &rarr; Kiểm tra OCR &rarr; Đánh giá Rubric.
            </p>
          </div>

          {/* Quick Enter Code Box */}
          <div className="bg-surface-container-low/80 p-4 rounded-xl border border-outline-variant/40 sm:max-w-xs w-full shadow-2xs">
            <span className="text-xs font-semibold text-on-surface block mb-1.5 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm text-secondary">pin</span>
              <span>Nhập mã đề bài từ giáo viên</span>
            </span>
            <form onSubmit={handleOpenCode} className="flex gap-2">
              <input
                type="text"
                value={codeInput}
                onChange={(e) => {
                  setCodeInput(e.target.value);
                  setCodeError(false);
                }}
                placeholder="VD: VAN11-NLVH-01"
                className="w-full px-2.5 py-1.5 text-xs font-mono uppercase rounded-lg border border-outline-variant/60 bg-surface-container-lowest text-on-surface focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-primary text-white font-semibold text-xs rounded-lg hover:bg-primary/90 transition-all shadow-sm shrink-0 active:scale-95"
              >
                Mở bài
              </button>
            </form>
            {codeError ? (
              <p className="text-[11px] text-error mt-1 flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px]">error</span>
                Mã không hợp lệ hoặc chưa được giao.
              </p>
            ) : (
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-outline-variant/20 text-[10px] text-on-surface-variant">
                <span>Mã mẫu đề mở: VAN11-NLVH-01</span>
              </div>
            )}
          </div>
        </div>

        {!classContextLoading && classrooms.length === 0 && (
          <Link
            href="/classrooms"
            className="rounded-xl border border-primary/25 bg-primary-container/15 px-4 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary-container/25 flex items-center justify-between gap-3"
          >
            <span className="flex items-center gap-2"><span className="material-symbols-outlined">group_add</span>Em chưa vào lớp nào — Nhập mã lớp</span>
            <span className="material-symbols-outlined">arrow_forward</span>
          </Link>
        )}

        {/* 4 Learning Metrics Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="glass-card p-4 rounded-xl border border-outline-variant/30 flex items-center justify-between">
            <div>
              <span className="text-xs text-on-surface-variant block font-medium">Bài tập cần làm</span>
              <span className="text-xl sm:text-2xl font-bold text-on-surface font-merriweather">
                {todoAssignments.length} bài
              </span>
              <span className="text-[11px] text-secondary font-semibold block mt-0.5">
                {todoAssignments.length > 0 ? 'Đang mở thời gian làm bài' : 'Đã hoàn tất toàn bộ'}
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-secondary-container/40 text-secondary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined">edit_document</span>
            </div>
          </div>

          <div className="glass-card p-4 rounded-xl border border-outline-variant/30 flex items-center justify-between">
            <div>
              <span className="text-xs text-on-surface-variant block font-medium">Bài đã nộp</span>
              <span className="text-xl sm:text-2xl font-bold text-tertiary font-merriweather">
                {submittedAssignments.length} bài
              </span>
              <span className="text-[11px] text-tertiary font-semibold block mt-0.5">
                {gradedList.length} kết quả đã công bố
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-tertiary-container/30 text-tertiary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined">task_alt</span>
            </div>
          </div>

          <div className="glass-card p-4 rounded-xl border border-outline-variant/30 flex items-center justify-between">
            <div>
              <span className="text-xs text-on-surface-variant block font-medium">Điểm trung bình</span>
              <span className="text-xl sm:text-2xl font-bold text-primary font-merriweather">
                {avgScore === null ? '—' : `${formatScore(avgScore)} / 10đ`}
              </span>
              <span className="text-[11px] text-[#CA8A04] font-semibold block mt-0.5">
                {gradedList.length ? 'Kết quả đã công bố • Thang 10' : 'Chưa có kết quả được công bố'}
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-primary-container/30 text-primary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined">military_tech</span>
            </div>
          </div>

          <div className="glass-card p-4 rounded-xl border border-outline-variant/30 flex items-center justify-between">
            <div>
              <span className="text-xs text-on-surface-variant block font-medium">Năng lực trọng tâm</span>
              <span className="text-sm sm:text-base font-bold text-on-surface font-merriweather line-clamp-1">
                Nghị luận văn học
              </span>
              <span className="text-[11px] text-secondary font-semibold block mt-0.5">
                Đọc hiểu &amp; Lập luận đa diện
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-surface-container-high text-primary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined">psychology</span>
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 border-b border-outline-variant/20 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab('todo')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'todo'
                ? 'bg-primary text-white shadow-sm ring-2 ring-primary/20'
                : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container border border-outline-variant/40'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">pending_actions</span>
            <span>Cần làm ({todoAssignments.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('submitted')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'submitted'
                ? 'bg-primary text-white shadow-sm ring-2 ring-primary/20'
                : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container border border-outline-variant/40'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">verified</span>
            <span>Đã nộp &amp; Lịch sử chấm ({submittedAssignments.length})</span>
          </button>
        </div>

        {/* Content Area */}
        {loading ? (
          <div className="p-16 text-center text-sm text-on-surface-variant flex flex-col items-center justify-center gap-3">
            <span className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin"></span>
            <span>Đang tải danh sách bài tập của em...</span>
          </div>
        ) : activeTab === 'todo' ? (
          todoAssignments.length === 0 ? (
            <div className="p-16 text-center bg-surface-container-lowest rounded-2xl border border-outline-variant/30 text-sm text-on-surface-variant space-y-2">
              <span className="material-symbols-outlined text-4xl text-outline mb-1">sentiment_satisfied</span>
              <p className="font-semibold text-on-surface">Em đã hoàn thành tất cả các bài tập được giao!</p>
              <p className="text-xs">Hãy xem lại kết quả bài đã nộp ở mục &ldquo;Đã nộp &amp; Lịch sử chấm&rdquo;.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {todoAssignments.map((assignment) => {
                const isExpanded = expandedInstructions[assignment.id];
                return (
                  <div
                    key={assignment.id}
                    className="glass-card rounded-2xl p-5 sm:p-6 border border-outline-variant/30 space-y-4 flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-secondary-fixed/50 text-secondary">
                            Nghị luận văn học
                          </span>
                          {assignment.classroomReadOnly ? (
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                              Chỉ xem
                            </span>
                          ) : (
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-tertiary-container/30 text-tertiary flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse"></span>
                              {deadlineState(assignment).closed ? 'Chỉ xem bài' : 'Đang mở nộp'}
                            </span>
                          )}
                          {classroomLabelFor(assignment) && (
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant">
                              {classroomLabelFor(assignment)}
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-mono font-semibold text-secondary">
                          {assignment.code}
                        </span>
                      </div>

                      <h3 className="font-merriweather font-bold text-lg text-on-surface leading-snug">
                        {assignment.title}
                      </h3>
                      <DeadlineNotice fields={assignment} compact />

                      <div className="text-xs text-on-surface-variant">
                        <p className={`leading-relaxed ${isExpanded ? 'whitespace-pre-line' : 'line-clamp-3'}`}>
                          {assignment.writingTask || assignment.instructions || 'Chưa có yêu cầu chi tiết.'}
                        </p>
                        {assignment.instructions && assignment.instructions.length > 120 && (
                          <button
                            type="button"
                            onClick={() => toggleInstructions(assignment.id)}
                            className="text-secondary text-[11px] font-semibold mt-1 hover:underline"
                          >
                            {isExpanded ? 'Thu gọn' : 'Xem yêu cầu chi tiết...'}
                          </button>
                        )}
                      </div>

                      {/* Rubric Badge Indicator */}
                      <div className="p-2.5 bg-surface-container-low/60 rounded-xl border border-outline-variant/20 flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 text-on-surface-variant font-medium">
                          <span className="material-symbols-outlined text-[16px] text-primary">gavel</span>
                          <span>Barem chấm GDPT 2018</span>
                        </span>
                        <span className="font-bold text-primary font-mono">
                          {assignment.rubric?.maxScore != null
                            ? `Thang ${formatScore(assignment.rubric.maxScore)} điểm`
                            : 'Theo barem được giao'}
                        </span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="pt-2 border-t border-outline-variant/20 flex items-center justify-between gap-2">
                      <Link
                        href={`/assignments/${assignment.id}/socratic`}
                        className="px-4 py-2 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary/90 transition-all shadow-sm flex items-center gap-1.5 active:scale-95"
                      >
                        <span className="material-symbols-outlined text-[16px]">psychology</span>
                        <span>Lập dàn ý Socratic</span>
                      </Link>

                      <Link
                        href={`/assignments/${assignment.id}/submit`}
                        className="px-3.5 py-2 bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-semibold rounded-xl transition-all flex items-center gap-1 border border-outline-variant/40"
                      >
                        <span className="material-symbols-outlined text-[16px]">photo_camera</span>
                        <span>Nộp ảnh bài viết</span>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          /* Submitted Assignments Tab */
          submittedAssignments.length === 0 ? (
            <div className="p-16 text-center bg-surface-container-lowest rounded-2xl border border-outline-variant/30 text-sm text-on-surface-variant space-y-2">
              <span className="material-symbols-outlined text-4xl text-outline mb-1">history_edu</span>
              <p className="font-semibold text-on-surface">Chưa có bài tập nào được nộp chính thức.</p>
              <p className="text-xs">Khi em hoàn thành bước kiểm tra OCR và xác nhận nộp, bài viết sẽ lưu tại đây.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {submittedAssignments.map((assignment) => {
                const assess = assessmentMap[assignment.id];
                const result = assess?.assessment.canViewResult ? assess.assessment.result : null;
                const assessmentStatus = assess?.assessment.status || 'none';

                return (
                  <div
                    key={assignment.id}
                    className="glass-card rounded-2xl p-5 sm:p-6 border border-outline-variant/30 space-y-4 flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                            <span className="material-symbols-outlined text-[13px]">check_circle</span>
                            Đã nộp chính thức
                          </span>
                          {classroomLabelFor(assignment) && (
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant">
                              {classroomLabelFor(assignment)}
                            </span>
                          )}
                          {assignment.classroomReadOnly && (
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                              Chỉ xem
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-mono font-semibold text-secondary">
                          {assignment.code}
                        </span>
                      </div>

                      <h3 className="font-merriweather font-bold text-lg text-on-surface leading-snug">
                        {assignment.title}
                      </h3>
                      <DeadlineNotice fields={assignment} compact />

                      {/* Score Highlight Box */}
                      {result ? (
                        <div className="p-3 bg-primary-container/15 rounded-xl border border-primary-container/30 flex flex-wrap gap-2 items-center justify-between">
                          <div>
                            <span className="text-[11px] text-on-surface-variant block font-medium">Kết quả đánh giá Rubric</span>
                            <div className="flex flex-wrap items-baseline gap-2 mt-0.5">
                              <span className="text-xl font-bold text-primary font-merriweather">
                                {formatScore(result.totalScore)} / {formatScore(result.maxScore)}đ
                              </span>
                              <span className="text-xs text-outline font-mono">
                                (Thang 10: {formatScore(result.scoreScale10, 1)}đ)
                              </span>
                            </div>
                          </div>
                          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-primary-container text-on-primary-container">
                            Đã công bố
                          </span>
                        </div>
                      ) : (
                        <div className="p-3 bg-surface-container-low/60 rounded-xl border border-outline-variant/30 space-y-1">
                          <p className="text-sm font-semibold text-on-surface">
                            {PENDING_ASSESSMENT_LABELS[assessmentStatus] || 'Chưa có kết quả được công bố'}
                          </p>
                          <p className="text-xs text-on-surface-variant">
                            Điểm và nhận xét chỉ hiển thị khi được giáo viên công bố.
                          </p>
                        </div>
                      )}

                      {result?.overallComment && (
                        <p className="text-xs text-on-surface-variant italic line-clamp-2">
                          &ldquo;{result.overallComment}&rdquo;
                        </p>
                      )}
                    </div>

                    <div className="pt-2 border-t border-outline-variant/20 flex items-center justify-between">
                      <span className="text-[11px] text-on-surface-variant">
                        {result ? 'Kết quả đã được giáo viên công bố' : 'Đã lưu bài nộp chính thức'}
                      </span>
                      <Link
                        href={`/assignments/${assignment.id}/result`}
                        className="px-4 py-2 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary/90 transition-all shadow-sm flex items-center gap-1.5 active:scale-95"
                      >
                        <span>{result ? 'Xem chi tiết đánh giá' : 'Theo dõi bài nộp'}</span>
                        <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>
    </StudentShell>
  );
}
