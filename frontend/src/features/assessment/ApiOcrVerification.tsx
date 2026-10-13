'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import StudentShell from '@/components/StudentShell';
import AssignmentWorkflowStepper from '@/components/AssignmentWorkflowStepper';
import { ApiError, type ApiSubmissionDraft } from '@/lib/api/types';
import { openSubmissionDraft, reportOcrIssue } from '@/lib/api/submissions';
import { resolveApiAssetUrl } from '@/lib/data-mode';
import { useAppStore } from '@/lib/store';

export default function ApiOcrVerification() {
  const router = useRouter();
  const params = useParams();
  const assignmentId = String(params?.id ?? '');
  const addToast = useAppStore((state) => state.addToast);

  const [draft, setDraft] = useState<ApiSubmissionDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPageIndex, setSelectedPageIndex] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [note, setNote] = useState('');
  const [reportingSegmentId, setReportingSegmentId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void openSubmissionDraft(assignmentId)
      .then((data) => {
        if (active) setDraft(data);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof ApiError ? cause.message : 'Không tải được bản OCR.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [assignmentId]);

  const handleReport = async (pageId: string, segmentId: string, text: string) => {
    if (!draft?.ocr) return;
    try {
      await reportOcrIssue(draft.id, {
        ocrRevisionId: draft.ocr.id,
        pageId,
        segmentId,
        reportedText: text,
        note,
      });
      setReportingSegmentId(null);
      setNote('');
      addToast('Đã gửi báo lỗi đoạn trích xuất tới giáo viên. Giáo viên sẽ kiểm tra và hiệu đính bản chép.', 'success');
    } catch (cause) {
      const msg = cause instanceof ApiError ? cause.message : 'Không gửi được báo lỗi.';
      setError(msg);
      addToast(msg, 'error');
    }
  };

  const pages = draft?.pages ?? [];
  const selectedPage = pages[selectedPageIndex] ?? pages[0];
  const ocrPage = draft?.ocr?.rawPages.pages.find((p) => p.pageId === selectedPage?.id);
  const segments = ocrPage?.segments ?? [];
  const needsReviewCount = segments.filter((s) => s.needsReview).length;

  const statusDescription =
    draft?.status === 'CONFIRMED'
      ? 'Giáo viên đã xác nhận bản chép số hóa; đã sẵn sàng chuyển sang bước chấm điểm.'
      : draft?.status === 'OCR_REVIEW'
      ? 'Em hãy đối chiếu ảnh chữ viết tay (bên trái) với bản chép số hóa (bên phải). Nếu có đoạn bóc tách chưa chính xác, em hãy báo lỗi để giáo viên hiệu đính.'
      : draft?.status === 'OCR_FAILED'
      ? 'Quá trình nhận dạng OCR gặp sự cố. Giáo viên sẽ kiểm tra và kích hoạt lại.'
      : 'Bản nhận dạng OCR đang được xử lý trên hệ thống.';

  return (
    <StudentShell headerTitle="Kiểm tra bản chép OCR" headerSubtitle="Giai đoạn 4 / Kiểm tra bản chép OCR">
      <div className="max-w-7xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-outline-variant/20">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs bg-secondary-fixed/50 text-secondary font-bold px-2 py-0.5 rounded-full">
                Giai đoạn 4 / Kiểm tra bản chép OCR
              </span>
              <span className="text-xs text-on-surface-variant font-mono">
                {draft ? `Bài nộp: ${draft.id.slice(0, 8)}` : ''}
              </span>
            </div>
            <h1 className="font-headline-md text-xl font-bold text-on-surface font-merriweather">
              Đối chiếu Ảnh bài viết tay &amp; Bản chép số hóa
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {draft?.status === 'CONFIRMED' && (
              <Link
                href={`/assignments/${assignmentId}/result`}
                className="px-4 py-2 bg-primary-container text-on-primary-container text-xs font-bold rounded-lg hover:brightness-95 transition-all shadow-sm flex items-center gap-1.5"
              >
                <span>Xem kết quả chấm Rubric</span>
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </Link>
            )}
            <Link
              href={`/assignments/${assignmentId}/submit`}
              className="px-3.5 py-1.5 rounded-lg border border-outline-variant/60 text-xs font-semibold text-on-surface hover:bg-surface-container transition-all flex items-center gap-1 shadow-sm"
            >
              <span className="material-symbols-outlined text-sm">arrow_back</span>
              <span>Quay lại ảnh</span>
            </Link>
          </div>
        </div>

        {/* Unified 5-Step Workflow Stepper */}
        <AssignmentWorkflowStepper currentStep="ocr" assignmentId={assignmentId} />

        {error && (
          <div role="alert" className="p-3 bg-error-container/60 border border-error/30 rounded-lg text-xs text-error">
            {error}
          </div>
        )}

        {/* Notice Card */}
        <div className="p-3.5 bg-surface-container-low/50 rounded-xl border border-outline-variant/30 text-xs text-on-surface-variant flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary text-base">info</span>
            <span>
              <strong>Lưu ý nhận dạng:</strong> {statusDescription}
            </span>
          </div>
          {draft?.status === 'OCR_REVIEW' && (
            <span className="font-mono text-[11px] bg-surface-container-lowest px-2.5 py-1 rounded border border-outline-variant/30 text-secondary font-semibold shrink-0">
              {needsReviewCount > 0 ? `${needsReviewCount} đoạn cần rà soát` : 'Các đoạn nhận dạng tốt'}
            </span>
          )}
        </div>

        {loading || !draft ? (
          <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-on-surface-variant">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            Đang tải dữ liệu bản chép số hóa OCR...
          </div>
        ) : draft.status === 'OCR_FAILED' ? (
          <div className="p-12 text-center bg-surface-container-lowest rounded-xl border border-error/30 space-y-3">
            <div className="w-12 h-12 rounded-full bg-error-container/40 flex items-center justify-center text-error mx-auto">
              <span className="material-symbols-outlined text-2xl">error</span>
            </div>
            <h3 className="text-base font-bold text-error">Quá trình trích xuất OCR chưa thành công</h3>
            <p className="text-xs text-on-surface-variant max-w-sm mx-auto">
              Chất lượng ảnh có thể quá mờ hoặc hệ thống gặp trục trặc tạm thời. Giáo viên sẽ chạy lại quá trình nhận dạng.
            </p>
            <Link
              href={`/assignments/${assignmentId}/submit`}
              className="inline-block px-4 py-2 bg-primary-container text-on-primary-container text-xs font-semibold rounded-lg"
            >
              Kiểm tra lại ảnh bài làm
            </Link>
          </div>
        ) : (
          /* Desktop Split View: Left Masked Paper (5 cols), Right Line-numbered Transcript (7 cols) */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left Image View (5 cols) */}
            <div className="lg:col-span-5 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm flex flex-col h-[660px]">
              {/* Image Toolbar */}
              <div className="p-3 border-b border-outline-variant/20 flex items-center justify-between text-xs">
                {/* Page Selector Tabs */}
                <div className="flex items-center gap-1.5 overflow-x-auto">
                  {pages.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedPageIndex(idx)}
                      className={`px-2.5 py-1 rounded font-semibold text-xs transition-colors shrink-0 ${
                        selectedPageIndex === idx
                          ? 'bg-secondary text-white shadow-xs'
                          : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                      }`}
                    >
                      Trang {idx + 1} / {pages.length}
                    </button>
                  ))}
                </div>

                {/* Zoom Controls */}
                <div className="flex items-center gap-1 text-on-surface-variant shrink-0">
                  <button
                    onClick={() => setZoomLevel(Math.max(80, zoomLevel - 10))}
                    title="Thu nhỏ"
                    className="p-1 hover:bg-surface-container rounded"
                  >
                    <span className="material-symbols-outlined text-sm">zoom_out</span>
                  </button>
                  <span className="font-mono text-[11px] px-1">{zoomLevel}%</span>
                  <button
                    onClick={() => setZoomLevel(Math.min(160, zoomLevel + 10))}
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
                {selectedPage ? (
                  <div
                    className="bg-white shadow-md rounded border border-[#E5E0D5] w-full max-w-md overflow-hidden transition-transform duration-150"
                    style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center' }}
                  >
                    {/* Masked PII Bar */}
                    <div className="p-2 bg-[#2D3748] text-white text-[10px] flex items-center justify-between font-mono">
                      <span>VÙNG DANH TÍNH ĐÃ MÃ HÓA PII</span>
                      <span className="text-[#63B3ED] font-bold">[TRANG {selectedPageIndex + 1}]</span>
                    </div>
                    <img
                      src={resolveApiAssetUrl(selectedPage.derivativeUrl)}
                      alt={`Trang ${selectedPageIndex + 1}`}
                      className="w-full object-contain bg-white"
                    />
                  </div>
                ) : (
                  <p className="text-xs text-on-surface-variant">Không có trang ảnh nào</p>
                )}
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
                    Nội dung trích xuất thuộc Trang {selectedPageIndex + 1} ({segments.length} đoạn)
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {draft.status === 'CONFIRMED' ? (
                    <span className="text-tertiary font-bold flex items-center gap-1 text-[11px]">
                      <span className="material-symbols-outlined text-sm">check_circle</span>
                      Đã xác nhận hoàn tất
                    </span>
                  ) : needsReviewCount > 0 ? (
                    <span className="text-[#CA8A04] font-bold flex items-center gap-1 text-[11px]">
                      <span className="material-symbols-outlined text-sm">warning</span>
                      {needsReviewCount} đoạn cần rà soát
                    </span>
                  ) : (
                    <span className="text-tertiary font-medium text-[11px]">
                      Đã đối chiếu ổn định
                    </span>
                  )}
                </div>
              </div>

              {/* Segments List Scroll Area */}
              <div className="flex-1 p-4 overflow-y-auto space-y-3 text-xs">
                {segments.length === 0 ? (
                  <div className="p-8 text-center text-on-surface-variant text-xs">
                    Chưa có đoạn văn bản trích xuất cho trang này.
                  </div>
                ) : (
                  segments.map((segment, sIdx) => {
                    const isReporting = reportingSegmentId === segment.id;
                    return (
                      <div
                        key={segment.id}
                        className={`p-3.5 rounded-xl border transition-all space-y-2 ${
                          segment.needsReview
                            ? 'bg-[#FEF9C3]/40 border-[#FDE047]'
                            : 'bg-surface-container-low/40 border-outline-variant/30'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-[10px] font-mono font-bold text-secondary bg-surface-container px-1.5 py-0.5 rounded">
                            Đoạn {sIdx + 1}
                          </span>
                          {segment.needsReview && (
                            <span className="text-[10px] font-semibold text-error bg-error-container/40 px-2 py-0.5 rounded flex items-center gap-1">
                              <span className="material-symbols-outlined text-[12px]">warning</span>
                              Cần rà soát: {segment.reason ?? 'khó đọc'}
                            </span>
                          )}
                        </div>

                        <p className="font-merriweather text-xs leading-relaxed text-on-surface">
                          {segment.text}
                        </p>

                        {/* Student Report Action */}
                        {draft.status === 'OCR_REVIEW' && (
                          <div className="pt-2 border-t border-outline-variant/20 flex flex-col gap-2">
                            {!isReporting ? (
                              <button
                                data-testid="report-ocr-issue"
                                type="button"
                                onClick={() => setReportingSegmentId(segment.id)}
                                className="self-end text-[11px] font-semibold text-primary hover:underline flex items-center gap-1"
                              >
                                <span className="material-symbols-outlined text-[13px]">flag</span>
                                <span>Báo lỗi đoạn này</span>
                              </button>
                            ) : (
                              <div className="p-2.5 bg-surface-container-lowest rounded-lg border border-outline-variant/40 space-y-2">
                                <label className="block text-[11px] font-semibold text-on-surface">
                                  Ghi chú lỗi nhận dạng cho giáo viên:
                                </label>
                                <input
                                  type="text"
                                  value={note}
                                  onChange={(e) => setNote(e.target.value)}
                                  placeholder="VD: Chữ 'kiên trì' bị nhận dạng nhầm thành 'kiên quyết'..."
                                  className="w-full px-2.5 py-1.5 text-xs rounded border border-outline-variant/60 bg-surface focus:outline-none focus:border-secondary"
                                />
                                <div className="flex justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setReportingSegmentId(null)}
                                    className="px-2.5 py-1 text-xs text-on-surface-variant hover:underline"
                                  >
                                    Hủy
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleReport(selectedPage.id, segment.id, segment.text)}
                                    className="px-3 py-1 bg-primary-container text-on-primary-container rounded font-bold text-xs shadow-xs"
                                  >
                                    Gửi báo lỗi
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Bottom Footer Area */}
              <div className="p-3.5 border-t border-outline-variant/20 bg-surface-container-low/40 rounded-b-xl flex items-center justify-between text-xs">
                <span className="text-[11px] text-on-surface-variant">
                  Thao tác báo lỗi giúp giáo viên có cơ sở hiệu đính bản chép trước khi chấm.
                </span>
                {draft.status === 'CONFIRMED' && (
                  <Link
                    href={`/assignments/${assignmentId}/result`}
                    className="px-3.5 py-1.5 bg-primary-container text-on-primary-container rounded-lg font-bold hover:brightness-95 transition-all text-xs shadow-sm flex items-center gap-1"
                  >
                    <span>Xem kết quả chấm</span>
                    <span className="material-symbols-outlined text-sm">arrow_forward</span>
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </StudentShell>
  );
}
