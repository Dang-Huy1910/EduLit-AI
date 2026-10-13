'use client';

import React, { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import StudentShell from '@/components/StudentShell';
import AssignmentWorkflowStepper from '@/components/AssignmentWorkflowStepper';
import { ApiError, type ApiSubmissionDraft } from '@/lib/api/types';
import {
  deleteDraftPage,
  openSubmissionDraft,
  reorderDraftPages,
  requestPrivacyReview,
  setPageMasks,
  uploadDraftPage,
} from '@/lib/api/submissions';
import { resolveApiAssetUrl } from '@/lib/data-mode';
import { useAppStore } from '@/lib/store';

const errorText = (error: unknown) =>
  error instanceof ApiError ? error.message : 'Thao tác chưa hoàn tất. Vui lòng thử lại.';

const STATE_MESSAGES: Record<string, { label: string; badgeClass: string; desc: string }> = {
  DRAFT: {
    label: 'Đang chuẩn bị ảnh',
    badgeClass: 'bg-surface-container-high text-on-surface-variant',
    desc: 'Em hãy tải lên tối đa 4 ảnh bài làm và kiểm tra che thông tin cá nhân trước khi nộp.',
  },
  PRIVACY_RETURNED: {
    label: 'Cần che lại thông tin',
    badgeClass: 'bg-error-container text-error',
    desc: 'Giáo viên yêu cầu che lại thông tin định danh cá nhân trên ảnh bài làm.',
  },
  AWAITING_PRIVACY_REVIEW: {
    label: 'Đang chờ giáo viên duyệt ảnh',
    badgeClass: 'bg-[#FEF9C3] text-[#CA8A04]',
    desc: 'Ảnh bài làm đã được gửi. Giáo viên đang duyệt tính ẩn danh trước khi tiến hành nhận dạng OCR.',
  },
  PRIVACY_APPROVED: {
    label: 'Ảnh đã được duyệt ẩn danh',
    badgeClass: 'bg-tertiary-container/40 text-tertiary',
    desc: 'Ảnh hợp lệ, hệ thống đang xếp hàng xử lý nhận dạng chữ viết tay.',
  },
  OCR_PROCESSING: {
    label: 'Đang nhận dạng chữ viết (OCR)',
    badgeClass: 'bg-secondary-fixed/50 text-secondary',
    desc: 'Mô hình AI Vision đang bóc tách chữ viết tay trên từng trang ảnh.',
  },
  OCR_FAILED: {
    label: 'Nhận dạng OCR cần chạy lại',
    badgeClass: 'bg-error-container text-error',
    desc: 'Quá trình trích xuất gặp sự cố. Giáo viên sẽ kiểm tra và kích hoạt lại.',
  },
  OCR_REVIEW: {
    label: 'Sẵn sàng đối chiếu bản chép',
    badgeClass: 'bg-tertiary-container/40 text-tertiary',
    desc: 'Bản chép số hóa đã sẵn sàng. Em hãy chuyển sang bước tiếp theo để đối chiếu.',
  },
  CONFIRMED: {
    label: 'Bản chép đã xác nhận',
    badgeClass: 'bg-tertiary-container/40 text-tertiary',
    desc: 'Bản chép số hóa đã được xác nhận hoàn tất.',
  },
};

export default function ApiSubmissionUpload() {
  const router = useRouter();
  const params = useParams();
  const assignmentId = String(params?.id ?? '');
  const addToast = useAppStore((state) => state.addToast);

  const [draft, setDraft] = useState<ApiSubmissionDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    let active = true;
    void openSubmissionDraft(assignmentId)
      .then((value) => {
        if (active) setDraft(value);
      })
      .catch((cause) => {
        if (active) setError(errorText(cause));
      });
    return () => {
      active = false;
    };
  }, [assignmentId]);

  const editable = draft?.status === 'DRAFT' || draft?.status === 'PRIVACY_RETURNED';

  const refresh = (value: ApiSubmissionDraft) => {
    setDraft(value);
    setError(null);
  };

  const latestDraft = () => draftRef.current;

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const current = latestDraft();
    if (!file || !current) return;
    if (current.pages.length >= 4) {
      addToast('Chỉ cho phép tối đa 4 trang ảnh cho một bài nộp.', 'warning');
      return;
    }
    setBusy(true);
    try {
      const updated = await uploadDraftPage(current.id, current.revision, file);
      refresh(updated);
      addToast(`Đã thêm Trang 0${updated.pages.length} vào bài làm.`, 'success');
    } catch (cause) {
      const msg = errorText(cause);
      setError(msg);
      addToast(msg, 'error');
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  };

  const handleMaskHeader = async (pageId: string) => {
    const current = latestDraft();
    if (!current) return;
    setBusy(true);
    try {
      const updated = await setPageMasks(current.id, pageId, current.revision, [
        { x: 0, y: 0, width: 1, height: 0.18 },
      ]);
      refresh(updated);
      addToast('Đã áp dụng vùng che thông tin cá nhân ở đầu trang.', 'success');
    } catch (cause) {
      const msg = errorText(cause);
      setError(msg);
      addToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleMove = async (pageId: string, direction: -1 | 1) => {
    const current = latestDraft();
    if (!current) return;
    const ids = current.pages.map((p) => p.id);
    const index = ids.indexOf(pageId);
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    setBusy(true);
    try {
      const updated = await reorderDraftPages(current.id, current.revision, ids);
      refresh(updated);
      addToast('Đã đổi thứ tự trang bài làm.', 'success');
    } catch (cause) {
      const msg = errorText(cause);
      setError(msg);
      addToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleDeletePage = async (pageId: string) => {
    const current = latestDraft();
    if (!current) return;
    setBusy(true);
    try {
      const updated = await deleteDraftPage(current.id, pageId, current.revision);
      refresh(updated);
      addToast('Đã xóa trang ảnh.', 'info');
    } catch (cause) {
      const msg = errorText(cause);
      setError(msg);
      addToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitPrivacy = async () => {
    const current = latestDraft();
    if (!current) return;
    if (current.pages.length === 0) {
      addToast('Vui lòng tải lên ít nhất 1 ảnh bài viết tay.', 'error');
      return;
    }
    setBusy(true);
    try {
      const updated = await requestPrivacyReview(current.id, current.revision);
      refresh(updated);
      addToast('Đã gửi ảnh bài làm tới giáo viên để duyệt ẩn danh.', 'success');
    } catch (cause) {
      const msg = errorText(cause);
      setError(msg);
      addToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const currentStatusInfo = useMemo(() => {
    const status = draft?.status ?? 'DRAFT';
    return STATE_MESSAGES[status] || STATE_MESSAGES.DRAFT;
  }, [draft?.status]);

  return (
    <StudentShell headerTitle="Nộp ảnh bài viết tay" headerSubtitle="Giai đoạn 3 / Viết tay &amp; Nộp ảnh">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-outline-variant/20">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs bg-primary-fixed text-primary font-bold px-2 py-0.5 rounded-full">
                Giai đoạn 3 / Viết tay &amp; Nộp ảnh
              </span>
              <span className="text-xs text-on-surface-variant font-mono">
                {draft ? `Mã bài nộp: ${draft.id.slice(0, 8)}` : ''}
              </span>
            </div>
            <h1 className="font-headline-md text-xl font-bold text-on-surface font-merriweather">
              Nộp ảnh bài viết tay &amp; Bảo vệ quyền riêng tư (PII-Shield)
            </h1>
          </div>

          <Link
            href={`/assignments/${assignmentId}/socratic`}
            className="px-3.5 py-1.5 rounded-lg border border-outline-variant/60 text-xs font-semibold text-on-surface hover:bg-surface-container transition-all flex items-center gap-1 shadow-sm shrink-0"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            <span>Quay lại Dàn ý Socratic</span>
          </Link>
        </div>

        {/* Unified 5-Step Workflow Stepper */}
        <AssignmentWorkflowStepper currentStep="submit" assignmentId={assignmentId} />

        {error && (
          <div role="alert" className="p-3.5 rounded-xl border border-error/30 bg-error-container/40 text-xs text-error">
            {error}
          </div>
        )}

        {/* PII Policy Card */}
        <div className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm space-y-2">
          <div className="flex items-center gap-2 text-secondary font-bold text-xs uppercase tracking-wider">
            <span className="material-symbols-outlined text-base">shield</span>
            Chính sách bảo mật quyền riêng tư học sinh (NFR-01 GDPT 2018)
          </div>
          <p className="text-xs text-on-surface-variant leading-relaxed">
            Họ tên, số báo danh và thông tin cá nhân ở đầu trang được che mờ trước khi gửi ảnh đến mô hình nhận dạng chữ viết tay. Điều này bảo đảm việc chấm bài hoàn toàn công bằng, khách quan và minh bạch.
          </p>
        </div>

        {/* State Banner */}
        <div className="p-3.5 bg-surface-container-lowest border border-outline-variant/30 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${currentStatusInfo.badgeClass}`}>
              {currentStatusInfo.label}
            </span>
            <span className="text-on-surface-variant">{currentStatusInfo.desc}</span>
          </div>
          {draft?.privacyReturnReason && (
            <span className="text-error font-medium">Lý do yêu cầu sửa: {draft.privacyReturnReason}</span>
          )}
        </div>

        {!draft ? (
          <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-on-surface-variant">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            Đang tải dữ liệu bài nộp...
          </div>
        ) : (
          <>
            {/* Pages Grid (1 to 4 pages) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-on-surface uppercase tracking-wider">
                  Danh sách trang ảnh bài làm ({draft.pages.length}/4 trang)
                </span>
                <span className="text-[11px] text-on-surface-variant">
                  Tối đa 4 ảnh JPEG/PNG/WebP • Chụp thẳng góc, đủ ánh sáng
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {draft.pages.map((page, idx) => (
                  <div
                    key={page.id}
                    className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/30 shadow-sm flex flex-col justify-between space-y-3"
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-primary font-mono">
                        Trang 0{idx + 1}
                      </span>
                      <span className="text-[10px] text-on-surface-variant">
                        {page.masks.length > 0 ? (
                          <span className="text-tertiary font-semibold flex items-center gap-0.5">
                            <span className="material-symbols-outlined text-[12px]">verified</span>
                            Đã che thông tin
                          </span>
                        ) : (
                          <span className="text-[#CA8A04] font-medium">Chưa che</span>
                        )}
                      </span>
                    </div>

                    {/* Image Preview */}
                    <div className="h-44 bg-surface-container-low rounded-lg border border-outline-variant/40 p-2 flex flex-col justify-between relative overflow-hidden">
                      <img
                        className="h-full w-full object-contain rounded"
                        src={resolveApiAssetUrl(page.derivativeUrl)}
                        alt={`Trang bài làm ${idx + 1}`}
                      />
                      {page.masks.length > 0 && (
                        <div className="absolute top-2 left-2 right-2 bg-slate-900/80 text-white text-[9px] px-2 py-0.5 rounded text-center font-mono">
                          Ảnh bài làm đã che thông tin cá nhân
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    {editable && (
                      <div className="space-y-2 pt-2 border-t border-outline-variant/20 text-xs">
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            data-testid="mask-header"
                            type="button"
                            disabled={busy}
                            onClick={() => void handleMaskHeader(page.id)}
                            className="px-2 py-1 bg-surface-container hover:bg-surface-container-high rounded text-[11px] font-semibold text-secondary transition-colors"
                          >
                            Che đầu trang
                          </button>
                          <button
                            data-testid="delete-page"
                            type="button"
                            disabled={busy}
                            onClick={() => void handleDeletePage(page.id)}
                            className="px-2 py-1 text-error hover:bg-error-container/30 rounded text-[11px] font-semibold transition-colors flex items-center justify-center gap-0.5"
                          >
                            <span className="material-symbols-outlined text-[13px]">delete</span>
                            <span>Xóa</span>
                          </button>
                        </div>
                        <div className="flex items-center justify-between pt-1">
                          <button
                            data-testid="page-move-prev"
                            type="button"
                            disabled={busy || idx === 0}
                            onClick={() => void handleMove(page.id, -1)}
                            title="Chuyển lên trước"
                            className="p-1 rounded hover:bg-surface-container text-on-surface-variant disabled:opacity-30"
                          >
                            <span className="material-symbols-outlined text-sm">arrow_back</span>
                          </button>
                          <span className="text-[10px] text-outline">Vị trí {idx + 1} / {draft.pages.length}</span>
                          <button
                            data-testid="page-move-next"
                            type="button"
                            disabled={busy || idx === draft.pages.length - 1}
                            onClick={() => void handleMove(page.id, 1)}
                            title="Chuyển ra sau"
                            className="p-1 rounded hover:bg-surface-container text-on-surface-variant disabled:opacity-30"
                          >
                            <span className="material-symbols-outlined text-sm">arrow_forward</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* Add Photo Card */}
                {editable && draft.pages.length < 4 && (
                  <label className="bg-surface-container-low/40 rounded-xl p-6 border-2 border-dashed border-outline-variant/60 hover:border-secondary hover:bg-surface-container-low transition-all cursor-pointer flex flex-col items-center justify-center text-center space-y-2 h-[260px]">
                    <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center text-secondary">
                      <span className="material-symbols-outlined text-2xl">add_photo_alternate</span>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-on-surface">
                        {busy ? 'Đang tải ảnh...' : 'Thêm trang ảnh mới'}
                      </p>
                      <p className="text-[11px] text-on-surface-variant mt-0.5">
                        Tải ảnh JPEG, PNG từ máy tính
                      </p>
                    </div>
                    <span className="text-[10px] bg-secondary-fixed/60 text-secondary font-bold px-2 py-0.5 rounded-full">
                      Còn {4 - draft.pages.length} vị trí
                    </span>
                    <input
                      data-testid="upload-page-input"
                      className="hidden"
                      disabled={busy}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleUpload}
                    />
                  </label>
                )}
              </div>
            </div>

            {/* Verification Checklist & Action Buttons */}
            <div className="p-5 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm space-y-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-outline">
                <span className="material-symbols-outlined text-base">checklist</span>
                Kiểm tra trước khi xác nhận nộp bài
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <div className="flex items-center gap-2 p-2 bg-surface-container-low/50 rounded-lg">
                  <span className="material-symbols-outlined text-tertiary text-base">check</span>
                  <span>Thứ tự các trang đúng mạch lạc</span>
                </div>
                <div className="flex items-center gap-2 p-2 bg-surface-container-low/50 rounded-lg">
                  <span className="material-symbols-outlined text-tertiary text-base">check</span>
                  <span>Ảnh rõ nét, không bị lóa sáng</span>
                </div>
                <div className="flex items-center gap-2 p-2 bg-surface-container-low/50 rounded-lg">
                  <span className="material-symbols-outlined text-tertiary text-base">check</span>
                  <span>Đã che thông tin cá nhân ở đầu trang</span>
                </div>
              </div>

              <div className="pt-3 border-t border-outline-variant/20 flex flex-wrap items-center justify-end gap-3">
                {editable && (
                  <button
                    data-testid="privacy-submit"
                    type="button"
                    disabled={busy || draft.pages.length === 0}
                    onClick={() => void handleSubmitPrivacy()}
                    className="px-5 py-2.5 bg-primary-container text-on-primary-container font-bold text-xs rounded-lg hover:brightness-95 transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-base">send</span>
                    <span>Xác nhận ảnh bài làm &amp; Gửi giáo viên duyệt</span>
                  </button>
                )}

                {draft.status === 'OCR_REVIEW' || draft.status === 'CONFIRMED' ? (
                  <Link
                    href={`/assignments/${assignmentId}/ocr`}
                    className="px-5 py-2.5 bg-primary-container text-on-primary-container font-bold text-xs rounded-lg hover:brightness-95 transition-all shadow-sm flex items-center gap-1.5"
                  >
                    <span>Sang kiểm tra bản chép OCR</span>
                    <span className="material-symbols-outlined text-base">arrow_forward</span>
                  </Link>
                ) : null}
              </div>
            </div>
          </>
        )}
      </div>
    </StudentShell>
  );
}
