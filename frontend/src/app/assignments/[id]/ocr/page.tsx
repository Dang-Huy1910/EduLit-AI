'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import StudentShell from '@/components/StudentShell';
import AssignmentWorkflowStepper from '@/components/AssignmentWorkflowStepper';
import { useAppStore } from '@/lib/store';
import { CENTRAL_ASSIGNMENT_ID } from '@/lib/mock/assignmentData';
import { SUBMISSION_MANIFEST } from '@/lib/mock/submissionsManifest';

export default function OcrVerificationPage() {
  const router = useRouter();
  const params = useParams();
  const assignmentId = (params?.id as string) || CENTRAL_ASSIGNMENT_ID;

  const {
    assignments,
    currentUser,
    getStudentSubmission,
    updateTranscriptionLine,
    ocrStatus,
    setOcrStatus,
    addToast,
    demoMilestone,
    setDemoMilestone,
  } = useAppStore();

  const assignment = assignments.find((a) => a.id === assignmentId) || assignments[0];
  const submission = getStudentSubmission(assignmentId, currentUser.id);

  // Fallback to Bùi Hà My's manifest if submission in memory hasn't been created yet
  const manifestData = SUBMISSION_MANIFEST[currentUser.id] || SUBMISSION_MANIFEST['user-student-48'];

  const pages = (submission?.pages && submission.pages.length > 0
    ? submission.pages.map((p, idx) => ({
        ...p,
        imageUrl: p.imageUrl || manifestData.pages[idx]?.localPath || manifestData.pages[0].localPath,
      }))
    : manifestData.pages.map((p) => ({
        pageIndex: p.pageIndex,
        imageUrl: p.localPath,
        size: p.size,
        caption: p.caption,
      })));

  const transcriptions =
    submission?.transcriptionByPage || manifestData.transcriptionByPage;

  // Active page tab (1 or 2)
  const [activePage, setActivePage] = useState<number>(1);

  // Image viewer transform state
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [rotationAngle, setRotationAngle] = useState<number>(0);

  // Line editing state
  const [editingLineIndex, setEditingLineIndex] = useState<number | null>(null);
  const [editingLineText, setEditingLineText] = useState<string>('');

  const activeImage = pages.find((p) => p.pageIndex === activePage) || pages[0];
  const activeTranscription = transcriptions.find((t) => t.pageIndex === activePage) || transcriptions[0];

  const handleZoomIn = () => setZoomScale((prev) => Math.min(prev + 0.25, 2.5));
  const handleZoomOut = () => setZoomScale((prev) => Math.max(prev - 0.25, 0.5));
  const handleRotate = () => setRotationAngle((prev) => (prev + 90) % 360);
  const handleResetView = () => {
    setZoomScale(1);
    setRotationAngle(0);
  };

  const handleStartEditLine = (index: number, currentText: string) => {
    setEditingLineIndex(index);
    setEditingLineText(currentText);
  };

  const handleSaveLine = (index: number) => {
    if (submission) {
      updateTranscriptionLine(submission.id, activePage, index, editingLineText);
    }
    setEditingLineIndex(null);
    addToast(`Đã lưu chỉnh sửa dòng số ${index + 1} của Trang ${activePage}.`, 'success');
  };

  const handleConfirmAndProceed = () => {
    setOcrStatus('confirmed');
    addToast('Đã xác nhận bản chép số hóa. Đang chuyển sang Kết quả đánh giá Rubric...', 'success');
    router.push(`/assignments/${assignmentId}/result`);
  };

  return (
    <StudentShell headerTitle="Đối chiếu bản chép số hóa" headerSubtitle={`${assignment?.code}: ${assignment?.title}`}>
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-outline-variant/20">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs bg-secondary-fixed/50 text-secondary font-bold px-2 py-0.5 rounded-full">
                Bước 4: Kiểm tra &amp; Đối chiếu OCR
              </span>
              <span className="text-xs text-on-surface-variant font-mono">
                Học sinh: {currentUser.name} ({currentUser.code || 'VN-12A1-048'})
              </span>
            </div>
            <h1 className="font-headline-md text-xl font-bold text-on-surface font-merriweather">
              Đối chiếu Ảnh bài viết tay &amp; Bản chép số hóa
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-surface-container-high text-on-surface border border-outline-variant/30">
              Mô phỏng rà soát OCR &amp; Che PII
            </span>
            <button
              onClick={handleConfirmAndProceed}
              className="px-4 py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary/90 transition-all shadow-sm flex items-center gap-1.5"
            >
              <span>Xem kết quả đánh giá Rubric</span>
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          </div>
        </div>

        {/* 5-Step Workflow Stepper */}
        <AssignmentWorkflowStepper currentStep="ocr" assignmentId={assignmentId} />

        {/* Page Switcher & Viewer Toolbar */}
        <div className="p-2.5 bg-surface-container-low/70 rounded-xl border border-outline-variant/30 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Page Tabs */}
          <div className="flex items-center gap-2">
            <span className="font-semibold text-on-surface mr-1">Chọn trang đối chiếu:</span>
            {pages.map((p) => (
              <button
                key={p.pageIndex}
                onClick={() => {
                  setActivePage(p.pageIndex);
                  handleResetView();
                  setEditingLineIndex(null);
                }}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all flex items-center gap-1.5 ${
                  activePage === p.pageIndex
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-surface-container-lowest text-on-surface border border-outline-variant/40 hover:bg-surface-container'
                }`}
              >
                <span className="material-symbols-outlined text-sm">description</span>
                <span>Trang 0{p.pageIndex}</span>
              </button>
            ))}
          </div>

          {/* Viewer Controls */}
          <div className="flex items-center gap-1.5 bg-surface-container-lowest p-1 rounded-lg border border-outline-variant/40">
            <span className="text-[11px] text-outline font-medium px-2">Kính lúp:</span>
            <button
              onClick={handleZoomOut}
              title="Thu nhỏ"
              className="p-1.5 rounded hover:bg-surface-container text-on-surface"
            >
              <span className="material-symbols-outlined text-base">zoom_out</span>
            </button>
            <span className="text-[11px] font-mono px-1 min-w-[45px] text-center text-on-surface font-semibold">
              {Math.round(zoomScale * 100)}%
            </span>
            <button
              onClick={handleZoomIn}
              title="Phóng to"
              className="p-1.5 rounded hover:bg-surface-container text-on-surface"
            >
              <span className="material-symbols-outlined text-base">zoom_in</span>
            </button>
            <div className="h-4 w-px bg-outline-variant/40 mx-1"></div>
            <button
              onClick={handleRotate}
              title="Xoay 90 độ"
              className="p-1.5 rounded hover:bg-surface-container text-on-surface flex items-center gap-1 text-[11px]"
            >
              <span className="material-symbols-outlined text-base">rotate_right</span>
              <span>Xoay</span>
            </button>
            <button
              onClick={handleResetView}
              title="Vừa khung nhìn"
              className="p-1.5 rounded hover:bg-surface-container text-on-surface flex items-center gap-1 text-[11px]"
            >
              <span className="material-symbols-outlined text-base">fit_screen</span>
              <span>Vừa khung</span>
            </button>
          </div>
        </div>

        {/* Side-by-side Split View: Left Image (50%), Right Transcription (50%) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left: Handwritten Photo Viewer (6 cols) */}
          <div className="lg:col-span-6 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm flex flex-col h-[650px] overflow-hidden">
            <div className="p-3 bg-surface-container-low/60 border-b border-outline-variant/20 flex items-center justify-between text-xs">
              <span className="font-bold text-primary flex items-center gap-1.5 font-merriweather">
                <span className="material-symbols-outlined text-sm">photo_camera</span>
                <span>Ảnh chụp bài viết tay gốc — Trang 0{activePage}</span>
              </span>
              <span className="text-[11px] text-on-surface-variant font-mono">
                {activeImage ? activeImage.size : '1.8 MB'}
              </span>
            </div>

            <div className="flex-1 bg-surface-container p-4 overflow-auto flex items-center justify-center relative">
              {activeImage ? (
                <div
                  style={{
                    transform: `scale(${zoomScale}) rotate(${rotationAngle}deg)`,
                    transition: 'transform 0.15s ease-out',
                  }}
                  className="origin-center max-w-full max-h-full flex items-center justify-center"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={activeImage.imageUrl}
                    alt={activeImage.caption}
                    className="max-h-[580px] w-auto object-contain rounded-md shadow-md border border-outline-variant/40 select-none"
                  />
                </div>
              ) : (
                <div className="text-center text-xs text-on-surface-variant">Không có ảnh trang này</div>
              )}
            </div>
          </div>

          {/* Right: Transcription Line-by-Line Viewer (6 cols) */}
          <div className="lg:col-span-6 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm flex flex-col h-[650px]">
            <div className="p-3 bg-surface-container-low/60 border-b border-outline-variant/20 flex items-center justify-between text-xs">
              <div>
                <span className="font-bold text-secondary flex items-center gap-1.5 font-merriweather">
                  <span className="material-symbols-outlined text-sm">text_snippet</span>
                  <span>Bản chép số hóa — Trang 0{activePage} ({activeTranscription?.lines.length || 0} dòng)</span>
                </span>
                <span className="text-[10px] text-on-surface-variant">
                  Bấm biểu tượng sửa ở từng dòng để đính chính ký tự nếu cần.
                </span>
              </div>

              <span className="text-[11px] font-semibold text-tertiary bg-tertiary-container/30 px-2 py-0.5 rounded">
                Số hóa theo trang
              </span>
            </div>

            {/* Transcription Lines Scroll */}
            <div className="flex-1 p-4 overflow-y-auto space-y-2 text-xs font-serif leading-relaxed">
              {activeTranscription?.lines.map((lineText, idx) => {
                const isEditing = editingLineIndex === idx;
                const hasUncertainWord = lineText.includes('[') && lineText.includes(']');

                if (isEditing) {
                  return (
                    <div
                      key={idx}
                      className="p-2 bg-surface-container-lowest rounded-lg border-2 border-secondary space-y-2 shadow-xs"
                    >
                      <div className="flex items-center justify-between text-[11px] font-mono text-outline">
                        <span>Sửa dòng {idx + 1}:</span>
                      </div>
                      <textarea
                        value={editingLineText}
                        onChange={(e) => setEditingLineText(e.target.value)}
                        rows={2}
                        className="w-full p-2 text-xs rounded border border-outline-variant/60 font-serif focus:outline-none focus:border-secondary"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleSaveLine(idx)}
                          className="px-3 py-1 bg-secondary text-white rounded text-xs font-semibold hover:bg-secondary/90"
                        >
                          Lưu dòng này
                        </button>
                        <button
                          onClick={() => setEditingLineIndex(null)}
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
                    key={idx}
                    className={`p-2 rounded-lg border flex items-start justify-between gap-3 group transition-all ${
                      hasUncertainWord
                        ? 'bg-[#FEF9C3]/50 border-[#CA8A04]/40'
                        : 'bg-surface-container-low/30 border-outline-variant/20 hover:border-secondary/40'
                    }`}
                  >
                    <div className="flex items-start gap-2.5 flex-1">
                      <span className="font-mono text-[10px] text-outline select-none mt-0.5 w-6 shrink-0">
                        {String(idx + 1).padStart(2, '0')}.
                      </span>
                      <p className="text-on-surface text-[12px] leading-relaxed flex-1">
                        {lineText}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleStartEditLine(idx, lineText)}
                      title="Sửa dòng này"
                      className="opacity-0 group-hover:opacity-100 p-1 text-on-surface-variant hover:text-secondary rounded transition-opacity"
                    >
                      <span className="material-symbols-outlined text-[15px]">edit</span>
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Bottom Confirm Action */}
            <div className="p-3.5 border-t border-outline-variant/20 bg-surface-container-low/50 rounded-b-xl flex items-center justify-between text-xs">
              <span className="text-on-surface-variant text-[11px]">
                Đã kiểm tra kỹ 2 trang? Bấm chuyển để xem báo cáo Rubric.
              </span>

              <button
                type="button"
                onClick={handleConfirmAndProceed}
                className="py-2 px-5 bg-primary text-white font-bold text-xs rounded-lg hover:bg-primary/90 transition-all shadow-sm flex items-center gap-1.5"
              >
                <span>Xác nhận &amp; Xem kết quả chấm Rubric</span>
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </StudentShell>
  );
}
