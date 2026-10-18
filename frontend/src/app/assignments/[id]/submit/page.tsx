'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import StudentShell from '@/components/StudentShell';
import AssignmentWorkflowStepper from '@/components/AssignmentWorkflowStepper';
import { useAppStore } from '@/lib/store';
import { CENTRAL_ASSIGNMENT_ID, CENTRAL_ASSIGNMENT } from '@/lib/mock/assignmentData';
import { SUBMISSION_MANIFEST } from '@/lib/mock/submissionsManifest';

function compressImage(file: File): Promise<{ dataUrl: string; sizeMb: string }> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1600;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.82);
          const sizeKb = Math.round((compressedDataUrl.length * 3) / 4 / 1024);
          const sizeMb = sizeKb > 1024 ? (sizeKb / 1024).toFixed(1) + ' MB' : sizeKb + ' KB';
          resolve({ dataUrl: compressedDataUrl, sizeMb });
          return;
        }
        resolve({
          dataUrl: e.target?.result as string,
          sizeMb: (file.size / (1024 * 1024)).toFixed(1) + ' MB',
        });
      };
      img.onerror = () => {
        resolve({
          dataUrl: e.target?.result as string,
          sizeMb: (file.size / (1024 * 1024)).toFixed(1) + ' MB',
        });
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function SubmitPhotosPage() {
  const router = useRouter();
  const params = useParams();
  const assignmentId = (params?.id as string) || CENTRAL_ASSIGNMENT_ID;

  const {
    assignments,
    uploadedPages,
    loadStudentPages,
    addCustomUploadedPage,
    removeUploadedPage,
    reorderUploadedPages,
    submitHandwrittenEssay,
    addToast,
    currentUser,
  } = useAppStore();

  const assignment = assignments.find((a) => a.id === assignmentId) || (assignmentId === CENTRAL_ASSIGNMENT_ID ? CENTRAL_ASSIGNMENT : assignments[0]);

  const [previewModalPage, setPreviewModalPage] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close preview modal on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPreviewModalPage(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Prefetch OCR page for instant transition
  useEffect(() => {
    router.prefetch(`/assignments/${assignmentId}/ocr`);
  }, [router, assignmentId]);

  // Auto-load student scanned pages if empty
  useEffect(() => {
    if (uploadedPages.length === 0) {
      loadStudentPages(assignmentId, currentUser?.id || 'user-student-11a14-001');
    }
  }, [uploadedPages.length, loadStudentPages, assignmentId, currentUser?.id]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (uploadedPages.length + files.length > 4) {
      addToast('Mỗi bài nộp tối đa 4 trang ảnh.', 'warning');
      return;
    }

    const fileList = Array.from(files);
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const { dataUrl, sizeMb } = await compressImage(file);
      addCustomUploadedPage({
        pageIndex: uploadedPages.length + i + 1,
        imageUrl: dataUrl,
        size: sizeMb,
        caption: `Ảnh tải lên: ${file.name}`,
        isCustomUpload: true,
      });
      addToast(`Đã thêm ảnh ${file.name} vào danh sách bài nộp.`, 'success');
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleLoadDemo = () => {
    const studentId = currentUser?.id || 'user-student-11a14-001';
    loadStudentPages(assignmentId, studentId);
    const count = (SUBMISSION_MANIFEST[studentId] || SUBMISSION_MANIFEST['user-student-11a14-001'])?.pages?.length || 2;
    addToast(`Đã đồng bộ ${count} trang bài viết tay của ${currentUser?.name || 'học sinh'} từ ứng dụng quét!`, 'success');
  };

  const handleSubmit = () => {
    if (uploadedPages.length === 0) {
      addToast('Vui lòng chọn hoặc tải lên ít nhất 1 ảnh bài viết tay.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      submitHandwrittenEssay(assignmentId);
    } catch (err) {
      console.warn('submitHandwrittenEssay warning:', err);
    }

    const targetUrl = `/assignments/${assignmentId}/ocr`;
    router.push(targetUrl);

    // Guaranteed fallback navigation in 200ms
    setTimeout(() => {
      if (typeof window !== 'undefined' && window.location.pathname.endsWith('/submit')) {
        window.location.assign(targetUrl);
      }
    }, 200);
  };

  const previewTarget = uploadedPages.find((p) => p.pageIndex === previewModalPage);

  return (
    <StudentShell headerTitle="Nộp ảnh bài viết tay" headerSubtitle={`${assignment?.code}: ${assignment?.title}`}>
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-outline-variant/20">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs bg-primary-fixed text-primary font-bold px-2.5 py-0.5 rounded-full">
                Bước 3: Viết tay &amp; Nộp ảnh bài làm
              </span>
              <span className="text-xs text-on-surface-variant font-medium">Hạn nộp: {assignment?.deadline}</span>
            </div>
            <h1 className="font-headline-md text-xl font-bold text-on-surface font-merriweather">
              Nộp ảnh bài viết tay &amp; Bảo vệ thông tin học sinh
            </h1>
          </div>

          <Link
            href={`/assignments/${assignmentId}/socratic`}
            className="px-3.5 py-1.5 rounded-lg border border-outline-variant/60 text-xs font-semibold text-on-surface hover:bg-surface-container transition-all flex items-center gap-1 shadow-sm shrink-0"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            <span>Xem lại Dàn ý Socratic</span>
          </Link>
        </div>

        {/* 5-Step Workflow Stepper */}
        <AssignmentWorkflowStepper currentStep="submit" assignmentId={assignmentId} />

        {/* Upload & Instructions Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Upload Action & Info (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="p-5 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm space-y-4">
              <div>
                <h3 className="font-bold text-sm text-on-surface font-merriweather">
                  Tải lên trang bài viết tay từ thiết bị
                </h3>
                <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                  Đề bài yêu cầu bài viết khoảng 600 chữ (tương đương 1–4 trang viết tay tuỳ nét chữ). Chụp ảnh đủ sáng, giữ phẳng trang giấy và rõ chữ.
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png, image/jpeg, image/jpg"
                multiple
                onChange={handleFileUpload}
                className="hidden"
              />

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-3 px-4 border-2 border-dashed border-primary/40 rounded-xl bg-primary-container/10 hover:bg-primary-container/20 text-primary text-xs font-bold flex items-center justify-center gap-2 transition-all"
                >
                  <span className="material-symbols-outlined text-xl">upload_file</span>
                  <span>Chọn file ảnh từ máy tính (JPG, PNG)</span>
                </button>

                <button
                  type="button"
                  onClick={handleLoadDemo}
                  className="w-full py-2.5 px-4 bg-surface-container-low hover:bg-surface-container text-on-surface text-xs font-semibold rounded-xl border border-outline-variant/40 flex items-center justify-center gap-2 transition-all"
                >
                  <span className="material-symbols-outlined text-base text-secondary">sync</span>
                  <span>Đồng bộ từ camera / EduLit Scanner ({currentUser?.name || 'Học sinh'})</span>
                </button>
              </div>

              {/* Privacy Shield Notice */}
              <div className="p-3 bg-surface-container-low rounded-lg border border-outline-variant/30 space-y-1.5 text-[11px] text-on-surface-variant">
                <div className="flex items-center gap-1.5 font-bold text-secondary">
                  <span className="material-symbols-outlined text-sm">shield</span>
                  <span>Bảo vệ quyền riêng tư học sinh (PII Shield):</span>
                </div>
                <p className="leading-relaxed">
                  • Vùng tên và mã định danh trên bài thi được che mờ tự động để đảm bảo tính khách quan trước khi gửi sang hội đồng chấm.
                </p>
              </div>
            </div>

            {/* Assignment instructions recap card */}
            <div className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm space-y-2 text-xs">
              <span className="font-bold text-primary flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">checklist</span>
                <span>Nhắc nhở trước khi nộp bài:</span>
              </span>
              <ul className="space-y-1 text-on-surface-variant text-[11px]">
                <li>✓ Đúng thứ tự trang bài làm (đã đánh số trang hoặc theo mạch triển khai).</li>
                <li>✓ Đã có phân tích nghịch lí &ldquo;không thoát ly bùn đất&rdquo;.</li>
                <li>✓ Đã có dẫn chứng liên hệ tác phẩm ngoài (Đồng chí / Quê hương / Bếp lửa...).</li>
                <li>✓ Dung lượng bài viết tay tương ứng khoảng 600 chữ (1–4 trang).</li>
              </ul>
            </div>
          </div>

          {/* Right Uploaded Pages Grid & Thumbnails (7 cols) */}
          <div className="lg:col-span-7 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm p-4 flex flex-col justify-between min-h-[480px]">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-outline-variant/20 mb-4">
                <div>
                  <h3 className="font-bold text-sm text-on-surface font-merriweather">
                    Danh sách trang đã tải lên ({uploadedPages.length} trang)
                  </h3>
                  <span className="text-[11px] text-on-surface-variant">
                    {uploadedPages.length > 0
                      ? `Đã nạp ${uploadedPages.length} trang bài làm, sẵn sàng đối chiếu OCR.`
                      : 'Vui lòng chọn ảnh bài làm hoặc bấm đồng bộ từ máy quét (hỗ trợ 1–4 trang).'}
                  </span>
                </div>

                {uploadedPages.length > 0 && (
                  <button
                    onClick={() => {
                      useAppStore.setState({ uploadedPages: [] });
                      addToast('Đã xóa tất cả các trang.', 'info');
                    }}
                    className="text-[11px] text-error hover:underline flex items-center gap-0.5"
                  >
                    <span className="material-symbols-outlined text-sm">delete_sweep</span>
                    <span>Xóa hết</span>
                  </button>
                )}
              </div>

              {uploadedPages.length === 0 ? (
                <div className="p-12 text-center border-2 border-dashed border-outline-variant/40 rounded-xl space-y-3">
                  <div className="w-12 h-12 rounded-full bg-surface-container-low flex items-center justify-center text-outline mx-auto">
                    <span className="material-symbols-outlined text-2xl">image</span>
                  </div>
                  <h4 className="font-bold text-xs text-on-surface">Chưa có trang bài làm nào</h4>
                  <p className="text-[11px] text-on-surface-variant max-w-sm mx-auto">
                    Bấm &ldquo;Đồng bộ từ camera&rdquo; hoặc tải file ảnh từ thiết bị để bắt đầu.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {uploadedPages.map((page, idx) => (
                    <div
                      key={page.pageIndex}
                      className="p-3 bg-surface-container-low/50 rounded-xl border border-outline-variant/30 space-y-2 group hover:border-secondary transition-all"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-primary font-mono">
                          Trang 0{page.pageIndex} / 0{uploadedPages.length}
                        </span>
                        <span className="text-[10px] text-on-surface-variant bg-surface-container px-2 py-0.5 rounded">
                          {page.size}
                        </span>
                      </div>

                      {/* Thumbnail Container */}
                      <div
                        onClick={() => setPreviewModalPage(page.pageIndex)}
                        className="relative h-56 rounded-lg overflow-hidden border border-outline-variant/30 bg-surface cursor-pointer group-hover:shadow-md transition-all flex items-center justify-center"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={page.imageUrl}
                          alt={page.caption}
                          className="w-full h-full object-contain"
                        />
                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-semibold transition-opacity gap-1">
                          <span className="material-symbols-outlined text-base">zoom_in</span>
                          <span>Bấm để phóng to</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] pt-1">
                        <span className="text-on-surface-variant truncate max-w-[140px] text-[10px]">
                          {page.isCustomUpload ? 'Ảnh tải lên từ tệp' : 'Bản quét camera'}
                        </span>

                        <div className="flex items-center gap-1">
                          {idx > 0 && (
                            <button
                              type="button"
                              onClick={() => reorderUploadedPages(idx, idx - 1)}
                              title="Đổi thứ tự trang trước"
                              className="p-1 hover:bg-surface-container rounded text-on-surface-variant hover:text-primary"
                            >
                              <span className="material-symbols-outlined text-sm">arrow_back</span>
                            </button>
                          )}
                          {idx < uploadedPages.length - 1 && (
                            <button
                              type="button"
                              onClick={() => reorderUploadedPages(idx, idx + 1)}
                              title="Đổi thứ tự trang sau"
                              className="p-1 hover:bg-surface-container rounded text-on-surface-variant hover:text-primary"
                            >
                              <span className="material-symbols-outlined text-sm">arrow_forward</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => removeUploadedPage(page.pageIndex)}
                            title="Xóa trang này"
                            className="p-1 hover:bg-error-container/40 rounded text-error"
                          >
                            <span className="material-symbols-outlined text-sm">delete</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Bottom Submit Action */}
            <div className="pt-4 mt-4 border-t border-outline-variant/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-xs text-on-surface-variant">
                  {uploadedPages.length > 0
                    ? `Đã sẵn sàng nộp ${uploadedPages.length} trang.`
                    : 'Vui lòng thêm ảnh trước khi nộp.'}
                </span>

                {isSubmitting && (
                  <div className="flex items-center gap-1.5 text-[11px] text-primary">
                    <span className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin"></span>
                    <span>Đang xử lý nộp bài...</span>
                  </div>
                )}
              </div>

              <button
                type="button"
                disabled={uploadedPages.length === 0 || isSubmitting}
                onClick={handleSubmit}
                className="py-2.5 px-6 bg-primary text-white font-bold text-xs rounded-lg hover:bg-primary/90 transition-all shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                ) : (
                  <span className="material-symbols-outlined text-base">check_circle</span>
                )}
                <span>Xác nhận Nộp &amp; Chuyển sang Đối chiếu OCR</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Large Page Preview Modal */}
      {previewModalPage !== null && previewTarget && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-outline-variant/40">
            <div className="p-4 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low/70 rounded-t-2xl">
              <div>
                <h3 className="font-bold text-sm text-on-surface font-merriweather">
                  Xem trước: {previewTarget.caption}
                </h3>
                <span className="text-[11px] text-on-surface-variant">
                  Kích thước: {previewTarget.size} • Giữ nguyên tỉ lệ hiển thị chữ viết tay
                </span>
              </div>
              <button
                onClick={() => setPreviewModalPage(null)}
                className="p-1 text-on-surface-variant hover:text-on-surface rounded-lg"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            <div className="p-4 overflow-auto flex-1 flex items-center justify-center bg-surface-container">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewTarget.imageUrl}
                alt={previewTarget.caption}
                className="max-h-[70vh] object-contain rounded-lg shadow-sm"
              />
            </div>

            <div className="p-3 border-t border-outline-variant/20 flex items-center justify-between bg-surface-container-low/40 rounded-b-2xl text-xs">
              <span className="text-on-surface-variant">Phím tắt: Bấm Esc để đóng xem trước</span>
              <button
                onClick={() => setPreviewModalPage(null)}
                className="px-4 py-1.5 bg-primary text-white rounded-lg text-xs font-semibold"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </StudentShell>
  );
}
