'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { GradingEvaluation, StudentSubmission } from '@/lib/types';
import AssignmentWorkflowStepper from '@/components/AssignmentWorkflowStepper';
import { CENTRAL_ASSIGNMENT_ID, DOCX_ORIGINAL_GUIDE } from '@/lib/mock/assignmentData';
import { SUBMISSION_MANIFEST } from '@/lib/mock/submissionsManifest';

interface EvaluationResultViewProps {
  viewMode?: 'student' | 'teacher';
  assignmentId?: string;
  studentId?: string;
}

export default function EvaluationResultView({
  viewMode = 'student',
  assignmentId = CENTRAL_ASSIGNMENT_ID,
  studentId,
}: EvaluationResultViewProps) {
  const router = useRouter();
  const {
    assignments,
    currentUser,
    getStudentSubmission,
    updateStudentGrading,
    publishStudentResult,
    addToast,
  } = useAppStore();

  const targetStudentId = studentId || currentUser?.id || '';
  const assignment = assignments.find((a) => a.id === assignmentId) || assignments[0];
  const submission = getStudentSubmission(assignmentId, targetStudentId);

  // Tab navigation inside evaluation detail
  const [activeTab, setActiveTab] = useState<'eval' | 'handwriting' | 'transcription'>('eval');

  // Teacher editing state
  const [isEditingScores, setIsEditingScores] = useState(false);
  const [editedEvaluations, setEditedEvaluations] = useState<GradingEvaluation[]>([]);
  const [editedTeacherNotes, setEditedTeacherNotes] = useState<string>('');

  // Image viewer state for handwritten tab
  const [activeHandwritingPage, setActiveHandwritingPage] = useState<number>(1);
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [rotationAngle, setRotationAngle] = useState<number>(0);

  // Docx original guide modal
  const [docxGuideModalOpen, setDocxGuideModalOpen] = useState(false);

  useEffect(() => {
    if (submission) {
      setEditedEvaluations(submission.evaluations);
      setEditedTeacherNotes(submission.teacherNotes || '');
    }
  }, [submission]);

  // Escape key closes modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDocxGuideModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // If no submission found for this student / assignment: show explicit 404/Empty State
  if (!submission) {
    return (
      <div className="max-w-4xl mx-auto p-12 text-center bg-surface-container-lowest rounded-2xl border border-outline-variant/30 space-y-4 my-8">
        <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center text-outline mx-auto">
          <span className="material-symbols-outlined text-3xl">folder_off</span>
        </div>
        <h2 className="font-headline-md text-lg font-bold text-on-surface font-merriweather">
          Không tìm thấy bài nộp của học sinh
        </h2>
        <p className="text-xs text-on-surface-variant max-w-md mx-auto leading-relaxed">
          Mã học sinh: <strong className="font-mono">{targetStudentId}</strong> chưa có bài nộp cho đề{' '}
          <strong>{assignment?.title}</strong> hoặc bài đang trong giai đoạn nháp.
        </p>
        <div className="pt-2 flex justify-center gap-3">
          {viewMode === 'teacher' ? (
            <Link
              href="/reports"
              className="px-4 py-2 bg-primary text-white rounded-lg text-xs font-semibold hover:bg-primary/90"
            >
              Quay lại danh sách báo cáo
            </Link>
          ) : (
            <Link
              href={`/assignments/${assignmentId}/submit`}
              className="px-4 py-2 bg-primary text-white rounded-lg text-xs font-semibold hover:bg-primary/90"
            >
              Nộp ảnh bài làm ngay
            </Link>
          )}
        </div>
      </div>
    );
  }

  // Handle score change in teacher edit mode
  const handleScoreChange = (criterionId: string, newScore: number) => {
    setEditedEvaluations((prev) =>
      prev.map((e) =>
        e.criterionId === criterionId
          ? { ...e, awardedScore: Math.min(Math.max(newScore, 0), e.maxScore) }
          : e
      )
    );
  };

  const handleSaveGrading = () => {
    updateStudentGrading(submission.id, {
      evaluations: editedEvaluations,
      teacherNotes: editedTeacherNotes,
    });
    setIsEditingScores(false);
    addToast('Đã lưu bảng điểm và nhận xét của giáo viên thành công!', 'success');
  };

  const handleTogglePublish = () => {
    if (!submission.isPublishedToStudent) {
      publishStudentResult(submission.id);
      addToast(`Đã công bố kết quả cho học sinh ${submission.studentName}!`, 'success');
    } else {
      useAppStore.setState((state) => ({
        submissions: {
          ...state.submissions,
          [submission.id]: {
            ...state.submissions[submission.id],
            isPublishedToStudent: false,
          },
        },
      }));
      addToast(`Đã chuyển kết quả học sinh ${submission.studentName} về trạng thái chờ duyệt.`, 'info');
    }
  };

  // If in student mode and teacher hasn't published yet
  if (viewMode === 'student' && !submission.isPublishedToStudent) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <AssignmentWorkflowStepper currentStep="result" assignmentId={assignmentId} />
        <div className="p-12 text-center bg-surface-container-lowest rounded-2xl border border-[#CA8A04]/30 space-y-4">
          <div className="w-16 h-16 rounded-full bg-[#FEF9C3] flex items-center justify-center text-[#CA8A04] mx-auto">
            <span className="material-symbols-outlined text-3xl">hourglass_top</span>
          </div>
          <h2 className="font-headline-md text-lg font-bold text-on-surface font-merriweather">
            Bài làm đang được Giáo viên thẩm định &amp; Phê duyệt điểm
          </h2>
          <p className="text-xs text-on-surface-variant max-w-lg mx-auto leading-relaxed">
            Học sinh <strong className="text-on-surface">{submission.studentName}</strong> ({submission.studentCode}) đã nộp bài vào lúc {submission.submissionDate}. Để đảm bảo tính chính xác và khách quan theo chuẩn GDPT 2018, kết quả và nhận xét chi tiết sẽ hiển thị ngay sau khi Cô Đặng Loan công bố kết quả chính thức.
          </p>
          <div className="flex justify-center gap-3 pt-2">
            <Link
              href={`/assignments/${assignmentId}/ocr`}
              className="px-4 py-2 border border-outline-variant/60 rounded-lg text-xs font-semibold text-on-surface hover:bg-surface-container"
            >
              Xem lại bản chép OCR
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Active handwriting page image
  const activeImage =
    submission.pages.find((p) => p.pageIndex === activeHandwritingPage) || submission.pages[0];

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* Top Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-outline-variant/20">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs bg-primary-fixed text-primary font-bold px-2.5 py-0.5 rounded-full">
              Rubric GDPT 2018 (Thang 4,0đ)
            </span>
            <span className="text-xs text-on-surface-variant font-medium">
              Đề: {assignment?.title}
            </span>
          </div>
          <h1 className="font-headline-md text-xl font-bold text-on-surface font-merriweather flex items-center gap-2">
            <span>Chi tiết đánh giá: {submission.studentName}</span>
            <span className="text-xs font-mono font-normal text-outline">({submission.studentCode})</span>
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setDocxGuideModalOpen(true)}
            className="px-3 py-1.5 rounded-lg border border-outline-variant/60 bg-surface-container-lowest text-xs font-semibold text-secondary hover:bg-surface-container transition-all flex items-center gap-1.5 shadow-sm"
          >
            <span className="material-symbols-outlined text-sm">menu_book</span>
            <span>Hướng dẫn chấm gốc DOCX</span>
          </button>

          {viewMode === 'teacher' ? (
            <Link
              href="/reports"
              className="px-3.5 py-1.5 bg-surface-container-lowest border border-outline-variant/60 rounded-lg text-xs font-semibold text-on-surface hover:bg-surface-container transition-all flex items-center gap-1 shadow-sm"
            >
              <span className="material-symbols-outlined text-sm">arrow_back</span>
              <span>Báo cáo lớp 12A1</span>
            </Link>
          ) : (
            <Link
              href="/assignments"
              className="px-3 py-1.5 rounded-lg border border-outline-variant/50 text-xs text-on-surface hover:bg-surface-container"
            >
              Bài tập của em
            </Link>
          )}
        </div>
      </div>

      {/* 5-Step Workflow Stepper for Student */}
      {viewMode === 'student' && (
        <AssignmentWorkflowStepper currentStep="result" assignmentId={assignmentId} />
      )}

      {/* Overall Score & Status KPI Card */}
      <div className="p-4 bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-primary-container/40 flex flex-col items-center justify-center text-primary border border-primary/30">
            <span className="text-xl font-bold font-mono leading-none">{submission.totalScore.toFixed(2)}</span>
            <span className="text-[10px] text-outline font-medium">/ 4,00đ</span>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-on-surface font-merriweather">
                Xếp loại: {submission.gradeLevel}
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  submission.isPublishedToStudent
                    ? 'bg-tertiary-container/40 text-tertiary border border-tertiary/30'
                    : 'bg-[#FEF9C3] text-[#CA8A04] border border-[#CA8A04]/30'
                }`}
              >
                {submission.isPublishedToStudent ? 'Đã công bố cho HS' : 'Chờ công bố'}
              </span>
            </div>
            <p className="text-xs text-on-surface-variant mt-1 font-mono">
              Quy đổi thang 10: <strong>{submission.scoreScale10.toFixed(2)} / 10.0đ</strong>{' '}
              <span className="text-[11px] text-outline font-normal">(Công thức: [Điểm / 4.0] × 10)</span>
            </p>
          </div>
        </div>

        {/* Teacher Action Buttons */}
        {viewMode === 'teacher' && (
          <div className="flex flex-wrap items-center gap-2">
            {!isEditingScores ? (
              <button
                onClick={() => setIsEditingScores(true)}
                className="px-3.5 py-1.5 rounded-lg border border-secondary/50 bg-secondary-container/20 text-secondary text-xs font-semibold hover:bg-secondary-container/40 flex items-center gap-1.5 transition-all shadow-sm"
              >
                <span className="material-symbols-outlined text-sm">edit_note</span>
                <span>Điều chỉnh điểm &amp; Nhận xét</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveGrading}
                  className="px-3.5 py-1.5 rounded-lg bg-secondary text-white text-xs font-bold hover:bg-secondary/90 shadow-sm flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-sm">save</span>
                  <span>Lưu thay đổi</span>
                </button>
                <button
                  onClick={() => setIsEditingScores(false)}
                  className="px-3 py-1.5 rounded-lg border border-outline-variant/60 text-xs text-on-surface-variant hover:bg-surface-container"
                >
                  Hủy
                </button>
              </div>
            )}

            <button
              onClick={handleTogglePublish}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm ${
                submission.isPublishedToStudent
                  ? 'bg-surface-container-high text-on-surface hover:bg-surface-container'
                  : 'bg-primary text-white hover:bg-primary/90'
              }`}
            >
              <span className="material-symbols-outlined text-sm">
                {submission.isPublishedToStudent ? 'visibility_off' : 'send'}
              </span>
              <span>{submission.isPublishedToStudent ? 'Ẩn kết quả' : 'Công bố kết quả cho HS'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Writing Profile AI Synthesis Callout (Student only) */}
      {viewMode === 'student' && submission.isPublishedToStudent && (
        <div className="p-3.5 bg-gradient-to-r from-secondary-container/30 via-surface-container-lowest to-purple-500/10 rounded-2xl border border-secondary/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-secondary-fixed text-secondary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-lg">fingerprint</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-on-surface">
                  Dấu ấn văn phong: Đã trích xuất vào Hồ sơ Cây bút
                </span>
                <span className="text-[10px] bg-secondary-fixed/50 text-secondary font-bold px-1.5 py-0.2 rounded-full">
                  AI Synthesis
                </span>
              </div>
              <p className="text-[11px] text-on-surface-variant">
                Gemini 2.5 Flash đã trích xuất các dẫn chứng về lựa chọn từ ngữ và cấu trúc câu từ bài viết này để cập nhật vào Hồ sơ văn phong của {submission.studentName}.
              </p>
            </div>
          </div>
          <Link
            href="/profile"
            className="px-3 py-1.5 bg-secondary text-white rounded-xl text-xs font-semibold hover:bg-secondary/90 transition-all flex items-center gap-1 shadow-sm shrink-0 self-end sm:self-auto"
          >
            <span>Xem Hồ sơ văn phong</span>
            <span className="material-symbols-outlined text-sm">arrow_forward</span>
          </Link>
        </div>
      )}

      {/* 3 Main Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-outline-variant/20 pb-1">
        <button
          onClick={() => setActiveTab('eval')}
          className={`px-4 py-2 font-bold text-xs rounded-t-lg transition-all flex items-center gap-1.5 border-b-2 ${
            activeTab === 'eval'
              ? 'border-primary text-primary bg-surface-container-lowest shadow-xs'
              : 'border-transparent text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-sm">gavel</span>
          <span>1. Đánh giá &amp; Barem Rubric (4,0đ)</span>
        </button>
        <button
          onClick={() => setActiveTab('handwriting')}
          className={`px-4 py-2 font-bold text-xs rounded-t-lg transition-all flex items-center gap-1.5 border-b-2 ${
            activeTab === 'handwriting'
              ? 'border-primary text-primary bg-surface-container-lowest shadow-xs'
              : 'border-transparent text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-sm">photo_camera</span>
          <span>2. Bài viết tay ({submission.pages.length} trang ảnh)</span>
        </button>
        <button
          onClick={() => setActiveTab('transcription')}
          className={`px-4 py-2 font-bold text-xs rounded-t-lg transition-all flex items-center gap-1.5 border-b-2 ${
            activeTab === 'transcription'
              ? 'border-primary text-primary bg-surface-container-lowest shadow-xs'
              : 'border-transparent text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-sm">text_snippet</span>
          <span>3. Bản chép số hóa</span>
        </button>
      </div>

      {/* TAB 1: Evaluation & Rubric Breakdown */}
      {activeTab === 'eval' && (
        <div className="space-y-5">
          {/* 4 Rubric Criteria Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {submission.evaluations.map((ev) => {
              const currentScore =
                isEditingScores
                  ? editedEvaluations.find((e) => e.criterionId === ev.criterionId)?.awardedScore ?? ev.awardedScore
                  : ev.awardedScore;

              return (
                <div
                  key={ev.criterionId}
                  className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm space-y-3"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
                    <span className="font-bold text-xs text-on-surface font-merriweather flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-secondary"></span>
                      {ev.criterionName}
                    </span>

                    {isEditingScores ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="0.05"
                          min="0"
                          max={ev.maxScore}
                          value={currentScore}
                          onChange={(e) => handleScoreChange(ev.criterionId, parseFloat(e.target.value) || 0)}
                          className="w-16 px-1.5 py-0.5 text-xs font-mono font-bold text-right rounded border border-secondary bg-surface"
                        />
                        <span className="text-xs font-mono text-outline">/ {ev.maxScore.toFixed(2)}đ</span>
                      </div>
                    ) : (
                      <span className="font-mono font-bold text-secondary text-xs">
                        {ev.awardedScore.toFixed(2)} / {ev.maxScore.toFixed(2)}đ
                      </span>
                    )}
                  </div>

                  {/* Strengths */}
                  {ev.strengths && ev.strengths.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-[11px] font-bold text-tertiary flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs">check_circle</span>
                        Điểm sáng &amp; Luận điểm tốt:
                      </span>
                      <ul className="space-y-1 text-[11px] text-on-surface-variant pl-4 list-disc">
                        {ev.strengths.map((str, idx) => (
                          <li key={idx} className="leading-relaxed">{str}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Weaknesses & Missing Elements */}
                  {ev.weaknesses && ev.weaknesses.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-[11px] font-bold text-[#CA8A04] flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs">warning</span>
                        Điểm cần lưu ý &amp; thiếu sót:
                      </span>
                      <ul className="space-y-1 text-[11px] text-on-surface-variant pl-4 list-disc">
                        {ev.weaknesses.map((w, idx) => (
                          <li key={idx} className="leading-relaxed text-error/90 font-medium">{w}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Comment */}
                  {ev.comment && (
                    <div className="p-2.5 bg-surface-container-low/60 rounded-lg text-[11px] text-on-surface italic border border-outline-variant/20">
                      &ldquo;{ev.comment}&rdquo;
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Teacher Overall Notes Card */}
          <div className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm space-y-2">
            <div className="flex items-center justify-between pb-1">
              <span className="font-bold text-xs text-primary flex items-center gap-1.5 uppercase tracking-wider">
                <span className="material-symbols-outlined text-sm">rate_review</span>
                <span>Nhận xét tổng quát của Giáo viên bộ môn (Cô Đặng Loan):</span>
              </span>
            </div>

            {isEditingScores ? (
              <textarea
                value={editedTeacherNotes}
                onChange={(e) => setEditedTeacherNotes(e.target.value)}
                rows={3}
                placeholder="Nhập nhận xét tổng quát cho học sinh..."
                className="w-full p-2.5 text-xs rounded-lg border border-secondary bg-surface text-on-surface leading-relaxed focus:outline-none"
              />
            ) : (
              <p className="text-xs text-on-surface leading-relaxed bg-surface-container-low/50 p-3 rounded-lg border border-outline-variant/20">
                {submission.teacherNotes || 'Chưa có ghi chú tổng quát.'}
              </p>
            )}
          </div>

          {/* Pedagogical Improvement Tasks */}
          {submission.pedagogicalTasks && submission.pedagogicalTasks.length > 0 && (
            <div className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm space-y-3">
              <span className="font-bold text-xs text-secondary flex items-center gap-1.5 uppercase tracking-wider">
                <span className="material-symbols-outlined text-sm">model_training</span>
                <span>Nhiệm vụ sư phạm khắc phục &amp; Phát triển năng lực (GDPT 2018):</span>
              </span>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {submission.pedagogicalTasks.map((t) => (
                  <div key={t.id} className="p-3 bg-surface-container-low/50 rounded-xl border border-outline-variant/20 flex flex-col justify-between space-y-2">
                    <div>
                      <h4 className="font-bold text-xs text-on-surface">{t.title}</h4>
                      <p className="text-[11px] text-on-surface-variant mt-1 leading-relaxed">{t.description}</p>
                    </div>
                    <button
                      onClick={() => addToast(`Đã mở nhiệm vụ: "${t.title}"`, 'info')}
                      className="self-start text-[11px] font-bold text-secondary hover:underline flex items-center gap-1 pt-1"
                    >
                      <span>{t.actionLabel}</span>
                      <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Handwritten Photos Viewer */}
      {activeTab === 'handwriting' && (
        <div className="space-y-4">
          <div className="p-2.5 bg-surface-container-low/70 rounded-xl border border-outline-variant/30 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-on-surface">Chọn trang bài viết tay:</span>
              {submission.pages.map((p) => (
                <button
                  key={p.pageIndex}
                  onClick={() => {
                    setActiveHandwritingPage(p.pageIndex);
                    setZoomScale(1);
                    setRotationAngle(0);
                  }}
                  className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all flex items-center gap-1.5 ${
                    activeHandwritingPage === p.pageIndex
                      ? 'bg-primary text-white shadow-sm'
                      : 'bg-surface-container-lowest text-on-surface border border-outline-variant/40 hover:bg-surface-container'
                  }`}
                >
                  <span>Trang 0{p.pageIndex}</span>
                </button>
              ))}
            </div>

            {/* Viewer Controls */}
            <div className="flex items-center gap-1.5 bg-surface-container-lowest p-1 rounded-lg border border-outline-variant/40">
              <button
                onClick={() => setZoomScale((prev) => Math.max(prev - 0.25, 0.5))}
                title="Thu nhỏ"
                className="p-1 rounded hover:bg-surface-container text-on-surface"
              >
                <span className="material-symbols-outlined text-base">zoom_out</span>
              </button>
              <span className="text-[11px] font-mono px-1 min-w-[45px] text-center text-on-surface font-semibold">
                {Math.round(zoomScale * 100)}%
              </span>
              <button
                onClick={() => setZoomScale((prev) => Math.min(prev + 0.25, 2.5))}
                title="Phóng to"
                className="p-1 rounded hover:bg-surface-container text-on-surface"
              >
                <span className="material-symbols-outlined text-base">zoom_in</span>
              </button>
              <div className="h-4 w-px bg-outline-variant/40 mx-1"></div>
              <button
                onClick={() => setRotationAngle((prev) => (prev + 90) % 360)}
                title="Xoay"
                className="p-1 rounded hover:bg-surface-container text-on-surface flex items-center gap-1 text-[11px]"
              >
                <span className="material-symbols-outlined text-base">rotate_right</span>
                <span>Xoay</span>
              </button>
              <button
                onClick={() => {
                  setZoomScale(1);
                  setRotationAngle(0);
                }}
                title="Vừa khung"
                className="p-1 rounded hover:bg-surface-container text-on-surface flex items-center gap-1 text-[11px]"
              >
                <span className="material-symbols-outlined text-base">fit_screen</span>
                <span>Vừa khung</span>
              </button>
            </div>
          </div>

          <div className="bg-surface-container p-6 rounded-2xl border border-outline-variant/30 flex items-center justify-center min-h-[550px] overflow-auto">
            {activeImage ? (
              <div
                style={{
                  transform: `scale(${zoomScale}) rotate(${rotationAngle}deg)`,
                  transition: 'transform 0.15s ease-out',
                }}
                className="origin-center flex items-center justify-center"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={
                    activeImage.imageUrl ||
                    SUBMISSION_MANIFEST[targetStudentId]?.pages.find((p) => p.pageIndex === activeHandwritingPage)?.localPath ||
                    SUBMISSION_MANIFEST['user-student-48'].pages[0].localPath
                  }
                  alt={activeImage.caption}
                  className="max-h-[600px] w-auto object-contain rounded-lg shadow-lg border border-outline-variant/40 select-none"
                />
              </div>
            ) : (
              <p className="text-xs text-on-surface-variant">Không có ảnh trang này</p>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: Transcription View */}
      {activeTab === 'transcription' && (
        <div className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant/30 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
            <span className="font-bold text-xs text-primary font-merriweather uppercase tracking-wider">
              Bản chép số hóa từng trang đối chiếu:
            </span>
            <span className="text-[11px] text-on-surface-variant">
              Tách bạch 2 trang theo đúng bài nộp
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {submission.transcriptionByPage.map((p) => (
              <div key={p.pageIndex} className="p-4 bg-surface-container-low/40 rounded-xl border border-outline-variant/30 space-y-2">
                <span className="font-bold text-xs text-secondary font-mono block pb-1 border-b border-outline-variant/20">
                  Trang 0{p.pageIndex} ({p.lines.length} dòng)
                </span>
                <div className="font-serif text-[12px] leading-relaxed text-on-surface space-y-1 max-h-[450px] overflow-y-auto pr-1">
                  {p.lines.map((line, idx) => (
                    <div key={idx} className="flex items-start gap-2 py-0.5 hover:bg-surface-container-low px-1 rounded">
                      <span className="font-mono text-[10px] text-outline select-none mt-0.5 w-5 shrink-0">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <p className="flex-1">{line}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Verbatim DOCX Guide Modal */}
      {docxGuideModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-xl border border-outline-variant/40">
            <div className="p-4 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low/60 rounded-t-2xl">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">gavel</span>
                <h3 className="font-bold text-sm text-on-surface font-merriweather">
                  Hướng dẫn chấm gốc từ DOCX (&ldquo;Đề. Chạy thử.docx&rdquo;)
                </h3>
              </div>
              <button
                onClick={() => setDocxGuideModalOpen(false)}
                className="p-1 text-on-surface-variant hover:text-on-surface rounded-lg"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-3 text-xs leading-relaxed">
              <pre className="font-sans text-[11px] text-on-surface whitespace-pre-wrap leading-relaxed p-3 bg-surface-container-low rounded-lg border border-outline-variant/20">
                {DOCX_ORIGINAL_GUIDE}
              </pre>
            </div>

            <div className="p-3 border-t border-outline-variant/20 flex justify-end bg-surface-container-low/40 rounded-b-2xl">
              <button
                onClick={() => setDocxGuideModalOpen(false)}
                className="px-4 py-1.5 bg-primary text-white rounded-lg text-xs font-semibold"
              >
                Đóng (Esc)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
