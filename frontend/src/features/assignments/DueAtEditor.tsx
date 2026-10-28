'use client';

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import LatePolicySelect from './LatePolicySelect';
import type { LatePolicy } from './deadline';

interface DueAtEditorProps {
  dueAt: string | null;
  /** Accessible name of the trigger, e.g. "Đổi hạn nộp bài Khói nhà máy". */
  label: string;
  busy: boolean;
  disabled?: boolean;
  /** Trigger content: the existing due-date badge. */
  children: React.ReactNode;
  triggerClassName: string;
  latePolicy?: LatePolicy;
  extension?: boolean;
  dialogLabel?: string;
  dialogTitle?: string;
  dialogHint?: string;
  clearLabel?: string;
  fieldLabel?: string;
  onSave: (dueAt: string | null, latePolicy?: LatePolicy) => Promise<boolean>;
}

const POPOVER_WIDTH = 304;
const POPOVER_HEIGHT_GUESS = 230;
const GAP = 8;
const QUICK_DAYS = [1, 3, 7];

interface Placement {
  top?: number;
  bottom?: number;
  left: number;
}

export function toDateTimeLocal(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Due-date badge that opens a small popover to extend or change the deadline,
 * also after the assignment is published. Portaled to <body> like
 * InlineDeleteButton so card transforms never clip it.
 */
export default function DueAtEditor({
  dueAt,
  label,
  busy,
  disabled = false,
  children,
  triggerClassName,
  onSave,
  latePolicy,
  extension = false,
  dialogLabel,
  dialogTitle,
  dialogHint,
  clearLabel,
  fieldLabel,
}: DueAtEditorProps) {
  const [open, setOpen] = useState(false);
  const [policy, setPolicy] = useState<LatePolicy>(latePolicy || 'ALLOW_LATE');
  const [value, setValue] = useState('');
  const [placement, setPlacement] = useState<Placement | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const height = popoverRef.current?.offsetHeight || POPOVER_HEIGHT_GUESS;
    const above = rect.bottom + GAP + height > window.innerHeight && rect.top - GAP - height > 0;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 8));
    setPlacement(above ? { bottom: window.innerHeight - rect.top + GAP, left } : { top: rect.bottom + GAP, left });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (busy || triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, busy, place]);

  const extendBy = (days: number) => {
    // Extend from the current deadline, or from now if it has already passed.
    const current = dueAt ? new Date(dueAt) : null;
    const base = current && !Number.isNaN(current.getTime()) && current.getTime() > Date.now() ? current : new Date();
    if (!current || current.getTime() <= Date.now()) base.setHours(23, 59, 0, 0);
    base.setDate(base.getDate() + days);
    setValue(toDateTimeLocal(base.toISOString()));
  };

  const save = async (next: string | null) => {
    if (await onSave(next, latePolicy ? policy : undefined)) setOpen(false);
  };

  const parsed = value ? new Date(value) : null;
  const invalid = Boolean(value) && (!parsed || Number.isNaN(parsed.getTime()));
  const unchanged = value === toDateTimeLocal(dueAt) && (!latePolicy || policy === latePolicy);
  const resolvedDialogLabel = dialogLabel || (extension ? 'Gia hạn cho học sinh' : 'Đổi hạn nộp');
  const resolvedTitle = dialogTitle || (extension ? 'Gia hạn cho học sinh' : 'Hạn nộp và chính sách');
  const resolvedHint = dialogHint || 'Học sinh thấy hạn mới ngay sau khi lưu.';
  const resolvedClear = clearLabel || (extension ? 'Gỡ gia hạn' : 'Bỏ hạn nộp');
  const resolvedField = fieldLabel || 'Hạn nộp mới';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={label}
        disabled={disabled || busy}
        onClick={(event) => {
          event.stopPropagation();
          if (!open) {
            setValue(toDateTimeLocal(dueAt));
            setPolicy(latePolicy || 'ALLOW_LATE');
            place();
          }
          setOpen(!open);
        }}
        className={`${triggerClassName} transition-all hover:ring-2 hover:ring-secondary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/40 disabled:cursor-not-allowed disabled:hover:ring-0`}
      >
        {children}
        {!disabled && (
          <span className="material-symbols-outlined text-[13px] opacity-70" aria-hidden="true">
            edit_calendar
          </span>
        )}
      </button>

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label={resolvedDialogLabel}
            onClick={(event) => event.stopPropagation()}
            style={{
              position: 'fixed',
              top: placement?.top,
              bottom: placement?.bottom,
              left: placement?.left ?? 8,
              width: POPOVER_WIDTH,
            }}
            className="z-[70] max-w-[calc(100vw-1rem)] rounded-2xl bg-surface-container-lowest p-4 shadow-[0_18px_40px_-12px_rgba(18,28,42,0.35)] ring-1 ring-black/5 text-left space-y-3"
          >
            <div>
              <p className="text-sm font-bold text-on-surface">{resolvedTitle}</p>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                {resolvedHint}
              </p>
            </div>
            <div className="flex gap-1.5">
              {QUICK_DAYS.map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => extendBy(days)}
                  disabled={busy}
                  className="flex-1 h-8 rounded-lg border border-outline-variant/50 text-xs font-semibold text-secondary hover:bg-secondary/5 transition-all disabled:opacity-50"
                >
                  +{days} ngày
                </button>
              ))}
            </div>
            <input
              type="datetime-local"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              disabled={busy}
              aria-label={resolvedField}
              className="w-full h-9 px-2.5 rounded-lg border border-outline-variant/60 bg-surface-container-lowest text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/30"
            />
            {latePolicy && <LatePolicySelect value={policy} onChange={setPolicy} disabled={busy} />}
            <div className="flex items-center justify-between gap-2">
              {dueAt ? (
                <button
                  type="button"
                  onClick={() => void save(null)}
                  disabled={busy}
                  className="text-xs font-semibold text-on-surface-variant hover:text-error hover:underline disabled:opacity-50"
                >
                  {resolvedClear}
                </button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={busy}
                  className="h-8 px-3 rounded-lg text-xs font-semibold text-on-surface-variant hover:bg-surface-container transition-all disabled:opacity-50"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={() => void save(value === toDateTimeLocal(dueAt) ? dueAt : parsed ? parsed.toISOString() : null)}
                  disabled={busy || invalid || unchanged || (!value && !dueAt && !latePolicy)}
                  className="h-8 px-3.5 rounded-lg bg-primary text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {busy ? (
                    <>
                      <span className="w-3 h-3 border-2 border-white/90 border-t-transparent rounded-full animate-spin" />
                      Đang lưu
                    </>
                  ) : (
                    'Lưu hạn mới'
                  )}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
