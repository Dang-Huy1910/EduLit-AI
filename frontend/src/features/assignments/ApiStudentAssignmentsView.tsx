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

  const toggleInstructions = (id: string) => {
    setExpandedInstructions((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleRubric = (id: string) => {
    setExpandedRubrics((prev) => ({ ...prev, [id]: !prev[id] }));
  };

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

  const todoAssignments = assignments.filter((item) => !item.submission);
  const submittedAssignments = assignments.filter((item) => item.submission);

  // Compute metrics from actual data
  const socraticCount = assignments.filter((a) => Boolean(a.socraticSession)).length;
  const gradedWithScore = submittedAssignments.filter(
    (a) => a.submission && (a as unknown as { assessment?: { totalScore?: number } }).assessment?.totalScore !== undefined,
  );
  const averageScore =
    gradedWithScore.length > 0
      ? (
          gradedWithScore.reduce(
            (acc, curr) => acc + Number((curr as unknown as { assessment: { totalScore: number } }).assessment.totalScore || 0),
            0,
          ) / gradedWithScore.length
        ).toFixed(1)
      : null;

  const handleOpenCode = async (event: React.FormEvent) => {
    event.preventDefault();
    const clean = codeInput.trim().toUpperCase();
    if (!clean) return;
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
    <StudentShell headerTitle="Không gian học sinh" headerSubtitle="Bài tập của em &amp; Bài đã nộp">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Hero Section */}
        <div className="p-6 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs bg-secondary-fixed/50 text-secondary font-bold px-2 py-0.5 rounded-full">
                {user?.displayName || 'Học sinh'} • THPT Đan Phượng
              </span>
              <span className="text-xs bg-surface-container text-on-surface-variant font-medium px-2 py-0.5 rounded-full">
                Dữ liệu hệ thống GDPT 2018
              </span>
            </div>
            <h1 className="font-headline-lg text-2xl font-bold text-on-surface font-merriweather">
              Không gian học tập &amp; Bài viết của em
            </h1>
            <p className="text-xs sm:text-sm text-on-surface-variant mt-1">
              Rèn luyện năng lực nghị luận theo quy trình GDPT 2018: Đọc hiểu &rarr; Lập dàn ý Socratic &rarr; Viết tay &rarr; Đánh giá Rubric.
            </p>
          </div>

          {/* Quick Enter Code Box */}
          <div className="bg-surface-container-low/70 p-3.5 rounded-xl border border-outline-variant/40 sm:max-w-xs w-full">
            <span className="text-xs font-semibold text-on-surface block mb-1.5 flex items-center gap-1">
              <span className="material-symbols-outlined text-sm text-secondary">pin</span>
              Nhập mã đề bài từ giáo viên
            </span>
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
                className="w-full px-2.5 py-1.5 text-xs font-mono uppercase rounded-lg border border-outline-variant/60 bg-surface-container-lowest text-on-surface focus:outline-none focus:border-secondary"
              />
              <button
                data-testid="assignment-code-open"
                type="submit"
                className="px-3 py-1.5 bg-primary-container text-on-primary-container font-semibold text-xs rounded-lg hover:brightness-95 shrink-0 transition-all shadow-sm"
              >
                Mở bài
              </button>
            </form>
            {codeError && (
              <p className="text-[11px] text-error mt-1 flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px]">error</span>
                Mã không hợp lệ hoặc chưa được công bố.
              </p>
            )}
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-outline-variant/20 text-[10px] text-on-surface-variant">
              <span>Mã mẫu: VAN12-NLXH-SOC</span>
              <button
                type="button"
                onClick={() => {
                  setCodeInput('DEMO-NLXH-12');
                  setCodeError(false);
                }}
                className="text-secondary hover:underline"
              >
                DEMO-NLXH-12
              </button>
            </div>
          </div>
        </div>

        {/* Learning Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm">
            <span className="text-xs text-on-surface-variant block">Bài tập cần làm</span>
            <span className="text-xl font-bold text-on-surface font-merriweather">
              {String(todoAssignments.length).padStart(2, '0')}
            </span>
            <span className="text-[10px] text-secondary font-medium block mt-0.5">
              {todoAssignments.length > 0 ? 'Có bài cần hoàn thành' : 'Đã nộp tất cả'}
            </span>
          </div>

          <div className="p-3.5 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm">
            <span className="text-xs text-on-surface-variant block">Bài đã nộp</span>
            <span className="text-xl font-bold text-tertiary font-merriweather">
              {String(submittedAssignments.length).padStart(2, '0')}
            </span>
            <span className="text-[10px] text-tertiary font-medium block mt-0.5">
              {submittedAssignments.length > 0 ? 'Đã ghi nhận bài nộp' : 'Chưa có bài nộp'}
            </span>
          </div>

          <div className="p-3.5 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm">
            <span className="text-xs text-on-surface-variant block">Đang xây dựng dàn ý</span>
            <span className="text-xl font-bold text-primary font-merriweather">
              {String(socraticCount).padStart(2, '0')}
            </span>
            <span className="text-[10px] text-primary font-medium block mt-0.5">
              {socraticCount > 0 ? 'Đang thực hiện Socratic' : 'Chưa mở dàn ý'}
            </span>
          </div>

          <div className="p-3.5 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm">
            <span className="text-xs text-on-surface-variant block">Điểm trung bình</span>
            <span className="text-xl font-bold text-secondary font-merriweather">
              {averageScore ? `${averageScore} / 10` : '-- / 10'}
            </span>
            <span className="text-[10px] text-secondary font-medium block mt-0.5">
              {averageScore ? 'Điểm chính thức đã công bố' : 'Chờ giáo viên công bố'}
            </span>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="flex items-center gap-2 border-b border-outline-variant/30 pb-1">
          <button
            onClick={() => setActiveTab('todo')}
            className={`pb-2 px-3 text-sm font-semibold transition-all relative ${
              activeTab === 'todo'
                ? 'text-primary border-b-2 border-primary'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Bài tập cần làm ({todoAssignments.length})
          </button>
          <button
            onClick={() => setActiveTab('submitted')}
            className={`pb-2 px-3 text-sm font-semibold transition-all relative ${
              activeTab === 'submitted'
                ? 'text-secondary border-b-2 border-secondary'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Bài đã nộp &amp; Lịch sử chấm ({submittedAssignments.length})
          </button>
        </div>

        {error && (
          <div className="p-3 bg-error-container/50 border border-error/30 rounded-lg text-sm text-error flex items-center justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => void load()}
              className="px-2 py-1 bg-surface-container-lowest rounded text-xs font-semibold"
            >
              Thử lại
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-on-surface-variant py-8">
            <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Đang tải danh sách bài tập từ máy chủ...
          </div>
        ) : activeTab === 'todo' ? (
          <div className="space-y-4">
            {todoAssignments.length === 0 ? (
              <div className="bg-surface-container-lowest rounded-xl p-12 text-center border border-outline-variant/30 shadow-sm max-w-md mx-auto my-6">
                <div className="w-14 h-14 rounded-full bg-tertiary-container/30 flex items-center justify-center text-tertiary mx-auto mb-3">
                  <span className="material-symbols-outlined text-3xl">verified</span>
                </div>
                <h3 className="text-base font-bold text-on-surface mb-1">Tuyệt vời! Em đã hoàn thành hết bài tập</h3>
                <p className="text-xs text-on-surface-variant mb-4">
                  Tất cả bài tập đã được nộp. Hãy kiểm tra tab &quot;Bài đã nộp &amp; Lịch sử chấm&quot; để theo dõi nhận xét nhé!
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('submitted')}
                  className="px-4 py-2 bg-secondary text-white rounded-lg text-xs font-semibold hover:bg-secondary/90 transition-all shadow-sm"
                >
                  Xem bài đã nộp &rarr;
                </button>
              </div>
            ) : (
              todoAssignments.map((assignment) => {
                const hasRead = Boolean(assignment.progress?.readAt);
                const hasSocratic = Boolean(assignment.socraticSession);
                const isInstructionsOpen = !!expandedInstructions[assignment.id];
                const isRubricOpen = !!expandedRubrics[assignment.id];

                return (
                  <article
                    key={assignment.id}
                    data-testid={`assignment-card-${assignment.code}`}
                    className={`p-5 bg-surface-container-lowest rounded-xl shadow-sm space-y-4 transition-all ${
                      hasSocratic
                        ? 'border-2 border-primary-container/60'
                        : 'border border-outline-variant/30'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-outline-variant/20">
                      <div className="flex flex-wrap items-center gap-2">
                        {hasSocratic ? (
                          <span className="text-xs font-bold text-on-primary-container bg-primary-container px-2.5 py-0.5 rounded-full">
                            Đang lập dàn ý (Bước 2/5)
                          </span>
                        ) : hasRead ? (
                          <span className="text-xs font-semibold text-secondary bg-secondary-fixed/50 px-2.5 py-0.5 rounded-full">
                            Đã đọc đề (Bước 1/5)
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-on-surface-variant bg-surface-container px-2.5 py-0.5 rounded-full">
                            Chưa bắt đầu (Bước 1/5)
                          </span>
                        )}
                        <span className="text-xs text-secondary font-mono font-semibold">{assignment.code}</span>
                      </div>
                      {assignment.dueAt ? (
                        <span className="text-xs text-[#DC2626] font-medium flex items-center gap-1">
                          <span className="material-symbols-outlined text-[15px]">timer</span>
                          Hạn nộp: {new Date(assignment.dueAt).toLocaleString('vi-VN')}
                        </span>
                      ) : (
                        <span className="text-xs text-on-surface-variant font-medium">Không giới hạn thời gian</span>
                      )}
                    </div>

                    <div>
                      <h3 className="font-headline-md text-lg font-bold text-on-surface font-merriweather">
                        {assignment.title}
                      </h3>
                      <p className="text-xs text-on-surface-variant mt-1">
                        Dạng bài: {assignment.genre} • Khối {assignment.gradeLevel} THPT Đan Phượng
                      </p>
                    </div>

                    {/* Progress 5 Steps Preview */}
                    <div className="p-3 bg-surface-container-low/50 rounded-lg">
                      <span className="text-[11px] font-semibold text-outline uppercase tracking-wider block mb-2">
                        Chu trình 5 bước theo chuẩn GDPT 2018
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                        <div className={`flex items-center gap-1.5 ${hasRead ? 'text-tertiary font-medium' : 'text-primary font-bold'}`}>
                          <span className="material-symbols-outlined text-base">
                            {hasRead ? 'check_circle' : 'pending'}
                          </span>
                          <span>1. Đọc hiểu</span>
                        </div>
                        <div className={`flex items-center gap-1.5 ${hasSocratic ? 'text-primary font-bold' : hasRead ? 'text-on-surface-variant' : 'text-outline-variant'}`}>
                          <span className="material-symbols-outlined text-base">
                            {hasSocratic ? 'pending' : 'radio_button_unchecked'}
                          </span>
                          <span>2. Socratic</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-outline-variant">
                          <span className="material-symbols-outlined text-base">radio_button_unchecked</span>
                          <span>3. Viết tay</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-outline-variant">
                          <span className="material-symbols-outlined text-base">radio_button_unchecked</span>
                          <span>4. Soát OCR</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-outline-variant">
                          <span className="material-symbols-outlined text-base">radio_button_unchecked</span>
                          <span>5. Rubric</span>
                        </div>
                      </div>
                    </div>

                    {/* Collapsible Instructions */}
                    <div>
                      <button
                        type="button"
                        onClick={() => toggleInstructions(assignment.id)}
                        className="text-xs font-semibold text-secondary flex items-center gap-1 hover:underline"
                      >
                        <span className="material-symbols-outlined text-base">
                          {isInstructionsOpen ? 'expand_less' : 'expand_more'}
                        </span>
                        {isInstructionsOpen ? 'Thu gọn yêu cầu đề bài' : 'Xem chi tiết yêu cầu đề bài (~600 chữ)'}
                      </button>
                      {isInstructionsOpen && (
                        <div className="mt-2 p-3 bg-surface-container-low/60 rounded-lg text-xs leading-relaxed text-on-surface-variant space-y-1.5 whitespace-pre-line font-merriweather">
                          {assignment.instructions}
                        </div>
                      )}
                    </div>

                    {/* Collapsible Rubric */}
                    <div>
                      <button
                        type="button"
                        onClick={() => toggleRubric(assignment.id)}
                        className="text-xs font-semibold text-on-surface-variant flex items-center gap-1 hover:underline"
                      >
                        <span className="material-symbols-outlined text-base">
                          {isRubricOpen ? 'expand_less' : 'expand_more'}
                        </span>
                        Thang điểm Rubric chuẩn GDPT 2018 (Tổng {assignment.maxScore}đ)
                      </button>
                      {isRubricOpen && assignment.rubric && (
                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          {assignment.rubric.criteria.map((criterion) => (
                            <div key={criterion.criterionId} className="p-2.5 bg-surface-container-low rounded-lg border border-outline-variant/30">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold block text-primary">{criterion.name}</span>
                                <span className="text-on-surface-variant text-[11px] font-mono">{criterion.weight} điểm</span>
                              </div>
                              {criterion.descriptor && (
                                <p className="text-[11px] text-on-surface-variant mt-1 leading-relaxed">
                                  {criterion.descriptor}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="pt-3 border-t border-outline-variant/20 flex items-center justify-end gap-2">
                      <Link
                        data-testid={`open-assignment-${assignment.code}`}
                        href={`/assignments/${assignment.id}`}
                        className="px-4 py-2 rounded-lg bg-primary-container text-on-primary-container text-xs font-semibold hover:brightness-95 transition-all flex items-center gap-1.5 shadow-sm"
                      >
                        <span>{hasRead ? 'Tiếp tục bài viết' : 'Đọc đề & Ngữ liệu'}</span>
                        <span className="material-symbols-outlined text-sm">arrow_forward</span>
                      </Link>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {submittedAssignments.length === 0 ? (
              <div className="bg-surface-container-lowest rounded-xl p-12 text-center border border-outline-variant/30 shadow-sm max-w-md mx-auto my-6">
                <div className="w-14 h-14 rounded-full bg-surface-container-low flex items-center justify-center text-on-surface-variant mx-auto mb-3">
                  <span className="material-symbols-outlined text-3xl">task_alt</span>
                </div>
                <h3 className="text-base font-bold text-on-surface mb-1">Chưa có bài nào đã nộp</h3>
                <p className="text-xs text-on-surface-variant mb-4">
                  Khi em hoàn thành quy trình viết tay và gửi ảnh bài làm, bài thi sẽ được hiển thị ở đây để tra cứu kết quả.
                </p>
              </div>
            ) : (
              submittedAssignments.map((assignment) => (
                <article
                  key={assignment.id}
                  className="p-5 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-outline-variant/20">
                    <span className="text-xs font-mono font-semibold text-secondary">{assignment.code}</span>
                    <span className="text-xs text-on-surface-variant">
                      Đã nộp: {assignment.submission ? new Date(assignment.submission.submittedAt).toLocaleString('vi-VN') : ''}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-headline-md text-base font-bold font-merriweather text-on-surface">
                      {assignment.title}
                    </h3>
                    <p className="text-xs text-on-surface-variant mt-0.5">
                      Dạng bài: {assignment.genre} • Khối {assignment.gradeLevel} THPT Đan Phượng
                    </p>
                  </div>
                  <div className="pt-2 flex flex-wrap items-center gap-3">
                    <Link
                      data-testid={`open-result-${assignment.code}`}
                      href={`/assignments/${assignment.id}/result`}
                      className="px-3 py-1.5 bg-primary-container text-on-primary-container rounded-lg text-xs font-semibold hover:brightness-95 transition-all flex items-center gap-1 shadow-sm"
                    >
                      <span className="material-symbols-outlined text-sm">assessment</span>
                      <span>Xem kết quả đánh giá</span>
                    </Link>
                    {assignment.socraticSession && (
                      <Link
                        href={`/assignments/${assignment.id}/socratic?sessionId=${assignment.socraticSession.sessionId}`}
                        className="px-3 py-1.5 border border-outline-variant/60 rounded-lg text-xs font-semibold text-secondary hover:bg-surface-container transition-all flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-sm">history</span>
                        <span>Xem lại dàn ý Socratic</span>
                      </Link>
                    )}
                  </div>
                </article>
              ))
            )}
          </div>
        )}
      </div>
    </StudentShell>
  );
}
