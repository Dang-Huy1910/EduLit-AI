'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import StudentShell from '@/components/StudentShell';
import AssignmentWorkflowStepper from '@/components/AssignmentWorkflowStepper';
import { getAssignment, getAssignmentProgress, markAssignmentRead } from '@/lib/api/assignments';
import { ApiError, type ApiAssignment, type ApiAssignmentProgress } from '@/lib/api/types';

export default function ApiAssignmentReadView() {
  const params = useParams();
  const id = String(params?.id ?? '');
  const [assignment, setAssignment] = useState<ApiAssignment | null>(null);
  const [progress, setProgress] = useState<ApiAssignmentProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [row, nextProgress] = await Promise.all([getAssignment(id), getAssignmentProgress(id)]);
        if (!active) return;
        setAssignment(row);
        setProgress(nextProgress);
        setConfirmed(Boolean(nextProgress.readAt));
      } catch (cause) {
        if (active) setError(cause instanceof ApiError ? cause.message : 'Không tải được đề.');
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  const confirmRead = async () => {
    if (!assignment) return;
    setBusy(true);
    setError(null);
    try {
      await markAssignmentRead(assignment.id);
      const nextProgress = await getAssignmentProgress(assignment.id);
      setProgress(nextProgress);
      setConfirmed(true);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Không ghi nhận được việc đã đọc.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <StudentShell headerTitle="Đọc đề và ngữ liệu" headerSubtitle="Bước 1 / 5">
      <main className="mx-auto max-w-4xl space-y-5">
        <AssignmentWorkflowStepper currentStep="reading" assignmentId={id} />
        {error && (
          <div role="alert" className="rounded-lg border border-error/30 bg-error-container/40 p-4 text-sm text-error">
            {error}
          </div>
        )}
        {!assignment ? (
          <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-on-surface-variant">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            Đang mở đề…
          </div>
        ) : (
          <>
            <header className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-6" data-testid="assignment-reading">
              <p className="font-mono text-xs font-semibold text-secondary">
                {assignment.code} · {assignment.genre} · Khối {assignment.gradeLevel}
                {assignment.status === 'CLOSED' ? ' · Đã đóng' : ''}
              </p>
              <h1 className="mt-2 font-merriweather text-2xl font-bold">{assignment.title}</h1>
              <p className="mt-4 whitespace-pre-line text-sm leading-7 text-on-surface-variant">{assignment.instructions}</p>
            </header>
            <section className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-6">
              <h2 className="font-merriweather text-lg font-bold">Ngữ liệu</h2>
              <p className="mt-3 whitespace-pre-line text-sm leading-7 text-on-surface">{assignment.learningMaterialText}</p>
            </section>
            <section className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-6">
              <h2 className="font-merriweather text-lg font-bold">Barem Rubric</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {assignment.rubric?.criteria.map((item) => (
                  <div key={item.criterionId} className="rounded-lg bg-surface-container-low p-3">
                    <div className="flex justify-between gap-2 text-sm font-semibold">
                      <span>{item.name}</span>
                      <span>{item.weight}đ</span>
                    </div>
                    {item.descriptor && <p className="mt-1 text-xs leading-5 text-on-surface-variant">{item.descriptor}</p>}
                  </div>
                ))}
              </div>
            </section>
            <div className="flex flex-wrap items-center justify-end gap-3">
              {!confirmed ? (
                <button
                  data-testid="mark-read"
                  type="button"
                  disabled={busy}
                  onClick={() => void confirmRead()}
                  className="rounded-lg bg-primary-container px-4 py-2.5 text-sm font-semibold text-on-primary-container transition-all hover:brightness-95 active:scale-[0.98] disabled:opacity-50"
                >
                  {busy ? 'Đang ghi nhận…' : 'Tôi đã đọc đề và ngữ liệu'}
                </button>
              ) : (
                <Link
                  data-testid="continue-socratic"
                  href={`/assignments/${assignment.id}/socratic`}
                  className="rounded-lg bg-primary-container px-4 py-2.5 text-sm font-semibold text-on-primary-container transition-all hover:brightness-95 active:scale-[0.98]"
                >
                  {progress?.socratic ? 'Tiếp tục dàn ý Socratic →' : 'Đã đọc, lập dàn ý Socratic →'}
                </Link>
              )}
            </div>
          </>
        )}
      </main>
    </StudentShell>
  );
}
