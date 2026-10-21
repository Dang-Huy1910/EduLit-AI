'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import StudentShell from '@/components/StudentShell';
import AssignmentWorkflowStepper from '@/components/AssignmentWorkflowStepper';
import { useAppStore } from '@/lib/store';
import { AuthApiError } from '@/lib/auth-types';
import { submissionApi } from '@/features/submission/api';
import type { MaskRegion, SubmissionPage, SubmissionPayload } from '@/features/submission/types';

function formatDue(value: string | null | undefined): string {
  if (!value) return 'Chưa có hạn nộp';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('vi-VN');
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof AuthApiError ? err.message : fallback;
}

function pageSourceLabel(page: SubmissionPage): string {
  const name = (page.filename || '').toLowerCase();
  if (
    !name ||
    name === 'image.jpg' ||
    name === 'image.jpeg' ||
    name === 'image.png' ||
    name.startsWith('img_') ||
    name.includes('capture') ||
    name.includes('camera')
  ) {
    return 'Bản quét camera';
  }
  return 'Ảnh tải lên từ tệp';
}

export default function SubmitPhotosPage() {
  const router = useRouter();
  const params = useParams();
  const assignmentId = (params?.id as string) || '';
  const { addToast, currentUser } = useAppStore();

  const [payload, setPayload] = useState<SubmissionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [previewPage, setPreviewPage] = useState<SubmissionPage | null>(null);
  const [maskDraft, setMaskDraft] = useState<MaskRegion[]>([]);
  const [drawing, setDrawing] = useState<{ x: number; y: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replacePageId = useRef<string | null>(null);
  const previewBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await submissionApi.get(assignmentId);
        if (cancelled) return;
        setPayload(data);
        if (['queued', 'processing', 'review'].includes(data.status)) {
          router.replace(`/assignments/${assignmentId}/ocr`);
        }
      } catch (err) {
        if (!cancelled) setLoadError(errorMessage(err, 'Không tải được bài nộp.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assignmentId, router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewPage(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pages = payload?.pages || [];
  const canEdit = payload?.canEditPages !== false && payload?.status === 'draft';

  const run = async (work: () => Promise<SubmissionPayload>, ok?: string) => {
    setBusy(true);
    try {
      const next = await work();
      setPayload(next);
      if (ok) addToast(ok, 'success');
      return next;
    } catch (err) {
      addToast(errorMessage(err, 'Không thực hiện được thao tác.'), 'error');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    if (pages.length + fileList.length > 4) {
      addToast('Mỗi bài nộp tối đa 4 trang ảnh.', 'warning');
      return;
    }
    setBusy(true);
    try {
      let next: SubmissionPayload | null = payload;
      for (const file of Array.from(fileList)) {
        if (!file.type.includes('jpeg') && !file.type.includes('jpg') && !file.type.includes('png')) {
          addToast('Chỉ nhận ảnh JPEG hoặc PNG.', 'warning');
          continue;
        }
        next = await submissionApi.uploadPage(assignmentId, file);
        setPayload(next);
        addToast(`Đã thêm ảnh ${file.name}.`, 'success');
      }
    } catch (err) {
      addToast(errorMessage(err, 'Không tải được ảnh lên máy chủ.'), 'error');
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    }
  };

  const handleRotate = (page: SubmissionPage) => {
    void run(
      () =>
        submissionApi.updatePage(assignmentId, page.id, {
          rotationDegrees: (page.rotationDegrees + 90) % 360,
        }),
      'Đã xoay trang. Ảnh gửi OCR đã được xuất lại.'
    );
  };

  const handleDelete = (page: SubmissionPage) => {
    void run(() => submissionApi.deletePage(assignmentId, page.id), 'Đã xóa trang.');
  };

  const handleClearAll = () => {
    void run(() => submissionApi.clearPages(assignmentId), 'Đã xóa tất cả các trang.');
  };

  const handleReorder = (index: number, nextIndex: number) => {
    const ids = pages.map((p) => p.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(nextIndex, 0, moved);
    void run(() => submissionApi.reorder(assignmentId, ids));
  };

  const handleReplace = (pageId: string) => {
    replacePageId.current = pageId;
    replaceInputRef.current?.click();
  };

  const handleReplaceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const pageId = replacePageId.current;
    e.target.value = '';
    if (!file || !pageId) return;
    await run(() => submissionApi.replacePage(assignmentId, pageId, file), 'Đã thay ảnh trang này.');
  };

  const openPreview = (page: SubmissionPage) => {
    setPreviewPage(page);
    setMaskDraft(page.maskRegions || []);
    setDrawing(null);
  };

  const pointerPos = (event: React.PointerEvent) => {
    const box = previewBoxRef.current;
    if (!box) return null;
    const rect = box.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  };

  const onMaskDown = (event: React.PointerEvent) => {
    if (!canEdit) return;
    const pos = pointerPos(event);
    if (!pos) return;
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    setDrawing(pos);
  };

  const onMaskUp = (event: React.PointerEvent) => {
    if (!drawing) return;
    const pos = pointerPos(event);
    setDrawing(null);
    if (!pos) return;
    const x = Math.min(drawing.x, pos.x);
    const y = Math.min(drawing.y, pos.y);
    const width = Math.abs(pos.x - drawing.x);
    const height = Math.abs(pos.y - drawing.y);
    if (width < 0.02 || height < 0.02) return;
    setMaskDraft((prev) => [...prev, { x, y, width, height }]);
  };

  const saveMasks = async () => {
    if (!previewPage) return;
    const next = await run(
      () => submissionApi.updatePage(assignmentId, previewPage.id, { maskRegions: maskDraft }),
      'Đã che vùng thông tin cá nhân trên ảnh gửi OCR.'
    );
    if (next) {
      const updated = next.pages.find((p) => p.id === previewPage.id) || null;
      setPreviewPage(updated);
    }
  };

  const handleSubmit = async () => {
    if (payload?.classroomReadOnly) return;
    if (!pages.length) {
      addToast('Vui lòng chọn hoặc chụp ít nhất 1 ảnh bài viết tay.', 'error');
      return;
    }
    const next = await run(() => submissionApi.submit(assignmentId), 'Đã nộp bài. Đang số hóa...');
    if (next) router.push(`/assignments/${assignmentId}/ocr`);
  };

  const handleNewAttempt = async () => {
    if (payload?.classroomReadOnly) return;
    await run(() => submissionApi.newAttempt(assignmentId), 'Đã tạo lượt nộp mới. Hãy tải ảnh.');
  };

  if (loading) {
    return (
      <StudentShell headerTitle="Nộp ảnh bài viết tay" headerSubtitle="Đang tải...">
        <div className="max-w-3xl mx-auto p-10 text-sm text-on-surface-variant">Đang tải bài nộp...</div>
      </StudentShell>
    );
  }

  if (loadError || !payload) {
    return (
      <StudentShell headerTitle="Nộp ảnh bài viết tay" headerSubtitle="Không tải được đề">
        <div className="max-w-3xl mx-auto p-6 bg-surface-container-lowest rounded-xl border text-sm text-error">
          {loadError || 'Không tải được bài tập.'}
        </div>
      </StudentShell>
    );
  }

  const assignment = payload.assignment;

  return (
    <StudentShell headerTitle="Nộp ảnh bài viết tay" headerSubtitle={`${assignment.code}: ${assignment.title}`}>
      <div className="max-w-6xl mx-auto space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-outline-variant/20">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs bg-primary-fixed text-primary font-bold px-2.5 py-0.5 rounded-full">
                Bước 3: Viết tay &amp; Nộp ảnh bài làm
              </span>
              <span className="text-xs text-on-surface-variant font-medium">Hạn nộp: {formatDue(assignment.dueAt)}</span>
            </div>
            <h1 className="font-headline-md text-xl font-bold text-on-surface font-merriweather">
              Nộp ảnh bài viết tay &amp; Che thông tin cá nhân
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

        <AssignmentWorkflowStepper currentStep="submit" assignmentId={assignmentId} />

        {payload.classroomReadOnly && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300 flex items-start gap-2">
            <span className="material-symbols-outlined text-lg" aria-hidden="true">visibility</span>
            <span>Lớp thuộc kỳ học đã kết thúc nên em chỉ xem được bài.</span>
          </div>
        )}

        {payload.status === 'failed' && (
          <div className="p-3 rounded-xl border border-error/40 bg-error-container/30 text-xs space-y-2">
            <p className="font-semibold text-error">Không số hóa được bài với bộ ảnh này.</p>
            <p>{payload.ocrError || 'Một hoặc nhiều trang lỗi. Em thử lại OCR cùng bộ ảnh, hoặc tạo lượt mới để thay ảnh.'}</p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy || payload.classroomReadOnly}
                onClick={() => void run(() => submissionApi.retryOcr(assignmentId), 'Đã gửi lại OCR.').then((next) => {
                  if (next) router.push(`/assignments/${assignmentId}/ocr`);
                })}
                className="px-3 py-1.5 bg-primary text-white rounded-lg font-semibold"
              >
                Thử lại OCR
              </button>
              <button
                type="button"
                disabled={busy || payload.classroomReadOnly}
                onClick={() => void handleNewAttempt()}
                className="px-3 py-1.5 border rounded-lg font-semibold disabled:opacity-50"
              >
                Tạo lượt nộp ảnh mới
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-5 space-y-4">
            <div className="p-5 sm:p-6 glass-panel rounded-2xl border border-white/60 shadow-sm space-y-4">
              <div>
                <h3 className="font-bold text-sm text-on-surface font-merriweather">
                  Tải lên hoặc chụp trang bài viết tay
                </h3>
                <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                  Mỗi bài 1–4 trang JPEG/PNG. Chụp đủ sáng, giữ phẳng trang giấy và rõ chữ. Ảnh được lưu trên máy chủ theo tài khoản của em.
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg"
                multiple
                onChange={(e) => void handleFiles(e.target.files)}
                className="hidden"
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/png,image/jpeg"
                capture="environment"
                onChange={(e) => void handleFiles(e.target.files)}
                className="hidden"
              />
              <input
                ref={replaceInputRef}
                type="file"
                accept="image/png,image/jpeg"
                onChange={(e) => void handleReplaceFile(e)}
                className="hidden"
              />

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  disabled={!canEdit || busy}
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-3 px-4 border-2 border-dashed border-primary/40 rounded-xl bg-primary-container/10 hover:bg-primary-container/20 text-primary text-xs font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-xl">upload_file</span>
                  <span>Chọn file ảnh từ máy tính (JPG, PNG)</span>
                </button>
                <button
                  type="button"
                  disabled={!canEdit || busy}
                  onClick={() => cameraInputRef.current?.click()}
                  className="w-full py-2.5 px-4 bg-surface-container-low hover:bg-surface-container text-on-surface text-xs font-semibold rounded-xl border border-outline-variant/40 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-base text-secondary">photo_camera</span>
                  <span>Chụp ảnh từ camera ({currentUser?.name || payload.student.displayName})</span>
                </button>
              </div>

              <div className="p-3 bg-surface-container-low rounded-lg border border-outline-variant/30 space-y-1.5 text-[11px] text-on-surface-variant">
                <div className="flex items-center gap-1.5 font-bold text-secondary">
                  <span className="material-symbols-outlined text-sm">shield</span>
                  <span>Quyền riêng tư trước khi gửi OCR:</span>
                </div>
                <p className="leading-relaxed">
                  Em xem trước ảnh sẽ gửi, xoay cho thẳng chữ, rồi khoanh vùng che kín họ tên / lớp / mã định danh nếu có trên trang. Hệ thống xuất ảnh đã che thành file thật rồi mới gửi dịch vụ OCR. Hệ thống không tự che mờ danh tính.
                </p>
              </div>
            </div>

            <div className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm space-y-2 text-xs">
              <span className="font-bold text-primary flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">checklist</span>
                <span>Nhắc nhở trước khi nộp bài:</span>
              </span>
              <ul className="space-y-1 text-on-surface-variant text-[11px]">
                <li>✓ Đúng thứ tự trang bài làm.</li>
                <li>✓ Đã xem ảnh đã xử lý (xoay/che) — đúng bản sẽ gửi OCR.</li>
                <li>✓ Dung lượng bài viết tay tương ứng khoảng 1–4 trang.</li>
                {assignment.writingTask ? <li>✓ {assignment.writingTask}</li> : null}
              </ul>
            </div>
          </div>

          <div className="lg:col-span-7 glass-panel rounded-2xl border border-white/60 shadow-sm p-5 sm:p-6 flex flex-col justify-between min-h-[480px]">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-outline-variant/20 mb-4">
                <div>
                  <h3 className="font-bold text-sm text-on-surface font-merriweather">
                    Danh sách trang đã tải lên ({pages.length} trang)
                  </h3>
                  <span className="text-[11px] text-on-surface-variant">
                    {pages.length > 0
                      ? `Đã nạp ${pages.length} trang bài làm, sẵn sàng đối chiếu OCR.`
                      : 'Vui lòng chọn hoặc chụp ảnh bài làm (1–4 trang). Không tự nạp ảnh mẫu.'}
                  </span>
                </div>
                {pages.length > 0 && canEdit && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleClearAll()}
                    className="text-[11px] text-error hover:underline flex items-center gap-0.5 disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-sm">delete_sweep</span>
                    <span>Xóa hết</span>
                  </button>
                )}
              </div>

              {pages.length === 0 ? (
                <div className="p-12 text-center border-2 border-dashed border-outline-variant/40 rounded-xl space-y-3">
                  <div className="w-12 h-12 rounded-full bg-surface-container-low flex items-center justify-center text-outline mx-auto">
                    <span className="material-symbols-outlined text-2xl">image</span>
                  </div>
                  <h4 className="font-bold text-xs text-on-surface">Chưa có trang bài làm nào</h4>
                  <p className="text-[11px] text-on-surface-variant max-w-sm mx-auto">
                    Bấm chụp ảnh hoặc tải file từ thiết bị. Hệ thống không tự điền ảnh mẫu. Refresh trang vẫn tải lại ảnh đã lưu.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {pages.map((page, idx) => (
                    <div
                      key={page.id}
                      className="p-3 bg-surface-container-low/50 rounded-xl border border-outline-variant/30 space-y-2 group hover:border-secondary transition-all"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-primary font-mono">
                          Trang 0{page.pageIndex} / 0{pages.length}
                        </span>
                        <span className="text-[10px] text-on-surface-variant bg-surface-container px-2 py-0.5 rounded">
                          {page.size}
                        </span>
                      </div>
                      <div
                        onClick={() => openPreview(page)}
                        className="relative h-56 rounded-lg overflow-hidden border border-outline-variant/30 bg-surface cursor-pointer group-hover:shadow-md transition-all flex items-center justify-center"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          key={page.processedSha256 || page.id}
                          src={page.imageUrl}
                          alt={page.filename}
                          className="w-full h-full object-contain"
                        />
                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-semibold transition-opacity gap-1">
                          <span className="material-symbols-outlined text-base">zoom_in</span>
                          <span>Bấm để phóng to &amp; rà soát</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-[11px] pt-1">
                        <span className="text-on-surface-variant truncate max-w-[140px] text-[10px]">
                          {pageSourceLabel(page)}
                        </span>
                        {canEdit && (
                          <div className="flex items-center gap-1">
                            {idx > 0 && (
                              <button
                                type="button"
                                onClick={() => handleReorder(idx, idx - 1)}
                                title="Đưa lên trước"
                                className="p-1 hover:bg-surface-container rounded text-on-surface-variant hover:text-primary"
                              >
                                <span className="material-symbols-outlined text-sm">arrow_back</span>
                              </button>
                            )}
                            {idx < pages.length - 1 && (
                              <button
                                type="button"
                                onClick={() => handleReorder(idx, idx + 1)}
                                title="Đưa ra sau"
                                className="p-1 hover:bg-surface-container rounded text-on-surface-variant hover:text-primary"
                              >
                                <span className="material-symbols-outlined text-sm">arrow_forward</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRotate(page)}
                              title="Xoay 90 độ (xuất lại ảnh OCR)"
                              className="p-1 hover:bg-surface-container rounded text-on-surface-variant hover:text-primary"
                            >
                              <span className="material-symbols-outlined text-sm">rotate_right</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReplace(page.id)}
                              title="Thay ảnh"
                              className="p-1 hover:bg-surface-container rounded text-on-surface-variant hover:text-primary"
                            >
                              <span className="material-symbols-outlined text-sm">swap_horiz</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(page)}
                              title="Xóa trang này"
                              className="p-1 hover:bg-error-container/40 rounded text-error"
                            >
                              <span className="material-symbols-outlined text-sm">delete</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-4 mt-4 border-t border-outline-variant/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-xs text-on-surface-variant">
                  {pages.length > 0 ? `Đã sẵn sàng nộp ${pages.length} trang.` : 'Vui lòng thêm ảnh trước khi nộp.'}
                </span>
                {busy && (
                  <div className="flex items-center gap-1.5 text-[11px] text-primary">
                    <span className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin"></span>
                    <span>Đang lưu...</span>
                  </div>
                )}
              </div>
              {canEdit ? (
                <button
                  type="button"
                  disabled={pages.length === 0 || busy || payload.classroomReadOnly}
                  onClick={() => void handleSubmit()}
                  className="py-2.5 px-6 bg-primary text-white font-bold text-xs rounded-lg hover:bg-primary/90 transition-all shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-base">check_circle</span>
                  <span>Xác nhận Nộp &amp; Chuyển sang Đối chiếu OCR</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy || payload.classroomReadOnly}
                  onClick={() => void handleNewAttempt()}
                  className="py-2.5 px-6 border border-outline-variant text-xs font-bold rounded-lg disabled:opacity-50"
                >
                  Tạo lượt nộp ảnh mới
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {previewPage && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-outline-variant/40">
            <div className="p-4 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low/70 rounded-t-2xl">
              <div>
                <h3 className="font-bold text-sm text-on-surface font-merriweather">
                  Ảnh sẽ gửi OCR — Trang 0{previewPage.pageIndex}
                </h3>
                <span className="text-[11px] text-on-surface-variant">
                  {previewPage.size} • Kéo chuột để che vùng tên/lớp nếu cần
                </span>
              </div>
              <button onClick={() => setPreviewPage(null)} className="p-1 text-on-surface-variant rounded-lg">
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>
            <div className="p-4 overflow-auto flex-1 flex items-center justify-center bg-surface-container">
              <div
                ref={previewBoxRef}
                onPointerDown={onMaskDown}
                onPointerUp={onMaskUp}
                className="relative max-h-[70vh] cursor-crosshair"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewPage.imageUrl}
                  alt={previewPage.filename}
                  className="max-h-[70vh] object-contain rounded-lg shadow-sm select-none"
                  draggable={false}
                />
                {maskDraft.map((region, idx) => (
                  <div
                    key={`${region.x}-${idx}`}
                    className="absolute bg-black/80 border border-black"
                    style={{
                      left: `${region.x * 100}%`,
                      top: `${region.y * 100}%`,
                      width: `${region.width * 100}%`,
                      height: `${region.height * 100}%`,
                    }}
                  />
                ))}
              </div>
            </div>
            <div className="p-3 border-t border-outline-variant/20 flex items-center justify-between bg-surface-container-low/40 rounded-b-2xl text-xs gap-2">
              <button
                type="button"
                className="text-error"
                onClick={() => setMaskDraft([])}
                disabled={!canEdit}
              >
                Xóa vùng che
              </button>
              <div className="flex gap-2">
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => void saveMasks()}
                    className="px-4 py-1.5 bg-secondary text-white rounded-lg text-xs font-semibold"
                  >
                    Lưu ảnh đã che
                  </button>
                )}
                <button
                  onClick={() => setPreviewPage(null)}
                  className="px-4 py-1.5 bg-primary text-white rounded-lg text-xs font-semibold"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </StudentShell>
  );
}
