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

/**
 * Five steps on one row at every width: below xl only the current step keeps its label,
 * the others shrink to numbered circles, so the current step is never scrolled out of view.
 */
export default function AssignmentWorkflowStepper({
  currentStep,
  assignmentId = '',
}: AssignmentWorkflowStepperProps) {
  const currentIdx = STEPS.findIndex((s) => s.id === currentStep);

  return (
    <nav
      aria-label="Các bước làm bài"
      className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2.5 sm:px-4"
    >
      <ol className="flex items-center gap-1.5 sm:gap-2">
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
              <li className={isCurrent ? 'min-w-0 shrink' : 'shrink-0'}>
                <Link
                  href={targetHref}
                  aria-current={isCurrent ? 'step' : undefined}
                  aria-label={`Bước ${step.stepNumber}: ${step.label}${isDone ? ' (đã xong)' : ''}`}
                  title={`Bước ${step.stepNumber}: ${step.label}`}
                  className={`flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors select-none ${
                    isCurrent ? 'text-on-surface' : 'text-on-surface-variant hover:bg-surface-container'
                  }`}
                >
                  <span
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold tabular-nums shrink-0 ${
                      isCurrent
                        ? 'bg-primary text-white'
                        : isDone
                          ? 'bg-tertiary-container/40 text-tertiary'
                          : 'border border-outline-variant text-on-surface-variant'
                    }`}
                  >
                    {isDone ? (
                      <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                        check
                      </span>
                    ) : (
                      step.stepNumber
                    )}
                  </span>
                  <span
                    className={`text-sm whitespace-nowrap ${
                      isCurrent ? 'hidden sm:inline font-semibold truncate' : 'hidden xl:inline'
                    }`}
                  >
                    {isCurrent ? `Bước ${step.stepNumber}: ${step.label}` : step.label}
                  </span>
                </Link>
              </li>
              {idx < STEPS.length - 1 && (
                <li
                  aria-hidden="true"
                  className={`h-px flex-1 min-w-3 ${idx < currentIdx ? 'bg-tertiary/50' : 'bg-outline-variant/60'}`}
                />
              )}
            </React.Fragment>
          );
        })}
      </ol>
      {currentIdx >= 0 ? (
        <p className="sm:hidden mt-2 px-1.5 text-sm font-semibold text-on-surface" aria-hidden="true">
          Bước {STEPS[currentIdx].stepNumber}/{STEPS.length}: {STEPS[currentIdx].label}
        </p>
      ) : null}
    </nav>
  );
}
