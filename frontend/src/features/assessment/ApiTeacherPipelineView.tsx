'use client';

import { useEffect, useMemo, useState } from 'react';
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

const fail = (error: unknown) => (error instanceof ApiError ? error.message : 'Thao tác chưa hoàn tất.');

export default function ApiTeacherPipelineView() {
  const params = useParams();
  const assignmentId = String(params?.assignmentId ?? '');
  const [drafts, setDrafts] = useState<ApiSubmissionDraft[]>([]);
  const [submissions, setSubmissions] = useState<ApiTeacherSubmission[]>([]);
  const [jobs, setJobs] = useState<Record<string, ApiProfileExtractionJob>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [corrections, setCorrections] = useState<Record<string, string>>({});

  const load = async () => {
    try {
      const [nextDrafts, nextSubmissions] = await Promise.all([listTeacherDrafts(assignmentId), listTeacherSubmissions(assignmentId)]);
      setDrafts(nextDrafts);
      setSubmissions(nextSubmissions);
      const published = nextSubmissions.filter((row) => row.assessment?.status === 'PUBLISHED');
      const nextJobs: Record<string, ApiProfileExtractionJob> = {};
      await Promise.all(
        published.map(async (row) => {
          if (!row.assessment) return;
          nextJobs[row.assessment.id] = await getProfileExtraction(row.assessment.id);
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
    } catch (cause) {
      setError(fail(cause));
    } finally {
      setBusy(null);
    }
  };

  const counters = useMemo(
    () => ({
      privacy: drafts.filter((draft) => draft.status === 'AWAITING_PRIVACY_REVIEW').length,
      ocr: drafts.filter((draft) => ['PRIVACY_APPROVED', 'OCR_FAILED', 'OCR_REVIEW', 'OCR_PROCESSING'].includes(draft.status)).length,
      grade: submissions.filter((row) => !row.assessment).length,
      publish: submissions.filter((row) => row.assessment?.status === 'AI_DRAFT').length,
    }),
    [drafts, submissions],
  );

  return (
    <TeacherShell>
      <main className="mx-auto max-w-6xl space-y-6">
        <header>
          <p className="text-xs font-bold uppercase tracking-widest text-secondary">Hàng chờ xử lý</p>
          <h1 className="mt-1 font-merriweather text-2xl font-bold">Duyệt ảnh, xác nhận OCR và công bố kết quả</h1>
          <p className="mt-2 text-sm text-on-surface-variant">Mỗi thao tác ghi vào DB; ảnh gốc vẫn private và OCR chỉ nhận derivative đã che.</p>
        </header>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="teacher-worklist-counters">
          <Counter label="Chờ duyệt ảnh" value={counters.privacy} />
          <Counter label="Hàng OCR" value={counters.ocr} />
          <Counter label="Chờ chấm" value={counters.grade} />
          <Counter label="Chờ công bố" value={counters.publish} />
        </dl>
        {error && (
          <div role="alert" className="rounded-lg border border-error/30 bg-error-container/40 p-3 text-sm text-error">
            {error}
          </div>
        )}
        <section className="space-y-3">
          <h2 className="font-merriweather text-lg font-bold">Ảnh/OCR chờ xử lý ({drafts.length})</h2>
          {drafts.length === 0 ? (
            <p className="rounded-xl bg-surface-container-low p-5 text-sm text-on-surface-variant">Chưa có bản nháp ảnh.</p>
          ) : (
            drafts.map((draft) => (
              <article key={draft.id} className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-5" data-testid={`teacher-draft-${draft.id}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold" data-testid="draft-student-name">
                      {draft.student?.displayName ?? `Học sinh ${draft.studentId.slice(0, 8)}…`}
                    </h3>
                    <p className="mt-1 text-sm text-on-surface-variant">
                      {draft.student?.loginId} · {draft.pages.length} trang · trạng thái <strong>{draft.status}</strong>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {draft.status === 'AWAITING_PRIVACY_REVIEW' && (
                      <>
                        <button data-testid="privacy-approve" disabled={busy === draft.id} onClick={() => void act(draft.id, () => reviewPrivacy(draft.id, true))} className="rounded-lg bg-primary-container px-3 py-2 text-xs font-bold text-on-primary-container">
                          Duyệt ảnh
                        </button>
                        <button
                          data-testid="privacy-return"
                          disabled={busy === draft.id}
                          onClick={() => {
                            const reason = window.prompt('Nêu vùng cần che thêm');
                            if (reason) void act(draft.id, () => reviewPrivacy(draft.id, false, reason));
                          }}
                          className="rounded-lg border border-error/30 px-3 py-2 text-xs font-bold text-error"
                        >
                          Trả lại
                        </button>
                      </>
                    )}
                    {(draft.status === 'PRIVACY_APPROVED' || draft.status === 'OCR_FAILED') && (
                      <button data-testid="run-ocr" disabled={busy === draft.id} onClick={() => void act(draft.id, () => runOcr(draft.id))} className="rounded-lg bg-secondary px-3 py-2 text-xs font-bold text-white">
                        Chạy OCR
                      </button>
                    )}
                    {draft.status === 'OCR_REVIEW' && draft.ocr && (
                      <>
                        <button
                          data-testid="ocr-correct"
                          disabled={busy === draft.id}
                          onClick={() => void act(draft.id, () => correctOcr(draft.id, draft.ocr!.revision, corrections[draft.id] ?? draft.ocr!.correctedText, 'Đối chiếu derivative'))}
                          className="rounded-lg border border-primary px-3 py-2 text-xs font-bold text-primary"
                        >
                          Lưu sửa OCR
                        </button>
                        <button data-testid="ocr-confirm" disabled={busy === draft.id} onClick={() => void act(draft.id, () => confirmOcr(draft.id, draft.ocr!.revision))} className="rounded-lg bg-primary-container px-3 py-2 text-xs font-bold text-on-primary-container">
                          Xác nhận bản chép
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {draft.ocr && (
                  <textarea
                    data-testid="ocr-correction"
                    value={corrections[draft.id] ?? draft.ocr.correctedText}
                    onChange={(event) => setCorrections((current) => ({ ...current, [draft.id]: event.target.value }))}
                    className="mt-4 min-h-28 w-full rounded-lg border border-outline-variant/50 p-3 text-sm leading-6"
                    aria-label="Bản chép OCR đã hiệu chỉnh"
                  />
                )}
              </article>
            ))
          )}
        </section>
        <section className="space-y-3">
          <h2 className="font-merriweather text-lg font-bold">Bài đã xác nhận / chấm điểm ({submissions.length})</h2>
          {submissions.map((submission) => {
            const job = submission.assessment ? jobs[submission.assessment.id] : undefined;
            return (
              <article key={submission.id} className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-5" data-testid={`teacher-submission-${submission.id}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold">{submission.student.displayName}</h3>
                    <p className="text-sm text-on-surface-variant">
                      {submission.assessment ? `${submission.assessment.status} · ${submission.assessment.totalScore}/${submission.assessment.maxScore}` : 'Chờ tạo AI draft'}
                      {job ? ` · hồ sơ ${job.status}${job.noObservations ? ' (không có observation)' : ''}` : ''}
                    </p>
                  </div>
                  {!submission.assessment ? (
                    <button data-testid="grade-ai" disabled={busy === submission.id} onClick={() => void act(submission.id, () => gradeSubmission(submission.id))} className="rounded-lg bg-secondary px-3 py-2 text-xs font-bold text-white">
                      Chấm bằng AI
                    </button>
                  ) : submission.assessment.status === 'AI_DRAFT' ? (
                    <button data-testid="publish-assessment" disabled={busy === submission.id} onClick={() => void act(submission.id, () => publishAssessment(submission.assessment!.id))} className="rounded-lg bg-primary-container px-3 py-2 text-xs font-bold text-on-primary-container">
                      Duyệt & công bố
                    </button>
                  ) : (
                    <span className="text-xs font-bold text-tertiary">Đã công bố</span>
                  )}
                </div>
                {submission.assessment?.status === 'AI_DRAFT' && (
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {submission.assessment.detailedEvaluations.map((evaluation) => (
                      <div key={evaluation.criterionId} className="rounded-lg bg-surface-container-low p-3 text-sm">
                        <strong>
                          {evaluation.criterionId}: {evaluation.awardedScore}đ
                        </strong>
                        <p className="mt-1 text-on-surface-variant">{evaluation.comment}</p>
                      </div>
                    ))}
                  </div>
                )}
                {submission.assessment?.status === 'PUBLISHED' && job && (
                  <div className="mt-4 space-y-2 rounded-lg bg-surface-container-low p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold">Trích xuất văn phong: {job.status}</p>
                      {job.status === 'FAILED' && (
                        <button data-testid="retry-profile" disabled={busy === submission.assessment.id} onClick={() => void act(submission.assessment!.id, () => retryProfileExtraction(submission.assessment!.id))} className="rounded-md border border-primary px-2 py-1 text-xs font-bold text-primary">
                          Thử trích xuất lại
                        </button>
                      )}
                    </div>
                    {job.observations.map((observation) => (
                      <div key={observation.id} className="rounded-md bg-surface-container-lowest p-2 text-xs" data-testid="teacher-observation">
                        <p>
                          {observation.description} · {observation.status}
                        </p>
                        <p className="mt-1 italic">“{observation.evidenceQuote}”</p>
                        {observation.status === 'PROVISIONAL' && submission.assessment && (
                          <button
                            data-testid="review-observation"
                            className="mt-2 font-bold text-primary"
                            onClick={() =>
                              void act(observation.id, () =>
                                reviewObservation(observation.id, { status: 'SUPPORTED', expectedProfileVersion: job.profileVersion }),
                              )
                            }
                          >
                            Xác nhận observation
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </section>
      </main>
    </TeacherShell>
  );
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-4">
      <dt className="text-xs text-on-surface-variant">{label}</dt>
      <dd className="mt-1 text-2xl font-bold">{value}</dd>
    </div>
  );
}
