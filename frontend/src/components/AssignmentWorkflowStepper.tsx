'use client';

import React from 'react';
import Link from 'next/link';
export type WorkflowStepId = 'reading' | 'socratic' | 'submit' | 'ocr' | 'result';

interface StepConfig {
  id: WorkflowStepId;
  stepNumber: number;
  label: string;
  icon: string;
  href: string;
}

const STEPS: StepConfig[] = [
  {
    id: 'reading',
    stepNumber: 1,
    label: 'Đề bài & Ngữ liệu',
    icon: 'menu_book',
    href: '/materials',
  },
  {
    id: 'socratic',
    stepNumber: 2,
    label: 'Dàn ý Socratic',
    icon: 'psychology',
    href: '',
  },
  {
    id: 'submit',
    stepNumber: 3,
    label: 'Viết tay & Nộp ảnh',
    icon: 'photo_camera',
    href: '',
  },
  {
    id: 'ocr',
    stepNumber: 4,
    label: 'Kiểm tra OCR',
    icon: 'document_scanner',
    href: '',
  },
  {
    id: 'result',
    stepNumber: 5,
    label: 'Đánh giá Rubric',
    icon: 'verified',
    href: '',
  },
];

interface AssignmentWorkflowStepperProps {
  currentStep: WorkflowStepId;
  assignmentId?: string;
}

export default function AssignmentWorkflowStepper({
  currentStep,
  assignmentId = '',
}: AssignmentWorkflowStepperProps) {
  const currentIdx = STEPS.findIndex((s) => s.id === currentStep);

  return (
    <div className="w-full glass-panel rounded-2xl border border-white/60 shadow-sm p-3 sm:p-4 overflow-x-auto">
      <div className="flex items-center justify-between min-w-[820px] gap-2">
        {STEPS.map((step, idx) => {
          const isDone = idx < currentIdx;
          const isCurrent = idx === currentIdx;

          // Target URL
          const targetHref =
            step.id === 'reading'
              ? `/assignments/${assignmentId}/socratic`
              : `/assignments/${assignmentId}/${step.id}`;

          return (
            <React.Fragment key={step.id}>
              {/* Step Item */}
              <Link
                href={targetHref}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all shrink-0 select-none ${
                  isCurrent
                    ? 'bg-primary text-white font-bold shadow-sm ring-2 ring-primary/30 scale-[1.02]'
                    : isDone
                    ? 'text-tertiary hover:bg-surface-container font-medium'
                    : 'text-on-surface-variant/70 hover:bg-surface-container hover:text-on-surface font-medium'
                }`}
              >
                {/* Step Logo Box with Status Overlay */}
                <div className="relative shrink-0">
                  <div
                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition-all ${
                      isCurrent
                        ? 'bg-white/20 text-white shadow-xs ring-1 ring-white/40'
                        : isDone
                        ? 'bg-tertiary-container/40 text-tertiary border border-tertiary/30'
                        : 'bg-surface-container text-outline border border-outline-variant/30'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {step.icon}
                    </span>
                  </div>

                  {/* Corner Status Badge */}
                  {isDone ? (
                    <span
                      title="Đã hoàn thành"
                      className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-tertiary text-white rounded-full flex items-center justify-center shadow-xs ring-1 ring-white"
                    >
                      <span className="material-symbols-outlined text-[9px] font-bold">check</span>
                    </span>
                  ) : isCurrent ? (
                    <span
                      title="Đang thực hiện"
                      className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-white text-primary rounded-full flex items-center justify-center text-[9px] font-bold font-mono shadow-xs ring-1 ring-primary animate-pulse"
                    >
                      {step.stepNumber}
                    </span>
                  ) : (
                    <span
                      title={`Bước ${step.stepNumber}`}
                      className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-surface-container-high text-on-surface-variant/80 rounded-full flex items-center justify-center text-[9px] font-medium font-mono ring-1 ring-white"
                    >
                      {step.stepNumber}
                    </span>
                  )}
                </div>

                {/* Step Label */}
                <div className="flex items-center gap-1.5 whitespace-nowrap">
                  <span className="text-xs tracking-tight font-medium">
                    {step.stepNumber}. {step.label}
                  </span>
                  {isCurrent && (
                    <span className="text-[10px] bg-white/20 text-white font-bold px-1.5 py-0.2 rounded-full font-mono uppercase">
                      Đang ở đây
                    </span>
                  )}
                </div>
              </Link>

              {/* Connecting Divider Arrow */}
              {idx < STEPS.length - 1 && (
                <div className="flex-1 flex items-center justify-center min-w-[20px] px-1 text-outline-variant/60">
                  <div className="w-full h-[1px] bg-outline-variant/40 relative flex items-center justify-center">
                    <span className="material-symbols-outlined text-[12px] bg-surface-container-lowest px-0.5 text-outline">
                      chevron_right
                    </span>
                  </div>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
