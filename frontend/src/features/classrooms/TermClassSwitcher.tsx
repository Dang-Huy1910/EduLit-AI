'use client';

import Link from 'next/link';
import { useTeacherClassContext } from './useClassContext';

interface TermClassSwitcherProps {
  fullWidth?: boolean;
}

export default function TermClassSwitcher({ fullWidth = false }: TermClassSwitcherProps) {
  const { terms, term, classrooms, classroom, loading, setTerm, setClassroom } = useTeacherClassContext();

  return (
    <div className={fullWidth ? 'flex flex-col gap-2 w-full' : 'flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 min-w-0'}>
      <label className={`flex items-center gap-1.5 min-w-0 text-xs text-on-surface-variant ${fullWidth ? 'w-full' : ''}`}>
        <span className="material-symbols-outlined text-[17px] text-outline" aria-hidden="true">calendar_month</span>
        <span className="sr-only">Kỳ học</span>
        <select
          aria-label="Kỳ học"
          value={term?.id || ''}
          onChange={(event) => setTerm(event.target.value)}
          disabled={loading && terms.length === 0}
          className={fullWidth ? 'h-8 min-w-0 w-full max-w-none bg-surface-container-lowest border border-outline-variant/50 rounded-lg px-2 text-sm font-semibold text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50' : 'h-8 min-w-0 w-full sm:w-auto max-w-[13rem] bg-surface-container-lowest border border-outline-variant/50 rounded-lg px-2 text-sm font-semibold text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50'}
        >
          {!terms.length && <option value="">Đang tải kỳ học...</option>}
          {terms.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} • {item.academicYear}
            </option>
          ))}
        </select>
      </label>
      <label className={`flex items-center gap-1.5 min-w-0 text-xs text-on-surface-variant ${fullWidth ? 'w-full' : ''}`}>
        <span className="material-symbols-outlined text-[17px] text-outline" aria-hidden="true">groups</span>
        <span className="sr-only">Lớp</span>
        <select
          aria-label="Lớp"
          value={classroom?.id || ''}
          onChange={(event) => setClassroom(event.target.value)}
          disabled={loading && classrooms.length === 0}
          className={fullWidth ? 'h-8 min-w-0 w-full max-w-none bg-surface-container-lowest border border-outline-variant/50 rounded-lg px-2 text-sm font-semibold text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50' : 'h-8 min-w-0 w-full sm:w-auto max-w-[14rem] bg-surface-container-lowest border border-outline-variant/50 rounded-lg px-2 text-sm font-semibold text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50'}
        >
          {!classrooms.length && <option value="">Chưa có lớp</option>}
          {classrooms.length > 0 && !classroom && <option value="" disabled>Chọn lớp</option>}
          {classrooms.map((item) => (
            <option key={item.id} value={item.id}>
              {item.code} • {item.subject}{item.readOnly ? ' (chỉ xem)' : ''}
            </option>
          ))}
        </select>
      </label>
      {!classrooms.length && !loading && (
        <Link href="/classrooms" className="text-xs font-semibold text-primary hover:underline whitespace-nowrap">
          Tạo lớp
        </Link>
      )}
    </div>
  );
}
