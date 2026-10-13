'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import StudentShell from '@/components/StudentShell';
import { getAssignmentByCode, listAssignments } from '@/lib/api/assignments';
import { ApiError, type ApiAssignment } from '@/lib/api/types';
import { useApiAuthStore } from '@/lib/api-auth-store';
import { useAppStore } from '@/lib/store';

export default function ApiStudentAssignmentsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useApiAuthStore((state) => state.user);
  const addToast = useAppStore((state) => state.addToast);
  const initialTab = searchParams.get('tab') === 'submitted' ? 'submitted' : 'todo';
  const [activeTab, setActiveTab] = useState<'todo' | 'submitted'>(initialTab);
  const [assignments, setAssignments] = useState<ApiAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState('VAN12-NLXH-SOC');
  const [codeError, setCodeError] = useState(false);
  const [expandedInstructions, setExpandedInstructions] = useState<Record<string, boolean>>({});
  const [expandedRubrics, setExpandedRubrics] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listAssignments();
      setAssignments(rows);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không tải được danh sách đề.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const todo = assignments.filter((item) => !item.submission);
  const submitted = assignments.filter((item) => item.submission);

  const handleOpenCode = async (event: React.FormEvent) => {
    event.preventDefault();
    const clean = codeInput.trim().toUpperCase();
    try {
      const matched = await getAssignmentByCode(clean);
      setCodeError(false);
      addToast(`Mở thành công: ${matched.title}`, 'success');
      router.push(`/assignments/${matched.id}`);
    } catch {
      setCodeError(true);
      addToast('Mã đề không tồn tại hoặc chưa được công bố.', 'error');
    }
  };

  return (
    <StudentShell headerTitle="Không gian học sinh" headerSubtitle="Bài tập của em">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="p-6 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs bg-secondary-fixed/50 text-secondary font-bold px-2 py-0.5 rounded-full">
                {user?.displayName ?? 'Học sinh'}
              </span>
              <span className="text-xs bg-surface-container text-on-surface-variant font-medium px-2 py-0.5 rounded-full">
                Dữ liệu từ máy chủ
              </span>
            </div>
            <h1 className="font-headline-lg text-2xl font-bold text-on-surface font-merriweather">
              Không gian học tập &amp; Bài viết của em
            </h1>
            <p className="text-xs sm:text-sm text-on-surface-variant mt-1">
              Đọc đề, ngữ liệu và barem trước khi lập dàn ý Socratic.
            </p>
          </div>
          <div className="bg-surface-container-low/70 p-3.5 rounded-xl border border-outline-variant/40 sm:max-w-xs w-full">
            <span className="text-xs font-semibold text-on-surface block mb-1.5">Nhập mã đề bài từ giáo viên</span>
            <form onSubmit={handleOpenCode} className="flex gap-2">
              <input
                data-testid="assignment-code-input"
                type="text"
                value={codeInput}
                onChange={(event) => {
                  setCodeInput(event.target.value);
                  setCodeError(false);
                }}
                placeholder="VD: VAN12-NLXH-SOC"
                className="w-full px-2.5 py-1.5 text-xs font-mono uppercase rounded-lg border border-outline-variant/60 bg-surface-container-lowest"
              />
              <button data-testid="assignment-code-open" type="submit" className="px-3 py-1.5 bg-primary-container text-on-primary-container font-semibold text-xs rounded-lg">
                Mở bài
              </button>
            </form>
            {codeError && <p className="text-[11px] text-error mt-1">Mã không hợp lệ hoặc chưa được công bố.</p>}
            <p className="text-[10px] text-on-surface-variant mt-2">Mã thử chat mới: VAN12-NLXH-SOC</p>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-error-container/50 border border-error/30 rounded-lg text-sm text-error flex items-center justify-between">
            <span>{error}</span>
            <button type="button" onClick={() => void load()} className="px-2 py-1 bg-surface-container-lowest rounded text-xs font-semibold">
              Thử lại
            </button>
          </div>
        )}

        <div className="flex items-center gap-2 border-b border-outline-variant/30 pb-1">
          <button
            onClick={() => setActiveTab('todo')}
            className={`pb-2 px-3 text-sm font-semibold ${activeTab === 'todo' ? 'text-primary border-b-2 border-primary' : 'text-on-surface-variant'}`}
          >
            Bài tập cần làm ({todo.length})
          </button>
          <button
            onClick={() => setActiveTab('submitted')}
            className={`pb-2 px-3 text-sm font-semibold ${activeTab === 'submitted' ? 'text-secondary border-b-2 border-secondary' : 'text-on-surface-variant'}`}
          >
            Bài đã nộp ({submitted.length})
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-on-surface-variant">
            <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Đang tải đề đã công bố...
          </div>
        ) : activeTab === 'todo' ? (
          <div className="space-y-4">
            {todo.length === 0 ? (
              <p className="text-sm text-on-surface-variant">Hiện không có đề chưa nộp.</p>
            ) : (
              todo.map((assignment) => (
                <article key={assignment.id} data-testid={`assignment-card-${assignment.code}`} className="p-5 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-secondary font-mono font-semibold">{assignment.code}</span>
                    {assignment.dueAt && (
                      <span className="text-xs text-on-surface-variant">
                        Hạn: {new Date(assignment.dueAt).toLocaleString('vi-VN')}
                      </span>
                    )}
                  </div>
                  <h3 className="font-headline-md text-lg font-bold text-on-surface font-merriweather">{assignment.title}</h3>
                  <p className="text-xs text-on-surface-variant">Dạng bài: {assignment.genre} • Khối {assignment.gradeLevel}</p>
                  <button type="button" onClick={() => setExpandedInstructions((prev) => ({ ...prev, [assignment.id]: !prev[assignment.id] }))} className="text-xs font-semibold text-secondary">
                    {expandedInstructions[assignment.id] ? 'Thu gọn yêu cầu đề bài' : 'Xem yêu cầu đề bài'}
                  </button>
                  {expandedInstructions[assignment.id] && (
                    <div className="p-3 bg-surface-container-low/60 rounded-lg text-xs whitespace-pre-line font-merriweather">{assignment.instructions}</div>
                  )}
                  <button type="button" onClick={() => setExpandedRubrics((prev) => ({ ...prev, [assignment.id]: !prev[assignment.id] }))} className="text-xs font-semibold text-on-surface-variant">
                    Thang điểm Rubric (tối đa {assignment.maxScore})
                  </button>
                  {expandedRubrics[assignment.id] && assignment.rubric && (
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {assignment.rubric.criteria.map((criterion) => (
                        <div key={criterion.criterionId} className="p-2 bg-surface-container-low rounded border border-outline-variant/30">
                          <span className="font-semibold block text-primary">{criterion.name}</span>
                          <span className="text-on-surface-variant text-[11px]">{criterion.weight} điểm</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="pt-3 border-t border-outline-variant/20 flex justify-end">
                    <Link
                      data-testid={`open-socratic-${assignment.code}`}
                      href={`/assignments/${assignment.id}`}
                      className="px-4 py-2 rounded-lg bg-primary-container text-on-primary-container text-xs font-semibold"
                    >
                      {assignment.socraticSession ? 'Tiếp tục lập dàn ý Socratic' : 'Bắt đầu lập dàn ý Socratic'}
                    </Link>
                  </div>
                </article>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {submitted.length === 0 ? (
              <p className="text-sm text-on-surface-variant">Chưa có bài nộp trên máy chủ.</p>
            ) : (
              submitted.map((assignment) => (
                <article key={assignment.id} className="p-5 bg-surface-container-lowest rounded-xl border border-outline-variant/30 space-y-3">
                  <span className="text-xs font-mono text-secondary">{assignment.code}</span>
                  <h3 className="font-headline-md text-base font-bold font-merriweather">{assignment.title}</h3>
                  <p className="text-xs text-on-surface-variant">
                    Đã nộp {assignment.submission ? new Date(assignment.submission.submittedAt).toLocaleString('vi-VN') : ''}. Chấm điểm chưa có API.
                  </p>
                  {assignment.socraticSession && (
                    <Link href={`/assignments/${assignment.id}/socratic?sessionId=${assignment.socraticSession.sessionId}`} className="text-xs font-semibold text-secondary">
                      Xem lịch sử Socratic
                    </Link>
                  )}
                </article>
              ))
            )}
          </div>
        )}
      </div>
    </StudentShell>
  );
}
