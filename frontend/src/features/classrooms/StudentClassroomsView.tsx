'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import StudentShell from '@/components/StudentShell';
import { AuthApiError } from '@/lib/auth-types';
import { useAppStore } from '@/lib/store';
import { normalizeJoinCode, termLabel } from './model';
import { studentClassroomsApi } from './api';
import { useStudentClassContext } from './useClassContext';

export default function StudentClassroomsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { addToast } = useAppStore();
  const { term, classrooms, loading, error, select, setClassroom, reload } = useStudentClassContext();
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joining, setJoining] = useState(false);
  const invitationCode = searchParams.get('join') || '';

  useEffect(() => {
    if (invitationCode) setJoinCode(normalizeJoinCode(invitationCode));
  }, [invitationCode]);

  const handleJoin = async (event: React.FormEvent) => {
    event.preventDefault();
    const code = normalizeJoinCode(joinCode);
    setJoinCode(code);
    setJoinError('');
    if (code.length !== 6) {
      setJoinError('Mã lớp gồm 6 ký tự. Em kiểm tra lại mã thầy cô gửi nhé.');
      return;
    }

    setJoining(true);
    try {
      const result = await studentClassroomsApi.join(code);
      addToast(
        result.alreadyMember
          ? 'Em đã ở trong lớp này'
          : `Đã vào lớp ${result.classroom.code} • ${result.classroom.subject}`,
        'success'
      );
      select(result.classroom.termId, result.classroom.id);
      await reload();
    } catch (err) {
      if (err instanceof AuthApiError && err.status === 429) {
        setJoinError(`Em thử quá nhiều lần, đợi ${err.retryAfter ?? 0} giây.`);
      } else {
        setJoinError(err instanceof AuthApiError ? err.message : 'Không vào được lớp. Em thử lại nhé.');
      }
    } finally {
      setJoining(false);
    }
  };

  return (
    <StudentShell headerSubtitle="Tham gia và xem bài tập theo lớp">
      <div className="max-w-5xl mx-auto space-y-6">
        <section className="glass-panel rounded-2xl border border-white/60 p-5 sm:p-6 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
            <div className="max-w-xl">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-secondary-fixed/50 text-secondary">
                <span className="material-symbols-outlined text-sm">group_add</span>
                Lớp học của em
              </span>
              <h1 className="mt-3 font-merriweather text-2xl sm:text-3xl font-bold tracking-tight text-on-surface">Tham gia lớp</h1>
              <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
                Nhập mã gồm 6 ký tự thầy cô gửi để nhận bài tập của lớp.
              </p>
            </div>

            <form onSubmit={handleJoin} className="w-full lg:max-w-md">
              <label className="block text-xs font-semibold text-on-surface mb-1.5" htmlFor="join-classroom-code">
                Mã lớp
              </label>
              <div className="flex gap-2">
                <input
                  id="join-classroom-code"
                  type="text"
                  value={joinCode}
                  onChange={(event) => {
                    setJoinCode(normalizeJoinCode(event.target.value));
                    setJoinError('');
                  }}
                  maxLength={8}
                  autoCapitalize="characters"
                  inputMode="text"
                  placeholder="VD: A1B2C3"
                  className="min-w-0 flex-1 h-11 rounded-xl border border-outline-variant/60 bg-surface-container-lowest px-3 font-mono text-lg font-bold tracking-[0.14em] uppercase text-on-surface placeholder:tracking-normal placeholder:font-sans placeholder:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  aria-describedby={joinError ? 'join-classroom-error' : undefined}
                />
                <button
                  type="submit"
                  disabled={joining || joinCode.length !== 6}
                  className="h-11 shrink-0 rounded-xl bg-primary px-4 text-sm font-bold text-white shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-40"
                >
                  {joining ? 'Đang vào...' : 'Vào lớp'}
                </button>
              </div>
              {joinError && (
                <p id="join-classroom-error" role="alert" className="mt-2 flex items-center gap-1.5 text-xs text-error">
                  <span className="material-symbols-outlined text-base">error</span>
                  {joinError}
                </p>
              )}
            </form>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
            <div>
              <h2 className="font-merriweather text-xl font-bold text-on-surface">Lớp trong kỳ đang chọn</h2>
              <p className="mt-1 text-sm text-on-surface-variant">{term ? termLabel(term) : 'Đang tải kỳ học...'}</p>
            </div>
            <span className="text-xs font-semibold text-on-surface-variant">{classrooms.length} lớp</span>
          </div>

          {error && (
            <div role="alert" className="rounded-xl border border-error/30 bg-error-container/30 p-3 text-sm text-error flex items-center justify-between gap-3">
              <span>{error}</span>
              <button type="button" onClick={() => void reload()} className="shrink-0 font-semibold underline">Tải lại</button>
            </div>
          )}

          {loading && classrooms.length === 0 ? (
            <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-12 text-center text-sm text-on-surface-variant">
              Đang tải lớp của em...
            </div>
          ) : classrooms.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-outline-variant/50 bg-surface-container-lowest p-10 text-center">
              <span className="material-symbols-outlined text-4xl text-outline">groups</span>
              <p className="mt-3 font-semibold text-on-surface">
                Em chưa tham gia lớp nào trong {term ? termLabel(term) : 'kỳ học này'}.
              </p>
              <p className="mt-1 text-sm text-on-surface-variant">Hãy nhập mã lớp mà thầy cô gửi.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {classrooms.map((classroom) => (
                <article key={classroom.id} className="glass-card rounded-2xl border border-outline-variant/30 p-5 space-y-4 transition-all duration-150 hover:border-primary/30">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="font-mono text-lg font-bold tracking-wide text-primary">{classroom.code}</span>
                      <h3 className="mt-1 font-merriweather font-bold text-on-surface">{classroom.name}</h3>
                    </div>
                    {classroom.readOnly && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                        <span className="material-symbols-outlined text-[13px]">visibility</span>
                        Chỉ xem
                      </span>
                    )}
                  </div>
                  <dl className="space-y-1.5 text-sm">
                    <div className="flex items-center gap-2 text-on-surface-variant">
                      <span className="material-symbols-outlined text-[17px] text-secondary">menu_book</span>
                      <dt className="sr-only">Môn học</dt>
                      <dd>{classroom.subject}</dd>
                    </div>
                    <div className="flex items-center gap-2 text-on-surface-variant">
                      <span className="material-symbols-outlined text-[17px] text-secondary">person</span>
                      <dt className="sr-only">Giáo viên</dt>
                      <dd>{classroom.teacherName}</dd>
                    </div>
                  </dl>
                  <button
                    type="button"
                    onClick={() => {
                      setClassroom(classroom.id);
                      router.push('/assignments');
                    }}
                    className="w-full h-10 rounded-xl border border-outline-variant/50 bg-surface-container-lowest text-sm font-semibold text-on-surface transition-all hover:bg-surface-container active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    Xem bài tập
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </StudentShell>
  );
}
