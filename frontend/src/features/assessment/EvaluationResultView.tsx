'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { MOCK_STUDENT_RESULT } from '@/lib/mock/data';

interface EvaluationResultViewProps {
  viewMode?: 'student' | 'teacher';
}

export default function EvaluationResultView({ viewMode = 'student' }: EvaluationResultViewProps) {
  const router = useRouter();
  const { studentResult, addToast } = useAppStore();

  const [highlightedLine, setHighlightedLine] = useState<number | null>(14);
  const [demoState, setDemoState] = useState<'graded' | 'grading' | 'pending_teacher'>('graded');

  const result = studentResult || MOCK_STUDENT_RESULT;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Top Banner & Official Disclaimer */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-outline-variant/20">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs bg-primary-fixed text-primary font-bold px-2 py-0.5 rounded-full">
                Phản hồi đánh giá bằng AI (Tham vấn sư phạm)
              </span>
              <span className="text-xs text-on-surface-variant font-medium">
                Barem GDPT 2018 v1.4 • Dữ liệu minh họa Prototype
              </span>
            </div>
            <h1 className="font-headline-lg text-2xl font-bold text-on-surface font-merriweather">
              Kết quả đánh giá theo Rubric GDPT 2018
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {viewMode === 'teacher' ? (
              <Link
                href="/reports"
                className="px-3.5 py-2 bg-surface-container-lowest border border-outline-variant/60 rounded-lg text-xs font-semibold text-on-surface hover:bg-surface-container transition-all flex items-center gap-1 shadow-sm"
              >
                <span className="material-symbols-outlined text-sm">arrow_back</span>
                <span>Quay lại Báo cáo lớp 12A1</span>
              </Link>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/assignments"
                  className="px-3 py-1.5 rounded-lg border border-outline-variant/50 text-xs text-on-surface hover:bg-surface-container"
                >
                  Bài tập của em
                </Link>
                <Link
                  href="/assignments/assign-nlxh-01/ocr"
                  className="px-3 py-1.5 rounded-lg border border-outline-variant/50 text-xs text-secondary hover:bg-surface-container flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-sm">document_scanner</span>
                  <span>Bản chép OCR</span>
                </Link>
                <button
                  onClick={() => addToast('Đang tạo file PDF kết quả chấm Rubric có dấu mộc nhà trường...', 'info')}
                  className="px-3 py-1.5 rounded-lg bg-surface-container-lowest border border-outline-variant/50 text-xs text-on-surface hover:bg-surface-container flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-sm">print</span>
                  <span>Xuất PDF</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Disclaimer Card */}
        <div className="p-3 bg-surface-container-low/70 rounded-xl border border-outline-variant/30 text-xs text-on-surface-variant flex items-center gap-2.5">
          <span className="material-symbols-outlined text-secondary text-base">policy</span>
          <span>
            <strong>Khuyến cáo sư phạm:</strong> Điểm số và nhận xét từ mô hình AI là căn cứ tham vấn hỗ trợ học tập, <strong>không tự động thay thế điểm số chính thức</strong> của Giáo viên bộ môn THPT Đan Phượng.
          </span>
        </div>
      </div>

      {/* Demo Switcher */}
      <div className="p-2.5 bg-surface-container-low rounded-lg border border-outline-variant/30 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-on-surface-variant font-medium flex items-center gap-1">
          <span className="material-symbols-outlined text-sm text-secondary">tune</span>
          Chế độ thử nghiệm màn hình (Demo):
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDemoState('graded')}
            className={`px-2.5 py-1 rounded font-semibold text-[11px] ${
              demoState === 'graded' ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container-lowest text-on-surface-variant'
            }`}
          >
            Đã có kết quả (7.5đ)
          </button>
          <button
            onClick={() => setDemoState('grading')}
            className={`px-2.5 py-1 rounded font-semibold text-[11px] ${
              demoState === 'grading' ? 'bg-secondary-container text-on-secondary-container' : 'bg-surface-container-lowest text-on-surface-variant'
            }`}
          >
            Đang chấm AI
          </button>
          <button
            onClick={() => setDemoState('pending_teacher')}
            className={`px-2.5 py-1 rounded font-semibold text-[11px] ${
              demoState === 'pending_teacher' ? 'bg-[#FEF9C3] text-[#CA8A04]' : 'bg-surface-container-lowest text-on-surface-variant'
            }`}
          >
            Chờ giáo viên duyệt
          </button>
        </div>
      </div>

      {demoState === 'grading' ? (
        <div className="p-16 text-center bg-surface-container-lowest rounded-xl border border-outline-variant/30 space-y-3">
          <span className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin inline-block"></span>
          <h3 className="text-base font-bold text-on-surface font-merriweather">
            Hệ thống đang đối chiếu bài viết với Rubric GDPT 2018...
          </h3>
          <p className="text-xs text-on-surface-variant max-w-md mx-auto">
            Mô hình đang phân tích 4 tiêu chí: Cấu trúc luận điểm, dẫn chứng thực tế, phát hiện lỗi chính tả ngữ pháp và độ độc đáo của tư duy.
          </p>
        </div>
      ) : demoState === 'pending_teacher' ? (
        <div className="p-16 text-center bg-surface-container-lowest rounded-xl border border-[#FDE047] space-y-3">
          <div className="w-12 h-12 rounded-full bg-[#FEF9C3] flex items-center justify-center text-[#CA8A04] mx-auto">
            <span className="material-symbols-outlined text-2xl">hourglass_top</span>
          </div>
          <h3 className="text-base font-bold text-[#CA8A04] font-merriweather">
            Bài thi đang chờ giáo viên xác nhận bản chép OCR
          </h3>
          <p className="text-xs text-on-surface-variant max-w-md mx-auto">
            Phát hiện 01 đoạn chữ tay bị nghiêng ở dòng 14. Kết quả điểm chính thức sẽ được công bố ngay sau khi Cô Nguyễn Thu Hà duyệt bản chép.
          </p>
        </div>
      ) : (
        <>
          {/* Hero Score Card */}
          <div className="p-6 bg-surface-container-lowest rounded-xl border-2 border-primary-container/70 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-5">
              <div className="w-20 h-20 rounded-2xl bg-surface-container-low flex flex-col items-center justify-center border border-outline-variant/40">
                <span className="text-3xl font-extrabold text-primary font-merriweather leading-none">
                  {result.totalScore.toFixed(1)}
                </span>
                <span className="text-[11px] text-on-surface-variant font-mono mt-1">/ 10.0</span>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs bg-tertiary-container/40 text-tertiary font-bold px-2.5 py-0.5 rounded-full">
                    {result.gradeLevel}
                  </span>
                  <span className="text-xs text-on-surface-variant font-mono">
                    Mã bài thi: {result.studentCode}
                  </span>
                </div>
                <h2 className="font-headline-md text-lg font-bold text-on-surface font-merriweather">
                  Bài làm: Ý chí và lòng kiên định của giới trẻ
                </h2>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Học sinh: <strong>{result.studentName}</strong> • Lớp 12A1 • THPT Đan Phượng
                </p>
              </div>
            </div>

            <div className="p-3 bg-surface-container-low/60 rounded-xl border border-outline-variant/30 text-xs text-right space-y-1">
              <span className="text-[11px] text-outline block">Độ tin cậy OCR trích xuất:</span>
              <span className="font-bold text-secondary font-mono text-sm block">94.0%</span>
              <span className="text-[10px] text-tertiary font-semibold">Đã ẩn danh thông tin PII</span>
            </div>
          </div>

          {/* Main Comparison Layout: Left Criteria (7 cols), Right Transcript Quote Rail (5 cols) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left 4 Criteria (7 cols) */}
            <div className="lg:col-span-7 space-y-4">
              <span className="text-xs font-bold uppercase tracking-wider text-outline block">
                Bảng điểm chi tiết theo 4 tiêu chí Rubric (Tổng 10.0đ)
              </span>

              {result.evaluations.map((ev) => (
                <div
                  key={ev.criterionId}
                  className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant/30 shadow-sm space-y-3"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
                    <div>
                      <span className="text-xs font-mono font-bold text-secondary block">
                        {ev.criterionId}
                      </span>
                      <h4 className="text-sm font-bold text-on-surface font-merriweather">
                        {ev.criterionName}
                      </h4>
                    </div>

                    <div className="text-right">
                      <span className="text-base font-bold text-primary font-mono">
                        {ev.awardedScore.toFixed(2)} / {ev.maxScore.toFixed(1)}đ
                      </span>
                    </div>
                  </div>

                  {/* Strengths */}
                  {ev.strengths.length > 0 && (
                    <div className="space-y-1 text-xs">
                      <span className="text-[11px] font-bold text-tertiary flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">check_circle</span>
                        Điểm sáng &amp; Năng lực đạt được:
                      </span>
                      <ul className="list-disc list-inside space-y-0.5 text-on-surface-variant text-[11px] pl-1">
                        {ev.strengths.map((str, idx) => (
                          <li key={idx}>{str}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Weaknesses / Missing */}
                  {(ev.weaknesses.length > 0 || (ev.missingElements && ev.missingElements.length > 0)) && (
                    <div className="space-y-1 text-xs">
                      <span className="text-[11px] font-bold text-[#CA8A04] flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">warning</span>
                        Điểm cần bổ sung / Giới hạn:
                      </span>
                      <ul className="list-disc list-inside space-y-0.5 text-on-surface-variant text-[11px] pl-1">
                        {ev.weaknesses.map((wk, idx) => (
                          <li key={idx}>{wk}</li>
                        ))}
                        {ev.missingElements?.map((ms, idx) => (
                          <li key={`ms-${idx}`} className="text-error font-medium">{ms}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Errors row for C3 */}
                  {ev.errors && ev.errors.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[11px] font-bold text-error flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">error</span>
                        Các lỗi cụ thể được phát hiện:
                      </span>
                      <div className="space-y-1.5">
                        {ev.errors.map((err, idx) => (
                          <div
                            key={idx}
                            onClick={() => setHighlightedLine(err.lineRef)}
                            className="p-2.5 bg-surface-container-low/60 rounded-lg border border-outline-variant/30 text-[11px] cursor-pointer hover:border-secondary transition-all"
                          >
                            <div className="flex items-center justify-between font-semibold mb-0.5">
                              <span className="text-secondary flex items-center gap-1">
                                <span className="material-symbols-outlined text-[13px]">location_on</span>
                                Dòng {err.lineRef}: “{err.quote}”
                              </span>
                              <span className="text-error font-mono font-bold">-{err.penalty}đ</span>
                            </div>
                            <p className="text-on-surface-variant">{err.issue}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* General Comment */}
                  {ev.comment && (
                    <p className="text-[11px] text-on-surface-variant italic pt-1 border-t border-outline-variant/20">
                      Nhận xét: {ev.comment}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* Right Transcript Rail (5 cols) & Actionable Pedagogical Tasks */}
            <div className="lg:col-span-5 space-y-5">
              {/* Transcript Reference Preview */}
              <div className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant/30 shadow-sm space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
                  <span className="text-xs font-bold uppercase tracking-wider text-secondary flex items-center gap-1">
                    <span className="material-symbols-outlined text-base">format_quote</span>
                    Trích đoạn đối chiếu trực tiếp
                  </span>
                  <span className="text-[11px] text-on-surface-variant">
                    {highlightedLine ? `Đang xem dòng ${highlightedLine}` : 'Chọn lỗi để xem'}
                  </span>
                </div>

                <div className="p-3 bg-surface-container-low/40 rounded-xl max-h-56 overflow-y-auto space-y-1 font-mono text-xs">
                  {result.transcription.slice(10, 18).map((line, idx) => {
                    const lineNum = idx + 11;
                    const isTarget = lineNum === highlightedLine;
                    return (
                      <div
                        key={idx}
                        className={`p-1 rounded flex items-start gap-2 ${
                          isTarget ? 'bg-[#FEF9C3] border border-[#FDE047] font-semibold text-black' : 'text-on-surface-variant'
                        }`}
                      >
                        <span className="text-outline text-[10px] w-5 text-right">{lineNum}</span>
                        <span className="flex-1 font-sans text-[11px] leading-relaxed">{line}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Actionable Pedagogical Tasks */}
              <div className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant/30 shadow-sm space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
                  <span className="material-symbols-outlined text-base">task_alt</span>
                  Gợi ý cải thiện năng lực (Pedagogical Next Steps)
                </div>

                <div className="space-y-2.5">
                  {result.pedagogicalTasks.map((task) => (
                    <div
                      key={task.id}
                      className="p-3 bg-surface-container-low/50 rounded-xl border border-outline-variant/30 text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-on-surface">{task.title}</span>
                        <button
                          onClick={() => {
                            if (task.id === 'TASK_3') {
                              router.push('/assignments/assign-nlxh-01/socratic');
                            } else {
                              addToast(`Đã mở bài tập luyện tập: ${task.title}`, 'info');
                            }
                          }}
                          className="px-2 py-0.5 bg-surface-container-lowest text-secondary rounded text-[10px] font-bold border border-secondary/30 hover:bg-secondary hover:text-white transition-all"
                        >
                          {task.actionLabel} &rarr;
                        </button>
                      </div>
                      <p className="text-[11px] text-on-surface-variant leading-relaxed">
                        {task.description}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="pt-2 flex items-center justify-between gap-2 text-xs">
                  <button
                    onClick={() => {
                      addToast('Đã lưu các gợi ý này vào Sổ tay văn học cá nhân.', 'success');
                    }}
                    className="w-1/2 py-2 rounded-lg border border-outline-variant/60 text-center font-medium hover:bg-surface-container"
                  >
                    Lưu vào Sổ tay
                  </button>
                  <button
                    onClick={() => {
                      addToast('Đã gửi câu hỏi thắc mắc tới Cô Nguyễn Thu Hà.', 'success');
                    }}
                    className="w-1/2 py-2 rounded-lg bg-secondary text-white text-center font-bold hover:bg-secondary/90 shadow-sm"
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
  );
}

