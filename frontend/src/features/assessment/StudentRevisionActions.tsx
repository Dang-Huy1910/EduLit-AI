'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthApiError } from '@/lib/auth-types';
import { submissionApi } from '@/features/submission/api';
import { assessmentApi } from './api';
import { revisionAction } from './revision';

const BUTTON = 'h-9 px-4 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-40 inline-flex items-center gap-1.5';

export default function StudentRevisionActions({
  assignmentId,
  submission,
}: {
  assignmentId: string;
  submission: {
    maxRevisions?: number | null;
    revisionRound?: number | null;
    canStartRevision?: boolean;
    startRevisionBlockedReason?: string | null;
    revisionsRemaining?: number | null;
    revisionDueAt?: string | null;
  };
}) {
  const router = useRouter();
  const [publishedRound, setPublishedRound] = useState<number | null>(null);
  const [roundsKnown, setRoundsKnown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setRoundsKnown(false);
    void assessmentApi.studentRounds(assignmentId).then((view) => {
      if (!active) return;
      setPublishedRound(view.currentPublishedRound);
      setRoundsKnown(true);
    }).catch(() => { if (active) setRoundsKnown(false); });
    return () => { active = false; };
  }, [assignmentId, submission.revisionRound, submission.canStartRevision, submission.startRevisionBlockedReason]);

  if (!roundsKnown && !submission.canStartRevision) return null;
  const action = revisionAction({ ...submission, currentPublishedRound: publishedRound, roundsKnown });
  if (action.kind === 'hidden') return null;
  const start = async () => {
    setBusy(true);
    setError('');
    try {
      await submissionApi.startRevision(assignmentId);
      router.push(`/assignments/${assignmentId}/submit`);
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : 'Không bắt đầu được bản viết lại.');
      setBusy(false);
    }
  };
  return <section aria-label="Viết lại bài" className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-4 space-y-2">
    <h2 className="text-sm font-semibold text-on-surface">Viết lại sau khi có điểm</h2>
    {action.kind === 'start' && <button type="button" className={BUTTON} disabled={busy} onClick={() => void start()}>{busy ? 'Đang mở bản mới...' : action.label}</button>}
    {action.kind === 'continue' && <button type="button" className={BUTTON} onClick={() => router.push(`/assignments/${assignmentId}/submit`)}>{action.label}</button>}
    {action.kind === 'start' && <p className="text-sm text-on-surface-variant">Còn {submission.revisionsRemaining ?? 0} lượt viết lại.</p>}
    {submission.revisionDueAt && <p className="text-sm">Hạn viết lại: {new Date(submission.revisionDueAt).toLocaleString('vi-VN')}</p>}
    {action.kind === 'continue' && <p className="text-sm">Điểm bản trước vẫn giữ cho tới khi bản mới được công bố.</p>}
    {action.reason && <p role="status" className="text-sm">{action.reason}</p>}
    {error && <p role="alert" className="text-sm text-error">{error}</p>}
  </section>;
}
