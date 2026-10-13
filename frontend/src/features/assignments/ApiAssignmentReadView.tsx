'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
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
    <StudentShell headerTitle="Đọc đề và ngữ liệu" headerSubtitle="Bước 1 / 5: Tiếp cận văn bản">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header Breadcrumb & Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-outline-variant/20">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs bg-primary-fixed text-primary font-bold px-2.5 py-0.5 rounded-full">
                Bước 1 / 5: Đọc hiểu &amp; Phân tích đề
              </span>
              <span className="text-xs text-on-surface-variant font-mono">
                {assignment ? `${assignment.code} · ${assignment.genre} · Khối ${assignment.gradeLevel}` : 'Đang tải...'}
              </span>
            </div>
            <h1 className="font-headline-md text-xl sm:text-2xl font-bold text-on-surface font-merriweather">
              {assignment ? assignment.title : 'Đọc đề bài và ngữ liệu đính kèm'}
            </h1>
          </div>

          <Link
            href="/assignments"
            className="px-3.5 py-1.5 rounded-lg border border-outline-variant/60 text-xs font-semibold text-on-surface hover:bg-surface-container transition-all flex items-center gap-1 shadow-sm shrink-0"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            <span>Về danh sách bài tập</span>
          </Link>
        </div>

        {/* Unified 5-Step Workflow Stepper */}
        <AssignmentWorkflowStepper currentStep="reading" assignmentId={id} />

        {error && (
          <div role="alert" className="rounded-xl border border-error/30 bg-error-container/40 p-4 text-sm text-error">
            {error}
          </div>
        )}

        {!assignment ? (
          <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-on-surface-variant">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            Đang tải dữ liệu đề thi và ngữ liệu...
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Main Content (8 cols) */}
            <div className="lg:col-span-8 space-y-6">
              {/* 1. Yêu cầu đề bài */}
              <article
                className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/30 shadow-sm space-y-3"
                data-testid="assignment-reading"
              >
                <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
                  <span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm">edit_document</span>
                    Yêu cầu bài viết
                  </span>
                  <span className="text-xs text-on-surface-variant font-medium">
                    {assignment.genre} • Khối {assignment.gradeLevel}
                  </span>
                </div>
                <h2 className="font-merriweather text-lg font-bold text-on-surface">{assignment.title}</h2>
                <div className="p-4 bg-surface-container-low/50 rounded-lg text-xs leading-relaxed text-on-surface-variant whitespace-pre-line font-merriweather">
                  {assignment.instructions}
                </div>
              </article>

              {/* 2. Ngữ liệu đọc hiểu */}
              <section className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/30 shadow-sm space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
                  <span className="text-xs font-bold uppercase tracking-wider text-secondary flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm">menu_book</span>
                    Ngữ liệu đọc hiểu đính kèm
                  </span>
                  <span className="text-xs text-tertiary font-semibold flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">verified</span>
                    Chuẩn GDPT 2018
                  </span>
                </div>
                <div className="p-5 bg-surface-container-low/30 rounded-xl border border-outline-variant/20 text-xs sm:text-sm leading-relaxed text-on-surface whitespace-pre-line font-merriweather">
                  {assignment.learningMaterialText}
                </div>
              </section>
            </div>

            {/* Right Column (4 cols): Rubric & Next CTA */}
            <div className="lg:col-span-4 space-y-5">
              {/* Rubric Summary Card */}
              <section className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant/30 shadow-sm space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
                  <span className="text-xs font-bold uppercase tracking-wider text-on-surface flex items-center gap-1">
                    <span className="material-symbols-outlined text-base text-primary">gavel</span>
                    Barem Rubric (Tổng {assignment.maxScore}đ)
                  </span>
                </div>

                <div className="space-y-2.5 text-xs">
                  {assignment.rubric?.criteria.map((item) => (
                    <div
                      key={item.criterionId}
                      className="p-3 bg-surface-container-low/50 rounded-lg border border-outline-variant/20 space-y-1"
                    >
                      <div className="flex items-center justify-between font-semibold">
                        <span className="text-primary font-medium">{item.name}</span>
                        <span className="text-on-surface font-mono text-[11px] bg-surface-container px-2 py-0.5 rounded">
                          {item.weight}đ
                        </span>
                      </div>
                      {item.descriptor && (
                        <p className="text-[11px] text-on-surface-variant leading-relaxed">
                          {item.descriptor}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              {/* Action Box */}
              <div className="p-5 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm space-y-3">
                <span className="text-xs font-bold uppercase tracking-wider text-outline block">
                  Xác nhận tiến độ học tập
                </span>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Sau khi đọc kỹ đề và ngữ liệu, em hãy xác nhận để mở bước lập dàn ý cùng Trợ lý Socratic AI.
                </p>

                <div className="pt-2">
                  {!confirmed ? (
                    <button
                      data-testid="mark-read"
                      type="button"
                      disabled={busy}
                      onClick={() => void confirmRead()}
                      className="w-full py-2.5 px-4 rounded-lg bg-primary-container text-on-primary-container font-bold text-xs hover:brightness-95 transition-all flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-base">check</span>
                      <span>{busy ? 'Đang ghi nhận…' : 'Tôi đã đọc đề và ngữ liệu'}</span>
                    </button>
                  ) : (
                    <Link
                      data-testid="continue-socratic"
                      href={`/assignments/${assignment.id}/socratic`}
                      className="w-full py-2.5 px-4 rounded-lg bg-primary-container text-on-primary-container font-bold text-xs hover:brightness-95 transition-all flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <span>{progress?.socratic ? 'Tiếp tục dàn ý Socratic' : 'Bắt đầu lập dàn ý Socratic'}</span>
                      <span className="material-symbols-outlined text-base">arrow_forward</span>
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </StudentShell>
  );
}
