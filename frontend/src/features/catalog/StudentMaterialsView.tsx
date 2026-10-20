'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AuthApiError } from '@/lib/auth-types';
import { studentMaterialsApi } from './api';
import type { StudentMaterial } from './types';

type GenreFilter = 'all' | 'NLVH' | 'NLXH';

const GENRE_LABELS: Record<string, string> = {
  NLVH: 'Nghị luận văn học',
  NLXH: 'Nghị luận xã hội',
};

const READING_SIZES = ['text-sm', 'text-base', 'text-lg'] as const;

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof AuthApiError ? err.message : fallback;
}

/** Split stored plain text into paragraphs without interpreting any markup. */
function paragraphs(content: string): string[] {
  return content
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
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

  const selected = filtered.find((item) => item.id === selectedId) || filtered[0] || null;

  useEffect(() => {
    setDetail(null);
    setDetailError('');
    if (!selected) {
      setDetailLoading(false);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    void studentMaterialsApi
      .get(selected.id)
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
  }, [selected?.id, detailNonce]);

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
    <div className="max-w-7xl mx-auto space-y-5 pb-10">
      {/* Header */}
      <div className="glass-panel relative overflow-hidden rounded-3xl p-6 sm:p-7 shadow-sm">
        <div className="absolute -top-16 -right-10 w-64 h-64 bg-secondary/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-secondary to-primary text-white flex items-center justify-center shadow-md shrink-0">
              <span className="material-symbols-outlined text-2xl">menu_book</span>
            </div>
            <div className="space-y-1">
              <h1 className="text-xl sm:text-2xl font-bold font-merriweather text-on-surface">
                Tra cứu ngữ liệu đọc hiểu
              </h1>
              <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed max-w-2xl">
                Ngữ liệu do giáo viên lớp em đưa lên kho học liệu. Em đọc để chuẩn bị bài; nội dung chỉ để xem,
                không chỉnh sửa hay tạo đề.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 self-start md:self-auto px-3 py-1 rounded-full bg-surface-container text-on-surface-variant text-xs font-semibold border border-outline-variant/40">
            <span className="material-symbols-outlined text-sm">visibility</span>
            Chế độ chỉ xem
          </span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="glass-panel p-3.5 sm:p-4 rounded-2xl shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-72">
            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-outline text-base">
              search
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Tìm ngữ liệu"
              placeholder="Tìm theo tên, tác giả, chuyên đề..."
              className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-outline-variant/60 bg-surface text-on-surface focus:outline-none focus:border-secondary"
            />
          </div>
          {hasGenres && (
            <div className="flex items-center bg-surface-container-low/70 p-1 rounded-xl border border-outline-variant/30 text-xs">
              {(['all', 'NLVH', 'NLXH'] as GenreFilter[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={genre === value}
                  onClick={() => setGenre(value)}
                  className={`px-3 py-1 rounded-lg font-medium transition-all ${
                    genre === value
                      ? 'bg-surface-container-lowest text-primary font-bold shadow-xs'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {value === 'all' ? 'Tất cả' : GENRE_LABELS[value]}
                </button>
              ))}
            </div>
          )}
          {grades.length > 1 && (
            <select
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              aria-label="Lọc theo khối"
              className="px-2.5 py-2 text-xs rounded-xl border border-outline-variant/60 bg-surface"
            >
              <option value="all">Tất cả khối</option>
              {grades.map((value) => (
                <option key={value} value={String(value)}>
                  Khối {value}
                </option>
              ))}
            </select>
          )}
        </div>
        {!loading && !error && (
          <span className="text-xs text-on-surface-variant">
            <strong>{filtered.length}</strong> / {items.length} ngữ liệu
          </span>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 animate-pulse" aria-busy="true">
          <div className="lg:col-span-5 space-y-3">
            {[0, 1, 2].map((key) => (
              <div key={key} className="h-28 rounded-2xl bg-surface-container" />
            ))}
          </div>
          <div className="lg:col-span-7 h-96 rounded-2xl bg-surface-container" />
        </div>
      ) : error ? (
        <StateCard
          icon="cloud_off"
          title="Không tải được ngữ liệu"
          body={error}
          action={
            <button
              type="button"
              onClick={() => void load()}
              className="px-4 py-1.5 bg-secondary text-white text-xs font-semibold rounded-xl hover:bg-secondary/90 shadow-sm"
            >
              Thử lại
            </button>
          }
        />
      ) : items.length === 0 ? (
        <StateCard
          icon="local_library"
          title="Chưa có ngữ liệu để xem"
          body="Giáo viên lớp em chưa đưa ngữ liệu nào lên kho, hoặc em chưa được thêm vào lớp. Khi có ngữ liệu, em sẽ thấy ở đây."
        />
      ) : filtered.length === 0 ? (
        <StateCard
          icon="search_off"
          title="Không tìm thấy ngữ liệu phù hợp"
          body="Em thử từ khóa khác hoặc bỏ bộ lọc."
          action={
            <button
              type="button"
              onClick={resetFilters}
              className="px-4 py-1.5 bg-secondary text-white text-xs font-semibold rounded-xl hover:bg-secondary/90 shadow-sm"
            >
              Bỏ bộ lọc
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* List */}
          <div className="lg:col-span-5 space-y-3 lg:max-h-[calc(100vh-260px)] lg:overflow-y-auto lg:pr-1 scrollbar-thin">
            {filtered.map((item) => {
              const active = selected?.id === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => choose(item.id)}
                  className={`w-full text-left p-4 rounded-2xl border transition-all glass-card ${
                    active
                      ? 'border-secondary shadow-md ring-2 ring-secondary/25'
                      : 'border-outline-variant/30 hover:border-secondary/40 shadow-xs'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-1.5 mb-2">
                    {item.genre && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-secondary bg-secondary-fixed/40 px-2 py-0.5 rounded-md">
                        {item.genre}
                      </span>
                    )}
                    <span className="text-[10px] font-semibold text-on-surface-variant bg-surface-container px-2 py-0.5 rounded-md">
                      Khối {item.gradeLevel}
                    </span>
                    {item.topicTitle && (
                      <span className="text-[10px] text-on-surface-variant truncate max-w-[60%]">{item.topicTitle}</span>
                    )}
                  </div>
                  <h3 className="text-sm font-bold text-on-surface font-merriweather line-clamp-2">{item.title}</h3>
                  {item.author && <p className="text-[11px] text-on-surface-variant mt-0.5">{item.author}</p>}
                  {item.excerpt && (
                    <p className="text-xs text-on-surface-variant leading-relaxed mt-2 line-clamp-3">{item.excerpt}</p>
                  )}
                </button>
              );
            })}
          </div>

          {/* Reader */}
          <div
            ref={readerRef}
            className="lg:col-span-7 glass-panel rounded-2xl shadow-sm overflow-hidden lg:sticky lg:top-4 scroll-mt-20"
          >
            {selected && (
              <>
                <div className="p-5 sm:p-6 border-b border-outline-variant/20 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <h2 className="text-lg sm:text-xl font-bold font-merriweather text-on-surface leading-snug">
                        {selected.title}
                      </h2>
                      {selected.author && (
                        <p className="text-sm text-on-surface-variant">{selected.author}</p>
                      )}
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
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-on-surface-variant">
                    {selected.topicTitle && (
                      <span className="inline-flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs">folder</span>
                        {selected.topicTitle}
                      </span>
                    )}
                    {selected.genre && <span>{GENRE_LABELS[selected.genre] || selected.genre}</span>}
                    <span>Khối {selected.gradeLevel}</span>
                    {formatDate(selected.updatedAt) && <span>Cập nhật {formatDate(selected.updatedAt)}</span>}
                  </div>
                </div>

                <div className="p-5 sm:p-7 lg:max-h-[calc(100vh-380px)] overflow-y-auto scrollbar-thin">
                  {detailLoading ? (
                    <div className="space-y-3 animate-pulse" aria-busy="true">
                      {[0, 1, 2, 3, 4].map((key) => (
                        <div key={key} className="h-4 rounded bg-surface-container" style={{ width: `${92 - key * 9}%` }} />
                      ))}
                    </div>
                  ) : detailError ? (
                    <div className="text-sm text-error flex flex-col items-start gap-3">
                      <p>{detailError}</p>
                      <button
                        type="button"
                        onClick={() => setDetailNonce((value) => value + 1)}
                        className="px-3 py-1.5 rounded-xl border border-error/40 text-xs font-semibold hover:bg-error/5"
                      >
                        Thử lại
                      </button>
                    </div>
                  ) : shown ? (
                    <article className="space-y-6">
                      <div
                        className={`font-merriweather text-on-surface leading-loose space-y-4 ${READING_SIZES[readingSize]}`}
                      >
                        {paragraphs(shown.content || '').map((block, index) => (
                          <p key={index} className="whitespace-pre-line">
                            {block}
                          </p>
                        ))}
                        {!shown.content && (
                          <p className="text-sm text-on-surface-variant">Ngữ liệu này chưa có nội dung văn bản.</p>
                        )}
                      </div>

                      {(shown.sourceInfo || (shown.sourceNotes && shown.sourceNotes.length > 0)) && (
                        <div className="p-4 rounded-xl bg-surface-container-low/60 border border-outline-variant/30 space-y-2 text-xs text-on-surface-variant">
                          <p className="font-bold text-on-surface flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-sm text-secondary">bookmark</span>
                            Nguồn ngữ liệu
                          </p>
                          {shown.sourceInfo && <p className="leading-relaxed whitespace-pre-line">{shown.sourceInfo}</p>}
                          {shown.sourceNotes && shown.sourceNotes.length > 0 && (
                            <ul className="list-disc pl-5 space-y-1">
                              {shown.sourceNotes.map((note, index) => (
                                <li key={index} className="leading-relaxed">
                                  {note}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </article>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StateCard({
  icon,
  title,
  body,
  action,
}: {
  icon: string;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="glass-panel p-10 rounded-2xl shadow-xs text-center flex flex-col items-center gap-3">
      <div className="w-12 h-12 rounded-2xl bg-secondary/10 text-secondary flex items-center justify-center">
        <span className="material-symbols-outlined text-2xl">{icon}</span>
      </div>
      <p className="text-sm font-bold font-merriweather text-on-surface">{title}</p>
      <p className="text-xs text-on-surface-variant leading-relaxed max-w-md">{body}</p>
      {action}
    </div>
  );
}
