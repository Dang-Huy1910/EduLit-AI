'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import TeacherShell from '@/components/TeacherShell';
import { listTeacherAssignments, closeTeacherAssignment } from '@/lib/api/teacher-assignments';
import { ApiError, type ApiTeacherAssignment } from '@/lib/api/types';

const statusLabel: Record<ApiTeacherAssignment['status'], string> = { DRAFT: 'Bản nháp', PUBLISHED: 'Đang giao', CLOSED: 'Đã đóng' };

export default function ApiTeacherAssignmentsView() {
  const [rows, setRows] = useState<ApiTeacherAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = async () => {
    setLoading(true); setError(null);
    try { setRows(await listTeacherAssignments()); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : 'Không tải được danh sách đề.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const close = async (id: string) => {
    setBusy(id); setError(null);
    try { await closeTeacherAssignment(id); await load(); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : 'Không thể đóng đề.'); }
    finally { setBusy(null); }
  };
  return <TeacherShell>
    <main className="max-w-6xl mx-auto space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-semibold tracking-widest uppercase text-secondary">Đề và barem</p><h1 className="font-merriweather text-2xl font-bold text-on-surface">Bài tập của giáo viên</h1><p className="mt-1 text-sm text-on-surface-variant">Tạo bản nháp, rà rubric, công bố mã đề và theo dõi các mốc học sinh.</p></div>
        <Link href="/assignments/new" className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-container px-4 py-2.5 text-sm font-semibold text-on-primary-container transition-all duration-150 hover:brightness-95 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/50"><span className="material-symbols-outlined text-lg">add</span>Tạo đề mới</Link>
      </header>
      {error && <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-error/30 bg-error-container/40 p-3 text-sm text-error"><span>{error}</span><button className="font-semibold underline" onClick={() => void load()}>Thử lại</button></div>}
      {loading ? <Loading /> : rows.length === 0 ? <Empty /> : <section className="grid gap-4 md:grid-cols-2">
        {rows.map((row) => <article key={row.id} className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-sm transition-colors hover:border-outline-variant/70">
          <div className="flex items-start justify-between gap-3"><div><span className="font-mono text-xs font-semibold text-secondary">{row.code}</span><h2 className="mt-1 font-merriweather text-lg font-bold text-on-surface">{row.title}</h2></div><span className="rounded-full bg-surface-container px-2.5 py-1 text-xs font-semibold text-on-surface-variant">{statusLabel[row.status]}</span></div>
          <p className="mt-2 line-clamp-2 text-sm text-on-surface-variant">{row.instructions}</p>
          <dl className="mt-4 grid grid-cols-3 gap-2 rounded-lg bg-surface-container-low/50 p-3 text-xs"><div><dt className="text-outline">Đã đọc</dt><dd className="mt-0.5 font-semibold">{row.worklist?.read ?? 0}</dd></div><div><dt className="text-outline">Đã nộp</dt><dd className="mt-0.5 font-semibold">{row.worklist?.submitted ?? 0}</dd></div><div><dt className="text-outline">Đã công bố</dt><dd className="mt-0.5 font-semibold">{row.worklist?.published ?? 0}</dd></div></dl>
          <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-outline-variant/20 pt-4"><Link href={`/assignments/${row.id}`} className="rounded-lg border border-outline-variant/50 px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-surface-container">{row.status === 'DRAFT' ? 'Soạn đề' : 'Xem đề'}</Link>{row.status === 'PUBLISHED' && <button disabled={busy === row.id} onClick={() => void close(row.id)} className="rounded-lg border border-error/30 px-3 py-1.5 text-xs font-semibold text-error transition-colors hover:bg-error-container/30 disabled:opacity-40">{busy === row.id ? 'Đang đóng…' : 'Đóng đề'}</button>}</div>
        </article>)}
      </section>}
    </main>
  </TeacherShell>;
}

function Loading() { return <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-on-surface-variant"><span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent"/>Đang tải đề…</div>; }
function Empty() { return <div className="rounded-xl border border-dashed border-outline-variant/60 bg-surface-container-low/30 p-10 text-center"><span className="material-symbols-outlined text-3xl text-outline">assignment</span><p className="mt-2 font-semibold">Chưa có đề nào</p><p className="mt-1 text-sm text-on-surface-variant">Bắt đầu bằng một bản nháp có ngữ liệu và barem.</p></div>; }
