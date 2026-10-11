'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import StudentShell from '@/components/StudentShell';
import AssignmentWorkflowStepper from '@/components/AssignmentWorkflowStepper';
import { useAppStore } from '@/lib/store';

export default function SubmitPhotosPage() {
  const router = useRouter();
  const {
    uploadedPages,
    addUploadedPage,
    removeUploadedPage,
    movePage,
    piiStatus,
    setPiiStatus,
    addToast,
  } = useAppStore();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [demoState, setDemoState] = useState<'success' | 'processing' | 'failed'>(piiStatus);

  const handleStateChange = (state: 'success' | 'processing' | 'failed') => {
    setDemoState(state);
    setPiiStatus(state);
    if (state === 'failed') {
      addToast('Mô phỏng lỗi: Vùng danh tính bị mờ hoặc không che được PII.', 'error');
    } else if (state === 'processing') {
      addToast('Mô phỏng: Đang dò quét họ tên và số báo danh trên ảnh...', 'info');
    } else {
      addToast('Mô phỏng: Che mờ thông tin định danh cá nhân hoàn tất.', 'success');
    }
  };

  const handleAddPhoto = () => {
    if (uploadedPages.length >= 4) {
      addToast('Chỉ cho phép tối đa 4 trang ảnh cho một bài nộp.', 'warning');
      return;
    }
    const newIdx = uploadedPages.length + 1;
    addUploadedPage({
      id: `p${Date.now()}`,
      url: `/mock-paper-${newIdx}.jpg`,
      size: '2.1 MB',
      piiMasked: true,
    });
    addToast(`Đã thêm Trang 0${newIdx} vào bài làm.`, 'success');
  };

  const handleSubmit = () => {
    if (uploadedPages.length === 0) {
      addToast('Vui lòng tải lên ít nhất 1 ảnh bài viết tay.', 'error');
      return;
    }
    if (demoState === 'failed') {
      addToast('Không thể nộp bài: Vùng thông tin cá nhân chưa được che mờ hợp lệ.', 'error');
      return;
    }

    setIsSubmitting(true);
    addToast('Đang gửi ảnh sang dịch vụ OCR trích xuất chữ viết tay...', 'info');

    setTimeout(() => {
      setIsSubmitting(false);
      router.push('/assignments/assign-nlxh-01/ocr');
    }, 1200);
  };

  const canSubmit = uploadedPages.length > 0 && uploadedPages.length <= 4 && demoState === 'success';

  return (
    <StudentShell headerTitle="Nộp ảnh bài viết tay" headerSubtitle="Khối 12 - Lớp 12A1">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-outline-variant/20">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs bg-primary-fixed text-primary font-bold px-2 py-0.5 rounded-full">
                Giai đoạn 3 / Viết tay &amp; Nộp ảnh
              </span>
              <span className="text-xs text-on-surface-variant">Hạn nộp: 25/10/2024 23:59</span>
            </div>
            <h1 className="font-headline-md text-xl font-bold text-on-surface font-merriweather">
              Nộp ảnh bài viết tay &amp; Bảo vệ quyền riêng tư (PII-Shield)
            </h1>
          </div>

          <Link
            href="/assignments/assign-nlxh-01/socratic"
            className="px-3.5 py-1.5 rounded-lg border border-outline-variant/60 text-xs font-semibold text-on-surface hover:bg-surface-container transition-all flex items-center gap-1 shadow-sm shrink-0"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            <span>Quay lại Dàn ý Socratic</span>
          </Link>
        </div>

        {/* Unified 5-Step Workflow Stepper */}
        <AssignmentWorkflowStepper currentStep="submit" />

        {/* Demo Switcher Bar */}
        <div className="p-3 bg-surface-container-low/70 rounded-xl border border-outline-variant/30 flex flex-wrap items-center justify-between gap-3 text-xs">
          <span className="font-semibold text-on-surface-variant flex items-center gap-1">
            <span className="material-symbols-outlined text-sm text-secondary">tune</span>
            Chế độ thử nghiệm PII-Shield (Demo):
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleStateChange('success')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                demoState === 'success'
                  ? 'bg-tertiary-container/40 text-tertiary border border-tertiary/40'
                  : 'bg-surface-container-lowest text-on-surface-variant'
              }`}
            >
              1. Đã che hợp lệ
            </button>
            <button
              onClick={() => handleStateChange('processing')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                demoState === 'processing'
                  ? 'bg-surface-container-high text-[#CA8A04] border border-[#CA8A04]/40'
                  : 'bg-surface-container-lowest text-on-surface-variant'
              }`}
            >
              2. Đang phân tích PII
            </button>
            <button
              onClick={() => handleStateChange('failed')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                demoState === 'failed'
                  ? 'bg-error-container text-error border border-error/40'
                  : 'bg-surface-container-lowest text-on-surface-variant'
              }`}
            >
              3. Ảnh mờ / Lỗi PII
            </button>
          </div>
        </div>

        {/* PII Policy Card */}
        <div className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm space-y-2">
          <div className="flex items-center gap-2 text-secondary font-bold text-xs uppercase tracking-wider">
            <span className="material-symbols-outlined text-base">shield</span>
            Chính sách bảo mật quyền riêng tư học sinh (NFR-01 GDPT 2018)
          </div>
          <p className="text-xs text-on-surface-variant leading-relaxed">
            Họ tên, số báo danh và mã trường được tự động che mờ trên máy học sinh trước khi gửi ảnh đến mô hình AI Vision. Điều này bảo đảm việc chấm thi hoàn toàn công bằng, khách quan và minh bạch.
          </p>
        </div>

        {/* State Banner */}
        {demoState === 'success' ? (
          <div className="p-3.5 bg-tertiary-container/30 border border-tertiary/30 rounded-xl flex items-center justify-between text-xs text-tertiary">
            <div className="flex items-center gap-2 font-semibold">
              <span className="material-symbols-outlined text-base">verified</span>
              <span>Bảo vệ thông tin cá nhân: Hoàn tất {uploadedPages.length}/{uploadedPages.length} trang</span>
            </div>
            <span className="font-mono text-[11px] bg-surface-container-lowest px-2 py-0.5 rounded">
              Thuật toán PII-Shield v2.4
            </span>
          </div>
        ) : demoState === 'processing' ? (
          <div className="p-3.5 bg-surface-container-low border border-outline-variant/40 rounded-xl flex items-center gap-2 text-xs text-[#CA8A04]">
            <span className="w-4 h-4 border-2 border-[#CA8A04] border-t-transparent rounded-full animate-spin"></span>
            <span>Đang phát hiện và mã hóa các vùng chữ viết tay chứa thông tin cá nhân...</span>
          </div>
        ) : (
          <div className="p-3.5 bg-error-container/60 border border-error/40 rounded-xl text-xs text-error space-y-1">
            <div className="flex items-center gap-2 font-bold">
              <span className="material-symbols-outlined text-base">block</span>
              <span>Chưa thể gửi ảnh đến dịch vụ nhận dạng</span>
            </div>
            <p className="text-[11px] text-on-error-container/90">
              Chất lượng ảnh quá mờ hoặc phát hiện vùng họ tên chưa được che mờ hoàn toàn. Vui lòng chụp lại ảnh với đủ ánh sáng.
            </p>
          </div>
        )}

        {/* Pages Grid (1 to 4 pages) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-on-surface uppercase tracking-wider">
              Danh sách trang ảnh đã chụp ({uploadedPages.length}/4 trang)
            </span>
            <span className="text-[11px] text-on-surface-variant">
              Tối đa 4 ảnh • Chụp thẳng góc, đủ ánh sáng
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {uploadedPages.map((page, idx) => (
              <div
                key={page.id}
                className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/30 shadow-sm flex flex-col justify-between space-y-3"
              >
                {/* Header */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-primary font-mono">
                    Trang 0{idx + 1}
                  </span>
                  <span className="text-[10px] text-on-surface-variant">{page.size}</span>
                </div>

                {/* Mock Photo Preview (Lined paper + Masked bar) */}
                <div className="h-44 bg-surface-container-low rounded-lg border border-outline-variant/40 p-3 flex flex-col justify-between relative overflow-hidden font-mono text-[10px] text-outline">
                  {/* Top Masked PII Bar */}
                  <div className="p-1.5 bg-surface-container rounded border border-outline-variant/30 flex items-center justify-between text-[9px]">
                    <span className="text-on-surface-variant">SỞ GD&amp;ĐT HÀ NỘI — THPT ĐAN PHƯỢNG</span>
                    <span className="bg-surface-tint text-white px-1.5 py-0.2 rounded font-bold">
                      [ĐÃ CHE PII]
                    </span>
                  </div>

                  {/* Lined paper body mock */}
                  <div className="space-y-1.5 text-on-surface/70 text-[9px]">
                    <div className="h-2 bg-outline-variant/30 rounded w-full"></div>
                    <div className="h-2 bg-outline-variant/30 rounded w-5/6"></div>
                    <div className="h-2 bg-outline-variant/30 rounded w-4/6"></div>
                    <div className="h-2 bg-outline-variant/30 rounded w-full"></div>
                    <div className="h-2 bg-outline-variant/30 rounded w-3/4"></div>
                  </div>

                  <div className="text-[9px] text-secondary font-semibold text-right">
                    Mã ẩn danh: VN-12A1-048
                  </div>
                </div>

                {/* Actions: Move earlier / later / Remove */}
                <div className="flex items-center justify-between pt-2 border-t border-outline-variant/20 text-xs">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => movePage(idx, idx - 1)}
                      title="Chuyển lên trước"
                      className="p-1 rounded hover:bg-surface-container text-on-surface-variant disabled:opacity-30"
                    >
                      <span className="material-symbols-outlined text-sm">arrow_back</span>
                    </button>
                    <button
                      type="button"
                      disabled={idx === uploadedPages.length - 1}
                      onClick={() => movePage(idx, idx + 1)}
                      title="Chuyển ra sau"
                      className="p-1 rounded hover:bg-surface-container text-on-surface-variant disabled:opacity-30"
                    >
                      <span className="material-symbols-outlined text-sm">arrow_forward</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeUploadedPage(page.id)}
                    className="text-error hover:bg-error-container/30 px-2 py-1 rounded text-[11px] font-medium flex items-center gap-0.5"
                  >
                    <span className="material-symbols-outlined text-[13px]">delete</span>
                    <span>Xóa trang</span>
                  </button>
                </div>
              </div>
            ))}

            {/* Add Photo Card */}
            {uploadedPages.length < 4 && (
              <div
                onClick={handleAddPhoto}
                className="bg-surface-container-low/40 rounded-xl p-6 border-2 border-dashed border-outline-variant/60 hover:border-secondary hover:bg-surface-container-low transition-all cursor-pointer flex flex-col items-center justify-center text-center space-y-2 h-[260px]"
              >
                <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center text-secondary">
                  <span className="material-symbols-outlined text-2xl">add_photo_alternate</span>
                </div>
                <div>
                  <p className="text-xs font-bold text-on-surface">Thêm trang ảnh mới</p>
                  <p className="text-[11px] text-on-surface-variant mt-0.5">
                    Chụp trực tiếp bằng camera hoặc tải file từ máy
                  </p>
                </div>
                <span className="text-[10px] bg-secondary-fixed/60 text-secondary font-bold px-2 py-0.5 rounded-full">
                  Còn {4 - uploadedPages.length} vị trí
                </span>
              </div>
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
              <span>Không để lộ họ tên trên bài làm</span>
            </div>
          </div>

          <div className="pt-3 border-t border-outline-variant/20 flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => addToast('Đã lưu nháp ảnh bài viết vào thiết bị.', 'info')}
              className="px-4 py-2 border border-outline-variant/60 rounded-lg text-xs font-medium text-on-surface hover:bg-surface-container"
            >
              Lưu nháp nộp bài
            </button>
            <button
              type="button"
              disabled={!canSubmit || isSubmitting}
              onClick={handleSubmit}
              className="px-5 py-2.5 bg-primary-container text-on-primary-container font-bold text-xs rounded-lg hover:brightness-95 transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-on-primary-container border-t-transparent rounded-full animate-spin"></span>
                  <span>Đang xử lý PII &amp; OCR...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-base">send</span>
                  <span>Xác nhận nộp bài &amp; Chuyển sang OCR đối chiếu</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </StudentShell>
  );
}

