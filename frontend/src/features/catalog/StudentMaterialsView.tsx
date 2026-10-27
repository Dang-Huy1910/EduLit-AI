'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AuthApiError } from '@/lib/auth-types';
import { studentMaterialsApi } from './api';
import { PreviewLabel } from './PreviewBlocks';
import type { StudentMaterial } from './types';

type GenreFilter = 'all' | 'NLVH' | 'NLXH';

const GENRE_LABELS: Record<string, string> = {
  NLVH: 'Nghị luận văn học',
  NLXH: 'Nghị luận xã hội',
};

// The first size matches the teacher catalog preview; A−/A+ step around it.
const READING_SIZES = ['text-[13.5px]', 'text-[15px]', 'text-[17px]'] as const;

const NO_TOPIC = 'Chưa gắn chuyên đề';

const FIELD_CLASS =
  'h-9 px-2.5 text-sm rounded-lg border border-outline-variant/60 bg-surface-container-lowest text-on-surface';

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof AuthApiError ? err.message : fallback;
}

export default function StudentMaterialsView() {
  const [items, setItems] = useState<StudentMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [genre, setGenre] = useState<GenreFilter>('all');
  const [grade, setGrade] = useState('all');
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<StudentMaterial | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [detailNonce, setDetailNonce] = useState(0);
  const [readingSize, setReadingSize] = useState(1);
  const readerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await studentMaterialsApi.list();
      setItems(res.items);
    } catch (err) {
      setItems([]);
      setError(errorText(err, 'Không tải được ngữ liệu. Em thử lại nhé.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const grades = useMemo(
    () => Array.from(new Set(items.map((item) => item.gradeLevel))).sort((a, b) => a - b),
    [items]
  );
  const hasGenres = items.some((item) => item.genre);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('vi');
    return items.filter((item) => {
      if (genre !== 'all' && item.genre !== genre) return false;
      if (grade !== 'all' && String(item.gradeLevel) !== grade) return false;
      if (!needle) return true;
      return [item.title, item.author, item.topicTitle || '', item.excerpt]
        .some((text) => text.toLocaleLowerCase('vi').includes(needle));
    });
  }, [items, query, genre, grade]);

  // Group by topic like the teacher catalog groups by kind; one group shows no header.
  const groups = useMemo(() => {
    const byTopic = new Map<string, StudentMaterial[]>();
    for (const item of filtered) {
      const key = item.topicTitle || NO_TOPIC;
      byTopic.set(key, [...(byTopic.get(key) || []), item]);
    }
    return Array.from(byTopic, ([label, groupItems]) => ({ label, items: groupItems })).sort((a, b) =>
      a.label === NO_TOPIC ? 1 : b.label === NO_TOPIC ? -1 : a.label.localeCompare(b.label, 'vi')
    );
  }, [filtered]);
  const showGroups = groups.length > 1;
  const hasActiveFilters = Boolean(query.trim()) || genre !== 'all' || grade !== 'all';

  const selected = filtered.find((item) => item.id === selectedId) || filtered[0] || null;
  const visibleMaterialId = selected?.id;

  useEffect(() => {
    setDetail(null);
    setDetailError('');
    if (!visibleMaterialId) {
      setDetailLoading(false);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    void studentMaterialsApi
      .get(visibleMaterialId)
      .then((full) => {
        if (!cancelled) setDetail(full);
      })
      .catch((err) => {
        if (!cancelled) setDetailError(errorText(err, 'Không tải được nội dung ngữ liệu.'));
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visibleMaterialId, detailNonce]);

  const choose = (id: string) => {
    setSelectedId(id);
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      window.setTimeout(() => readerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    }
  };

  const resetFilters = () => {
    setQuery('');
    setGenre('all');
    setGrade('all');
  };

  const shown = detail && selected && detail.id === selected.id ? detail : null;

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-headline-lg text-2xl sm:text-3xl font-bold text-on-surface font-merriweather">
            Tra cứu ngữ liệu đọc hiểu
          </h1>
          <p className="text-xs sm:text-sm text-on-surface-variant mt-1">
            Ngữ liệu do giáo viên lớp em đưa lên kho học liệu. Em đọc để chuẩn bị bài; nội dung chỉ để xem, không chỉnh
            sửa hay tạo đề.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 self-start sm:self-auto shrink-0 px-3 py-1.5 rounded-lg bg-surface-container text-on-surface-variant text-xs font-semibold border border-outline-variant/40">
          <span className="material-symbols-outlined text-[16px]" aria-hidden="true">visibility</span>
          Chỉ xem
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-outline text-[18px] pointer-events-none">
            search
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Tìm ngữ liệu"
            placeholder="Tìm theo tên, tác giả, chuyên đề..."
            className="w-full h-9 pl-9 pr-3 text-sm rounded-lg border border-outline-variant/60 bg-surface-container-lowest text-on-surface focus:outline-none focus:border-secondary"
          />
        </div>
        {hasGenres && (
          <select
            value={genre}
            onChange={(e) => setGenre(e.target.value as GenreFilter)}
            aria-label="Dạng bài"
            className={FIELD_CLASS}
          >
            <option value="all">Tất cả dạng bài</option>
            <option value="NLVH">{GENRE_LABELS.NLVH}</option>
            <option value="NLXH">{GENRE_LABELS.NLXH}</option>
          </select>
        )}
        {grades.length > 1 && (
          <select value={grade} onChange={(e) => setGrade(e.target.value)} aria-label="Khối lớp" className={FIELD_CLASS}>
            <option value="all">Tất cả khối</option>
            {grades.map((value) => (
              <option key={value} value={String(value)}>
                Khối {value}
              </option>
            ))}
          </select>
        )}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="h-9 px-2 text-xs font-semibold text-secondary hover:underline"
          >
            Xoá lọc
          </button>
        )}
      </div>

      {loading ? (
        <div className="p-12 text-center text-sm text-on-surface-variant">Đang tải ngữ liệu...</div>
      ) : error ? (
        <div className="p-3 bg-error-container/50 text-error text-sm rounded-lg flex items-center justify-between gap-2">
          <span>{error}</span>
          <button type="button" className="text-xs font-semibold" onClick={() => void load()}>
            Thử lại
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="p-12 text-center text-sm text-on-surface-variant">
          Giáo viên lớp em chưa đưa ngữ liệu nào lên kho, hoặc em chưa được thêm vào lớp. Khi có ngữ liệu, em sẽ thấy ở
          đây.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-6 items-start">
          <section
            aria-label="Danh sách ngữ liệu"
            className="flex flex-col rounded-xl border border-outline-variant/40 bg-surface-container-lowest overflow-hidden max-h-[60vh] lg:max-h-[calc(100dvh-6.5rem)] lg:sticky lg:top-20"
          >
            <div className="px-4 py-2.5 border-b border-outline-variant/30 text-xs text-on-surface-variant">
              <strong className="font-semibold text-on-surface tabular-nums">{filtered.length}</strong> ngữ liệu
              {hasActiveFilters ? ' khớp bộ lọc' : ''}
            </div>
            <div className="relative flex-1 min-h-0 overflow-y-auto overscroll-contain">
              {filtered.length === 0 ? (
                <p className="p-8 text-center text-sm text-on-surface-variant">
                  Không tìm thấy ngữ liệu phù hợp. Em thử từ khóa khác hoặc bỏ bộ lọc.
                </p>
              ) : (
                groups.map((group) => (
                  <div key={group.label} role={showGroups ? 'group' : undefined} aria-label={showGroups ? group.label : undefined}>
                    {showGroups && (
                      <p className="sticky top-0 z-20 h-8 px-4 flex items-center gap-1.5 bg-surface-container-low border-b border-outline-variant/30 text-xs font-semibold text-on-surface-variant">
                        <span className="truncate">{group.label}</span>
                        <span className="font-normal tabular-nums">{group.items.length}</span>
                      </p>
                    )}
                    <ul>
                      {group.items.map((item) => {
                        const isSelected = selected?.id === item.id;
                        return (
                          <li
                            key={item.id}
                            className={`relative flex items-start gap-3 px-4 py-3 border-b border-outline-variant/20 last:border-b-0 transition-colors ${
                              isSelected ? 'bg-surface-container-low' : 'hover:bg-surface-container-low/60'
                            }`}
                          >
                            {isSelected && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-primary" />}
                            <span aria-hidden="true" className="material-symbols-outlined text-[20px] mt-0.5 shrink-0 text-on-surface-variant">
                              menu_book
                            </span>
                            <button
                              type="button"
                              onClick={() => choose(item.id)}
                              aria-current={isSelected ? 'true' : undefined}
                              className="flex-1 min-w-0 text-left after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-secondary"
                            >
                              <span className="block text-sm font-semibold text-on-surface leading-snug line-clamp-2">
                                {item.title}
                              </span>
                              <span className="mt-0.5 block truncate text-xs text-on-surface-variant">
                                {item.author || 'Chưa có tác giả'} · Khối {item.gradeLevel}
                              </span>
                            </button>
                            {item.genre && (
                              <span className="relative z-10 shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-secondary-fixed/60 text-secondary">
                                {item.genre}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </section>

          <div
            ref={readerRef}
            className="scroll-mt-20 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6.5rem)] lg:overflow-y-auto overscroll-contain rounded-xl"
          >
            {selected && (
              <div className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 sm:p-7 space-y-6 shadow-sm">
                <div className="flex items-start justify-between gap-4 pb-5 border-b border-outline-variant/20">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant">
                        Ngữ liệu
                      </span>
                      <span className="text-xs text-on-surface-variant font-medium">Khối {selected.gradeLevel}</span>
                    </div>
                    <h2 className="font-headline-md text-xl sm:text-2xl font-bold text-on-surface font-merriweather leading-snug">
                      {selected.title}
                    </h2>
                    <p className="text-xs text-on-surface-variant mt-1">
                      {[
                        selected.author || 'Chưa có tác giả',
                        selected.topicTitle,
                        selected.genre ? GENRE_LABELS[selected.genre] || selected.genre : null,
                        formatDate(selected.updatedAt) ? `Cập nhật ${formatDate(selected.updatedAt)}` : null,
                      ]
                        .filter(Boolean)
                        .join(' • ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0" role="group" aria-label="Cỡ chữ đọc">
                    <button
                      type="button"
                      onClick={() => setReadingSize((size) => Math.max(0, size - 1))}
                      disabled={readingSize === 0}
                      aria-label="Giảm cỡ chữ"
                      className="w-8 h-8 rounded-lg border border-outline-variant/50 text-xs font-bold text-on-surface-variant hover:bg-surface-container disabled:opacity-40"
                    >
                      A−
                    </button>
                    <button
                      type="button"
                      onClick={() => setReadingSize((size) => Math.min(READING_SIZES.length - 1, size + 1))}
                      disabled={readingSize === READING_SIZES.length - 1}
                      aria-label="Tăng cỡ chữ"
                      className="w-8 h-8 rounded-lg border border-outline-variant/50 text-sm font-bold text-on-surface-variant hover:bg-surface-container disabled:opacity-40"
                    >
                      A+
                    </button>
                  </div>
                </div>

                {detailLoading && <p className="text-sm text-on-surface-variant">Đang tải nội dung ngữ liệu...</p>}
                {detailError && (
                  <div className="p-3 bg-error-container/50 text-error text-sm rounded-lg flex items-center justify-between gap-2">
                    <span>{detailError}</span>
                    <button
                      type="button"
                      className="text-xs font-semibold"
                      onClick={() => setDetailNonce((value) => value + 1)}
                    >
                      Thử lại
                    </button>
                  </div>
                )}

                {shown && (
                  <>
                    <div className="space-y-2.5">
                      <PreviewLabel icon="auto_stories">Nội dung ngữ liệu</PreviewLabel>
                      <div className="relative px-5 sm:px-6 py-5 rounded-xl bg-[#fffcf7] border border-outline-variant/40">
                        <span aria-hidden="true" className="absolute left-0 top-4 bottom-4 w-1 rounded-full bg-primary/60" />
                        <span
                          aria-hidden="true"
                          className="absolute right-4 top-1 font-merriweather text-6xl leading-none text-primary-fixed-dim/50 select-none"
                        >
                          &rdquo;
                        </span>
                        <pre
                          className={`relative whitespace-pre-wrap font-merriweather leading-[1.9] text-on-surface ${READING_SIZES[readingSize]}`}
                        >
                          {shown.content || 'Ngữ liệu này chưa có nội dung văn bản.'}
                        </pre>
                      </div>
                    </div>

                    {(shown.sourceInfo || (shown.sourceNotes && shown.sourceNotes.length > 0)) && (
                      <div className="space-y-1.5">
                        <PreviewLabel icon="bookmark">Nguồn ngữ liệu</PreviewLabel>
                        {shown.sourceInfo && (
                          <p className="text-sm leading-relaxed text-on-surface-variant whitespace-pre-line">{shown.sourceInfo}</p>
                        )}
                        {shown.sourceNotes && shown.sourceNotes.length > 0 && (
                          <ul className="list-disc pl-5 space-y-1 text-sm leading-relaxed text-on-surface-variant">
                            {shown.sourceNotes.map((note, index) => (
                              <li key={index}>{note}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
