'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import StudentShell from '@/components/StudentShell';
import AssignmentWorkflowStepper from '@/components/AssignmentWorkflowStepper';
import { useAppStore } from '@/lib/store';
import { AuthApiError } from '@/lib/auth-types';
import { submissionApi } from '@/features/submission/api';
import type { SubmissionPayload, TranscriptionPage, TranscriptionSegment } from '@/features/submission/types';

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof AuthApiError ? err.message : fallback;
}

function statusLabel(status: string): string {
  if (status === 'queued') return 'Chờ số hóa';
  if (status === 'processing') return 'Đang số hóa';
  if (status === 'review') return 'Cần rà soát';
  if (status === 'failed') return 'Lỗi số hóa';
  if (status === 'confirmed') return 'Đã xác nhận';
  return 'Bản nháp';
}

export default function OcrVerificationPage() {
  const params = useParams();
  const assignmentId = (params?.id as string) || '';
  const { addToast, currentUser } = useAppStore();

  const [payload, setPayload] = useState<SubmissionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [activePageIndex, setActivePageIndex] = useState(1);
  const [zoomScale, setZoomScale] = useState(1);
  const [rotationAngle, setRotationAngle] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [draftPages, setDraftPages] = useState<TranscriptionPage[]>([]);

  const applyPayload = useCallback((data: SubmissionPayload) => {
    setPayload(data);
    setDraftPages(data.transcriptionPages || []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await submissionApi.getOcr(assignmentId);
        if (!cancelled) applyPayload(data);
      } catch (err) {
        if (!cancelled) setLoadError(errorMessage(err, 'Không tải được bản chép OCR.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assignmentId, applyPayload]);

  useEffect(() => {
    if (!payload) return;
    if (payload.status !== 'queued' && payload.status !== 'processing') return;
    const timer = window.setInterval(() => {
      void submissionApi
        .getOcr(assignmentId)
        .then(applyPayload)
        .catch(() => {
          /* keep waiting; polling must not report failure just because OCR is slow */
        });
    }, 2500);
    return () => window.clearInterval(timer);
  }, [assignmentId, payload?.status, applyPayload]);

  const pages = payload?.pages || [];
  const activeImage = pages.find((p) => p.pageIndex === activePageIndex) || pages[0];
  const activeTranscription =
    draftPages.find((t) => t.pageIndex === (activeImage?.pageIndex || activePageIndex)) || draftPages[0];

  const handleResetView = () => {
    setZoomScale(1);
    setRotationAngle(0);
  };

  const handleSaveSegment = async (segment: TranscriptionSegment) => {
    if (!payload) return;
    const nextPages = draftPages.map((page) =>
      page.pageIndex === activeTranscription?.pageIndex
        ? {
            ...page,
            segments: page.segments.map((item) =>
              item.segmentId === segment.segmentId ? { ...item, text: editingText, needsReview: false } : item
            ),
          }
        : page
    );
    setBusy(true);
    try {
      const saved = await submissionApi.saveSegments(assignmentId, {
        expectedRevision: payload.expectedRevision,
        pages: nextPages,
      });
      applyPayload(saved);
      setEditingId(null);
      addToast('Đã lưu chỉnh sửa dòng này.', 'success');
    } catch (err) {
      addToast(errorMessage(err, 'Không lưu được chỉnh sửa.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    if (!payload) return;
    setBusy(true);
    try {
      const saved = await submissionApi.confirm(assignmentId, {
        expectedRevision: payload.expectedRevision,
        pages: draftPages,
      });
      applyPayload(saved);
      addToast('Bản chép đã xác nhận — Chờ đánh giá.', 'success');
    } catch (err) {
      addToast(errorMessage(err, 'Không xác nhận được bản chép.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleRetry = async () => {
    setBusy(true);
    try {
      const saved = await submissionApi.retryOcr(assignmentId);
      applyPayload(saved);
      addToast('Đã gửi lại yêu cầu số hóa với cùng bộ ảnh.', 'success');
    } catch (err) {
      addToast(errorMessage(err, 'Không thử lại được OCR.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleReopen = async () => {
    setBusy(true);
    try {
      const saved = await submissionApi.reopen(assignmentId);
      applyPayload(saved);
      addToast('Đã mở bản nháp mới. Em sửa xong hãy xác nhận lại.', 'info');
    } catch (err) {
      addToast(errorMessage(err, 'Không mở lại bản chép được.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <StudentShell headerTitle="Đối chiếu bản chép số hóa" headerSubtitle="Đang tải...">
        <div className="max-w-3xl mx-auto p-10 text-sm text-on-surface-variant">Đang tải bản chép...</div>
      </StudentShell>
    );
  }

  if (loadError || !payload) {
    return (
      <StudentShell headerTitle="Đối chiếu bản chép số hóa" headerSubtitle="Không tải được">
        <div className="max-w-3xl mx-auto p-6 bg-surface-container-lowest rounded-xl border text-sm text-error">
          {loadError || 'Không tải được bài nộp.'}
        </div>
      </StudentShell>
    );
  }

  const assignment = payload.assignment;
  const waiting = payload.status === 'queued' || payload.status === 'processing';
  const confirmed = payload.status === 'confirmed';
  const failed = payload.status === 'failed';
  const canEdit = payload.status === 'review';

  return (
    <StudentShell headerTitle="Đối chiếu bản chép số hóa" headerSubtitle={`${assignment.code}: ${assignment.title}`}>
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-outline-variant/20">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs bg-secondary-fixed/50 text-secondary font-bold px-2 py-0.5 rounded-full">
                Bước 4: Kiểm tra &amp; Đối chiếu OCR
              </span>
              <span className="text-xs text-on-surface-variant font-mono">
                Học sinh: {currentUser?.name || payload.student.displayName} ({payload.student.loginId})
              </span>
            </div>
            <h1 className="font-headline-md text-xl font-bold text-on-surface font-merriweather">
              Đối chiếu Ảnh bài viết tay &amp; Bản chép số hóa
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-surface-container-high text-on-surface border border-outline-variant/30">
              {statusLabel(payload.status)}
            </span>
            {canEdit && (
              <button
                onClick={() => void handleConfirm()}
                disabled={busy}
                className="px-4 py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary/90 transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50"
              >
                <span>Xác nhận bản chép</span>
                <span className="material-symbols-outlined text-sm">check</span>
              </button>
            )}
          </div>
        </div>

        <AssignmentWorkflowStepper currentStep="ocr" assignmentId={assignmentId} />

        {payload.status === 'draft' && (
          <div className="p-3 rounded-xl border border-outline-variant/40 bg-surface-container-low text-xs">
            Em chưa nộp ảnh. <Link href={`/assignments/${assignmentId}/submit`} className="text-primary font-semibold">Về bước nộp ảnh</Link>
          </div>
        )}

        {waiting && (
          <div className="p-3 rounded-xl border border-primary/30 bg-primary-container/20 text-xs text-on-surface">
            Hệ thống đang số hóa bài viết tay của em. Trang này chỉ đọc trạng thái, không tạo job mới. Hãy giữ trang; không phải lỗi vì chờ lâu.
          </div>
        )}

        {failed && (
          <div className="p-3 rounded-xl border border-error/40 bg-error-container/30 text-xs space-y-2">
            <p className="font-semibold text-error">Không số hóa được bài.</p>
            <p>{payload.ocrError || 'Một hoặc nhiều trang lỗi. Em thử lại cùng bộ ảnh, hoặc nộp bộ ảnh mới.'}</p>
            {Object.keys(payload.ocrPageErrors || {}).length > 0 && (
              <ul className="list-disc pl-4">
                {Object.entries(payload.ocrPageErrors).map(([page, reason]) => (
                  <li key={page}>
                    Trang {page}: {reason}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleRetry()}
                className="px-3 py-1.5 bg-primary text-white rounded-lg font-semibold"
              >
                Thử lại OCR
              </button>
              <Link
                href={`/assignments/${assignmentId}/submit`}
                className="px-3 py-1.5 border rounded-lg font-semibold"
              >
                Thay ảnh / nộp lại
              </Link>
            </div>
          </div>
        )}

        {confirmed && (
          <div className="p-3 rounded-xl border border-tertiary/40 bg-tertiary-container/30 text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <span className="font-semibold text-tertiary">Bản chép đã xác nhận — Chờ đánh giá</span>
            <button type="button" onClick={() => void handleReopen()} className="px-3 py-1.5 border rounded-lg font-semibold">
              Chỉnh sửa lại bản chép
            </button>
          </div>
        )}

        <div className="p-2.5 bg-surface-container-low/70 rounded-xl border border-outline-variant/30 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-on-surface mr-1">Chọn trang đối chiếu:</span>
            {pages.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setActivePageIndex(p.pageIndex);
                  handleResetView();
                  setEditingId(null);
                }}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all flex items-center gap-1.5 ${
                  activePageIndex === p.pageIndex
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-surface-container-lowest text-on-surface border border-outline-variant/40 hover:bg-surface-container'
                }`}
              >
                <span className="material-symbols-outlined text-sm">description</span>
                <span>Trang 0{p.pageIndex}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 bg-surface-container-lowest p-1 rounded-lg border border-outline-variant/40">
            <span className="text-[11px] text-outline font-medium px-2">Kính lúp:</span>
            <button onClick={() => setZoomScale((v) => Math.max(v - 0.25, 0.5))} className="p-1.5 rounded hover:bg-surface-container">
              <span className="material-symbols-outlined text-base">zoom_out</span>
            </button>
            <span className="text-[11px] font-mono px-1 min-w-[45px] text-center font-semibold">
              {Math.round(zoomScale * 100)}%
            </span>
            <button onClick={() => setZoomScale((v) => Math.min(v + 0.25, 2.5))} className="p-1.5 rounded hover:bg-surface-container">
              <span className="material-symbols-outlined text-base">zoom_in</span>
            </button>
            <div className="h-4 w-px bg-outline-variant/40 mx-1"></div>
            <button
              onClick={() => setRotationAngle((v) => (v + 90) % 360)}
              className="p-1.5 rounded hover:bg-surface-container flex items-center gap-1 text-[11px]"
            >
              <span className="material-symbols-outlined text-base">rotate_right</span>
              <span>Xoay</span>
            </button>
            <button
              onClick={handleResetView}
              className="p-1.5 rounded hover:bg-surface-container flex items-center gap-1 text-[11px]"
            >
              <span className="material-symbols-outlined text-base">fit_screen</span>
              <span>Vừa khung</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-6 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm flex flex-col h-[650px] overflow-hidden">
            <div className="p-3 bg-surface-container-low/60 border-b border-outline-variant/20 flex items-center justify-between text-xs">
              <span className="font-bold text-primary flex items-center gap-1.5 font-merriweather">
                <span className="material-symbols-outlined text-sm">photo_camera</span>
                <span>Ảnh đã gửi OCR — Trang 0{activeImage?.pageIndex || activePageIndex}</span>
              </span>
              <span className="text-[11px] text-on-surface-variant font-mono">{activeImage?.size || ''}</span>
            </div>
            <div className="flex-1 bg-surface-container p-4 overflow-auto flex items-center justify-center relative">
              {activeImage ? (
                <div
                  style={{ transform: `scale(${zoomScale}) rotate(${rotationAngle}deg)`, transition: 'transform 0.15s ease-out' }}
                  className="origin-center max-w-full max-h-full flex items-center justify-center"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    key={activeImage.processedSha256 || activeImage.id}
                    src={activeImage.imageUrl}
                    alt={activeImage.filename}
                    className="max-h-[580px] w-auto object-contain rounded-md shadow-md border border-outline-variant/40 select-none"
                  />
                </div>
              ) : (
                <div className="text-center text-xs text-on-surface-variant">Không có ảnh trang này</div>
              )}
            </div>
          </div>

          <div className="lg:col-span-6 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm flex flex-col h-[650px]">
            <div className="p-3 bg-surface-container-low/60 border-b border-outline-variant/20 flex items-center justify-between text-xs">
              <div>
                <span className="font-bold text-secondary flex items-center gap-1.5 font-merriweather">
                  <span className="material-symbols-outlined text-sm">text_snippet</span>
                  <span>
                    Bản chép số hóa — Trang 0{activeTranscription?.pageIndex || activePageIndex} (
                    {activeTranscription?.segments.length || 0} dòng)
                  </span>
                </span>
                <span className="text-[10px] text-on-surface-variant">
                  Dòng vàng cần kiểm tra. Bấm biểu tượng sửa để đính chính, rồi xác nhận bản chép.
                </span>
              </div>
              <span className="text-[11px] font-semibold text-tertiary bg-tertiary-container/30 px-2 py-0.5 rounded">
                Số hóa theo trang
              </span>
            </div>

            <div className="flex-1 p-4 overflow-y-auto space-y-2 text-xs font-serif leading-relaxed">
              {waiting && (
                <div className="p-8 text-center text-on-surface-variant">Đang chờ bản chép từ OCR...</div>
              )}
              {!waiting &&
                (activeTranscription?.segments || []).map((segment) => {
                  const isEditing = editingId === segment.segmentId;
                  const needsReview = segment.needsReview || /\[[^\]]+\]/.test(segment.text);
                  if (isEditing) {
                    return (
                      <div
                        key={segment.segmentId}
                        className="p-2 bg-surface-container-lowest rounded-lg border-2 border-secondary space-y-2 shadow-xs"
                      >
                        <div className="flex items-center justify-between text-[11px] font-mono text-outline">
                          <span>Sửa dòng {segment.order}:</span>
                        </div>
                        <textarea
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          rows={2}
                          className="w-full p-2 text-xs rounded border border-outline-variant/60 font-serif focus:outline-none focus:border-secondary"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => void handleSaveSegment(segment)}
                            disabled={busy}
                            className="px-3 py-1 bg-secondary text-white rounded text-xs font-semibold"
                          >
                            Lưu dòng này
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-2.5 py-1 text-xs text-on-surface-variant hover:bg-surface-container rounded"
                          >
                            Hủy
                          </button>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div
                      key={segment.segmentId}
                      className={`p-2 rounded-lg border flex items-start justify-between gap-3 group transition-all ${
                        needsReview
                          ? 'bg-[#FEF9C3]/50 border-[#CA8A04]/40'
                          : 'bg-surface-container-low/30 border-outline-variant/20 hover:border-secondary/40'
                      }`}
                    >
                      <div className="flex items-start gap-2.5 flex-1">
                        <span className="font-mono text-[10px] text-outline select-none mt-0.5 w-6 shrink-0">
                          {String(segment.order).padStart(2, '0')}.
                        </span>
                        <p className="text-on-surface text-[12px] leading-relaxed flex-1">
                          {segment.text}
                          {segment.reviewReason ? (
                            <span className="block text-[10px] text-[#854D0E] mt-1">{segment.reviewReason}</span>
                          ) : null}
                        </p>
                      </div>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(segment.segmentId);
                            setEditingText(segment.text);
                          }}
                          title="Sửa dòng này"
                          className="opacity-0 group-hover:opacity-100 p-1 text-on-surface-variant hover:text-secondary rounded transition-opacity"
                        >
                          <span className="material-symbols-outlined text-[15px]">edit</span>
                        </button>
                      )}
                    </div>
                  );
                })}
            </div>

            <div className="p-3.5 border-t border-outline-variant/20 bg-surface-container-low/50 rounded-b-xl flex items-center justify-between text-xs gap-3">
              <span className="text-on-surface-variant text-[11px]">
                {confirmed
                  ? 'Bản chép đã xác nhận — Chờ đánh giá. Chấm rubric AI chưa mở.'
                  : `Đã đối chiếu kỹ các trang bài làm (${pages.length} trang)?`}
              </span>
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => void handleConfirm()}
                  disabled={busy}
                  className="py-2 px-5 bg-primary text-white font-bold text-xs rounded-lg hover:bg-primary/90 transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                >
                  <span>Xác nhận bản chép</span>
                  <span className="material-symbols-outlined text-sm">check</span>
                </button>
              ) : confirmed ? (
                <span className="text-tertiary font-semibold">Chờ đánh giá</span>
              ) : (
                <Link href={`/assignments/${assignmentId}/submit`} className="text-primary font-semibold">
                  Về nộp ảnh
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </StudentShell>
  );
}
