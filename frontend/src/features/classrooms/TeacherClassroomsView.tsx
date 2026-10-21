'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import TeacherShell from '@/components/TeacherShell';
import { AuthApiError } from '@/lib/auth-types';
import { useAppStore } from '@/lib/store';
import { classroomsApi } from './api';
import { classroomLabel, termLabel } from './model';
import { useTeacherClassContext } from './useClassContext';

const FIELD_CLASS =
  'h-9 w-full rounded-lg border border-outline-variant/60 bg-surface-container-lowest px-3 text-sm text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40';

export default function TeacherClassroomsView() {
  const router = useRouter();
  const { addToast } = useAppStore();
  const [showArchived, setShowArchived] = useState(false);
  const { terms, term, classrooms, loading, error, setTerm, setClassroom, reload } = useTeacherClassContext({ includeArchived: showArchived });
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [code, setCode] = useState('');
  const [gradeLevel, setGradeLevel] = useState(10);
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('Ngữ văn');

  const visibleClassrooms = classrooms;

  const copyJoinCode = async (joinCode: string) => {
    try {
      await navigator.clipboard.writeText(joinCode);
      addToast('Đã sao chép mã tham gia.', 'success');
    } catch {
      addToast('Không thể sao chép mã. Hãy thử lại.', 'error');
    }
  };

  const openClassroom = (id: string) => {
    setClassroom(id);
    router.push(`/classrooms/${encodeURIComponent(id)}`);
  };

  const createClassroom = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!term) return;
    setCreating(true);
    setFormError('');
    setFields({});
    try {
      const created = await classroomsApi.createClassroom({
        termId: term.id,
        code: code.trim(),
        gradeLevel,
        name: name.trim() || undefined,
        subject: subject.trim() || undefined,
      });
      setClassroom(created.id);
      setCode('');
      setName('');
      setSubject('Ngữ văn');
      setShowForm(false);
      addToast(`Đã tạo lớp ${created.code}.`, 'success');
      reload();
    } catch (err) {
      if (err instanceof AuthApiError) {
        setFormError(err.message);
        setFields(err.fields || {});
      } else {
        setFormError('Không tạo được lớp. Hãy thử lại.');
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <TeacherShell>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="font-headline-lg text-2xl sm:text-3xl font-bold text-on-surface font-merriweather">Lớp học</h1>
            <p className="mt-1 text-sm text-on-surface-variant">Tổ chức lớp theo kỳ học, quản lý mã tham gia và danh sách học sinh.</p>
          </div>
          {term && term.status !== 'ENDED' && (
            <button
              type="button"
              onClick={() => setShowForm((value) => !value)}
              className="h-9 px-3.5 rounded-lg bg-primary text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-primary/90 active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              Tạo lớp
            </button>
          )}
        </div>

        <div className="glass-card rounded-xl border border-outline-variant/30 p-4 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <label className="text-sm space-y-1 min-w-0">
            <span className="block text-xs font-semibold text-on-surface-variant">Kỳ học</span>
            <select value={term?.id || ''} onChange={(event) => setTerm(event.target.value)} className={`${FIELD_CLASS} sm:w-72`}>
              {terms.map((item) => <option key={item.id} value={item.id}>{termLabel(item)}</option>)}
            </select>
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-on-surface-variant cursor-pointer select-none">
            <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} className="accent-primary" />
            Hiện lớp đã lưu trữ
          </label>
        </div>

        {showForm && term && (
          <form onSubmit={(event) => void createClassroom(event)} className="glass-panel rounded-2xl p-5 border border-primary/20 space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-primary-container/30 text-primary flex items-center justify-center"><span className="material-symbols-outlined">group_add</span></span>
              <div><h2 className="font-bold text-on-surface">Tạo lớp cho {termLabel(term)}</h2><p className="text-xs text-on-surface-variant">Mã lớp là thông tin bắt buộc.</p></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <label className="text-xs space-y-1"><span className="font-semibold">Mã lớp</span><input required value={code} onChange={(event) => setCode(event.target.value)} className={FIELD_CLASS} placeholder="12A14" />{fields.code && <span className="block text-error">{fields.code}</span>}</label>
              <label className="text-xs space-y-1"><span className="font-semibold">Khối</span><select value={gradeLevel} onChange={(event) => setGradeLevel(Number(event.target.value))} className={FIELD_CLASS}><option value={10}>10</option><option value={11}>11</option><option value={12}>12</option></select>{fields.gradeLevel && <span className="block text-error">{fields.gradeLevel}</span>}</label>
              <label className="text-xs space-y-1"><span className="font-semibold">Tên lớp <span className="font-normal text-outline">(tuỳ chọn)</span></span><input value={name} onChange={(event) => setName(event.target.value)} className={FIELD_CLASS} placeholder="Lớp 12A14" />{fields.name && <span className="block text-error">{fields.name}</span>}</label>
              <label className="text-xs space-y-1"><span className="font-semibold">Môn</span><input value={subject} onChange={(event) => setSubject(event.target.value)} className={FIELD_CLASS} />{fields.subject && <span className="block text-error">{fields.subject}</span>}</label>
            </div>
            {formError && <p className="text-sm text-error bg-error-container/30 rounded-lg px-3 py-2">{formError}</p>}
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setShowForm(false)} className="h-9 px-3 rounded-lg text-sm font-semibold text-on-surface-variant hover:bg-surface-container">Huỷ</button><button disabled={creating} className="h-9 px-3.5 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-40">{creating ? 'Đang tạo...' : 'Tạo lớp'}</button></div>
          </form>
        )}

        {error && <div className="rounded-xl bg-error-container/30 text-error text-sm p-4 flex justify-between gap-3"><span>{error}</span><button type="button" onClick={reload} className="font-semibold underline">Tải lại</button></div>}
        {loading ? (
          <div className="p-12 text-center text-sm text-on-surface-variant">Đang tải lớp học...</div>
        ) : visibleClassrooms.length === 0 ? (
          <div className="glass-panel rounded-2xl p-12 text-center max-w-lg mx-auto space-y-3"><span className="material-symbols-outlined text-4xl text-outline">groups</span><h2 className="font-merriweather font-bold text-on-surface">Chưa có lớp trong kỳ này</h2><p className="text-sm text-on-surface-variant">Tạo lớp để bắt đầu giao bài và mời học sinh bằng mã tham gia.</p></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {visibleClassrooms.map((item) => (
              <article key={item.id} role="link" tabIndex={0} onClick={() => openClassroom(item.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openClassroom(item.id); } }} className="glass-card rounded-2xl border border-outline-variant/30 p-5 cursor-pointer hover:border-primary/40 hover:bg-surface-container-low transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-mono font-bold text-secondary">{item.code}</p><h2 className="mt-1 text-lg font-bold font-merriweather text-on-surface">{item.name}</h2><p className="mt-1 text-sm text-on-surface-variant">{item.subject}</p></div><div className="flex flex-col items-end gap-1">{item.readOnly && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-800 dark:text-amber-300">Chỉ xem</span>}{item.archived && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant">Đã lưu trữ</span>}</div></div>
                <div className="mt-5 grid grid-cols-2 gap-3 text-xs"><div className="rounded-lg bg-surface-container-low p-3"><span className="block text-on-surface-variant">Học sinh</span><strong className="text-lg text-on-surface tabular-nums">{item.studentCount}</strong></div><div className="rounded-lg bg-surface-container-low p-3"><span className="block text-on-surface-variant">Mã tham gia</span><strong className="text-base tracking-wider font-mono text-on-surface">{item.joinCode}</strong></div></div>
                <div className="mt-4 flex items-center justify-between gap-2"><span className={`text-xs font-semibold flex items-center gap-1.5 ${item.joinEnabled ? 'text-tertiary' : 'text-on-surface-variant'}`}><span className={`w-1.5 h-1.5 rounded-full ${item.joinEnabled ? 'bg-tertiary' : 'bg-outline'}`} />{item.joinEnabled ? 'Đang mở mã' : 'Đã khoá mã'}</span><button type="button" onClick={(event) => { event.stopPropagation(); void copyJoinCode(item.joinCode); }} className="h-8 px-2.5 rounded-lg border border-outline-variant/50 text-xs font-semibold text-on-surface hover:bg-surface-container active:scale-[0.98]" aria-label={`Sao chép mã tham gia lớp ${classroomLabel(item)}`}><span className="material-symbols-outlined text-[15px] align-text-bottom mr-1">content_copy</span>Sao chép</button></div>
              </article>
            ))}
          </div>
        )}
      </div>
    </TeacherShell>
  );
}
