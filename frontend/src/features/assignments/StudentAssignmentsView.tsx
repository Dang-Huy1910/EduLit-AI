'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import StudentShell from '@/components/StudentShell';
import { useAppStore } from '@/lib/store';
import { AuthApiError } from '@/lib/auth-types';
import { catalogApi } from '@/features/catalog/api';
import type { StudentAssignment } from '@/features/catalog/types';

export default function StudentAssignmentsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentUser, addToast } = useAppStore();
  const initialTab = searchParams.get('tab') === 'submitted' ? 'submitted' : 'todo';
  const [activeTab, setActiveTab] = useState<'todo' | 'submitted'>(initialTab);
  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState(false);
  const [assignments, setAssignments] = useState<StudentAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await catalogApi.listStudentAssignments();
        setAssignments(res.items);
      } catch (err) {
        addToast(err instanceof AuthApiError ? err.message : 'Không tải được bài tập.', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [addToast]);

  const handleOpenCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = codeInput.trim().toUpperCase();
    try {
      const matched = await catalogApi.getAssignment(clean);
      setCodeError(false);
      addToast(`Mở thành công: ${matched.title}`, 'success');
      router.push(`/assignments/${matched.id}/socratic`);
    } catch {
      setCodeError(true);
      addToast('Mã đề thi không tồn tại hoặc chưa được giao.', 'error');
    }
  };

  return (
    <StudentShell headerTitle="Không gian học sinh" headerSubtitle="Bài tập của em & Bài đã nộp">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="p-6 bg-surface-container-lowest rounded-xl border shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs bg-secondary-fixed/50 text-secondary font-bold px-2 py-0.5 rounded-full">
                Học sinh {currentUser?.name || ''}
              </span>
            </div>
            <h1 className="font-headline-lg text-2xl font-bold font-merriweather">Không gian học tập &amp; Bài viết của em</h1>
            <p className="text-xs sm:text-sm text-on-surface-variant mt-1">
              Chỉ hiện bài đã phát hành và được giao cho em.
            </p>
          </div>
          <div className="bg-surface-container-low/70 p-3.5 rounded-xl border sm:max-w-xs w-full">
            <span className="text-xs font-semibold block mb-1.5">Nhập mã đề bài từ giáo viên</span>
            <form onSubmit={handleOpenCode} className="flex gap-2">
              <input
                type="text"
                value={codeInput}
                onChange={(e) => {
                  setCodeInput(e.target.value);
                  setCodeError(false);
                }}
                placeholder="VD: EDU-A1B2C3D4"
                className="w-full px-2.5 py-1.5 text-xs font-mono uppercase rounded-lg border"
              />
              <button type="submit" className="px-3 py-1.5 bg-primary-container text-on-primary-container font-semibold text-xs rounded-lg">
                Mở bài
              </button>
            </form>
            {codeError && <p className="text-[11px] text-error mt-1">Mã không hợp lệ hoặc chưa được giao.</p>}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('todo')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
              activeTab === 'todo' ? 'bg-primary-container' : 'border border-outline-variant/40'
            }`}
          >
            Cần làm ({assignments.length})
          </button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm text-on-surface-variant">Đang tải bài tập...</div>
        ) : assignments.length === 0 ? (
          <div className="p-12 text-center bg-surface-container-lowest rounded-xl border text-sm text-on-surface-variant">
            Chưa có bài tập được giao.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {assignments.map((assignment) => (
              <div key={assignment.id} className="p-5 bg-surface-container-lowest rounded-xl border space-y-3">
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-tertiary-container/30 text-tertiary">
                  Đã giao
                </span>
                <h3 className="font-merriweather font-bold">{assignment.title}</h3>
                <p className="text-xs text-on-surface-variant line-clamp-3">{assignment.instructions}</p>
                <div className="text-[11px] font-mono text-secondary">Mã: {assignment.code}</div>
                <Link
                  href={`/assignments/${assignment.id}/socratic`}
                  className="inline-flex px-3 py-1.5 bg-primary-container text-on-primary-container text-xs font-semibold rounded-lg"
                >
                  Lập dàn ý Socratic
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </StudentShell>
  );
}
