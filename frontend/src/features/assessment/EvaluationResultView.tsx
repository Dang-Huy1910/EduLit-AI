'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AssignmentWorkflowStepper from '@/components/AssignmentWorkflowStepper';
import { useAppStore } from '@/lib/store';
import { AuthApiError } from '@/lib/auth-types';
import { assessmentApi } from './api';
import type {
  AssessmentEvaluation,
  AssessmentPayload,
  AssessmentResultRef,
  StudentAssessmentResponse,
  TeacherAssessmentDetail,
} from './types';

const STALE_MUTATION_CODES = new Set([
  'VERSION_CONFLICT',
  'ASSESSMENT_STALE',
  'PUBLISH_STALE',
  'TRANSCRIPTION_LOCKED',
]);

interface EvaluationResultViewProps {
  viewMode?: 'student' | 'teacher';
  assignmentId: string;
  studentId?: string;
  studentData?: StudentAssessmentResponse | null;
  backHref?: string;
  backLabel?: string;
}

function formatScore(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toFixed(digits);
}

function statusCopy(status: string): string {
  if (status === 'grading' || status === 'queued') return 'Hệ thống đang chấm theo barem đã giao.';
  if (status === 'failed') return 'Lượt chấm gặp lỗi. Giáo viên có thể thử lại.';
  if (status === 'awaiting_review') return 'Đã chấm xong, chờ giáo viên rà soát và công bố.';
  if (status === 'revising') return 'Em đang sửa bản chép. Kết quả cũ (nếu đã công bố) vẫn gắn bản nộp trước.';
  if (status === 'new_version_grading') return 'Bản nộp mới đang được chấm. Kết quả đã công bố vẫn thuộc bản trước.';
  if (status === 'new_version_review') return 'Bản nộp mới đã chấm, chờ công bố. Học sinh vẫn thấy điểm bản trước.';
  if (status === 'new_version_failed') return 'Bản nộp mới chấm lỗi. Kết quả đã công bố vẫn thuộc bản trước.';
  if (status === 'published') return 'Đã công bố cho học sinh.';
  return 'Chưa có kết quả.';
}

export default function EvaluationResultView({
  viewMode = 'student',
  assignmentId,
  studentId,
  studentData,
  backHref,
  backLabel,
}: EvaluationResultViewProps) {
  const teacherBackHref = backHref || `/assignments/${assignmentId}?tab=submissions`;
  const teacherBackLabel = backLabel || 'Bài nộp của đề này';
  const { addToast } = useAppStore();
  const [detail, setDetail] = useState<TeacherAssessmentDetail | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(viewMode === 'teacher');
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<'eval' | 'handwriting' | 'transcription'>('eval');
  const [isEditingScores, setIsEditingScores] = useState(false);
  const [editedEvaluations, setEditedEvaluations] = useState<AssessmentEvaluation[]>([]);
  const [editedTeacherNotes, setEditedTeacherNotes] = useState('');
  const [editedGuidance, setEditedGuidance] = useState('');
  const [activeHandwritingPage, setActiveHandwritingPage] = useState(1);
  const [zoomScale, setZoomScale] = useState(1);
  const [rotationAngle, setRotationAngle] = useState(0);
  const [guideOpen, setGuideOpen] = useState(false);
  const [highlightSegment, setHighlightSegment] = useState<string | null>(null);

  const loadTeacher = async () => {
    if (viewMode !== 'teacher' || !studentId) return;
    const data = await assessmentApi.teacherDetail(assignmentId, studentId);
    setDetail(data);
    const working = data.assessment.working;
    setEditedEvaluations(working?.evaluations || []);
    setEditedTeacherNotes(working?.overallComment || '');
    setEditedGuidance((working?.improvementGuidance || []).join('\n'));
  };

  useEffect(() => {
    if (viewMode !== 'teacher' || !studentId) return;
    let cancelled = false;
    void (async () => {
      try {
        await loadTeacher();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof AuthApiError ? err.message : 'Không tải được bài chấm.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, assignmentId, studentId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setGuideOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const studentResult = studentData?.assessment.result || null;
  const working: AssessmentPayload | null =
    viewMode === 'teacher' ? detail?.assessment.working || null : studentResult;
  const pages = viewMode === 'teacher' ? detail?.pages || [] : studentData?.pages || [];
  const transcription =
    viewMode === 'teacher' ? detail?.transcriptionPages || [] : studentData?.transcriptionPages || [];
  const assignmentTitle =
    viewMode === 'teacher' ? detail?.assignment.title : studentData?.assignment.title;
  const studentName =
    viewMode === 'teacher' ? detail?.student.displayName : studentData?.student.displayName;
  const studentCode = viewMode === 'teacher' ? detail?.student.loginId : studentData?.student.loginId;
  const maxScore =
    working?.maxScore ??
    (viewMode === 'teacher' ? detail?.assignment.maxScore : studentResult?.maxScore) ??
    0;
  const scoreStep = working?.scoreStep ?? detail?.assignment.scoreStep ?? studentResult?.scoreStep ?? 0;
  const totalScore = working?.totalScore ?? null;
  const scale10 = working?.scoreScale10 ?? null;
  const studentStatus = studentData?.assessment.status || '';
  const isPublished = viewMode === 'teacher' ? Boolean(detail?.assessment.isPublished) : true;
  const rubric = detail?.assignment.rubric;
  const evaluations = isEditingScores ? editedEvaluations : working?.evaluations || [];
  const activeImage = pages.find((p) => p.pageIndex === activeHandwritingPage) || pages[0];

  const guideText = useMemo(() => {
    if (!rubric) return '';
    const lines = [`${rubric.title}`, rubric.description || '', ''];
    for (const criterion of rubric.criteria || []) {
      lines.push(`${criterion.id}. ${criterion.name} (tối đa ${criterion.weight})`);
      if (criterion.guideNote) lines.push(criterion.guideNote);
      lines.push('');
    }
    return lines.join('\n').trim();
  }, [rubric]);

  if (viewMode === 'teacher' && loading) {
    return <div className="p-8 text-sm text-on-surface-variant">Đang tải bài chấm...</div>;
  }
  if (viewMode === 'teacher' && (error || !detail)) {
    return (
      <div className="max-w-4xl mx-auto p-12 text-center bg-surface-container-lowest rounded-2xl border border-outline-variant/30 space-y-4 my-8">
        <h2 className="font-headline-md text-lg font-bold text-on-surface font-merriweather">
          Không tìm thấy bài nộp của học sinh
        </h2>
        <p className="text-xs text-on-surface-variant max-w-md mx-auto leading-relaxed">
          {error || 'Học sinh chưa có bài nộp cho đề này.'}
        </p>
        <Link href={teacherBackHref} className="px-4 py-2 bg-primary text-white rounded-lg text-xs font-semibold inline-block">
          {teacherBackLabel}
        </Link>
      </div>
    );
  }

  const run = async (fn: () => Promise<void>, success: string) => {
    setBusy(true);
    try {
      await fn();
      addToast(success, 'success');
    } catch (err) {
      const stale =
        err instanceof AuthApiError &&
        (err.status === 409 || STALE_MUTATION_CODES.has(err.code));
      addToast(
        stale
          ? err instanceof AuthApiError
            ? err.message
            : 'Dữ liệu đã thay đổi. Hãy tải lại rồi thao tác lại.'
          : err instanceof AuthApiError
            ? err.message
            : 'Không lưu được thay đổi.',
        'error'
      );
      if (stale) {
        setIsEditingScores(false);
        try {
          await loadTeacher();
        } catch {
          /* keep the error toast */
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const targetBody = (result: AssessmentResultRef) => ({
    resultId: result.id,
    transcriptionRevisionId: result.transcriptionRevisionId,
    expectedVersion: result.version,
  });

  const handleSaveGrading = () => {
    if (!detail || !studentId) return;
    const current = detail.assessment.currentResult;
    if (!current) {
      addToast('Dữ liệu đã thay đổi. Hãy tải lại rồi thao tác lại.', 'error');
      void loadTeacher();
      return;
    }
    void run(async () => {
      const next = await assessmentApi.saveReview(assignmentId, studentId, {
        ...targetBody(current),
        evaluations: editedEvaluations.map((item) => ({
          criterionId: item.criterionId,
          awardedScore: item.awardedScore,
          comment: item.comment,
          strengths: item.strengths,
          weaknesses: item.weaknesses,
        })),
        overallComment: editedTeacherNotes,
        improvementGuidance: editedGuidance
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
      });
      setDetail(next);
      setIsEditingScores(false);
    }, 'Đã lưu bảng điểm và nhận xét.');
  };

  const handlePublishCurrent = (label: string) => {
    if (!detail || !studentId) return;
    const current = detail.assessment.currentResult;
    if (!current) {
      addToast('Dữ liệu đã thay đổi. Hãy tải lại rồi thao tác lại.', 'error');
      void loadTeacher();
      return;
    }
    void run(async () => {
      setDetail(await assessmentApi.publish(assignmentId, studentId, targetBody(current)));
    }, label);
  };

  const handleUnpublish = () => {
    if (!detail || !studentId) return;
    const published = detail.assessment.publishedResult;
    if (!published || !published.isPublished) {
      addToast('Dữ liệu đã thay đổi. Hãy tải lại rồi thao tác lại.', 'error');
      void loadTeacher();
      return;
    }
    void run(async () => {
      setDetail(await assessmentApi.unpublish(assignmentId, studentId, targetBody(published)));
    }, 'Đã ẩn kết quả với học sinh.');
  };

  const openEvidence = (segmentId: string, pageIndex: number) => {
    setActiveTab('transcription');
    setHighlightSegment(segmentId);
    setActiveHandwritingPage(pageIndex);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-outline-variant/20">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs bg-primary-fixed text-primary font-bold px-2.5 py-0.5 rounded-full">
              Barem {formatScore(maxScore)}đ
            </span>
            <span className="text-xs text-on-surface-variant font-medium">Đề: {assignmentTitle}</span>
          </div>
          <h1 className="font-headline-md text-xl font-bold text-on-surface font-merriweather flex items-center gap-2">
            <span>Chi tiết đánh giá: {studentName}</span>
            <span className="text-xs font-mono font-normal text-outline">({studentCode})</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {guideText ? (
            <button
              onClick={() => setGuideOpen(true)}
              className="px-3 py-1.5 rounded-lg border border-outline-variant/60 bg-surface-container-lowest text-xs font-semibold text-secondary hover:bg-surface-container transition-all flex items-center gap-1.5 shadow-sm"
            >
              <span className="material-symbols-outlined text-sm">menu_book</span>
              <span>Hướng dẫn chấm</span>
            </button>
          ) : null}
          {viewMode === 'teacher' ? (
            <Link
              href={teacherBackHref}
              className="px-3.5 py-1.5 bg-surface-container-lowest border border-outline-variant/60 rounded-lg text-xs font-semibold text-on-surface hover:bg-surface-container transition-all flex items-center gap-1 shadow-sm"
            >
              <span className="material-symbols-outlined text-sm">arrow_back</span>
              <span>{teacherBackLabel}</span>
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

      {viewMode === 'student' && (
        <AssignmentWorkflowStepper currentStep="result" assignmentId={assignmentId} />
      )}

      {viewMode === 'teacher' && detail?.assessment.historyLabel ? (
        <div className="p-3 rounded-xl border border-[#CA8A04]/40 bg-[#FEF9C3] text-xs text-[#854D0E]">
          {detail.assessment.historyLabel}
        </div>
      ) : null}
      {viewMode === 'student' && (studentStatus.startsWith('new_version') || studentStatus === 'revising') ? (
        <div className="p-3 rounded-xl border border-[#CA8A04]/40 bg-[#FEF9C3] text-xs text-[#854D0E]">
          {statusCopy(studentStatus)} Điểm đang xem thuộc bản đã công bố trước.
        </div>
      ) : null}

      <div className="glass-panel p-5 sm:p-6 rounded-2xl border border-white/60 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-primary-container/30 flex flex-col items-center justify-center text-primary border border-primary/30 shadow-2xs">
            <span className="text-2xl font-bold font-mono leading-none">{formatScore(totalScore)}</span>
            <span className="text-[11px] text-outline font-medium mt-0.5">/ {formatScore(maxScore)}đ</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-on-surface font-merriweather">
                {viewMode === 'teacher'
                  ? statusCopy(detail?.assessment.status || '')
                  : studentStatus.startsWith('new_version') || studentStatus === 'revising'
                    ? 'Kết quả đã công bố (bản trước)'
                    : 'Kết quả đã công bố'}
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  isPublished
                    ? 'bg-tertiary-container/40 text-tertiary border border-tertiary/30'
                    : 'bg-[#FEF9C3] text-[#CA8A04] border border-[#CA8A04]/30'
                }`}
              >
                {isPublished ? 'Đã công bố cho HS' : 'Chờ công bố'}
              </span>
            </div>
            <p className="text-xs text-on-surface-variant mt-1 font-mono">
              Quy đổi thang 10: <strong>{formatScore(scale10)} / 10.0đ</strong>{' '}
              <span className="text-[11px] text-outline font-normal">
                (Công thức: tổng / {formatScore(maxScore)} × 10)
              </span>
            </p>
          </div>
        </div>

        {viewMode === 'teacher' && detail ? (
          <div className="flex flex-wrap items-center gap-2">
            {detail.assessment.canRetry ? (
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    if (!studentId) return;
                    setDetail(await assessmentApi.retry(assignmentId, studentId));
                  }, 'Đã đưa bài vào hàng đợi chấm lại.')
                }
                className="px-3.5 py-1.5 rounded-lg border border-error/40 text-error text-xs font-semibold"
              >
                Thử lại chấm
              </button>
            ) : null}
            {detail.assessment.canGrantReopen ? (
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    if (!studentId) return;
                    setDetail(await assessmentApi.grantReopen(assignmentId, studentId));
                  }, 'Đã mở quyền sửa bản chép cho học sinh.')
                }
                className="px-3.5 py-1.5 rounded-lg border text-xs font-semibold"
              >
                Mở lại bản chép
              </button>
            ) : null}
            {!isEditingScores ? (
              <button
                disabled={busy || !detail.assessment.working}
                onClick={() => setIsEditingScores(true)}
                className="px-3.5 py-1.5 rounded-lg border border-secondary/50 bg-secondary-container/20 text-secondary text-xs font-semibold hover:bg-secondary-container/40 flex items-center gap-1.5 transition-all shadow-sm"
              >
                <span className="material-symbols-outlined text-sm">edit_note</span>
                <span>Điều chỉnh điểm &amp; Nhận xét</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  disabled={busy}
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
            {(() => {
              const current = detail.assessment.currentResult;
              const published = detail.assessment.publishedResult;
              const livePublished = Boolean(published?.isPublished);
              const sameResult = Boolean(current && published && current.id === published.id);
              const canPublishCurrent =
                Boolean(current) &&
                detail.assessment.currentMatchesOfficial &&
                Boolean(detail.assessment.working) &&
                !isEditingScores;
              if (livePublished && sameResult) {
                return (
                  <>
                    <button
                      disabled={busy || !canPublishCurrent}
                      onClick={() => handlePublishCurrent('Đã công bố lại kết quả cho học sinh.')}
                      className="px-3.5 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-all flex items-center gap-1.5 shadow-sm"
                    >
                      <span className="material-symbols-outlined text-sm">send</span>
                      <span>Công bố lại</span>
                    </button>
                    <button
                      disabled={busy || isEditingScores}
                      onClick={handleUnpublish}
                      className="px-3.5 py-1.5 rounded-lg bg-surface-container-high text-on-surface text-xs font-bold hover:bg-surface-container transition-all flex items-center gap-1.5 shadow-sm"
                    >
                      <span className="material-symbols-outlined text-sm">visibility_off</span>
                      <span>Ẩn kết quả đang công bố</span>
                    </button>
                  </>
                );
              }
              if (livePublished) {
                return (
                  <>
                    <button
                      disabled={busy || !canPublishCurrent}
                      onClick={() => handlePublishCurrent('Đã công bố bản mới cho học sinh.')}
                      className="px-3.5 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-all flex items-center gap-1.5 shadow-sm"
                    >
                      <span className="material-symbols-outlined text-sm">send</span>
                      <span>Công bố bản mới</span>
                    </button>
                    <button
                      disabled={busy || isEditingScores}
                      onClick={handleUnpublish}
                      className="px-3.5 py-1.5 rounded-lg bg-surface-container-high text-on-surface text-xs font-bold hover:bg-surface-container transition-all flex items-center gap-1.5 shadow-sm"
                    >
                      <span className="material-symbols-outlined text-sm">visibility_off</span>
                      <span>Ẩn kết quả đang công bố</span>
                    </button>
                  </>
                );
              }
              return (
                <button
                  disabled={busy || !canPublishCurrent}
                  onClick={() => handlePublishCurrent('Đã công bố kết quả cho học sinh.')}
                  className="px-3.5 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-all flex items-center gap-1.5 shadow-sm"
                >
                  <span className="material-symbols-outlined text-sm">send</span>
                  <span>Công bố kết quả cho HS</span>
                </button>
              );
            })()}
          </div>
        ) : null}
      </div>

      {viewMode === 'teacher' && detail?.assessment.ai && detail.assessment.working ? (
        <p className="text-[11px] text-on-surface-variant">
          Bản AI gốc được giữ. Điểm đang hiển thị là bản giáo viên rà soát nếu đã lưu. Mô hình:{' '}
          {detail.assessment.provider}/{detail.assessment.model}, prompt {detail.assessment.promptVersion}.
        </p>
      ) : null}

      <div className="flex items-center gap-2 border-b border-outline-variant/20 pb-1">
        {(['eval', 'handwriting', 'transcription'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 font-bold text-xs rounded-t-lg transition-all flex items-center gap-1.5 border-b-2 ${
              activeTab === tab
                ? 'border-primary text-primary bg-surface-container-lowest shadow-xs'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-sm">
              {tab === 'eval' ? 'gavel' : tab === 'handwriting' ? 'photo_camera' : 'text_snippet'}
            </span>
            <span>
              {tab === 'eval'
                ? `1. Đánh giá & Barem (${formatScore(maxScore)}đ)`
                : tab === 'handwriting'
                ? `2. Bài viết tay (${pages.length} trang ảnh)`
                : '3. Bản chép được dùng để chấm'}
            </span>
          </button>
        ))}
      </div>

      {activeTab === 'eval' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {evaluations.map((ev) => {
              const currentScore = ev.awardedScore;
              return (
                <div
                  key={ev.criterionId}
                  className="glass-card p-4 sm:p-5 rounded-2xl border border-outline-variant/30 space-y-3"
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
                          step={scoreStep}
                          min={0}
                          max={ev.maxScore}
                          value={currentScore}
                          onChange={(e) =>
                            setEditedEvaluations((prev) =>
                              prev.map((item) =>
                                item.criterionId === ev.criterionId
                                  ? {
                                      ...item,
                                      awardedScore: Math.min(
                                        Math.max(parseFloat(e.target.value) || 0, 0),
                                        item.maxScore
                                      ),
                                    }
                                  : item
                              )
                            )
                          }
                          className="w-16 px-1.5 py-0.5 text-xs font-mono font-bold text-right rounded border border-secondary bg-surface"
                        />
                        <span className="text-xs font-mono text-outline">/ {formatScore(ev.maxScore)}đ</span>
                      </div>
                    ) : (
                      <span className="font-mono font-bold text-secondary text-xs">
                        {formatScore(ev.awardedScore)} / {formatScore(ev.maxScore)}đ
                      </span>
                    )}
                  </div>
                  {ev.strengths?.length ? (
                    <div className="space-y-1">
                      <span className="text-[11px] font-bold text-tertiary flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs">check_circle</span>
                        Điểm sáng:
                      </span>
                      <ul className="space-y-1 text-[11px] text-on-surface-variant pl-4 list-disc">
                        {ev.strengths.map((str, idx) => (
                          <li key={idx} className="leading-relaxed">
                            {str}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {ev.weaknesses?.length ? (
                    <div className="space-y-1">
                      <span className="text-[11px] font-bold text-[#CA8A04] flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs">warning</span>
                        Điểm cần lưu ý:
                      </span>
                      <ul className="space-y-1 text-[11px] text-on-surface-variant pl-4 list-disc">
                        {ev.weaknesses.map((w, idx) => (
                          <li key={idx} className="leading-relaxed text-error/90 font-medium">
                            {w}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {isEditingScores ? (
                    <textarea
                      value={ev.comment}
                      onChange={(e) =>
                        setEditedEvaluations((prev) =>
                          prev.map((item) =>
                            item.criterionId === ev.criterionId ? { ...item, comment: e.target.value } : item
                          )
                        )
                      }
                      rows={2}
                      className="w-full p-2 text-[11px] rounded-lg border border-secondary bg-surface"
                    />
                  ) : ev.comment ? (
                    <div className="p-2.5 bg-surface-container-low/60 rounded-lg text-[11px] text-on-surface italic border border-outline-variant/20">
                      &ldquo;{ev.comment}&rdquo;
                    </div>
                  ) : null}
                  {(ev.evidence || []).length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {ev.evidence.map((item) => (
                        <button
                          key={item.segmentId}
                          type="button"
                          onClick={() => openEvidence(item.segmentId, item.pageIndex)}
                          className="text-[10px] px-2 py-0.5 rounded-full bg-primary-container/40 text-primary"
                        >
                          Trang {item.pageIndex} · đoạn {item.order}
                        </button>
                      ))}
                    </div>
                  )}
                  {(ev.issues || []).map((issue, idx) => (
                    <p key={`${issue.code}-${idx}`} className="text-[11px] text-on-surface-variant">
                      <span className="font-mono text-[10px]">{issue.code}</span> · {issue.message}
                      {issue.source === 'ai' ? ' (AI phát hiện)' : ' (giáo viên)'}
                    </p>
                  ))}
                </div>
              );
            })}
          </div>

          <div className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm space-y-2">
            <span className="font-bold text-xs text-primary flex items-center gap-1.5 uppercase tracking-wider">
              <span className="material-symbols-outlined text-sm">rate_review</span>
              <span>Nhận xét tổng quát</span>
            </span>
            {isEditingScores ? (
              <textarea
                value={editedTeacherNotes}
                onChange={(e) => setEditedTeacherNotes(e.target.value)}
                rows={3}
                className="w-full p-2.5 text-xs rounded-lg border border-secondary bg-surface text-on-surface leading-relaxed focus:outline-none"
              />
            ) : (
              <p className="text-xs text-on-surface leading-relaxed bg-surface-container-low/50 p-3 rounded-lg border border-outline-variant/20">
                {working?.overallComment || 'Chưa có ghi chú tổng quát.'}
              </p>
            )}
          </div>

          <div className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm space-y-3">
            <span className="font-bold text-xs text-secondary flex items-center gap-1.5 uppercase tracking-wider">
              <span className="material-symbols-outlined text-sm">model_training</span>
              <span>Hướng cải thiện</span>
            </span>
            {isEditingScores ? (
              <textarea
                value={editedGuidance}
                onChange={(e) => setEditedGuidance(e.target.value)}
                rows={3}
                placeholder="Mỗi dòng một việc cần làm"
                className="w-full p-2.5 text-xs rounded-lg border border-secondary bg-surface"
              />
            ) : (
              <ul className="space-y-1 text-xs text-on-surface-variant list-disc pl-5">
                {(working?.improvementGuidance || []).map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
                {(working?.improvementGuidance || []).length === 0 ? <li>Chưa có hướng cải thiện.</li> : null}
              </ul>
            )}
          </div>
        </div>
      )}

      {activeTab === 'handwriting' && (
        <div className="space-y-4">
          <div className="p-2.5 bg-surface-container-low/70 rounded-xl border border-outline-variant/30 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-on-surface">Chọn trang bài viết tay:</span>
              {pages.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setActiveHandwritingPage(p.pageIndex);
                    setZoomScale(1);
                    setRotationAngle(0);
                  }}
                  className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all ${
                    activeHandwritingPage === p.pageIndex
                      ? 'bg-primary text-white shadow-sm'
                      : 'bg-surface-container-lowest text-on-surface border border-outline-variant/40'
                  }`}
                >
                  Trang 0{p.pageIndex}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 bg-surface-container-lowest p-1 rounded-lg border border-outline-variant/40">
              <button onClick={() => setZoomScale((prev) => Math.max(prev - 0.25, 0.5))} className="p-1 rounded">
                <span className="material-symbols-outlined text-base">zoom_out</span>
              </button>
              <span className="text-[11px] font-mono px-1 min-w-[45px] text-center">
                {Math.round(zoomScale * 100)}%
              </span>
              <button onClick={() => setZoomScale((prev) => Math.min(prev + 0.25, 2.5))} className="p-1 rounded">
                <span className="material-symbols-outlined text-base">zoom_in</span>
              </button>
              <button onClick={() => setRotationAngle((prev) => (prev + 90) % 360)} className="p-1 rounded text-[11px]">
                Xoay
              </button>
            </div>
          </div>
          <div className="bg-surface-container p-6 rounded-2xl border border-outline-variant/30 flex items-center justify-center min-h-[550px] overflow-auto">
            {activeImage ? (
              <div
                style={{ transform: `scale(${zoomScale}) rotate(${rotationAngle}deg)`, transition: 'transform 0.15s ease-out' }}
                className="origin-center"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={activeImage.imageUrl}
                  alt={activeImage.filename || `Trang ${activeImage.pageIndex}`}
                  className="max-h-[600px] w-auto object-contain rounded-lg shadow-lg border border-outline-variant/40 select-none"
                />
              </div>
            ) : (
              <p className="text-xs text-on-surface-variant">Không có ảnh trang này</p>
            )}
          </div>
        </div>
      )}

      {activeTab === 'transcription' && (
        <div className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant/30 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
            <span className="font-bold text-xs text-primary font-merriweather uppercase tracking-wider">
              Bản chép số hóa từng trang đối chiếu:
            </span>
            <span className="text-[11px] text-on-surface-variant">
              Tách bạch {transcription.length} trang theo đúng bài nộp
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {transcription.map((p) => (
              <div key={p.pageId} className="p-4 bg-surface-container-low/40 rounded-xl border border-outline-variant/30 space-y-2">
                <span className="font-bold text-xs text-secondary font-mono block pb-1 border-b border-outline-variant/20">
                  Trang 0{p.pageIndex} ({p.segments.length} dòng)
                </span>
                <div className="font-serif text-[12px] leading-relaxed text-on-surface space-y-1 max-h-[450px] overflow-y-auto pr-1">
                  {p.segments.map((line) => (
                    <div
                      key={line.segmentId}
                      className={`flex items-start gap-2 py-0.5 px-1 rounded ${
                        highlightSegment === line.segmentId ? 'bg-primary-container/40' : ''
                      }`}
                    >
                      <span className="font-mono text-[10px] text-outline select-none mt-0.5 w-5 shrink-0">
                        {String(line.order).padStart(2, '0')}
                      </span>
                      <p className="flex-1">{line.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {guideOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-xl border border-outline-variant/40">
            <div className="p-4 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low/60 rounded-t-2xl">
              <h3 className="font-bold text-sm text-on-surface font-merriweather">Hướng dẫn chấm từ barem đã giao</h3>
              <button onClick={() => setGuideOpen(false)} className="p-1 text-on-surface-variant">
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
            <div className="p-5 overflow-y-auto">
              <pre className="font-sans text-[11px] text-on-surface whitespace-pre-wrap leading-relaxed p-3 bg-surface-container-low rounded-lg border border-outline-variant/20">
                {guideText}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
