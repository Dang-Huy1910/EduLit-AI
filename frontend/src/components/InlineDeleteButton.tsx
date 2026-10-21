'use client';

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface InlineDeleteButtonProps {
  /** Accessible name of the confirmation trigger, e.g. "Xóa bài tập Khói nhà máy". */
  label: string;
  /** Material Symbols icon for the trigger. */
  icon?: string;
  title: string;
  description: string;
  /** This item is being deleted. */
  busy: boolean;
  /** Another delete is running. */
  disabled?: boolean;
  onConfirm: () => void | Promise<void>;
}

const POPOVER_WIDTH = 288;
const POPOVER_HEIGHT_GUESS = 180;
const GAP = 8;

interface Placement {
  top?: number;
  bottom?: number;
  right: number;
  above: boolean;
}

/**
 * Muted trash icon that asks for confirmation in a small popover instead of a
 * browser dialog. The popover is portaled to <body> so card transforms and
 * backdrop filters never hide it. Cancel has focus, so Enter never deletes by
 * accident.
 */
export default function InlineDeleteButton({
  label,
  icon = 'delete',
  title,
  description,
  busy,
  disabled = false,
  onConfirm,
}: InlineDeleteButtonProps) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const place = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const height = popoverRef.current?.offsetHeight || POPOVER_HEIGHT_GUESS;
    const above = rect.bottom + GAP + height > window.innerHeight && rect.top - GAP - height > 0;
    const right = Math.max(8, Math.min(window.innerWidth - rect.right, window.innerWidth - POPOVER_WIDTH - 8));
    setPlacement(
      above
        ? { bottom: window.innerHeight - rect.top + GAP, right, above }
        : { top: rect.bottom + GAP, right, above }
    );
  }, []);

  // Refine with the real popover height (flip above near the bottom edge).
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

  const confirm = async () => {
    await onConfirm();
    setOpen(false);
  };

  const caretSide = placement?.above
    ? '-bottom-1.5 [clip-path:polygon(100%_0,100%_100%,0_100%)]'
    : '-top-1.5 [clip-path:polygon(0_0,100%_0,0_100%)]';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={label}
        disabled={disabled && !busy}
        onClick={(event) => {
          event.stopPropagation();
          if (!open) place();
          setOpen(!open);
        }}
        className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error/40 disabled:opacity-40 disabled:cursor-not-allowed ${
          open ? 'text-error bg-error/10' : 'text-outline hover:text-error hover:bg-error/10'
        }`}
      >
        <span className="material-symbols-outlined text-[19px]" aria-hidden="true">
          {icon}
        </span>
      </button>

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label={title}
            onClick={(event) => event.stopPropagation()}
            style={{
              position: 'fixed',
              top: placement?.top,
              bottom: placement?.bottom,
              right: placement?.right ?? 8,
              width: POPOVER_WIDTH,
            }}
            className="z-[70] max-w-[calc(100vw-1rem)] rounded-2xl bg-surface-container-lowest p-4 shadow-[0_18px_40px_-12px_rgba(18,28,42,0.35)] ring-1 ring-black/5 text-left"
          >
            <span
              aria-hidden="true"
              className={`absolute right-3 w-3 h-3 rotate-45 bg-surface-container-lowest ring-1 ring-black/5 ${caretSide}`}
            />
            <div className="flex items-start gap-3">
              <span className="w-9 h-9 rounded-xl bg-error/10 text-error flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-xl" aria-hidden="true">
                  delete_forever
                </span>
              </span>
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-bold text-on-surface">{title}</p>
                <p className="text-xs text-on-surface-variant leading-relaxed">{description}</p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                ref={cancelRef}
                type="button"
                autoFocus
                onClick={() => setOpen(false)}
                disabled={busy}
                className="h-8 px-3 rounded-lg text-xs font-semibold text-on-surface-variant hover:bg-surface-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/40 transition-all disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => void confirm()}
                disabled={busy || disabled}
                className="h-8 px-3.5 rounded-lg bg-error text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm hover:brightness-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error/40 focus-visible:ring-offset-1 transition-all disabled:opacity-70 disabled:cursor-wait"
              >
                {busy ? (
                  <>
                    <span className="w-3 h-3 border-2 border-white/90 border-t-transparent rounded-full animate-spin" />
                    Đang xóa
                  </>
                ) : (
                  'Xóa'
                )}
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
