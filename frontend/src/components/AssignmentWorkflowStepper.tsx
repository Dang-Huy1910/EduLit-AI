'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { isApiMode } from '@/lib/data-mode';
import { getAssignmentProgress } from '@/lib/api/assignments';
import type { WorkflowStepState } from '@/lib/api/types';

export type WorkflowStepId = 'reading' | 'socratic' | 'submit' | 'ocr' | 'result';

interface StepConfig {
  id: WorkflowStepId;
  stepNumber: number;
  label: string;
  icon: string;
}

const STEPS: StepConfig[] = [
  { id: 'reading', stepNumber: 1, label: 'Đề bài & Ngữ liệu', icon: 'menu_book' },
  { id: 'socratic', stepNumber: 2, label: 'Dàn ý Socratic', icon: 'psychology' },
  { id: 'submit', stepNumber: 3, label: 'Viết tay & Nộp ảnh', icon: 'photo_camera' },
  { id: 'ocr', stepNumber: 4, label: 'Kiểm tra OCR', icon: 'document_scanner' },
  { id: 'result', stepNumber: 5, label: 'Đánh giá Rubric', icon: 'verified' },
];

interface AssignmentWorkflowStepperProps {
  currentStep: WorkflowStepId;
  assignmentId?: string;
}

function hrefFor(id: WorkflowStepId, assignmentId: string): string {
  if (id === 'reading') return `/assignments/${assignmentId}`;
  if (id === 'socratic') return `/assignments/${assignmentId}/socratic`;
  return `/assignments/${assignmentId}/${id}`;
}

const STATE_LABEL: Record<WorkflowStepState, string> = {
  not_started: 'Chưa bắt đầu',
  in_progress: 'Đang làm',
  waiting_teacher: 'Chờ giáo viên',
  complete: 'Hoàn tất',
};

export default function AssignmentWorkflowStepper({
  currentStep,
  assignmentId = 'assign-nlxh-01',
}: AssignmentWorkflowStepperProps) {
  const currentIdx = STEPS.findIndex((s) => s.id === currentStep);
  const apiMode = isApiMode();
  const [serverSteps, setServerSteps] = useState<Record<WorkflowStepId, WorkflowStepState> | null>(null);

  useEffect(() => {
    if (!apiMode || !assignmentId) return;
    let active = true;
    void getAssignmentProgress(assignmentId)
      .then((progress) => {
        if (active) setServerSteps(progress.steps);
      })
      .catch(() => {
        if (active) setServerSteps(null);
      });
    return () => {
      active = false;
    };
  }, [apiMode, assignmentId, currentStep]);

  return (
    <div className="w-full bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm p-3 sm:p-3.5 overflow-x-auto" data-testid="workflow-stepper">
      <div className="flex items-center justify-between min-w-[820px] gap-2">
        {STEPS.map((step, idx) => {
          const serverState = serverSteps?.[step.id];
          const isDone = apiMode ? serverState === 'complete' : idx < currentIdx;
          const isWaiting = apiMode && serverState === 'waiting_teacher';
          const isCurrent = step.id === currentStep;
          const targetHref = hrefFor(step.id, assignmentId);

          return (
            <React.Fragment key={step.id}>
              <Link
                href={targetHref}
                data-testid={`workflow-step-${step.id}`}
                data-state={serverState ?? (isDone ? 'complete' : isCurrent ? 'in_progress' : 'not_started')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all shrink-0 select-none ${
                  isCurrent
                    ? 'bg-primary-container text-on-primary-container font-bold shadow-sm ring-2 ring-primary-container/40'
                    : isDone
                    ? 'text-tertiary hover:bg-surface-container font-medium'
                    : isWaiting
                    ? 'text-secondary hover:bg-surface-container font-medium'
                    : 'text-on-surface-variant/70 hover:bg-surface-container hover:text-on-surface font-medium'
                }`}
              >
                <div className="relative shrink-0">
                  <div
                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition-all ${
                      isCurrent
                        ? 'bg-on-primary-container text-primary-container shadow-xs ring-1 ring-primary/40'
                        : isDone
                        ? 'bg-tertiary-container/50 text-tertiary border border-tertiary/30'
                        : isWaiting
                        ? 'bg-secondary-fixed text-secondary border border-secondary/30'
                        : 'bg-surface-container text-outline border border-outline-variant/30'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px]">{step.icon}</span>
                  </div>
                  {isDone ? (
                    <span title="Đã hoàn thành" className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-tertiary text-white rounded-full flex items-center justify-center shadow-xs ring-1 ring-surface-container-lowest">
                      <span className="material-symbols-outlined text-[9px] font-bold">check</span>
                    </span>
                  ) : isWaiting ? (
                    <span title="Chờ giáo viên" className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-secondary text-white rounded-full flex items-center justify-center shadow-xs ring-1 ring-surface-container-lowest">
                      <span className="material-symbols-outlined text-[9px] font-bold">hourglass_top</span>
                    </span>
                  ) : isCurrent ? (
                    <span title="Đang thực hiện" className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-primary text-white rounded-full flex items-center justify-center text-[9px] font-bold font-mono shadow-xs ring-1 ring-surface-container-lowest animate-pulse">
                      {step.stepNumber}
                    </span>
                  ) : (
                    <span title={`Bước ${step.stepNumber}`} className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-surface-container-high text-on-surface-variant/80 rounded-full flex items-center justify-center text-[9px] font-medium font-mono ring-1 ring-surface-container-lowest">
                      {step.stepNumber}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 whitespace-nowrap">
                  <span className="text-xs tracking-tight font-medium">
                    {step.stepNumber}. {step.label}
                  </span>
                  {isCurrent && (
                    <span className="text-[10px] bg-primary/10 text-primary font-bold px-1.5 py-0.5 rounded-full border border-primary/20">
                      Hiện tại
                    </span>
                  )}
                  {apiMode && serverState && !isCurrent && (
                    <span className="text-[10px] text-on-surface-variant">{STATE_LABEL[serverState]}</span>
                  )}
                </div>
              </Link>
              {idx < STEPS.length - 1 && (
                <div className="flex-1 flex items-center justify-center min-w-[20px] px-1 text-outline-variant/60">
                  <span className="material-symbols-outlined text-sm">trending_flat</span>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
