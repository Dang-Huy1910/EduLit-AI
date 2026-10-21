'use client';

import React, { useState } from 'react';
import type { CatalogMaterial } from './types';

/** Small uppercase caption with an icon, used above each block of a prompt preview. */
export function PreviewLabel({ icon, children, aside }: { icon: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5">
        <span className="material-symbols-outlined text-[16px] text-primary" aria-hidden="true">
          {icon}
        </span>
        {children}
      </span>
      {aside}
    </div>
  );
}

/** The writing task shown as a quoted callout so it stands apart from metadata. */
export function WritingTaskCallout({ label, text, icon = 'edit_note' }: { label: string; text: string; icon?: string }) {
  return (
    <div className="space-y-2">
      <PreviewLabel icon={icon}>{label}</PreviewLabel>
      <div className="relative pl-4 pr-4 py-3.5 rounded-xl bg-primary-fixed/25 border border-primary-fixed-dim/40">
        <span aria-hidden="true" className="absolute left-0 top-3 bottom-3 w-1 rounded-full bg-primary/70" />
        <p className="text-sm leading-relaxed text-on-surface whitespace-pre-line">{text}</p>
      </div>
    </div>
  );
}

/** Secondary note (summary, guidance) rendered lighter than the writing task. */
export function PreviewNote({ icon, label, text }: { icon: string; label: string; text: string }) {
  return (
    <div className="space-y-1.5">
      <PreviewLabel icon={icon}>{label}</PreviewLabel>
      <p className="text-sm leading-relaxed text-on-surface-variant whitespace-pre-line">{text}</p>
    </div>
  );
}

const COLLAPSE_AT = 900;

/**
 * A literary passage on a paper-like card. Long texts collapse behind a fade
 * unless `expanded` is forced by the caller.
 */
export function MaterialPassage({
  material,
  expanded,
  index,
}: {
  material: Pick<CatalogMaterial, 'id' | 'title' | 'author' | 'sourceInfo' | 'content' | 'excerpt'>;
  expanded?: boolean;
  index?: number;
}) {
  const [open, setOpen] = useState(false);
  const text = material.content || material.excerpt || '';
  const collapsible = expanded === undefined && text.length > COLLAPSE_AT;
  const showAll = expanded ?? (open || !collapsible);

  return (
    <article className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest overflow-hidden">
      <header className="flex items-start gap-3 px-4 py-3 bg-surface-container-low/60 border-b border-outline-variant/30">
        <span className="w-8 h-8 rounded-lg bg-secondary-fixed/60 text-secondary flex items-center justify-center shrink-0">
          {index !== undefined ? (
            <span className="text-xs font-bold font-mono">{index + 1}</span>
          ) : (
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">auto_stories</span>
          )}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-on-surface font-merriweather leading-snug">{material.title}</p>
          <p className="text-[11px] text-on-surface-variant mt-0.5 leading-relaxed">
            {material.author && <span className="font-semibold text-on-surface">{material.author}</span>}
            {material.author && ' · '}
            {material.sourceInfo || 'Chưa có thông tin nguồn'}
          </p>
        </div>
      </header>
      {text ? (
        <div className="relative">
          <div
            className={`relative px-5 sm:px-6 py-5 bg-[#fffcf7] ${showAll ? '' : 'max-h-72 overflow-hidden'}`}
          >
            <span
              aria-hidden="true"
              className="absolute right-4 top-1 font-merriweather text-6xl leading-none text-primary-fixed-dim/50 select-none"
            >
              &rdquo;
            </span>
            <pre className="relative whitespace-pre-wrap font-merriweather text-[13.5px] leading-[1.9] text-on-surface">
              {text}
            </pre>
          </div>
          {!showAll && (
            <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#fffcf7] to-transparent pointer-events-none" />
          )}
        </div>
      ) : (
        <p className="px-5 py-4 text-xs text-on-surface-variant">Chưa có nội dung.</p>
      )}
      {collapsible && (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="w-full px-4 py-2 border-t border-outline-variant/30 text-xs font-semibold text-secondary hover:bg-surface-container-low flex items-center justify-center gap-1"
        >
          {open ? 'Thu gọn' : 'Xem toàn văn'}
          <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
            {open ? 'expand_less' : 'expand_more'}
          </span>
        </button>
      )}
    </article>
  );
}
