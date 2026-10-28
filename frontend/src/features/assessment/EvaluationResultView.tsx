'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AssignmentWorkflowStepper from '@/components/AssignmentWorkflowStepper';
import { useAppStore } from '@/lib/store';
import { AuthApiError } from '@/lib/auth-types';
import { assessmentApi } from './api';
import RoundCompare from './RoundCompare';
import RoundHistory from './RoundHistory';
import StudentRevisionActions from './StudentRevisionActions';
import { comparisonForRound, defaultRound, roundAsAssessment, roundLabel, sortRounds } from './revision';
import type {
  AssessmentEvaluation,
  AssessmentPayload,
  AssessmentResultRef,
  RoundsView,
  StudentAssessmentResponse,
  TeacherAssessmentDetail,
} from './types';

const STALE_MUTATION_CODES = new Set([
  'VERSION_CONFLICT',
  'ASSESSMENT_STALE',
  'PUBLISH_STALE',
  'TRANSCRIPTION_LOCKED',
]);

const BTN_PRIMARY =
  'h-9 px-4 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-40 disabled:pointer-events-none inline-flex items-center gap-1.5 transition-colors';
const BTN_SAVE =
  'h-9 px-4 rounded-lg bg-secondary text-white text-sm font-semibold hover:bg-secondary/90 disabled:opacity-40 disabled:pointer-events-none inline-flex items-center gap-1.5 transition-colors';
const BTN_OUTLINE =
  'h-9 px-3.5 rounded-lg border border-outline-variant/60 bg-surface-container-lowest text-sm font-semibold text-on-surface hover:bg-surface-container disabled:opacity-40 disabled:pointer-events-none inline-flex items-center gap-1.5 transition-colors';
const BTN_DANGER =
  'h-9 px-3.5 rounded-lg border border-error/40 bg-surface-container-lowest text-sm font-semibold text-error hover:bg-error-container/30 disabled:opacity-40 disabled:pointer-events-none inline-flex items-center gap-1.5 transition-colors';
const NOTICE = 'p-3 rounded-lg border border-[#fde68a] bg-[#fffbeb] text-sm text-[#92400e]';

type TabId = 'eval' | 'handwriting' | 'transcription';

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

function ratio(awarded: number | null | undefined, max: number | null | undefined): number {
  if (!max || awarded === null || awarded === undefined || Number.isNaN(awarded)) return 0;
  return Math.min(Math.max(awarded / max, 0), 1);
}

function ScoreBar({ value, label }: { value: number; label: string }) {
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      className="h-1.5 rounded-full bg-surface-container-high overflow-hidden"
    >
      <div className="h-full rounded-full bg-secondary" style={{ width: `${value * 100}%` }} />
    </div>
  );
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
  const [activeTab, setActiveTab] = useState<TabId>('eval');
  const [isEditingScores, setIsEditingScores] = useState(false);
  const [editedEvaluations, setEditedEvaluations] = useState<AssessmentEvaluation[]>([]);
  const [editedTeacherNotes, setEditedTeacherNotes] = useState('');
  const [editedGuidance, setEditedGuidance] = useState('');
  const [activeHandwritingPage, setActiveHandwritingPage] = useState(1);
  const [zoomScale, setZoomScale] = useState(1);
  const [rotationAngle, setRotationAngle] = useState(0);
  const [guideOpen, setGuideOpen] = useState(false);
  const [highlightSegment, setHighlightSegment] = useState<string | null>(null);
  const [roundsView, setRoundsView] = useState<RoundsView | null>(null);
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [teacherRounds, setTeacherRounds] = useState<RoundsView | null>(null);

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

  // Evidence links jump to the transcription tab; bring the quoted line into view.
  useEffect(() => {
    if (activeTab !== 'transcription' || !highlightSegment) return;
    const frame = window.requestAnimationFrame(() => {
      document
        .getElementById(`segment-${highlightSegment}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeTab, highlightSegment]);

  useEffect(() => {
    if (viewMode !== 'student') return;
    let cancelled = false;
    void assessmentApi.studentRounds(assignmentId).then((view) => {
      if (cancelled) return;
      setRoundsView(view);
      setSelectedRound((current) => current ?? defaultRound(view.rounds, view.currentPublishedRound));
    }).catch(() => {
      if (!cancelled) setRoundsView(null);
    });
    return () => { cancelled = true; };
  }, [assignmentId, viewMode, studentData?.revisionRound, studentData?.assessment.status]);

  useEffect(() => {
    if (viewMode !== 'teacher' || !studentId || !detail) return;
    let cancelled = false;
    void assessmentApi.teacherRounds(assignmentId, studentId).then((view) => {
      if (!cancelled) setTeacherRounds(view);
    }).catch(() => {
      if (!cancelled) setTeacherRounds(null);
    });
    return () => { cancelled = true; };
  }, [assignmentId, studentId, viewMode, detail]);

  const studentResult = studentData?.assessment.result || null;
  const selectedSnapshot = viewMode === 'student' ? roundsView?.rounds.find((item) => item.round === selectedRound) : undefined;
  const working: AssessmentPayload | null =
    viewMode === 'teacher' ? detail?.assessment.working || null : selectedSnapshot ? roundAsAssessment(selectedSnapshot) : studentResult;
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
  const studentStatus = studentData?.assessment.status || '';
  const isPublished = viewMode === 'teacher' ? Boolean(detail?.assessment.isPublished) : true;
  const rubric = detail?.assignment.rubric;
  const evaluations = isEditingScores ? editedEvaluations : working?.evaluations || [];
  const activeImage = pages.find((p) => p.pageIndex === activeHandwritingPage) || pages[0];
  // While editing, preview the total from the edited criteria; the server recomputes it on save.
  const editedTotal = editedEvaluations.reduce((sum, item) => sum + (item.awardedScore || 0), 0);
  const totalScore = isEditingScores ? editedTotal : working?.totalScore ?? null;
  const scale10 = isEditingScores
    ? maxScore
      ? (editedTotal / maxScore) * 10
      : null
    : working?.scoreScale10 ?? null;
  const studentSeesPreviousVersion = studentStatus.startsWith('new_version') || studentStatus === 'revising';

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
      <div className="max-w-4xl mx-auto p-12 text-center bg-surface-container-lowest rounded-xl border border-outline-variant/40 space-y-4 my-8">
        <h2 className="font-headline-md text-lg font-bold text-on-surface font-merriweather">
          Không tìm thấy bài nộp của học sinh
        </h2>
        <p className="text-sm text-on-surface-variant max-w-md mx-auto leading-relaxed">
          {error || 'Học sinh chưa có bài nộp cho đề này.'}
        </p>
        <Link href={teacherBackHref} className={BTN_PRIMARY}>
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

  const cancelEditing = () => {
    const saved = detail?.assessment.working;
    setEditedEvaluations(saved?.evaluations || []);
    setEditedTeacherNotes(saved?.overallComment || '');
    setEditedGuidance((saved?.improvementGuidance || []).join('\n'));
    setIsEditingScores(false);
  };

  const openEvidence = (segmentId: string, pageIndex: number) => {
    setActiveTab('transcription');
    setHighlightSegment(segmentId);
    setActiveHandwritingPage(pageIndex);
  };

  const updateEvaluation = (criterionId: string, patch: Partial<AssessmentEvaluation>) =>
    setEditedEvaluations((prev) => prev.map((item) => (item.criterionId === criterionId ? { ...item, ...patch } : item)));

  const viewingOtherRound = Boolean(
    viewMode === 'student' && selectedSnapshot && roundsView && selectedRound !== roundsView.currentPublishedRound
  );
  const shownComparison = viewMode !== 'student' || !roundsView || selectedRound == null
    ? null
    : selectedRound === roundsView.currentPublishedRound && roundsView.comparison
      ? roundsView.comparison
      : comparisonForRound(roundsView.rounds, selectedRound);
  const statusText =
    viewMode === 'teacher'
      ? statusCopy(detail?.assessment.status || '')
      : viewingOtherRound
        ? `Đang xem kết quả đã công bố của ${roundLabel(selectedRound)}.`
        : studentSeesPreviousVersion
          ? 'Kết quả đã công bố của bản nộp trước.'
          : 'Giáo viên đã rà soát và công bố kết quả này.';
  const guidance = working?.improvementGuidance || [];
  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: 'eval', label: 'Đánh giá', icon: 'fact_check' },
    { id: 'handwriting', label: `Bài viết tay (${pages.length})`, icon: 'photo_camera' },
    { id: 'transcription', label: 'Bản chép', icon: 'text_snippet' },
  ];

  const publishActions = () => {
    if (!detail) return null;
    const current = detail.assessment.currentResult;
    const published = detail.assessment.publishedResult;
    const livePublished = Boolean(published?.isPublished);
    const sameResult = Boolean(current && published && current.id === published.id);
    const canPublishCurrent =
      Boolean(current) &&
      detail.assessment.currentMatchesOfficial &&
      Boolean(detail.assessment.working) &&
      !isEditingScores;
    const unpublishButton = (
      <button type="button" disabled={busy || isEditingScores} onClick={handleUnpublish} className={BTN_OUTLINE}>
        <span className="material-symbols-outlined text-[18px]">visibility_off</span>
        <span>Ẩn kết quả đang công bố</span>
      </button>
    );
    if (livePublished) {
      return (
        <>
          <button
            type="button"
            disabled={busy || !canPublishCurrent}
            onClick={() =>
              handlePublishCurrent(sameResult ? 'Đã công bố lại kết quả cho học sinh.' : 'Đã công bố bản mới cho học sinh.')
            }
            className={BTN_PRIMARY}
          >
            <span className="material-symbols-outlined text-[18px]">send</span>
            <span>{sameResult ? 'Công bố lại' : 'Công bố bản mới'}</span>
          </button>
          {unpublishButton}
        </>
      );
    }
    return (
      <button
        type="button"
        disabled={busy || !canPublishCurrent}
        onClick={() => handlePublishCurrent('Đã công bố kết quả cho học sinh.')}
        className={BTN_PRIMARY}
      >
        <span className="material-symbols-outlined text-[18px]">send</span>
        <span>Công bố kết quả cho HS</span>
      </button>
    );
  };

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0 space-y-1">
          {assignmentTitle ? <p className="text-sm text-on-surface-variant">Đề: {assignmentTitle}</p> : null}
          <h1 className="font-merriweather text-xl sm:text-2xl font-bold text-on-surface flex flex-wrap items-baseline gap-x-2">
            {viewMode === 'teacher' ? (
              <>
                <span>{studentName}</span>
                {studentCode ? <span className="text-sm font-normal font-mono text-outline">{studentCode}</span> : null}
              </>
            ) : (
              'Kết quả đánh giá'
            )}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {guideText ? (
            <button type="button" onClick={() => setGuideOpen(true)} className={BTN_OUTLINE}>
              <span className="material-symbols-outlined text-[18px]">menu_book</span>
              <span>Hướng dẫn chấm</span>
            </button>
          ) : null}
          {viewMode === 'teacher' ? (
            <Link href={teacherBackHref} className={BTN_OUTLINE}>
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
              <span>{teacherBackLabel}</span>
            </Link>
          ) : (
            <Link href="/assignments" className={BTN_OUTLINE}>
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
              <span>Bài tập của em</span>
            </Link>
          )}
        </div>
      </header>

      {viewMode === 'student' && <AssignmentWorkflowStepper currentStep="result" assignmentId={assignmentId} />}
      {viewMode === 'student' && studentData && <StudentRevisionActions assignmentId={assignmentId} submission={studentData} />}

      {viewMode === 'teacher' && detail?.assessment.historyLabel ? (
        <div className={NOTICE}>{detail.assessment.historyLabel}</div>
      ) : null}
      {viewMode === 'student' && studentSeesPreviousVersion ? (
        <div className={NOTICE}>{statusCopy(studentStatus)} Điểm đang xem thuộc bản đã công bố trước.</div>
      ) : null}

      {/* Score summary: total, scale-10 conversion, per-criterion bars, then the teacher's actions. */}
      {viewMode === 'student' && studentData?.assessment.canViewResult && studentResult && <Link href={`/assignments/${assignmentId}/result/print`} className={BTN_OUTLINE}>In phiếu</Link>}
      {viewMode === 'teacher' && studentId && detail?.assessment.isPublished && <Link href={`/reports/${assignmentId}/students/${studentId}/print`} className={BTN_OUTLINE}>In phiếu</Link>}
      {viewMode === 'student' && roundsView && roundsView.rounds.length > 0 && <label className="block max-w-xs text-sm font-semibold text-on-surface space-y-1">
        <span>Chọn bản</span>
        <select aria-label="Chọn bản" value={selectedRound ?? ''} onChange={(event) => setSelectedRound(Number(event.target.value))}
          className="w-full rounded-lg border border-outline-variant/60 bg-surface-container-lowest p-2 text-sm">
          {sortRounds(roundsView.rounds).map((round) => <option key={round.round} value={round.round}>
            {roundLabel(round.round)}{round.round === roundsView.currentPublishedRound ? ' (đang công bố)' : ''}
          </option>)}
        </select>
      </label>}
      {viewingOtherRound && <p className="text-sm text-on-surface-variant">Ảnh và bản chép trên trang thuộc bản đang công bố. Điểm và nhận xét là của bản đã chọn.</p>}
      {shownComparison && <RoundCompare comparison={shownComparison} />}
      <section
        aria-label="Tổng điểm"
        className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-5 sm:p-6"
      >
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-6">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${
                  isPublished ? 'bg-tertiary-container/30 text-tertiary' : 'bg-[#fffbeb] text-[#92400e] border border-[#fde68a]'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                {isPublished ? (viewMode === 'teacher' ? 'Đã công bố cho học sinh' : 'Đã công bố') : 'Chờ công bố'}
              </span>
              {isEditingScores ? (
                <span className="text-xs font-semibold text-secondary whitespace-nowrap">Đang điều chỉnh, chưa lưu</span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
              <div>
                <p className="text-sm text-on-surface-variant">Tổng điểm</p>
                <p className="mt-1 leading-none text-on-surface">
                  <span className="font-merriweather text-[40px] font-bold tabular-nums">{formatScore(totalScore)}</span>
                  <span className="text-lg text-on-surface-variant tabular-nums"> / {formatScore(maxScore)}đ</span>
                </p>
              </div>
              <div>
                <p className="text-sm text-on-surface-variant">Quy đổi thang 10</p>
                <p className="mt-1 leading-none">
                  <span className="text-2xl font-semibold tabular-nums text-on-surface">{formatScore(scale10)}</span>
                  <span className="text-sm text-on-surface-variant"> / 10</span>
                </p>
                <p className="mt-1 text-xs text-on-surface-variant">= tổng ÷ {formatScore(maxScore)} × 10</p>
              </div>
            </div>
            <p className="text-sm text-on-surface-variant leading-relaxed">{statusText}</p>
          </div>

          {evaluations.length > 0 ? (
            <ul className="space-y-3 lg:border-l lg:border-outline-variant/30 lg:pl-6" aria-label="Điểm theo tiêu chí">
              {evaluations.map((ev) => (
                <li key={ev.criterionId} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-on-surface min-w-0">{ev.criterionName}</span>
                    <span className="shrink-0 font-semibold tabular-nums text-on-surface">
                      {formatScore(ev.awardedScore)}
                      <span className="font-normal text-on-surface-variant"> / {formatScore(ev.maxScore)}</span>
                    </span>
                  </div>
                  <ScoreBar value={ratio(ev.awardedScore, ev.maxScore)} label={`${ev.criterionName}: ${formatScore(ev.awardedScore)} trên ${formatScore(ev.maxScore)}`} />
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {viewMode === 'teacher' && detail ? (
          <div className="mt-5 pt-4 border-t border-outline-variant/30 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {!isEditingScores ? (
                <button
                  type="button"
                  disabled={busy || !detail.assessment.working}
                  onClick={() => setIsEditingScores(true)}
                  className={BTN_OUTLINE}
                >
                  <span className="material-symbols-outlined text-[18px]">edit_note</span>
                  <span>Điều chỉnh điểm &amp; nhận xét</span>
                </button>
              ) : (
                <>
                  <button type="button" disabled={busy} onClick={handleSaveGrading} className={BTN_SAVE}>
                    <span className="material-symbols-outlined text-[18px]">save</span>
                    <span>Lưu thay đổi</span>
                  </button>
                  <button type="button" disabled={busy} onClick={cancelEditing} className={BTN_OUTLINE}>
                    Hủy
                  </button>
                </>
              )}
              {publishActions()}
              {detail.assessment.canGrantReopen ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      if (!studentId) return;
                      setDetail(await assessmentApi.grantReopen(assignmentId, studentId));
                    }, 'Đã mở quyền sửa bản chép cho học sinh.')
                  }
                  className={BTN_OUTLINE}
                >
                  <span className="material-symbols-outlined text-[18px]">lock_open</span>
                  <span>Mở lại bản chép</span>
                </button>
              ) : null}
              {detail.assessment.canRetry ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      if (!studentId) return;
                      setDetail(await assessmentApi.retry(assignmentId, studentId));
                    }, 'Đã đưa bài vào hàng đợi chấm lại.')
                  }
                  className={BTN_DANGER}
                >
                  <span className="material-symbols-outlined text-[18px]">refresh</span>
                  <span>Thử lại chấm</span>
                </button>
              ) : null}
            </div>
            {detail.assessment.ai && detail.assessment.working ? (
              <p className="text-xs text-on-surface-variant">
                Bản AI gốc được giữ; điểm trên là bản giáo viên đã rà soát nếu đã lưu.
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      {viewMode === 'teacher' && teacherRounds && <RoundHistory rounds={teacherRounds.rounds} />}

      <div role="tablist" aria-label="Nội dung bài chấm" className="flex gap-1 border-b border-outline-variant/40 overflow-x-auto">
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`assessment-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`assessment-panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`-mb-px inline-flex items-center gap-1.5 px-3 sm:px-4 py-2.5 border-b-2 text-sm whitespace-nowrap transition-colors ${
                active
                  ? 'border-primary text-on-surface font-semibold'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {/* The icon font sets its own display, so hide the wrapper instead. */}
              <span className="hidden sm:inline-flex" aria-hidden="true">
                <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
              </span>
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'eval' && (
        <div id="assessment-panel-eval" role="tabpanel" aria-labelledby="assessment-tab-eval" className="space-y-5">
          {/* Overall comment and next steps come first: they are what a student acts on. */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-5 space-y-2">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-on-surface">
                <span className="material-symbols-outlined text-[18px] text-primary">rate_review</span>
                Nhận xét chung
              </h2>
              {isEditingScores ? (
                <textarea
                  aria-label="Nhận xét chung"
                  value={editedTeacherNotes}
                  onChange={(e) => setEditedTeacherNotes(e.target.value)}
                  rows={4}
                  className="w-full p-3 text-sm rounded-lg border border-secondary bg-surface text-on-surface leading-relaxed focus:outline-none"
                />
              ) : (
                <p className="text-[15px] text-on-surface leading-relaxed whitespace-pre-line">
                  {working?.overallComment || 'Chưa có nhận xét chung.'}
                </p>
              )}
            </div>
            <div className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-5 space-y-2">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-on-surface">
                <span className="material-symbols-outlined text-[18px] text-secondary">trending_up</span>
                Hướng cải thiện
              </h2>
              {isEditingScores ? (
                <textarea
                  aria-label="Hướng cải thiện, mỗi dòng một việc"
                  value={editedGuidance}
                  onChange={(e) => setEditedGuidance(e.target.value)}
                  rows={4}
                  placeholder="Mỗi dòng một việc cần làm"
                  className="w-full p-3 text-sm rounded-lg border border-secondary bg-surface text-on-surface leading-relaxed focus:outline-none"
                />
              ) : guidance.length === 0 ? (
                <p className="text-sm text-on-surface-variant">Chưa có hướng cải thiện.</p>
              ) : (
                <ol className="list-decimal pl-5 space-y-1.5 text-[15px] text-on-surface leading-relaxed marker:text-on-surface-variant">
                  {guidance.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ol>
              )}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-on-surface">
              Theo tiêu chí <span className="font-normal text-on-surface-variant tabular-nums">({evaluations.length})</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
              {evaluations.map((ev) => (
                <article
                  key={ev.criterionId}
                  className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-4 sm:p-5 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-[15px] font-semibold text-on-surface leading-snug">{ev.criterionName}</h3>
                    {isEditingScores ? (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <input
                          type="number"
                          aria-label={`Điểm ${ev.criterionName}`}
                          step={scoreStep}
                          min={0}
                          max={ev.maxScore}
                          value={ev.awardedScore}
                          onChange={(e) =>
                            updateEvaluation(ev.criterionId, {
                              awardedScore: Math.min(Math.max(parseFloat(e.target.value) || 0, 0), ev.maxScore),
                            })
                          }
                          className="w-20 h-8 px-2 text-sm font-semibold tabular-nums text-right rounded-lg border border-secondary bg-surface"
                        />
                        <span className="text-sm text-on-surface-variant tabular-nums">/ {formatScore(ev.maxScore)}đ</span>
                      </div>
                    ) : (
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-secondary whitespace-nowrap">
                        {formatScore(ev.awardedScore)} / {formatScore(ev.maxScore)}đ
                      </span>
                    )}
                  </div>
                  <ScoreBar
                    value={ratio(ev.awardedScore, ev.maxScore)}
                    label={`${ev.criterionName}: ${formatScore(ev.awardedScore)} trên ${formatScore(ev.maxScore)}`}
                  />

                  {isEditingScores ? (
                    <textarea
                      aria-label={`Nhận xét ${ev.criterionName}`}
                      value={ev.comment}
                      onChange={(e) => updateEvaluation(ev.criterionId, { comment: e.target.value })}
                      rows={3}
                      className="w-full p-2.5 text-sm rounded-lg border border-secondary bg-surface leading-relaxed"
                    />
                  ) : ev.comment ? (
                    <p className="text-sm text-on-surface leading-relaxed">{ev.comment}</p>
                  ) : null}

                  {ev.strengths?.length ? (
                    <div>
                      <p className="flex items-center gap-1 text-xs font-semibold text-tertiary">
                        <span className="material-symbols-outlined text-[16px]">check_circle</span>
                        Làm tốt
                      </p>
                      <ul className="mt-1 list-disc pl-5 space-y-1 text-sm text-on-surface-variant leading-relaxed">
                        {ev.strengths.map((item, idx) => (
                          <li key={idx}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {ev.weaknesses?.length ? (
                    <div>
                      <p className="flex items-center gap-1 text-xs font-semibold text-[#92400e]">
                        <span className="material-symbols-outlined text-[16px]">lightbulb</span>
                        Cần cải thiện
                      </p>
                      <ul className="mt-1 list-disc pl-5 space-y-1 text-sm text-on-surface-variant leading-relaxed">
                        {ev.weaknesses.map((item, idx) => (
                          <li key={idx}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {(ev.issues || []).length > 0 ? (
                    <ul className="space-y-1">
                      {ev.issues.map((issue, idx) => (
                        <li key={`${issue.code}-${idx}`} title={issue.code} className="text-xs text-on-surface-variant">
                          {issue.message}
                          <span className="text-outline"> · {issue.source === 'ai' ? 'AI phát hiện' : 'Giáo viên ghi'}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {(ev.evidence || []).length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-xs text-on-surface-variant">Xem trong bài:</span>
                      {ev.evidence.map((item) => (
                        <button
                          key={item.segmentId}
                          type="button"
                          onClick={() => openEvidence(item.segmentId, item.pageIndex)}
                          className="h-7 px-2.5 rounded-full border border-outline-variant/50 bg-surface-container-low text-xs text-on-surface hover:border-secondary hover:text-secondary transition-colors"
                        >
                          Trang {item.pageIndex} · đoạn {item.order}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        </div>
      )}

      {activeTab === 'handwriting' && (
        <div
          id="assessment-panel-handwriting"
          role="tabpanel"
          aria-labelledby="assessment-tab-handwriting"
          className="space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Chọn trang">
              {pages.map((p) => {
                const active = activeHandwritingPage === p.pageIndex;
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setActiveHandwritingPage(p.pageIndex);
                      setZoomScale(1);
                      setRotationAngle(0);
                    }}
                    className={`h-8 px-3 rounded-lg text-sm font-semibold transition-colors ${
                      active
                        ? 'bg-on-surface text-surface'
                        : 'bg-surface-container-lowest text-on-surface border border-outline-variant/50 hover:bg-surface-container'
                    }`}
                  >
                    Trang {p.pageIndex}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-1">
              <button
                type="button"
                aria-label="Thu nhỏ"
                title="Thu nhỏ"
                onClick={() => setZoomScale((prev) => Math.max(prev - 0.25, 0.5))}
                className="w-8 h-8 rounded-md flex items-center justify-center hover:bg-surface-container"
              >
                <span className="material-symbols-outlined text-[20px]">zoom_out</span>
              </button>
              <span className="text-xs tabular-nums w-11 text-center text-on-surface-variant" aria-live="polite">
                {Math.round(zoomScale * 100)}%
              </span>
              <button
                type="button"
                aria-label="Phóng to"
                title="Phóng to"
                onClick={() => setZoomScale((prev) => Math.min(prev + 0.25, 2.5))}
                className="w-8 h-8 rounded-md flex items-center justify-center hover:bg-surface-container"
              >
                <span className="material-symbols-outlined text-[20px]">zoom_in</span>
              </button>
              <button
                type="button"
                aria-label="Xoay 90 độ"
                title="Xoay 90 độ"
                onClick={() => setRotationAngle((prev) => (prev + 90) % 360)}
                className="w-8 h-8 rounded-md flex items-center justify-center hover:bg-surface-container"
              >
                <span className="material-symbols-outlined text-[20px]">rotate_right</span>
              </button>
            </div>
          </div>
          <div className="rounded-xl border border-outline-variant/40 bg-surface-container p-3 sm:p-6 flex items-center justify-center min-h-[360px] sm:min-h-[550px] overflow-auto">
            {activeImage ? (
              <div
                style={{ transform: `scale(${zoomScale}) rotate(${rotationAngle}deg)`, transition: 'transform 0.15s ease-out' }}
                className="origin-center"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={activeImage.imageUrl}
                  alt={activeImage.filename || `Trang ${activeImage.pageIndex}`}
                  className="max-h-[600px] w-auto object-contain rounded-lg border border-outline-variant/40 select-none"
                />
              </div>
            ) : (
              <p className="text-sm text-on-surface-variant">Không có ảnh trang này.</p>
            )}
          </div>
        </div>
      )}

      {activeTab === 'transcription' && (
        <div
          id="assessment-panel-transcription"
          role="tabpanel"
          aria-labelledby="assessment-tab-transcription"
          className="space-y-3"
        >
          <p className="text-sm text-on-surface-variant">
            Bản chép đã được xác nhận và dùng để chấm, tách theo {transcription.length} trang của bài nộp.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            {transcription.map((p) => (
              <section
                key={p.pageId}
                className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest overflow-hidden"
              >
                <h3 className="px-4 py-2.5 border-b border-outline-variant/30 text-sm font-semibold text-on-surface">
                  Trang {p.pageIndex}
                  <span className="font-normal text-on-surface-variant"> · {p.segments.length} dòng</span>
                </h3>
                <div className="max-h-[480px] overflow-y-auto p-3 space-y-0.5 font-merriweather text-sm leading-relaxed text-on-surface">
                  {p.segments.map((line) => (
                    <div
                      key={line.segmentId}
                      id={`segment-${line.segmentId}`}
                      className={`flex items-start gap-2.5 px-2 py-1 rounded-md scroll-my-4 transition-colors ${
                        highlightSegment === line.segmentId ? 'bg-[#fffbeb] ring-1 ring-[#fde68a]' : ''
                      }`}
                    >
                      <span className="font-sans text-xs tabular-nums text-outline select-none mt-0.5 w-5 shrink-0 text-right">
                        {line.order}
                      </span>
                      <p className="flex-1">{line.text}</p>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}

      {guideOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setGuideOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="grading-guide-title"
            className="bg-surface-container-lowest rounded-xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-xl border border-outline-variant/40"
          >
            <div className="px-5 py-4 border-b border-outline-variant/30 flex items-center justify-between gap-3">
              <h2 id="grading-guide-title" className="font-merriweather text-base font-bold text-on-surface">
                Hướng dẫn chấm từ barem đã giao
              </h2>
              <button
                type="button"
                autoFocus
                onClick={() => setGuideOpen(false)}
                aria-label="Đóng hướng dẫn chấm"
                className="w-9 h-9 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <div className="p-5 overflow-y-auto">
              <pre className="font-sans text-sm text-on-surface whitespace-pre-wrap leading-relaxed">{guideText}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
