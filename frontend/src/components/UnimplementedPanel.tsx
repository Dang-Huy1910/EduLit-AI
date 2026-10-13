'use client';

import Link from 'next/link';
import StudentShell from './StudentShell';
import TeacherShell from './TeacherShell';

export default function UnimplementedPanel({
  title,
  description,
  shell = 'student',
}: {
  title: string;
  description: string;
  shell?: 'student' | 'teacher' | 'none';
}) {
  const body = (
    <div className="max-w-xl mx-auto mt-16 p-6 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm space-y-3">
      <div className="flex items-center gap-2 text-secondary">
        <span className="material-symbols-outlined">construction</span>
        <h1 className="font-headline-sm text-lg font-bold text-on-surface">{title}</h1>
      </div>
      <p className="text-sm text-on-surface-variant">{description}</p>
      <p className="text-xs text-on-surface-variant">
        Chế độ API hiện hỗ trợ đăng nhập học sinh, danh sách đề đã công bố, chat Socratic và lưu dàn ý.
      </p>
      <Link href="/assignments" className="inline-flex items-center gap-1 text-sm font-semibold text-secondary hover:underline">
        Về bài tập của em
        <span className="material-symbols-outlined text-base">arrow_forward</span>
      </Link>
    </div>
  );
  if (shell === 'teacher') {
    return <TeacherShell>{body}</TeacherShell>;
  }
  if (shell === 'student') {
    return <StudentShell headerTitle="Không gian học sinh" headerSubtitle={title}>{body}</StudentShell>;
  }
  return body;
}
