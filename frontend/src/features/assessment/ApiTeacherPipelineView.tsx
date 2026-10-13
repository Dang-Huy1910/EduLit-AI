'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import TeacherShell from '@/components/TeacherShell';
import { ApiError, type ApiProfileExtractionJob, type ApiSubmissionDraft, type ApiTeacherSubmission } from '@/lib/api/types';
import {
  confirmOcr,
  correctOcr,
  getProfileExtraction,
  gradeSubmission,
  listTeacherDrafts,
  listTeacherSubmissions,
  publishAssessment,
  retryProfileExtraction,
  reviewObservation,
  reviewPrivacy,
  runOcr,
} from '@/lib/api/submissions';
import { useAppStore } from '@/lib/store';

const fail = (error: unknown) => (error instanceof ApiError ? error.message : 'Thao tác chưa hoàn tất.');

export default function ApiTeacherPipelineView() {
  const params = useParams();
  const assignmentId = String(params?.assignmentId ?? '');
  const addToast = useAppStore((state) => state.addToast);

  const [drafts, setDrafts] = useState<ApiSubmissionDraft[]>([]);
  const [submissions, setSubmissions] = useState<ApiTeacherSubmission[]>([]);
  const [jobs, setJobs] = useState<Record<string, ApiProfileExtractionJob>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [corrections, setCorrections] = useState<Record<string, string>>({});

  const load = async () => {
    try {
      const [nextDrafts, nextSubmissions] = await Promise.all([
        listTeacherDrafts(assignmentId),
        listTeacherSubmissions(assignmentId),
      ]);
      setDrafts(nextDrafts);
      setSubmissions(nextSubmissions);

      const published = nextSubmissions.filter((row) => row.assessment?.status === 'PUBLISHED');
      const nextJobs: Record<string, ApiProfileExtractionJob> = {};
      await Promise.all(
        published.map(async (row) => {
          if (!row.assessment) return;
          try {
            nextJobs[row.assessment.id] = await getProfileExtraction(row.assessment.id);
          } catch {
            // ignore individual job errors
          }
        }),
      );
      setJobs(nextJobs);
    } catch (cause) {
      setError(fail(cause));
    }
  };

  useEffect(() => {
    void load();
  }, [assignmentId]);

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await load();
      addToast('Cập nhật trạng thái thành công.', 'success');
    } catch (cause) {
      const msg = fail(cause);
      setError(msg);
      addToast(msg, 'error');
    } finally {
      setBusy(null);
    }
  };

  const counters = useMemo(
    () => ({
      privacy: drafts.filter((draft) => draft.status === 'AWAITING_PRIVACY_REVIEW').length,
      ocr: drafts.filter((draft) =>
        ['PRIVACY_APPROVED', 'OCR_FAILED', 'OCR_REVIEW', 'OCR_PROCESSING'].includes(draft.status),
      ).length,
      grade: submissions.filter((row) => !row.assessment).length,
      publish: submissions.filter((row) => row.assessment?.status === 'AI_DRAFT').length,
    }),
    [drafts, submissions],
  );

  return (
    <TeacherShell
      breadcrumb={
        <div className="flex items-center gap-space-xs font-label-md text-sm text-on-surface-variant">
          <Link href="/assignments" className="hover:text-primary">
            Quản lý bài tập
          </Link>
          <span className="text-outline-variant">/</span>
          <span className="text-on-surface font-semibold">Hàng chờ duyệt ảnh, OCR &amp; Chấm điểm</span>
        </div>
      }
    >
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs bg-secondary-fixed/50 text-secondary font-bold px-2 py-0.5 rounded-full">
                Hàng chờ xử lý sư phạm
              </span>
              <span className="text-xs text-on-surface-variant font-mono">Mã bài: {assignmentId}</span>
            </div>
            <h1 className="font-headline-lg text-2xl sm:text-3xl font-bold text-on-surface font-merriweather">
              Duyệt ảnh, Xác nhận OCR &amp; Công bố kết quả
            </h1>
            <p className="mt-1 text-sm text-on-surface-variant">
              Mỗi thao tác được bảo toàn phiên bản; ảnh gốc luôn bảo mật PII và mô hình OCR nhận ảnh đã che.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/assignments"
              className="px-3.5 py-2 rounded-lg border border-outline-variant/60 bg-surface-container-lowest text-xs font-medium text-on-surface hover:bg-surface-container transition-all flex items-center gap-1 shadow-sm"
            >
              <span className="material-symbols-outlined text-sm">arrow_back</span>
              <span>Quay lại Quản lý bài tập</span>
            </Link>
          </div>
        </div>

        {/* 4 KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4" data-testid="teacher-worklist-counters">
          <div className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm">
            <span className="text-xs text-on-surface-variant block">Chờ duyệt ảnh PII</span>
            <span className="text-2xl font-bold text-on-surface font-merriweather mt-1 block">
              {counters.privacy}
            </span>
            <span className="text-[11px] text-[#CA8A04] font-semibold mt-1 block">
              {counters.privacy > 0 ? 'Cần duyệt ảnh' : 'Đã duyệt hết'}
            </span>
          </div>

          <div className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm">
            <span className="text-xs text-on-surface-variant block">Hàng đợi OCR</span>
            <span className="text-2xl font-bold text-secondary font-merriweather mt-1 block">
              {counters.ocr}
            </span>
            <span className="text-[11px] text-secondary font-semibold mt-1 block">
              Bóc tách chữ viết tay
            </span>
          </div>

          <div className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm">
            <span className="text-xs text-on-surface-variant block">Chờ chấm AI</span>
            <span className="text-2xl font-bold text-primary font-merriweather mt-1 block">
              {counters.grade}
            </span>
            <span className="text-[11px] text-primary font-semibold mt-1 block">
              Đối chiếu Rubric
            </span>
          </div>

          <div className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm">
            <span className="text-xs text-on-surface-variant block">Chờ công bố điểm</span>
            <span className="text-2xl font-bold text-tertiary font-merriweather mt-1 block">
              {counters.publish}
            </span>
            <span className="text-[11px] text-tertiary font-semibold mt-1 block">
              Cần duyệt điểm nháp
            </span>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-error/30 bg-error-container/40 p-3.5 text-xs text-error flex items-center justify-between"
          >
            <span>{error}</span>
            <button className="font-semibold underline" onClick={() => void load()}>
              Tải lại
            </button>
          </div>
        )}

        {/* Section 1: Ảnh & OCR chờ xử lý */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-headline-sm text-base font-bold text-on-surface font-merriweather">
              Ảnh bài làm &amp; Hàng OCR ({drafts.length})
            </h2>
            <span className="text-xs text-on-surface-variant">Duyệt tính ẩn danh trước khi chạy nhận dạng</span>
          </div>

          {drafts.length === 0 ? (
            <div className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-8 text-center text-xs text-on-surface-variant">
              Hiện không có bản nháp ảnh bài làm nào cần xử lý.
            </div>
          ) : (
            <div className="space-y-4">
              {drafts.map((draft) => (
                <article
                  key={draft.id}
                  className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-sm space-y-4"
                  data-testid={`teacher-draft-${draft.id}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-outline-variant/20">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-on-surface" data-testid="draft-student-name">
                          {draft.student?.displayName ?? `Học sinh ${draft.studentId.slice(0, 8)}…`}
                        </h3>
                        <span className="text-xs font-mono text-secondary bg-surface-container px-2 py-0.5 rounded">
                          {draft.student?.loginId}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-on-surface-variant">
                        Số trang: <strong>{draft.pages.length}</strong> • Trạng thái:{' '}
                        <span className="font-semibold text-secondary">{draft.status}</span>
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {draft.status === 'AWAITING_PRIVACY_REVIEW' && (
                        <>
                          <button
                            data-testid="privacy-approve"
                            disabled={busy === draft.id}
                            onClick={() => void act(draft.id, () => reviewPrivacy(draft.id, true))}
                            className="rounded-lg bg-primary-container px-3.5 py-1.5 text-xs font-bold text-on-primary-container hover:brightness-95 transition-all shadow-sm"
                          >
                            Duyệt ảnh hợp lệ
                          </button>
                          <button
                            data-testid="privacy-return"
                            disabled={busy === draft.id}
                            onClick={() => {
                              const reason = window.prompt('Nêu lý do yêu cầu học sinh che lại thông tin cá nhân:');
                              if (reason) void act(draft.id, () => reviewPrivacy(draft.id, false, reason));
                            }}
                            className="rounded-lg border border-error/40 px-3.5 py-1.5 text-xs font-bold text-error hover:bg-error-container/30 transition-all"
                          >
                            Yêu cầu che lại
                          </button>
                        </>
                      )}

                      {(draft.status === 'PRIVACY_APPROVED' || draft.status === 'OCR_FAILED') && (
                        <button
                          data-testid="run-ocr"
                          disabled={busy === draft.id}
                          onClick={() => void act(draft.id, () => runOcr(draft.id))}
                          className="rounded-lg bg-secondary px-3.5 py-1.5 text-xs font-bold text-white hover:bg-secondary/90 transition-all shadow-sm"
                        >
                          Chạy nhận dạng OCR
                        </button>
                      )}

                      {draft.status === 'OCR_REVIEW' && draft.ocr && (
                        <>
                          <button
                            data-testid="ocr-correct"
                            disabled={busy === draft.id}
                            onClick={() =>
                              void act(draft.id, () =>
                                correctOcr(
                                  draft.id,
                                  draft.ocr!.revision,
                                  corrections[draft.id] ?? draft.ocr!.correctedText,
                                  'Hiệu đính giáo viên',
                                ),
                              )
                            }
                            className="rounded-lg border border-primary px-3.5 py-1.5 text-xs font-bold text-primary hover:bg-surface-container transition-all"
                          >
                            Lưu bản sửa
                          </button>
                          <button
                            data-testid="ocr-confirm"
                            disabled={busy === draft.id}
                            onClick={() => void act(draft.id, () => confirmOcr(draft.id, draft.ocr!.revision))}
                            className="rounded-lg bg-primary-container px-3.5 py-1.5 text-xs font-bold text-on-primary-container hover:brightness-95 transition-all shadow-sm"
                          >
                            Xác nhận bản chép
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {draft.ocr && (
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-semibold text-outline uppercase tracking-wider">
                        Bản chép OCR số hóa (Hiệu đính nếu cần):
                      </label>
                      <textarea
                        data-testid="ocr-correction"
                        value={corrections[draft.id] ?? draft.ocr.correctedText}
                        onChange={(event) =>
                          setCorrections((current) => ({ ...current, [draft.id]: event.target.value }))
                        }
                        rows={4}
                        className="w-full rounded-lg border border-outline-variant/50 p-3 text-xs leading-relaxed font-merriweather bg-surface focus:outline-none focus:border-secondary"
                        aria-label="Bản chép OCR đã hiệu chỉnh"
                      />
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        {/* Section 2: Bài đã xác nhận / Chấm điểm */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-headline-sm text-base font-bold text-on-surface font-merriweather">
              Bài nộp đã xác nhận &amp; Chấm điểm Rubric ({submissions.length})
            </h2>
            <span className="text-xs text-on-surface-variant">Thẩm định điểm nháp của AI trước khi công bố</span>
          </div>

          {submissions.length === 0 ? (
            <div className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-8 text-center text-xs text-on-surface-variant">
              Chưa có bài nộp nào hoàn thành bước xác nhận bản chép.
            </div>
          ) : (
            <div className="space-y-4">
              {submissions.map((submission) => {
                const job = submission.assessment ? jobs[submission.assessment.id] : undefined;
                return (
                  <article
                    key={submission.id}
                    className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-sm space-y-4"
                    data-testid={`teacher-submission-${submission.id}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-outline-variant/20">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-on-surface">{submission.student.displayName}</h3>
                          <span className="text-xs font-mono text-secondary bg-surface-container px-2 py-0.5 rounded">
                            {submission.student.loginId}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-on-surface-variant">
                          {submission.assessment ? (
                            <span>
                              Điểm: <strong>{submission.assessment.totalScore} / {submission.assessment.maxScore}đ</strong> • Trạng thái: {submission.assessment.status}
                            </span>
                          ) : (
                            <span className="text-[#CA8A04] font-medium">Bản chép đã xác nhận, sẵn sàng chấm AI</span>
                          )}
                        </p>
                      </div>

                      <div>
                        {!submission.assessment ? (
                          <button
                            data-testid="grade-ai"
                            disabled={busy === submission.id}
                            onClick={() => void act(submission.id, () => gradeSubmission(submission.id))}
                            className="rounded-lg bg-secondary px-3.5 py-1.5 text-xs font-bold text-white hover:bg-secondary/90 transition-all shadow-sm"
                          >
                            Chấm bằng AI
                          </button>
                        ) : submission.assessment.status === 'AI_DRAFT' ? (
                          <button
                            data-testid="publish-assessment"
                            disabled={busy === submission.id}
                            onClick={() => void act(submission.id, () => publishAssessment(submission.assessment!.id))}
                            className="rounded-lg bg-primary-container px-3.5 py-1.5 text-xs font-bold text-on-primary-container hover:brightness-95 transition-all shadow-sm"
                          >
                            Duyệt &amp; Công bố điểm
                          </button>
                        ) : (
                          <span className="text-xs font-bold text-tertiary bg-tertiary-container/30 px-3 py-1 rounded-full flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">verified</span>
                            Đã công bố chính thức
                          </span>
                        )}
                      </div>
                    </div>

                    {/* AI Draft Evaluations */}
                    {submission.assessment?.status === 'AI_DRAFT' && (
                      <div className="space-y-2">
                        <span className="text-[11px] font-semibold text-outline uppercase tracking-wider block">
                          Điểm nháp AI theo từng tiêu chí Rubric:
                        </span>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {submission.assessment.detailedEvaluations.map((evaluation) => (
                            <div
                              key={evaluation.criterionId}
                              className="rounded-lg bg-surface-container-low/50 border border-outline-variant/30 p-3 text-xs space-y-1"
                            >
                              <div className="flex items-center justify-between font-bold">
                                <span className="text-primary">{evaluation.criterionId}</span>
                                <span className="text-on-surface font-mono">{evaluation.awardedScore}đ</span>
                              </div>
                              <p className="text-[11px] text-on-surface-variant leading-relaxed">
                                {evaluation.comment}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Writing Profile Extraction Observations */}
                    {submission.assessment?.status === 'PUBLISHED' && job && (
                      <div className="space-y-2.5 pt-2 border-t border-outline-variant/20">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold text-outline uppercase tracking-wider">
                            Trích xuất văn phong học sinh: {job.status}
                          </span>
                          {job.status === 'FAILED' && (
                            <button
                              data-testid="retry-profile"
                              disabled={busy === submission.assessment.id}
                              onClick={() => void act(submission.assessment!.id, () => retryProfileExtraction(submission.assessment!.id))}
                              className="rounded-md border border-primary px-2.5 py-1 text-xs font-bold text-primary hover:bg-surface-container"
                            >
                              Thử trích xuất lại
                            </button>
                          )}
                        </div>

                        {job.observations.map((observation) => (
                          <div
                            key={observation.id}
                            className="rounded-lg bg-surface-container-low/40 border border-outline-variant/30 p-3 text-xs space-y-1.5"
                            data-testid="teacher-observation"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-on-surface">{observation.description}</span>
                              <span className="text-[10px] font-mono bg-surface-container px-2 py-0.5 rounded">
                                {observation.status}
                              </span>
                            </div>
                            <blockquote className="italic text-[11px] text-on-surface-variant border-l-2 border-secondary pl-2">
                              “{observation.evidenceQuote}”
                            </blockquote>
                            {observation.status === 'PROVISIONAL' && submission.assessment && (
                              <div className="pt-1 flex justify-end">
                                <button
                                  data-testid="review-observation"
                                  className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
                                  onClick={() =>
                                    void act(observation.id, () =>
                                      reviewObservation(observation.id, {
                                        status: 'SUPPORTED',
                                        expectedProfileVersion: job.profileVersion,
                                      }),
                                    )
                                  }
                                >
                                  <span className="material-symbols-outlined text-[14px]">check</span>
                                  <span>Xác nhận nhận xét này</span>
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </TeacherShell>
  );
}
