'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import StudentShell from '@/components/StudentShell';
import AssignmentWorkflowStepper from '@/components/AssignmentWorkflowStepper';
import { useAppStore } from '@/lib/store';
import { MOCK_TRANSCRIPTION_LINES } from '@/lib/mock/data';
import { isApiMode } from '@/lib/data-mode';
import UnimplementedPanel from '@/components/UnimplementedPanel';

export default function OcrVerificationPage() {
  if (isApiMode()) {
    return (
      <UnimplementedPanel
        title="Đối chiếu OCR chưa có API"
        description="Bước OCR chưa được triển khai trên HTTP. Feature hiện tại dừng ở lập dàn ý Socratic."
      />
    );
  }
  return <MockOcrVerificationPage />;
}

function MockOcrVerificationPage() {
  const router = useRouter();
  const params = useParams();
  const assignmentId = (params?.id as string) || 'assign-nlxh-01';
  const {
    flaggedSegments,
    correctFlaggedSegment,
    ocrStatus,
    setOcrStatus,
    submitAssignment,
    addToast,
  } = useAppStore();

  const [activePageTab, setActivePageTab] = useState<1 | 2>(1);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [teacherEditMode, setTeacherEditMode] = useState<boolean>(false);
  const [editingText, setEditingText] = useState<string>('sáng suốt');
  const [reportedLines, setReportedLines] = useState<number[]>([]);
  const [simFailure, setSimFailure] = useState<boolean>(false);

  const handleReportLine = (lineIndex: number) => {
    if (reportedLines.includes(lineIndex)) {
      addToast(`Dòng số ${lineIndex + 1} đã được ghi nhận báo lỗi nhận dạng.`, 'info');
      return;
    }
    setReportedLines([...reportedLines, lineIndex]);
    addToast(`Đã báo cáo đoạn dòng ${lineIndex + 1} chưa nhận dạng đúng cho Giáo viên. Lưu ý: Thao tác này không thay đổi bài thi gốc.`, 'info');
  };

  const handleTeacherSaveCorrection = () => {
    correctFlaggedSegment(14, editingText);
    setOcrStatus('confirmed');
    addToast('Giáo viên đã xác nhận bản chép số hóa hoàn tất.', 'success');
  };

  const handleConfirmAndGrade = () => {
    submitAssignment(assignmentId);
    addToast('Đã xác nhận bản chép số hóa và nộp bài. Đang chuyển sang kết quả đánh giá Rubric...', 'success');
    router.push(`/assignments/${assignmentId}/result`);
  };

  return (
    <StudentShell headerTitle="Kiểm tra bản chép OCR" headerSubtitle="Khối 12 - Lớp 12A1">
      <div className="max-w-7xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-outline-variant/20">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs bg-secondary-fixed/50 text-secondary font-bold px-2 py-0.5 rounded-full">
                Giai đoạn 4 / Kiểm tra bản chép OCR
              </span>
              <span className="text-xs text-on-surface-variant font-mono">Bài nộp: SUB_20261012_001</span>
            </div>
            <h1 className="font-headline-md text-xl font-bold text-on-surface font-merriweather">
              Đối chiếu Ảnh bài viết tay &amp; Bản chép số hóa
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-secondary-fixed/40 text-secondary">
              Độ tin cậy OCR toàn bài: <strong>94%</strong>
            </span>
            <button
              onClick={() => handleConfirmAndGrade()}
              className="px-4 py-2 bg-primary-container text-on-primary-container text-xs font-bold rounded-lg hover:brightness-95 transition-all shadow-sm flex items-center gap-1.5"
            >
              <span>Xem kết quả chấm Rubric</span>
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          </div>
        </div>

        {/* Unified 5-Step Workflow Stepper */}
        <AssignmentWorkflowStepper currentStep="ocr" assignmentId={assignmentId} />

        {/* Demo Toolbar */}
        <div className="p-3 bg-surface-container-low/70 rounded-xl border border-outline-variant/30 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-sm text-secondary">tune</span>
            <span className="text-on-surface-variant font-medium">Công cụ thử nghiệm (Demo Control):</span>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={teacherEditMode}
                onChange={(e) => setTeacherEditMode(e.target.checked)}
                className="rounded text-primary focus:ring-primary"
              />
              <span className="font-semibold text-primary">Bật chế độ sửa lỗi bóc tách của GV</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={simFailure}
                onChange={(e) => setSimFailure(e.target.checked)}
                className="rounded text-error focus:ring-error"
              />
              <span className="font-medium text-error">Mô phỏng ảnh mờ / hỏng OCR</span>
            </label>
          </div>
        </div>

        {/* Confidence & Pedagogical Notice */}
        <div className="p-3.5 bg-surface-container-low/50 rounded-xl border border-outline-variant/30 text-xs text-on-surface-variant flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary text-base">info</span>
            <span>
              <strong>Lưu ý nhận dạng:</strong> Độ tin cậy trung bình cao (94%) không thay thế việc rà soát các đoạn bị đánh dấu. Độ tin cậy đo độ nhận dạng ký tự, không phải chất lượng hay điểm số của bài viết.
            </span>
          </div>
          <span className="bg-surface-container-high px-2 py-0.5 rounded text-[11px] font-semibold text-on-surface shrink-0">
            Chờ kiểm tra bản chép • Chưa xuất điểm chính thức
          </span>
        </div>

        {simFailure ? (
          <div className="p-12 text-center bg-surface-container-lowest rounded-xl border border-error/30 shadow-sm space-y-3">
            <div className="w-16 h-16 rounded-full bg-error-container flex items-center justify-center text-error mx-auto">
              <span className="material-symbols-outlined text-3xl">broken_image</span>
            </div>
            <h3 className="text-base font-bold text-error">Không đọc được chữ viết tay</h3>
            <p className="text-xs text-on-surface-variant max-w-sm mx-auto">
              Ảnh bị mất nét chữ hoặc độ tương phản quá thấp. Hệ thống đề xuất chụp lại ảnh bài làm.
            </p>
            <Link
              href={`/assignments/${assignmentId}/submit`}
              className="inline-block px-4 py-2 bg-primary-container text-on-primary-container text-xs font-semibold rounded-lg"
            >
              Nộp lại ảnh khác
            </Link>
          </div>
        ) : (
          /* Desktop Split View: Left Masked Paper, Right Line-numbered Transcript */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left Image View (5 cols) */}
            <div className="lg:col-span-5 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm flex flex-col h-[660px]">
              {/* Image Toolbar */}
              <div className="p-3 border-b border-outline-variant/20 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActivePageTab(1)}
                    className={`px-2.5 py-1 rounded font-semibold ${
                      activePageTab === 1 ? 'bg-secondary text-white' : 'bg-surface-container text-on-surface-variant'
                    }`}
                  >
                    Trang 1 / 2
                  </button>
                  <button
                    onClick={() => setActivePageTab(2)}
                    className={`px-2.5 py-1 rounded font-semibold ${
                      activePageTab === 2 ? 'bg-secondary text-white' : 'bg-surface-container text-on-surface-variant'
                    }`}
                  >
                    Trang 2 / 2
                  </button>
                </div>

                <div className="flex items-center gap-1 text-on-surface-variant">
                  <button
                    onClick={() => setZoomLevel(Math.max(80, zoomLevel - 10))}
                    title="Thu nhỏ"
                    className="p-1 hover:bg-surface-container rounded"
                  >
                    <span className="material-symbols-outlined text-sm">zoom_out</span>
                  </button>
                  <span className="font-mono text-[11px] px-1">{zoomLevel}%</span>
                  <button
                    onClick={() => setZoomLevel(Math.min(150, zoomLevel + 10))}
                    title="Phóng to"
                    className="p-1 hover:bg-surface-container rounded"
                  >
                    <span className="material-symbols-outlined text-sm">zoom_in</span>
                  </button>
                  <button
                    onClick={() => setZoomLevel(100)}
                    title="Đặt lại 100%"
                    className="p-1 hover:bg-surface-container rounded"
                  >
                    <span className="material-symbols-outlined text-sm">restart_alt</span>
                  </button>
                </div>
              </div>

              {/* Lined Paper Canvas with Masked Identity */}
              <div className="flex-1 p-4 bg-[#F5F2EB] overflow-auto flex items-center justify-center">
                <div
                  className="bg-white shadow-md p-6 rounded border border-[#E5E0D5] w-full max-w-md space-y-4 font-merriweather text-xs leading-relaxed transition-all"
                  style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center' }}
                >
                  {/* Paper Header with School & Mask */}
                  <div className="border-b-2 border-black pb-3 space-y-2 font-sans">
                    <div className="flex items-start justify-between text-[10px]">
                      <div>
                        <p className="font-bold text-black uppercase">SỞ GD&amp;ĐT HÀ NỘI</p>
                        <p className="font-bold text-black uppercase">TRƯỜNG THPT ĐAN PHƯỢNG</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-black">BÀI THI MÔN NGỮ VĂN KHỐI 12</p>
                        <p className="text-gray-600">Năm học 2024 - 2025</p>
                      </div>
                    </div>

                    {/* Masked PII Bar */}
                    <div className="p-2 bg-[#2D3748] text-white rounded text-[10px] flex items-center justify-between font-mono">
                      <span>VÙNG DANH TÍNH ĐÃ MÃ HÓA PII</span>
                      <span className="text-[#63B3ED] font-bold">MÃ: VN-12A1-048</span>
                    </div>
                  </div>

                  {/* Handwritten mock text lines */}
                  <div className="space-y-3 pt-2 text-[#2D3748] italic text-[11px]">
                    <p>
                      {activePageTab === 1
                        ? 'Cuộc sống không bao giờ là một đường thẳng bằng phẳng, mà luôn ẩn chứa những khúc quanh gập ghềnh và thử thách chông gai. Trước những biến thiên của thời đại, điều làm nên bản lĩnh của một con người chính là ý chí và lòng kiên định...'
                        : 'Mỗi học sinh chúng ta cần rèn luyện ý chí ngay từ những việc nhỏ nhặt nhất trong cuộc sống hằng ngày. Mặc dù khó khăn nhưng mà nó vẫn luôn là cơ hội để chúng ta rèn luyện bản lĩnh kiên cường...'}
                    </p>
                    <p>
                      {activePageTab === 1
                        ? 'Thật vậy, nếu coi cuộc đời như một chuyến hải trình dài, thì ý chí kiên định chính là chiếc la bàn soi đường chỉ lối giữa bão giông. Người có lòng kiên định luôn biết rõ mình muốn gì và không bao giờ dễ dàng đầu hàng...'
                        : 'Chỉ có qua chải nghiệm thực tế và tôi luyện kiên định, con người mới thực sự trưởng thành và chạm tới thành công. Đứng trước biển lớn cuộc đời, hãy làm con thuyền kiên định vượt sóng gió...'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Line-numbered Transcript Area (7 cols) */}
            <div className="lg:col-span-7 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm flex flex-col h-[660px]">
              <div className="p-3.5 border-b border-outline-variant/20 flex items-center justify-between text-xs">
                <div>
                  <h3 className="font-headline-sm text-sm font-bold text-on-surface font-merriweather">
                    Bản chép số hóa (OCR Text Transcript)
                  </h3>
                  <p className="text-[11px] text-on-surface-variant">
                    Đánh số theo từng dòng thực tế để tiện đối chiếu và chấm barem.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-on-surface-variant">
                    {flaggedSegments[0]?.isCorrected ? (
                      <span className="text-tertiary font-bold flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">check_circle</span>
                        Đã chuẩn hóa 100%
                      </span>
                    ) : (
                      <span className="text-[#CA8A04] font-bold flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">warning</span>
                        1 đoạn nghi ngờ (Dòng 14)
                      </span>
                    )}
                  </span>
                </div>
              </div>

              {/* Transcript Scrollable Lines */}
              <div className="flex-1 p-4 overflow-y-auto space-y-1.5 font-mono text-xs">
                {MOCK_TRANSCRIPTION_LINES.map((line, idx) => {
                  const lineNum = idx + 1;
                  const isFlagged = lineNum === 14;
                  const isReported = reportedLines.includes(idx);

                  return (
                    <div
                      key={idx}
                      className={`p-1.5 rounded flex items-start gap-3 transition-colors ${
                        isFlagged && !flaggedSegments[0]?.isCorrected
                          ? 'bg-[#FEF9C3] border border-[#FDE047]'
                          : isReported
                          ? 'bg-secondary-fixed/30 border border-secondary/30'
                          : 'hover:bg-surface-container-low'
                      }`}
                    >
                      <span className="text-outline text-[11px] select-none w-6 text-right shrink-0">
                        {lineNum}
                      </span>

                      <div className="flex-1 text-on-surface leading-relaxed font-sans text-xs">
                        {isFlagged ? (
                          <div>
                            <span>Mặc dù khó khăn nhưng mà nó vẫn luôn là cơ hội để chúng ta rèn luyện bản lĩnh </span>
                            <span className="bg-[#FDE047] px-1 rounded font-bold text-black border-b-2 border-[#CA8A04]">
                              {flaggedSegments[0]?.isCorrected ? flaggedSegments[0].text : 'sáng suốt (71%)'}
                            </span>
                            <span> kiên cường.</span>

                            {/* Teacher Correction Box */}
                            {teacherEditMode && !flaggedSegments[0]?.isCorrected && (
                              <div className="mt-2 p-2 bg-surface-container-lowest rounded border border-outline-variant/40 flex items-center gap-2">
                                <span className="text-[11px] text-primary font-semibold">Giáo viên sửa:</span>
                                <input
                                  type="text"
                                  value={editingText}
                                  onChange={(e) => setEditingText(e.target.value)}
                                  className="px-2 py-1 text-xs border rounded bg-surface"
                                />
                                <button
                                  type="button"
                                  onClick={handleTeacherSaveCorrection}
                                  className="px-2.5 py-1 bg-primary-container text-on-primary-container font-bold text-xs rounded hover:brightness-95"
                                >
                                  Lưu &amp; Xác nhận
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span>{line}</span>
                        )}
                      </div>

                      {/* Student report button */}
                      <button
                        type="button"
                        onClick={() => handleReportLine(idx)}
                        title="Báo đoạn chưa đọc đúng"
                        className="text-on-surface-variant hover:text-secondary opacity-40 hover:opacity-100 text-[10px] shrink-0"
                      >
                        <span className="material-symbols-outlined text-[14px]">flag</span>
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Bottom Actions */}
              <div className="p-3.5 border-t border-outline-variant/20 bg-surface-container-low/50 rounded-b-xl flex flex-wrap items-center justify-between gap-3 text-xs">
                <span className="text-on-surface-variant">
                  {teacherEditMode
                    ? 'Đang bật quyền chỉnh sửa của Giáo viên'
                    : 'Học sinh chỉ xem bản chép và bấm cờ báo lỗi nếu cần'}
                </span>

                <button
                  type="button"
                  onClick={handleConfirmAndGrade}
                  className="px-4 py-2 bg-primary-container text-on-primary-container font-bold text-xs rounded-lg hover:brightness-95 transition-all shadow-sm flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-base">fact_check</span>
                  <span>Xác nhận bản chép &amp; Chuyển sang Kết quả Rubric</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </StudentShell>
  );
}

