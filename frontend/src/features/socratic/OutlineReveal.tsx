'use client';

import { useEffect, useMemo, useState } from 'react';
import type { StyleTip } from './types';
import {
  REVEAL_POINT_MS,
  REVEAL_STEP_MS,
  hasSeenReveal,
  markRevealSeen,
  revealSteps,
} from './reveal';

export type RevealPhase = 'idle' | 'thinking' | 'revealing' | 'done';

interface RevealInput {
  /** `${userId}:${assignmentCode}`; null until both are known. */
  storageKey: string | null;
  /** The outline is on screen and no longer being generated. */
  ready: boolean;
  /** Generation failed or needs clarification: skip the sequence. */
  failed: boolean;
  totalPoints: number;
  personalized: boolean;
}

/**
 * Plays the drafting steps once per student and assignment, then lets the
 * outline appear point by point. There is deliberately no skip control.
 * While the outline is still being generated the last step keeps spinning.
 */
export function useOutlineReveal({ storageKey, ready, failed, totalPoints, personalized }: RevealInput) {
  const [phase, setPhase] = useState<RevealPhase>('idle');
  const [step, setStep] = useState(0);
  const [visiblePoints, setVisiblePoints] = useState(0);
  const steps = useMemo(() => revealSteps(personalized), [personalized]);

  useEffect(() => {
    if (!storageKey) return;
    setPhase(hasSeenReveal(storageKey) ? 'done' : 'thinking');
    setStep(0);
    setVisiblePoints(0);
  }, [storageKey]);

  useEffect(() => {
    if (phase !== 'thinking') return;
    if (failed) {
      setPhase('done');
      return;
    }
    if (step < steps.length - 1) {
      const timer = window.setTimeout(() => setStep((value) => value + 1), REVEAL_STEP_MS);
      return () => window.clearTimeout(timer);
    }
    if (!ready) return;
    const timer = window.setTimeout(() => setPhase('revealing'), REVEAL_STEP_MS);
    return () => window.clearTimeout(timer);
  }, [phase, step, steps.length, ready, failed]);

  useEffect(() => {
    if (phase !== 'revealing') return;
    if (visiblePoints >= totalPoints) {
      if (storageKey) markRevealSeen(storageKey);
      setPhase('done');
      return;
    }
    const timer = window.setTimeout(() => setVisiblePoints((value) => value + 1), REVEAL_POINT_MS);
    return () => window.clearTimeout(timer);
  }, [phase, visiblePoints, totalPoints, storageKey]);

  return { phase, step, steps, visiblePoints };
}

export function OutlineThinking({ steps, step }: { steps: string[]; step: number }) {
  return (
    <div className="mx-3.5 mt-3 p-4 rounded-xl border border-secondary/20 bg-secondary/5 space-y-3" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-xs font-bold text-on-surface">
        <span className="material-symbols-outlined text-[18px] text-secondary animate-pulse" aria-hidden="true">
          psychology
        </span>
        Trợ lý AI đang lập dàn ý cho em
      </div>
      <ol className="space-y-2">
        {steps.map((label, index) => {
          const done = index < step;
          const active = index === step;
          return (
            <li
              key={label}
              className={`flex items-center gap-2 text-[11px] transition-opacity duration-300 ${
                index > step ? 'opacity-40' : 'opacity-100'
              }`}
            >
              {done ? (
                <span className="material-symbols-outlined text-[15px] text-tertiary" aria-hidden="true">check_circle</span>
              ) : active ? (
                <span className="w-3.5 h-3.5 border-2 border-secondary border-t-transparent rounded-full animate-spin shrink-0" aria-hidden="true" />
              ) : (
                <span className="w-3.5 h-3.5 rounded-full border border-outline-variant shrink-0" aria-hidden="true" />
              )}
              <span className={active ? 'font-semibold text-on-surface' : 'text-on-surface-variant'}>
                {label}
                {active ? '…' : ''}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function StyleTipNote({ tip }: { tip: StyleTip }) {
  return (
    <div className="mt-1 ml-3 px-2.5 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-[11px] leading-relaxed text-on-surface">
      <span className="inline-flex items-center gap-1 mr-1.5 align-middle px-1.5 py-px rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 text-[10px] font-bold">
        <span className="material-symbols-outlined text-[12px]" aria-hidden="true">fingerprint</span>
        {tip.label}
      </span>
      {tip.text}
    </div>
  );
}
