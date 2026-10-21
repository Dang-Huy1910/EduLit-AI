'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import TeacherShell from '@/components/TeacherShell';
import InlineDeleteButton from '@/components/InlineDeleteButton';
import { AuthApiError } from '@/lib/auth-types';
import { useAppStore } from '@/lib/store';
import type { ClassroomDetail } from '@/features/catalog/types';
import { classroomsApi } from './api';
import { termLabel } from './model';
import { useTeacherClassContext } from './useClassContext';

const INPUT_CLASS = 'h-9 w-full rounded-lg border border-outline-variant/60 bg-surface-container-lowest px-3 text-sm text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-60';

function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('vi-VN');
}

export default function TeacherClassroomDetailView() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';
  const { addToast } = useAppStore();
  const { term, select, reload } = useTeacherClassContext();
  const [detail, setDetail] = useState<ClassroomDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [gradeLevel, setGradeLevel] = useState(10);
  const [saving, setSaving] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [removingId, setRemovingId] = useState('');

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const next = await classroomsApi.getClassroom(id);
      setDetail(next);
      setName(next.name);
      setCode(next.code);
      setGradeLevel(next.gradeLevel);
      if (!next.archived) select(next.termId, next.id);
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : 'Không tải được thông tin lớp.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const copy = async () => {
    if (!detail) return;
    try {
      await navigator.clipboard.writeText(detail.joinCode);
      addToast('Đã sao chép mã tham gia.', 'success');
    } catch {
      addToast('Không thể sao chép mã. Hãy thử lại.', 'error');
    }
  };

  const copyInvitation = async () => {
    if (!detail) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/classrooms?join=${detail.joinCode}`);
      addToast('Đã sao chép link mời.', 'success');
    } catch {
      addToast('Không thể sao chép link mời. Hãy thử lại.', 'error');
    }
  };

  const apply = async (body: Parameters<typeof classroomsApi.updateClassroom>[1], success: string) => {
    if (!detail) return null;
    setSaving(true);
    try {
      const updated = await classroomsApi.updateClassroom(detail.id, body);
      setDetail((current) => current ? { ...current, ...updated } : current);
      addToast(success, 'success');
      reload();
      return updated;
    } catch (err) {
      addToast(err instanceof AuthApiError ? err.message : 'Không thể cập nhật lớp.', 'error');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const saveBasics = async () => {
    const updated = await apply({ name: name.trim(), code: code.trim(), gradeLevel }, 'Đã cập nhật thông tin lớp.');
    if (updated) setEditing(false);
  };

  const rotate = async () => {
    if (!detail) return;
    setRotating(true);
    try {
      const updated = await classroomsApi.rotateJoinCode(detail.id);
      setDetail((current) => current ? { ...current, ...updated } : current);
      addToast('Đã đổi mã tham gia.', 'success');
      reload();
    } catch (err) {
      addToast(err instanceof AuthApiError ? err.message : 'Không đổi được mã tham gia.', 'error');
    } finally {
      setRotating(false);
    }
  };

  const removeMember = async (userId: string) => {
    if (!detail) return;
    setRemovingId(userId);
    try {
      await classroomsApi.removeMember(detail.id, userId);
      setDetail((current) => current ? { ...current, members: current.members.filter((member) => member.userId !== userId), studentCount: Math.max(0, current.studentCount - 1) } : current);
      addToast('Đã xoá học sinh khỏi lớp. Bài đã nộp vẫn được giữ.', 'success');
      reload();
    } catch (err) {
      addToast(err instanceof AuthApiError ? err.message : 'Không xoá được học sinh khỏi lớp.', 'error');
    } finally {
      setRemovingId('');
    }
  };

  if (loading) return <TeacherShell><div className="p-12 text-center text-sm text-on-surface-variant">Đang tải lớp học...</div></TeacherShell>;
  if (!detail) return <TeacherShell><div className="max-w-xl mx-auto p-8 space-y-3"><p className="text-error">{error || 'Không tìm thấy lớp học.'}</p><Link href="/classrooms" className="text-primary font-semibold hover:underline">Quay lại danh sách lớp</Link></div></TeacherShell>;

  const readOnly = detail.readOnly;
  const students = detail.members.filter((member) => member.role === 'STUDENT');

  return (
    <TeacherShell>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 pb-2 border-b border-outline-variant/20">
          <div><Link href="/classrooms" className="inline-flex mb-2 text-xs font-semibold text-secondary hover:underline"><span className="material-symbols-outlined text-[16px]">arrow_back</span>Danh sách lớp</Link><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-mono font-bold text-secondary">{detail.code}</span>{readOnly && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-800 dark:text-amber-300">Chỉ xem</span>}{detail.archived && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant">Đã lưu trữ</span>}</div><h1 className="mt-1 font-headline-lg text-2xl sm:text-3xl font-bold text-on-surface font-merriweather">{detail.name}</h1><p className="mt-1 text-sm text-on-surface-variant">{term?.id === detail.termId ? termLabel(term) : `${detail.termName} • ${detail.academicYear}`} · {detail.subject}</p></div>
          {!readOnly && <button type="button" onClick={() => setEditing((value) => !value)} className="h-9 px-3.5 rounded-lg border border-outline-variant/60 bg-surface-container-lowest text-sm font-semibold hover:bg-surface-container">{editing ? 'Đóng chỉnh sửa' : 'Sửa lớp'}</button>}
        </div>

        {editing && !readOnly && <section className="glass-panel rounded-2xl p-5 border border-primary/20 space-y-4"><h2 className="font-bold text-on-surface">Thông tin lớp</h2><div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><label className="text-xs space-y-1"><span>Tên lớp</span><input value={name} onChange={(event) => setName(event.target.value)} className={INPUT_CLASS} /></label><label className="text-xs space-y-1"><span>Mã lớp</span><input value={code} onChange={(event) => setCode(event.target.value)} className={INPUT_CLASS} /></label><label className="text-xs space-y-1"><span>Khối</span><select value={gradeLevel} onChange={(event) => setGradeLevel(Number(event.target.value))} className={INPUT_CLASS}><option value={10}>10</option><option value={11}>11</option><option value={12}>12</option></select></label></div><div className="flex justify-end gap-2"><button type="button" onClick={() => setEditing(false)} className="h-9 px-3 text-sm font-semibold text-on-surface-variant">Huỷ</button><button type="button" disabled={saving} onClick={() => void saveBasics()} className="h-9 px-3.5 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-40">Lưu thay đổi</button></div></section>}

        <section className="glass-card rounded-2xl border border-outline-variant/30 p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><div><h2 className="font-merriweather font-bold text-on-surface">Mã tham gia</h2><p className="text-xs text-on-surface-variant mt-1">Gửi mã này cho học sinh để tự vào lớp.</p></div><span className={`text-xs font-semibold flex items-center gap-1.5 ${detail.joinEnabled ? 'text-tertiary' : 'text-on-surface-variant'}`}><span className={`w-1.5 h-1.5 rounded-full ${detail.joinEnabled ? 'bg-tertiary' : 'bg-outline'}`} />{detail.joinEnabled ? 'Đang mở mã' : 'Đã khoá mã'}</span></div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3"><code className="text-2xl sm:text-3xl font-bold tracking-[0.16em] text-primary bg-primary-container/20 rounded-xl px-4 py-3">{detail.joinCode}</code><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => void copy()} className="h-9 px-3 rounded-lg border border-outline-variant/60 text-sm font-semibold hover:bg-surface-container"><span className="material-symbols-outlined text-[16px] align-text-bottom mr-1">content_copy</span>Sao chép</button><button type="button" onClick={() => void copyInvitation()} className="h-9 px-3 rounded-lg border border-outline-variant/60 text-sm font-semibold hover:bg-surface-container"><span className="material-symbols-outlined text-[16px] align-text-bottom mr-1">link</span>Sao chép link mời</button>{!readOnly && <div className="flex items-center gap-1"><span className="text-sm font-semibold text-on-surface-variant">Đổi mã</span><InlineDeleteButton icon="autorenew" label="Đổi mã tham gia" title="Đổi mã tham gia?" description="Mã cũ sẽ không còn dùng được để học sinh vào lớp." busy={rotating} onConfirm={rotate} /></div>}</div></div>
          <label className="inline-flex items-center gap-2 text-sm text-on-surface cursor-pointer"><input type="checkbox" checked={detail.joinEnabled} disabled={readOnly || saving} onChange={(event) => void apply({ joinEnabled: event.target.checked }, event.target.checked ? 'Đã mở mã tham gia.' : 'Đã khoá mã tham gia.')} className="accent-primary disabled:opacity-40" />Cho phép tham gia bằng mã</label>
        </section>

        <section className="glass-card rounded-2xl border border-outline-variant/30 overflow-hidden"><div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-outline-variant/20"><div><h2 className="font-merriweather font-bold text-on-surface">Học sinh ({students.length})</h2><p className="mt-1 text-xs text-on-surface-variant">Bấm tên một em để xem hồ sơ văn phong. Xoá khỏi lớp không xoá bài đã nộp.</p></div></div>{students.length === 0 ? <div className="p-10 text-center text-sm text-on-surface-variant">Gửi mã <strong className="font-mono text-on-surface">{detail.joinCode}</strong> cho học sinh để vào lớp.</div> : <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-surface-container-low text-xs text-on-surface-variant"><tr><th className="text-left font-semibold px-5 py-3">Học sinh</th><th className="text-left font-semibold px-5 py-3">Tên đăng nhập</th><th className="text-left font-semibold px-5 py-3">Email</th><th className="text-left font-semibold px-5 py-3">Ngày vào</th><th className="w-12" /></tr></thead><tbody>{students.map((member) => <tr key={member.userId} className="border-t border-outline-variant/20"><td className="px-5 py-3 font-semibold text-on-surface"><Link href={`/classrooms/${encodeURIComponent(detail.id)}/students/${encodeURIComponent(member.userId)}`} className="inline-flex items-center gap-1 hover:text-secondary hover:underline" title="Xem hồ sơ văn phong">{member.displayName}<span className="material-symbols-outlined text-[15px] text-outline" aria-hidden="true">fingerprint</span></Link></td><td className="px-5 py-3 text-on-surface-variant font-mono text-xs">{member.loginId}</td><td className="px-5 py-3 text-on-surface-variant">{member.email}</td><td className="px-5 py-3 text-on-surface-variant">{dateLabel(member.joinedAt)}</td><td className="px-3 py-2">{!readOnly && <InlineDeleteButton label={`Xoá ${member.displayName} khỏi lớp`} title="Xoá học sinh khỏi lớp?" description="Bài đã nộp vẫn được giữ trong hệ thống." busy={removingId === member.userId} disabled={Boolean(removingId)} onConfirm={() => removeMember(member.userId)} />}</td></tr>)}</tbody></table></div>}</section>

        {!readOnly && <div className="flex justify-end"><button type="button" disabled={saving} onClick={() => void apply({ archived: !detail.archived }, detail.archived ? 'Đã bỏ lưu trữ lớp.' : 'Đã lưu trữ lớp.')} className={`h-9 px-3.5 rounded-lg text-sm font-semibold border transition-all disabled:opacity-40 ${detail.archived ? 'border-primary/30 text-primary hover:bg-primary/5' : 'border-error/30 text-error hover:bg-error/5'}`}>{detail.archived ? 'Bỏ lưu trữ' : 'Lưu trữ lớp'}</button></div>}
      </div>
    </TeacherShell>
  );
}
