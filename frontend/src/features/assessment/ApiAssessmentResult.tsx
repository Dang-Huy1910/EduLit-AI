'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import StudentShell from '@/components/StudentShell';
import AssignmentWorkflowStepper from '@/components/AssignmentWorkflowStepper';
import { getAssignment } from '@/lib/api/assignments';
import { getStudentSubmission } from '@/lib/api/submissions';
import { ApiError, type ApiAssignment, type ApiStudentSubmission } from '@/lib/api/types';
import { useApiAuthStore } from '@/lib/api-auth-store';
import { useAppStore } from '@/lib/store';

export default function ApiAssessmentResult() {
  const params = useParams();
  const assignmentId = String(params?.id ?? '');
  const user = useApiAuthStore((state) => state.user);
  const addToast = useAppStore((state) => state.addToast);

  const [assignment, setAssignment] = useState<ApiAssignment | null>(null);
  const [result, setResult] = useState<ApiStudentSubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('Đang tải trạng thái bài nộp…');
  const [highlightedQuote, setHighlightedQuote] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void (async () => {
      try {
        const assignData = await getAssignment(assignmentId);
        if (active) setAssignment(assignData);

        if (!assignData.submission) {
          if (active) {
            setMessage('Bài ảnh chưa được giáo viên xác nhận nên chưa có kết quả chấm.');
            setLoading(false);
          }
          return;
        }

        const submissionData = await getStudentSubmission(assignData.submission.id);
        if (active) {
          setResult(submissionData);
          setLoading(false);
        }
      } catch (cause) {
        if (active) {
          setMessage(cause instanceof ApiError ? cause.message : 'Không tải được kết quả.');
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [assignmentId]);

  // Map criterionId to human-readable criterion name from assignment rubric if available
  const criterionNameMap = new Map<string, string>();
  if (assignment?.rubric?.criteria) {
    for (const c of assignment.rubric.criteria) {
      criterionNameMap.set(c.criterionId, c.name);
    }
  }

  const publishedAssessment =
    result?.assessment?.status === 'PUBLISHED' ? result.assessment : null;

  // Collect all quotes for the direct evidence quote rail
  const allQuotes: Array<{ criterionId: string; quote: string }> =
    publishedAssessment?.detailedEvaluations.flatMap((ev) =>
      ev.evidence.map((evItem) => ({
        criterionId: ev.criterionId,
        quote: evItem.quote,
      })),
    ) ?? [];

  return (
    <StudentShell headerTitle="Kết quả đánh giá Rubric" headerSubtitle="Giai đoạn 5 / Kết quả đánh giá Rubric">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top Banner & Header */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-outline-variant/20">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs bg-primary-fixed text-primary font-bold px-2.5 py-0.5 rounded-full">
                  Kết quả đánh giá Rubric GDPT 2018
                </span>
                <span className="text-xs text-on-surface-variant font-medium">
                  {assignment ? `${assignment.code} • ${assignment.genre}` : ''}
                </span>
              </div>
              <h1 className="font-headline-lg text-2xl font-bold text-on-surface font-merriweather">
                Kết quả đánh giá theo Rubric GDPT 2018
              </h1>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href="/assignments"
                className="px-3.5 py-1.5 rounded-lg border border-outline-variant/50 text-xs text-on-surface hover:bg-surface-container transition-all"
              >
                Bài tập của em
              </Link>
              <Link
                href={`/assignments/${assignmentId}/ocr`}
                className="px-3.5 py-1.5 rounded-lg border border-outline-variant/50 text-xs text-secondary hover:bg-surface-container transition-all flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">document_scanner</span>
                <span>Bản chép OCR</span>
              </Link>
              <button
                onClick={() => addToast('Chức năng xuất PDF bảng điểm có dấu xác nhận đang được chuẩn bị.', 'info')}
                className="px-3.5 py-1.5 rounded-lg bg-surface-container-lowest border border-outline-variant/50 text-xs text-on-surface hover:bg-surface-container transition-all flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">print</span>
                <span>Xuất PDF</span>
              </button>
            </div>
          </div>

          {/* Stepper */}
          <AssignmentWorkflowStepper currentStep="result" assignmentId={assignmentId} />

          {/* Pedagogical Disclaimer Card */}
          <div className="p-3 bg-surface-container-low/70 rounded-xl border border-outline-variant/30 text-xs text-on-surface-variant flex items-center gap-2.5">
            <span className="material-symbols-outlined text-secondary text-base">policy</span>
            <span>
              <strong>Khuyến cáo sư phạm:</strong> Điểm số và nhận xét từ mô hình AI là căn cứ tham vấn hỗ trợ học tập, <strong>không tự động thay thế điểm số chính thức</strong> của Giáo viên bộ môn THPT Đan Phượng.
            </span>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-on-surface-variant bg-surface-container-lowest rounded-xl border border-outline-variant/30">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span>Đang tải kết quả bài nộp...</span>
          </div>
        ) : !result ? (
          <div className="p-12 text-center bg-surface-container-lowest rounded-xl border border-outline-variant/30 space-y-3">
            <div className="w-12 h-12 rounded-full bg-surface-container-low flex items-center justify-center text-on-surface-variant mx-auto">
              <span className="material-symbols-outlined text-2xl">info</span>
            </div>
            <h3 className="text-base font-bold text-on-surface">{message}</h3>
            <div className="pt-2">
              <Link
                href={`/assignments/${assignmentId}/ocr`}
                className="inline-flex items-center gap-1 px-4 py-2 bg-primary-container text-on-primary-container text-xs font-semibold rounded-lg hover:brightness-95 transition-all"
              >
                <span>Xem bản chép OCR</span>
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </Link>
            </div>
          </div>
        ) : result.assessment.status === 'PENDING' ? (
          <div
            data-testid="result-pending"
            className="p-16 text-center bg-surface-container-lowest rounded-xl border border-[#FDE047] space-y-4 shadow-sm"
          >
            <div className="w-14 h-14 rounded-full bg-[#FEF9C3] flex items-center justify-center text-[#CA8A04] mx-auto shadow-xs">
              <span className="material-symbols-outlined text-3xl">hourglass_top</span>
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-[#CA8A04] font-merriweather">
                Bài thi đang chờ giáo viên chấm và công bố kết quả
              </h2>
              <p className="text-xs text-on-surface-variant max-w-md mx-auto leading-relaxed">
                Bài làm đã được xác nhận bản chép số hóa. Điểm nháp của AI không được hiển thị trước khi giáo viên duyệt nhằm bảo đảm tính sư phạm và khách quan.
              </p>
            </div>
            <div className="pt-2">
              <Link
                href={`/assignments/${assignmentId}/ocr`}
                className="inline-flex items-center gap-1 px-4 py-2 border border-outline-variant/50 text-xs text-secondary font-semibold rounded-lg hover:bg-surface-container transition-all"
              >
                <span>Xem lại bản chép OCR</span>
                <span className="material-symbols-outlined text-sm">arrow_back</span>
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Hero Score Card */}
            <div
              data-testid="official-score"
              className="p-6 bg-surface-container-lowest rounded-xl border-2 border-primary-container/70 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
            >
              <div className="flex items-center gap-5">
                <div className="w-20 h-20 rounded-2xl bg-surface-container-low flex flex-col items-center justify-center border border-outline-variant/40 shrink-0">
                  <span className="text-3xl font-extrabold text-primary font-merriweather leading-none">
                    {result.assessment.totalScore}
                  </span>
                  <span className="text-[11px] text-on-surface-variant font-mono mt-1">
                    / {publishedAssessment?.maxScore}
                  </span>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs bg-tertiary-container/40 text-tertiary font-bold px-2.5 py-0.5 rounded-full">
                      KẾT QUẢ CHÍNH THỨC
                    </span>
                    <span className="text-xs text-on-surface-variant font-mono">
                      Mã bài thi: {result.submission.id.slice(0, 8)}
                    </span>
                  </div>
                  <h2 className="font-headline-md text-lg font-bold text-on-surface font-merriweather">
                    {assignment?.title || 'Bài làm môn Ngữ văn'}
                  </h2>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Học sinh: <strong>{user?.displayName || 'Học sinh'}</strong> • Lớp 12A1 • THPT Đan Phượng
                  </p>
                </div>
              </div>

              <div className="p-3 bg-surface-container-low/60 rounded-xl border border-outline-variant/30 text-xs sm:text-right space-y-1">
                <span className="text-[11px] text-outline block">Bảo mật định danh:</span>
                <span className="font-bold text-secondary font-mono text-sm block">ĐÃ MÃ HÓA PII</span>
                <span className="text-[10px] text-tertiary font-semibold">Chuẩn Barem GDPT 2018</span>
              </div>
            </div>

            {/* Main Comparison Layout: Left Criteria (7 cols), Right Transcript Quote Rail (5 cols) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Criteria (7 cols) */}
              <div className="lg:col-span-7 space-y-4">
                <span className="text-xs font-bold uppercase tracking-wider text-outline block">
                  Bảng điểm chi tiết theo các tiêu chí Rubric (Tổng {publishedAssessment?.maxScore}đ)
                </span>

                {publishedAssessment?.detailedEvaluations.map((evaluation) => {
                  const criterionName =
                    criterionNameMap.get(evaluation.criterionId) || evaluation.criterionId;
                  return (
                    <article
                      key={evaluation.criterionId}
                      className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant/30 shadow-sm space-y-3"
                    >
                      <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
                        <div>
                          <span className="text-xs font-mono font-bold text-secondary block">
                            {evaluation.criterionId}
                          </span>
                          <h4 className="text-sm font-bold text-on-surface font-merriweather">
                            {criterionName}
                          </h4>
                        </div>
                        <div className="text-right">
                          <span className="text-base font-bold text-primary font-mono">
                            {evaluation.awardedScore}đ
                          </span>
                        </div>
                      </div>

                      {/* Comment */}
                      {evaluation.comment && (
                        <p className="text-xs leading-relaxed text-on-surface">
                          {evaluation.comment}
                        </p>
                      )}

                      {/* Weaknesses / Points to improve */}
                      {evaluation.weaknesses && evaluation.weaknesses.length > 0 && (
                        <div className="space-y-1 text-xs pt-1">
                          <span className="text-[11px] font-bold text-[#CA8A04] flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">warning</span>
                            Điểm cần rèn luyện thêm:
                          </span>
                          <ul className="list-disc list-inside space-y-0.5 text-on-surface-variant text-[11px] pl-1">
                            {evaluation.weaknesses.map((wk, idx) => (
                              <li key={idx}>{wk}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Evidence Quotes */}
                      {evaluation.evidence && evaluation.evidence.length > 0 && (
                        <div className="space-y-2 pt-1 border-t border-outline-variant/20">
                          <span className="text-[11px] font-semibold text-outline uppercase tracking-wider block">
                            Minh chứng trích dẫn từ bài viết:
                          </span>
                          {evaluation.evidence.map((ev, idx) => (
                            <blockquote
                              key={idx}
                              onClick={() => setHighlightedQuote(ev.quote)}
                              className="p-2.5 rounded-lg border-l-4 border-secondary bg-surface-container-low/50 text-[11px] italic font-merriweather leading-relaxed text-on-surface-variant cursor-pointer hover:border-primary transition-all"
                            >
                              “{ev.quote}”
                            </blockquote>
                          ))}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>

              {/* Right Transcript Quote Rail (5 cols) */}
              <div className="lg:col-span-5 space-y-5">
                {/* Transcript Direct Reference Preview */}
                <div className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant/30 shadow-sm space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
                    <span className="text-xs font-bold uppercase tracking-wider text-secondary flex items-center gap-1">
                      <span className="material-symbols-outlined text-base">format_quote</span>
                      Trích đoạn đối chiếu trực tiếp
                    </span>
                    <span className="text-[11px] text-on-surface-variant">
                      {allQuotes.length} trích đoạn
                    </span>
                  </div>

                  <div className="p-3 bg-surface-container-low/40 rounded-xl max-h-72 overflow-y-auto space-y-2 text-xs">
                    {allQuotes.length === 0 ? (
                      <p className="text-xs text-on-surface-variant">Không có trích đoạn nào.</p>
                    ) : (
                      allQuotes.map((item, idx) => {
                        const isTarget = item.quote === highlightedQuote;
                        return (
                          <div
                            key={idx}
                            onClick={() => setHighlightedQuote(item.quote)}
                            className={`p-2.5 rounded-lg border transition-all cursor-pointer ${
                              isTarget
                                ? 'bg-[#FEF9C3] border-[#FDE047] font-semibold text-black shadow-xs'
                                : 'bg-surface-container-lowest border-outline-variant/30 text-on-surface-variant hover:border-secondary'
                            }`}
                          >
                            <span className="text-[10px] font-mono font-bold text-secondary block mb-0.5">
                              {item.criterionId}
                            </span>
                            <p className="font-merriweather text-[11px] leading-relaxed italic">
                              “{item.quote}”
                            </p>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Sổ tay cá nhân & Hỏi giáo viên */}
                <div className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant/30 shadow-sm space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
                    <span className="material-symbols-outlined text-base">task_alt</span>
                    Gợi ý tiếp theo sau khi nhận điểm
                  </div>
                  <p className="text-xs text-on-surface-variant leading-relaxed">
                    Em hãy đối chiếu các nhận xét ở trên với bài viết tay gốc, ghi chú lại các lỗi diễn đạt để chuẩn bị tốt hơn cho bài viết tiếp theo.
                  </p>
                  <div className="pt-2 flex items-center justify-between gap-2 text-xs">
                    <button
                      onClick={() => addToast('Đã lưu nhận xét vào Sổ tay văn học cá nhân.', 'success')}
                      className="w-1/2 py-2 rounded-lg border border-outline-variant/60 text-center font-medium hover:bg-surface-container transition-all"
                    >
                      Lưu vào Sổ tay
                    </button>
                    <button
                      onClick={() => addToast('Đã gửi câu hỏi thắc mắc tới giáo viên bộ môn.', 'success')}
                      className="w-1/2 py-2 rounded-lg bg-secondary text-white text-center font-bold hover:bg-secondary/90 transition-all shadow-sm"
                    >
                      Hỏi cô giáo
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </StudentShell>
  );
}
