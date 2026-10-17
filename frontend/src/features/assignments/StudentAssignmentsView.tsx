'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import StudentShell from '@/components/StudentShell';
import { useAppStore } from '@/lib/store';
import { CENTRAL_ASSIGNMENT_ID, CENTRAL_ASSIGNMENT } from '@/lib/mock/assignmentData';

export default function StudentAssignmentsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    assignments,
    rubrics,
    submittedAssignmentIds,
    submissions,
    currentUser,
    getStudentSubmission,
    publishAssignment,
    addToast,
  } = useAppStore();

  const initialTab = searchParams.get('tab') === 'submitted' ? 'submitted' : 'todo';
  const [activeTab, setActiveTab] = useState<'todo' | 'submitted'>(initialTab);
  const [codeInput, setCodeInput] = useState('VAN11-NLVH-01');
  const [codeError, setCodeError] = useState(false);
  const [showEmptyState, setShowEmptyState] = useState(false);
  const [expandedInstructions, setExpandedInstructions] = useState<Record<string, boolean>>({ [CENTRAL_ASSIGNMENT_ID]: false });
  const [expandedRubrics, setExpandedRubrics] = useState<Record<string, boolean>>({});

  const toggleInstructions = (id: string) => {
    setExpandedInstructions((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleRubric = (id: string) => {
    setExpandedRubrics((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Divide assignments into todo and submitted dynamically
  const publishedAssignments = assignments.filter((a) => a.status === 'published');
  const todoAssignments = publishedAssignments.filter((a) => !submittedAssignmentIds.includes(a.id));
  const submittedAssignments = publishedAssignments.filter((a) => submittedAssignmentIds.includes(a.id));

  const handleOpenCode = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = codeInput.trim().toUpperCase();
    let matched = assignments.find((a) => a.code.toUpperCase() === clean);
    if (!matched && (clean === 'VAN11-NLVH-01' || clean === 'VAN12-NLVH-01' || clean === CENTRAL_ASSIGNMENT.code.toUpperCase())) {
      publishAssignment(CENTRAL_ASSIGNMENT_ID);
      matched = CENTRAL_ASSIGNMENT;
    }
    if (matched) {
      setCodeError(false);
      addToast(`Mở thành công: ${matched.title}`, 'success');
      router.push(`/assignments/${matched.id}/socratic`);
    } else {
      setCodeError(true);
      addToast('Mã đề thi không tồn tại hoặc chưa được giao.', 'error');
    }
  };

  return (
    <StudentShell headerTitle="Không gian học sinh" headerSubtitle="Bài tập của em & Bài đã nộp">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Hero Section */}
        <div className="p-6 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs bg-secondary-fixed/50 text-secondary font-bold px-2 py-0.5 rounded-full">
                Học sinh {currentUser?.name || 'Đỗ Đăng An'} ({currentUser?.classId ? `Lớp ${currentUser.classId}` : 'Lớp 11A14'})
              </span>
              <span className="text-xs bg-surface-container text-on-surface-variant font-medium px-2 py-0.5 rounded-full">
                Học kỳ I • Năm học 2026 - 2027
              </span>
            </div>
            <h1 className="font-headline-lg text-2xl font-bold text-on-surface font-merriweather">
              Không gian học tập &amp; Bài viết của em
            </h1>
            <p className="text-xs sm:text-sm text-on-surface-variant mt-1">
              Rèn luyện năng lực nghị luận theo quy trình GDPT 2018: Đọc hiểu &rarr; Lập dàn ý Socratic &rarr; Viết tay &rarr; Đánh giá Rubric.
            </p>
          </div>

          {/* Quick Enter Code Box */}
          <div className="bg-surface-container-low/70 p-3.5 rounded-xl border border-outline-variant/40 sm:max-w-xs w-full">
            <span className="text-xs font-semibold text-on-surface block mb-1.5 flex items-center gap-1">
              <span className="material-symbols-outlined text-sm text-secondary">pin</span>
              Nhập mã đề bài từ giáo viên
            </span>
            <form onSubmit={handleOpenCode} className="flex gap-2">
              <input
                type="text"
                value={codeInput}
                onChange={(e) => {
                  setCodeInput(e.target.value);
                  setCodeError(false);
                }}
                placeholder="VD: VAN12-NLVH-01"
                className="w-full px-2.5 py-1.5 text-xs font-mono uppercase rounded-lg border border-outline-variant/60 bg-surface-container-lowest text-on-surface focus:outline-none focus:border-secondary"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-primary-container text-on-primary-container font-semibold text-xs rounded-lg hover:brightness-95 shrink-0 transition-all shadow-sm"
              >
                Mở bài
              </button>
            </form>
            {codeError && (
              <p className="text-[11px] text-error mt-1 flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px]">error</span>
                Mã không hợp lệ hoặc đã hết hạn truy cập.
              </p>
            )}
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-outline-variant/20 text-[10px] text-on-surface-variant">
              <span>Mã bài tập: VAN11-NLVH-01</span>
            </div>
          </div>
        </div>

        {/* Learning Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm">
            <span className="text-xs text-on-surface-variant block">Bài tập cần làm</span>
            <span className="text-xl font-bold text-on-surface font-merriweather">
              {String(todoAssignments.length).padStart(2, '0')}
            </span>
            <span className="text-[10px] text-secondary font-medium block mt-0.5">
              {todoAssignments.length > 0 ? 'Có bài cần hoàn thành' : 'Đã nộp tất cả'}
            </span>
          </div>

          <div className="p-3.5 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm">
            <span className="text-xs text-on-surface-variant block">Đã có kết quả AI</span>
            <span className="text-xl font-bold text-tertiary font-merriweather">
              {String(submittedAssignments.length).padStart(2, '0')}
            </span>
            <span className="text-[10px] text-tertiary font-medium block mt-0.5">
              {submittedAssignments.length > 0 ? 'Đạt chuẩn Rubric' : 'Chưa có bài nộp'}
            </span>
          </div>

          <div className="p-3.5 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm">
            <span className="text-xs text-on-surface-variant block">Tiến độ Socratic</span>
            <span className="text-xl font-bold text-primary font-merriweather">
              {todoAssignments.length > 0 ? '50%' : '100%'}
            </span>
            <span className="text-[10px] text-primary font-medium block mt-0.5">
              {todoAssignments.length > 0 ? 'Đã hoàn thành 3/4 ý' : 'Hoàn tất dàn ý'}
            </span>
          </div>

          <div className="p-3.5 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm">
            <span className="text-xs text-on-surface-variant block">Điểm trung bình</span>
            <span className="text-xl font-bold text-secondary font-merriweather">
              {submittedAssignments.length > 0 ? '8.8 / 10' : '-- / 10'}
            </span>
            <span className="text-[10px] text-secondary font-medium block mt-0.5">
              {submittedAssignments.length > 0 ? 'Mức Giỏi (Tích lũy tốt)' : 'Chờ làm bài'}
            </span>
          </div>
        </div>

        {/* Tab & Demo Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-2 border-b border-outline-variant/30 pb-1">
            <button
              onClick={() => setActiveTab('todo')}
              className={`pb-2 px-3 text-sm font-semibold transition-all relative ${
                activeTab === 'todo'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Bài tập cần làm ({todoAssignments.length})
            </button>
            <button
              onClick={() => setActiveTab('submitted')}
              className={`pb-2 px-3 text-sm font-semibold transition-all relative ${
                activeTab === 'submitted'
                  ? 'text-secondary border-b-2 border-secondary'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Bài đã nộp &amp; Lịch sử chấm ({submittedAssignments.length})
            </button>
          </div>
        </div>

        {/* Content by Tab */}
        {showEmptyState ? (
          <div className="bg-surface-container-lowest rounded-xl p-12 text-center border border-outline-variant/30 shadow-sm max-w-md mx-auto my-6">
            <div className="w-14 h-14 rounded-full bg-surface-container-low flex items-center justify-center text-on-surface-variant mx-auto mb-3">
              <span className="material-symbols-outlined text-3xl">task_alt</span>
            </div>
            <h3 className="text-base font-bold text-on-surface mb-1">Hiện không có bài tập nào cần nộp</h3>
            <p className="text-xs text-on-surface-variant mb-4">
              Em đã hoàn thành xuất sắc các bài tập được giao. Hãy chờ đề bài tiếp theo từ cô giáo nhé!
            </p>
          </div>
        ) : activeTab === 'todo' ? (
          /* Tab Todo Cards */
          <div className="space-y-4">
            {todoAssignments.length === 0 ? (
              <div className="bg-surface-container-lowest rounded-xl p-12 text-center border border-outline-variant/30 shadow-sm max-w-md mx-auto my-6">
                <div className="w-14 h-14 rounded-full bg-tertiary-container/30 flex items-center justify-center text-tertiary mx-auto mb-3">
                  <span className="material-symbols-outlined text-3xl">verified</span>
                </div>
                <h3 className="text-base font-bold text-on-surface mb-1">Chưa có bài tập mới cần làm</h3>
                <p className="text-xs text-on-surface-variant mb-4 leading-relaxed">
                  Em đã hoàn thành <strong>02 bài tập trước đó</strong>. Hãy kiểm tra nhận xét chi tiết của AI và cô giáo ở tab bên cạnh hoặc chờ cô giáo giao đề bài mới nhé!
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('submitted')}
                  className="px-4 py-2 bg-secondary text-white rounded-lg text-xs font-semibold hover:bg-secondary/90 transition-all shadow-sm"
                >
                  Xem lịch sử bài đã nộp ({submittedAssignments.length}) &rarr;
                </button>
              </div>
            ) : (
              todoAssignments.map((assignment) => {
                const isCurrent = assignment.id === CENTRAL_ASSIGNMENT_ID;
                const isInstructionsOpen = !!expandedInstructions[assignment.id];
                const isRubricOpen = !!expandedRubrics[assignment.id];

                return (
                  <div
                    key={assignment.id}
                    className={`p-5 bg-surface-container-lowest rounded-xl shadow-sm space-y-4 transition-all ${
                      isCurrent
                        ? 'border-2 border-primary-container/60'
                        : 'border border-outline-variant/30'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-outline-variant/20">
                      <div className="flex flex-wrap items-center gap-2">
                        {isCurrent ? (
                          <span className="text-xs font-bold text-on-primary-container bg-primary-container px-2.5 py-0.5 rounded-full">
                            Đang thực hiện (Quy trình 5 bước)
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-on-surface-variant bg-surface-container px-2.5 py-0.5 rounded-full">
                            Chưa bắt đầu
                          </span>
                        )}
                        <span className="text-xs text-secondary font-mono font-semibold">{assignment.code}</span>
                      </div>
                      <span className="text-xs text-[#DC2626] font-medium flex items-center gap-1">
                        <span className="material-symbols-outlined text-[15px]">timer</span>
                        Hạn nộp: {assignment.deadline}
                      </span>
                    </div>

                    <div>
                      <h3 className="font-headline-md text-lg font-bold text-on-surface font-merriweather">
                        {assignment.title}
                      </h3>
                      <p className="text-xs text-on-surface-variant mt-1">
                        Dạng bài: {assignment.topic} • Khối {assignment.gradeLevel} THPT Đan Phượng
                      </p>
                    </div>

                    {/* Progress 5 Steps Preview */}
                    <div className="p-3 bg-surface-container-low/50 rounded-lg">
                      <span className="text-[11px] font-semibold text-outline uppercase tracking-wider block mb-2">
                        Chu trình 5 bước theo chuẩn GDPT 2018
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                        <div className="flex items-center gap-1.5 text-tertiary font-medium">
                          <span className="material-symbols-outlined text-base">check_circle</span>
                          <span>1. Đọc hiểu</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-primary font-bold">
                          <span className="material-symbols-outlined text-base">pending</span>
                          <span>2. Socratic</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-outline-variant">
                          <span className="material-symbols-outlined text-base">radio_button_unchecked</span>
                          <span>3. Viết tay</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-outline-variant">
                          <span className="material-symbols-outlined text-base">radio_button_unchecked</span>
                          <span>4. Soát OCR</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-outline-variant">
                          <span className="material-symbols-outlined text-base">radio_button_unchecked</span>
                          <span>5. Rubric</span>
                        </div>
                      </div>
                    </div>

                    {/* Collapsible Instructions Excerpt */}
                    <div>
                      <button
                        type="button"
                        onClick={() => toggleInstructions(assignment.id)}
                        className="text-xs font-semibold text-secondary flex items-center gap-1 hover:underline"
                      >
                        <span className="material-symbols-outlined text-base">
                          {isInstructionsOpen ? 'expand_less' : 'expand_more'}
                        </span>
                        {isInstructionsOpen ? 'Thu gọn yêu cầu đề bài' : 'Xem chi tiết yêu cầu đề bài (~600 chữ)'}
                      </button>
                      {isInstructionsOpen && (
                        <div className="mt-2 p-3 bg-surface-container-low/60 rounded-lg text-xs leading-relaxed text-on-surface-variant space-y-1.5 whitespace-pre-line font-merriweather">
                          {assignment.instructions}
                        </div>
                      )}
                    </div>

                    {/* Rubric Summary Collapsible */}
                    <div>
                      {(() => {
                        const assignmentRubric = rubrics.find((r) => r.id === assignment.rubricId) || rubrics[0];
                        return (
                          <>
                            <button
                              type="button"
                              onClick={() => toggleRubric(assignment.id)}
                              className="text-xs font-semibold text-on-surface-variant flex items-center gap-1 hover:underline"
                            >
                              <span className="material-symbols-outlined text-base">
                                {isRubricOpen ? 'expand_less' : 'expand_more'}
                              </span>
                              <span>
                                {assignmentRubric?.shortTitle || 'Thang điểm Rubric chuẩn GDPT 2018'} (Tổng {assignmentRubric?.maxScore.toFixed(1)}đ • {assignmentRubric?.criteria.length} tiêu chí)
                              </span>
                            </button>
                            {isRubricOpen && (
                              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                                {assignmentRubric?.criteria.map((c) => (
                                  <div key={c.id} className="p-2 bg-surface-container-low rounded border border-outline-variant/30 space-y-0.5">
                                    <span className="font-semibold block text-primary truncate" title={c.name}>
                                      {c.id}: {c.name}
                                    </span>
                                    <span className="text-on-surface-variant text-[11px]">
                                      {c.weight.toFixed(2)} điểm tối đa
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>

                    <div className="pt-3 border-t border-outline-variant/20 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                        <span className="material-symbols-outlined text-tertiary text-base">menu_book</span>
                        <span>Đã liên kết học liệu &amp; Barem chuẩn</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Link
                          href={`/assignments/${assignment.id}/submit`}
                          className="px-3.5 py-2 rounded-lg border border-outline-variant/60 text-xs font-medium text-on-surface hover:bg-surface-container transition-all"
                        >
                          Nộp ảnh viết tay
                        </Link>
                        <Link
                          href={`/assignments/${assignment.id}/socratic`}
                          className="px-4 py-2 rounded-lg bg-primary-container text-on-primary-container text-xs font-semibold hover:brightness-95 transition-all shadow-sm flex items-center gap-1.5"
                        >
                          <span>Tiếp tục lập dàn ý Socratic</span>
                          <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          /* Tab Submitted Cards */
          <div className="space-y-4">
            {submittedAssignments.length === 0 ? (
              <div className="bg-surface-container-lowest rounded-xl p-12 text-center border border-outline-variant/30 shadow-sm max-w-md mx-auto my-6">
                <div className="w-14 h-14 rounded-full bg-surface-container-low flex items-center justify-center text-on-surface-variant mx-auto mb-3">
                  <span className="material-symbols-outlined text-3xl">inbox</span>
                </div>
                <h3 className="text-base font-bold text-on-surface mb-1">Chưa có bài tập nào được nộp</h3>
                <p className="text-xs text-on-surface-variant mb-4">
                  Em hãy chuyển sang tab &quot;Bài tập cần làm&quot; để thực hiện quy trình lập dàn ý và nộp ảnh bài viết tay nhé!
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('todo')}
                  className="px-4 py-2 bg-primary-container text-on-primary-container rounded-lg text-xs font-semibold hover:brightness-95 transition-all shadow-sm"
                >
                  Xem bài tập cần làm &rarr;
                </button>
              </div>
            ) : (
              submittedAssignments.map((assignment) => {
                const sub =
                  getStudentSubmission?.(assignment.id, currentUser?.id || 'user-student-11a14-001') ||
                  (assignment.id === CENTRAL_ASSIGNMENT_ID ? submissions?.['sub-user-student-11a14-001'] : undefined) ||
                  (submissions ? Object.values(submissions).find((s) => s.assignmentId === assignment.id && s.studentId === (currentUser?.id || 'user-student-11a14-001')) : undefined) ||
                  (submissions ? Object.values(submissions).find((s) => s.assignmentId === assignment.id) : undefined);

                const score = typeof sub?.totalScore === 'number' ? sub.totalScore.toFixed(2) : '3.60';
                const score10 = typeof sub?.scoreScale10 === 'number' ? sub.scoreScale10.toFixed(1) : '9.0';
                const isPublished = sub ? sub.isPublishedToStudent : true;
                const gradeLevel =
                  sub?.gradeLevel ||
                  (Number(score) >= 3.6
                    ? 'Giỏi (Năng lực phân tích xuất sắc)'
                    : 'Khá (Phát triển tốt)');

                const criteriaBreakdown = Array.isArray(sub?.evaluations) && sub.evaluations.length > 0
                  ? sub.evaluations
                      .map((e) => `${(e.criterionId || '').slice(0, 2)}: ${(Number(e.awardedScore) || 0).toFixed(2)}/${(Number(e.maxScore) || 0).toFixed(2)}`)
                      .join(' | ')
                  : 'C1: 2.25/2.50 | C2: 0.65/0.75 | C3: 0.45/0.50 | C4: 0.25/0.25';

                const pageCount = sub?.pages?.length || 2;

                return (
                  <div
                    key={assignment.id}
                    className="p-5 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm space-y-4"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-outline-variant/20">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-tertiary bg-tertiary-container/30 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm">verified</span>
                          Đã có kết quả ({score} / 4.00 • Quy đổi {score10} / 10)
                        </span>
                        <span className="text-xs text-on-surface-variant font-mono">Mã bài nộp: {sub?.id || `SUB_20261015_${assignment.code}`}</span>
                      </div>
                      <span className="text-xs text-on-surface-variant">Hạn nộp: {assignment.deadline}</span>
                    </div>

                    <div>
                      <h3 className="font-headline-md text-base font-bold text-on-surface font-merriweather">
                        {assignment.title}
                      </h3>
                      <p className="text-xs text-on-surface-variant mt-1">
                        Xếp loại: <strong>{gradeLevel}</strong> • Điểm chi tiết: {criteriaBreakdown}
                      </p>
                    </div>

                    <div className="p-3 bg-surface-container-low/50 rounded-lg text-xs flex items-center justify-between">
                      <div className="flex items-center gap-2 text-on-surface-variant">
                        <span className="material-symbols-outlined text-secondary text-base">photo_library</span>
                        <span>Đã nhận dạng OCR {pageCount} trang viết tay • {sub?.ocrConfidenceLabel || 'Độ chính xác 98%'}</span>
                      </div>
                      <span className="text-tertiary font-semibold">
                        {isPublished ? 'Đã được giáo viên công bố' : 'Giáo viên đang rà soát'}
                      </span>
                    </div>

                    <div className="pt-2 flex items-center justify-end gap-3">
                      <Link
                        href={`/assignments/${assignment.id}/ocr`}
                        className="px-3.5 py-1.5 rounded-lg border border-outline-variant/60 text-xs font-medium text-on-surface hover:bg-surface-container transition-all flex items-center gap-1.5"
                      >
                        <span className="material-symbols-outlined text-sm">document_scanner</span>
                        <span>Đối chiếu OCR {pageCount} trang</span>
                      </Link>
                      <Link
                        href={`/assignments/${assignment.id}/result`}
                        className="px-4 py-1.5 rounded-lg bg-secondary text-white text-xs font-semibold hover:bg-secondary/90 transition-all flex items-center gap-1.5 shadow-sm"
                      >
                        <span className="material-symbols-outlined text-sm">visibility</span>
                        <span>Xem nhận xét &amp; Rubric</span>
                      </Link>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </StudentShell>
  );
}

