'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import StudentShell from '@/components/StudentShell';
import AssignmentWorkflowStepper from '@/components/AssignmentWorkflowStepper';
import { useAppStore } from '@/lib/store';
import {
  SOCRATIC_BRANCHES,
  evaluateOutlineCoverage,
} from '@/lib/mock/socraticScript';
import {
  CENTRAL_ASSIGNMENT_ID,
  POEM_TEXT_LINES,
  POEM_SOURCE_NOTES,
  DOCX_ORIGINAL_GUIDE,
} from '@/lib/mock/assignmentData';

export default function SocraticChatPage() {
  const router = useRouter();
  const params = useParams();
  const assignmentId = (params?.id as string) || CENTRAL_ASSIGNMENT_ID;

  const {
    assignments,
    activeRubric,
    socraticMessages,
    isAiResponding,
    sendSocraticMessage,
    outline,
    addOutlinePoint,
    updateOutlinePoint,
    removeOutlinePoint,
    reorderOutlinePoints,
    addToast,
  } = useAppStore();

  const assignment = assignments.find((a) => a.id === assignmentId) || assignments[0];

  const [inputMessage, setInputMessage] = useState('');
  const [readingModalOpen, setReadingModalOpen] = useState(false);
  const [rubricModalOpen, setRubricModalOpen] = useState(false);

  // Outline manual addition & inline editing
  const [addingSectionId, setAddingSectionId] = useState<string | null>(null);
  const [newPointText, setNewPointText] = useState('');
  const [editingPoint, setEditingPoint] = useState<{ sectionId: string; index: number; text: string } | null>(null);

  // Section targets for adding to outline from chat messages
  const [selectedTargetSection, setSelectedTargetSection] = useState<Record<string, 'intro' | 'body' | 'conclusion'>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat when messages update or during response
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [socraticMessages, isAiResponding]);

  // Handle Escape key to close modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setReadingModalOpen(false);
        setRubricModalOpen(false);
        setAddingSectionId(null);
        setEditingPoint(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || isAiResponding) return;
    const textToSend = inputMessage.trim();
    setInputMessage('');
    sendSocraticMessage(textToSend);
  };

  const handleSendChip = (question: string) => {
    if (isAiResponding) return;
    setInputMessage('');
    sendSocraticMessage(question);
  };

  const handleAddOutlinePointSubmit = (sectionId: string) => {
    if (!newPointText.trim()) return;
    const success = addOutlinePoint(sectionId, newPointText.trim());
    if (success) {
      addToast('Đã thêm ý mới vào dàn ý của em.', 'success');
      setNewPointText('');
      setAddingSectionId(null);
    } else {
      addToast('Ý này đã có trong dàn ý của em (tránh trùng lặp).', 'warning');
    }
  };

  const handleSaveInlineEdit = () => {
    if (!editingPoint) return;
    if (!editingPoint.text.trim()) {
      addToast('Nội dung ý không được để trống.', 'warning');
      return;
    }
    updateOutlinePoint(editingPoint.sectionId, editingPoint.index, editingPoint.text.trim());
    addToast('Đã cập nhật ý trong dàn ý.', 'success');
    setEditingPoint(null);
  };

  const handleTransferToOutline = (msgId: string, point: string, defaultSectionId: 'intro' | 'body' | 'conclusion' = 'body') => {
    const targetSection = selectedTargetSection[msgId] || defaultSectionId;
    const success = addOutlinePoint(targetSection, point);
    if (success) {
      const sectionName =
        targetSection === 'intro' ? 'Mở bài' : targetSection === 'body' ? 'Thân bài' : 'Kết bài';
      addToast(`Đã thêm ý vào phần ${sectionName}.`, 'success');
    } else {
      addToast('Ý này đã có trong dàn ý của em (tránh thêm trùng lặp).', 'info');
    }
  };

  const coverage = evaluateOutlineCoverage(outline);

  return (
    <StudentShell headerTitle="Khối 12 - Lớp 12A1" headerSubtitle="Trợ lý gợi mở Socratic & Lập dàn ý">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Top Breadcrumb & Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-outline-variant/20">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs bg-primary-fixed text-primary font-bold px-2.5 py-0.5 rounded-full">
                Socratic Writing Scaffold
              </span>
              <span className="text-xs text-on-surface-variant font-medium">
                {assignment?.code}: {assignment?.title}
              </span>
            </div>
            <h1 className="font-headline-md text-xl font-bold text-on-surface font-merriweather">
              Trợ lý Socratic: Gợi mở ý tưởng &amp; Xây dựng Dàn ý
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setReadingModalOpen(true)}
              className="px-3 py-1.5 rounded-lg border border-outline-variant/60 bg-surface-container-lowest text-xs font-semibold text-secondary hover:bg-surface-container transition-all flex items-center gap-1.5 shadow-sm"
            >
              <span className="material-symbols-outlined text-sm">menu_book</span>
              <span>Xem đề bài &amp; Bài thơ</span>
            </button>
            <button
              onClick={() => setRubricModalOpen(true)}
              className="px-3 py-1.5 rounded-lg border border-outline-variant/60 bg-surface-container-lowest text-xs font-semibold text-on-surface hover:bg-surface-container transition-all flex items-center gap-1.5 shadow-sm"
            >
              <span className="material-symbols-outlined text-sm">gavel</span>
              <span>Barem Rubric (4,0đ)</span>
            </button>
          </div>
        </div>

        {/* 5-Step Workflow Stepper */}
        <AssignmentWorkflowStepper currentStep="socratic" assignmentId={assignmentId} />



        {/* Pedagogical Guideline Alert */}
        <div className="p-3 bg-surface-container-low/50 rounded-xl border border-secondary/20 flex items-center gap-2.5 text-xs text-on-surface-variant">
          <span className="material-symbols-outlined text-secondary text-base shrink-0">verified</span>
          <span>
            <strong>Nguyên tắc Sư phạm GDPT 2018:</strong> Trợ lý định hướng gợi mở câu hỏi để em tự phát hiện ý tưởng và xây dựng dàn ý cá nhân. AI tuyệt đối <strong>không viết thay bài văn</strong> hoặc cung cấp văn mẫu sao chép.
          </span>
        </div>

        {/* Main Desktop Split View: Left Chat (55%), Right Outline (45%) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Chat Area (7 cols) */}
          <div className="lg:col-span-7 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm flex flex-col h-[670px]">
            {/* Chat Messages Scroll */}
            <div className="flex-1 p-4 overflow-y-auto space-y-4">
              {socraticMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div className="flex items-center gap-1.5 mb-1 text-[11px] text-on-surface-variant">
                    {msg.sender === 'ai' ? (
                      <>
                        <span className="w-5 h-5 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-bold text-[10px]">
                          AI
                        </span>
                        <span className="font-semibold text-secondary">Trợ lý Sư phạm</span>
                      </>
                    ) : (
                      <>
                        <span className="font-semibold text-on-surface">Bùi Hà My</span>
                        <span className="w-5 h-5 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-bold text-[10px]">
                          HM
                        </span>
                      </>
                    )}
                    <span>• {msg.timestamp}</span>
                  </div>

                  <div
                    className={`p-3.5 rounded-xl max-w-[88%] text-xs leading-relaxed ${
                      msg.sender === 'user'
                        ? 'bg-primary-container text-on-primary-container rounded-tr-none font-medium'
                        : 'bg-surface-container-low text-on-surface rounded-tl-none border border-outline-variant/30'
                    }`}
                  >
                    <p className="whitespace-pre-line">{msg.text}</p>

                    {/* Action: Transfer structured outline point to selected outline section */}
                    {msg.canAddToOutline && msg.outlinePoint && (
                      <div className="mt-3 pt-2.5 border-t border-outline-variant/30 flex flex-wrap items-center justify-between gap-2 bg-surface-container-lowest/60 p-2 rounded-lg">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-on-surface-variant font-medium">Chuyển vào:</span>
                          <select
                            value={selectedTargetSection[msg.id] || msg.suggestedSectionId || 'body'}
                            onChange={(e) =>
                              setSelectedTargetSection({
                                ...selectedTargetSection,
                                [msg.id]: e.target.value as 'intro' | 'body' | 'conclusion',
                              })
                            }
                            className="text-[11px] font-semibold bg-surface border border-outline-variant/60 rounded px-2 py-0.5 text-primary"
                          >
                            <option value="intro">I. Mở bài</option>
                            <option value="body">II. Thân bài</option>
                            <option value="conclusion">III. Kết bài</option>
                          </select>
                        </div>

                        <button
                          onClick={() =>
                            handleTransferToOutline(
                              msg.id,
                              msg.outlinePoint!,
                              msg.suggestedSectionId || 'body'
                            )
                          }
                          className="px-2.5 py-1 bg-secondary text-white rounded text-[11px] font-semibold hover:bg-secondary/90 flex items-center gap-1 shadow-sm transition-all"
                        >
                          <span className="material-symbols-outlined text-[14px]">playlist_add</span>
                          <span>Thêm vào dàn ý</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {isAiResponding && (
                <div className="flex items-center gap-2 p-3 bg-surface-container-low rounded-xl max-w-[80%] text-xs text-on-surface-variant italic">
                  <span className="w-3.5 h-3.5 border-2 border-secondary border-t-transparent rounded-full animate-spin"></span>
                  <span>Trợ lý Socratic đang đối chiếu ngữ liệu bài thơ và phản hồi...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Chips of Pre-scripted Socratic Scenarios */}
            <div className="p-2 bg-surface-container-low/50 border-t border-outline-variant/20 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-outline font-semibold">Gợi ý câu hỏi kịch bản (Bấm để gửi nhanh hoặc điền vào ô chat):</span>
                <span className="text-secondary font-medium">7 nhánh hội thoại</span>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {SOCRATIC_BRANCHES.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => handleSendChip(b.sampleQuestion)}
                    disabled={isAiResponding}
                    title={b.sampleQuestion}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all truncate max-w-xs ${
                      b.isRefusal
                        ? 'bg-error-container/40 text-error border-error/30 hover:bg-error-container/60'
                        : 'bg-surface-container-lowest text-on-surface border-outline-variant/40 hover:bg-surface-container hover:border-secondary'
                    }`}
                  >
                    {b.title}
                  </button>
                ))}
              </div>
            </div>

            {/* Chat Composer Form */}
            <form onSubmit={handleSendMessage} className="p-3 border-t border-outline-variant/30 flex gap-2 bg-surface-container-lowest rounded-b-xl">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                disabled={isAiResponding}
                placeholder="Nhập câu hỏi hoặc chọn gợi ý bên trên (VD: Vì sao tự do lại không thoát ly bùn đất?)..."
                maxLength={400}
                className="flex-1 px-3 py-2 text-xs rounded-lg border border-outline-variant/60 bg-surface text-on-surface focus:outline-none focus:border-secondary disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={isAiResponding || !inputMessage.trim()}
                className="px-4 py-2 bg-primary text-white font-bold text-xs rounded-lg hover:bg-primary/90 transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50 shrink-0"
              >
                {isAiResponding ? (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                ) : (
                  <span className="material-symbols-outlined text-base">send</span>
                )}
                <span>Gửi</span>
              </button>
            </form>
          </div>

          {/* Right Outline Canvas (5 cols) */}
          <div className="lg:col-span-5 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm flex flex-col h-[670px]">
            {/* Outline Header */}
            <div className="p-4 border-b border-outline-variant/20 flex items-center justify-between">
              <div>
                <h3 className="font-headline-sm text-sm font-bold text-on-surface font-merriweather">
                  Dàn ý bài viết của em (Outline Canvas)
                </h3>
                <p className="text-[11px] text-on-surface-variant">
                  Tự xây dựng từ phản hồi gợi mở, hỗ trợ chỉnh sửa và sắp xếp thứ tự.
                </p>
              </div>
              <button
                onClick={() => addToast('Dàn ý đã được lưu tự động vào bộ nhớ phiên làm việc.', 'success')}
                className="px-2.5 py-1 text-xs border border-outline-variant/50 rounded-md text-on-surface hover:bg-surface-container flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[14px]">save</span>
                <span>Lưu nháp</span>
              </button>
            </div>

            {/* Outline Sections & Points */}
            <div className="flex-1 p-3.5 overflow-y-auto space-y-3.5 text-xs">
              {outline.map((section) => (
                <div key={section.id} className="p-3 bg-surface-container-low/40 rounded-xl border border-outline-variant/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-primary font-merriweather flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-secondary"></span>
                      {section.title}
                    </span>
                    <button
                      type="button"
                      onClick={() => setAddingSectionId(section.id)}
                      className="text-[11px] text-secondary font-semibold hover:underline flex items-center gap-0.5"
                    >
                      <span className="material-symbols-outlined text-[13px]">add</span>
                      Thêm ý
                    </button>
                  </div>

                  {section.points.length === 0 ? (
                    <div className="p-2.5 border border-dashed border-outline-variant/40 rounded-lg text-center text-[11px] text-on-surface-variant/70 italic">
                      Chưa có ý nào. Hãy trao đổi với trợ lý AI hoặc bấm &ldquo;Thêm ý&rdquo;.
                    </div>
                  ) : (
                    <ul className="space-y-1.5">
                      {section.points.map((point, idx) => {
                        const isEditingThis =
                          editingPoint?.sectionId === section.id && editingPoint?.index === idx;

                        if (isEditingThis) {
                          return (
                            <li key={idx} className="p-2 bg-surface-container-lowest rounded-lg border border-secondary space-y-1.5">
                              <textarea
                                value={editingPoint.text}
                                onChange={(e) =>
                                  setEditingPoint({ ...editingPoint, text: e.target.value })
                                }
                                rows={2}
                                className="w-full p-1.5 text-[11px] rounded border border-outline-variant/60 focus:outline-none focus:border-secondary"
                              />
                              <div className="flex justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={handleSaveInlineEdit}
                                  className="px-2 py-0.5 bg-secondary text-white rounded text-[10px] font-semibold"
                                >
                                  Lưu
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingPoint(null)}
                                  className="px-2 py-0.5 text-[10px] text-on-surface-variant hover:bg-surface-container rounded"
                                >
                                  Hủy
                                </button>
                              </div>
                            </li>
                          );
                        }

                        return (
                          <li
                            key={idx}
                            className="p-2 bg-surface-container-lowest rounded-lg border border-outline-variant/30 text-on-surface text-[11px] flex items-start justify-between gap-2 group hover:border-secondary/40 transition-all"
                          >
                            <span className="leading-relaxed flex-1">• {point}</span>
                            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity shrink-0">
                              {/* Reorder Up */}
                              {idx > 0 && (
                                <button
                                  type="button"
                                  onClick={() => reorderOutlinePoints(section.id, idx, idx - 1)}
                                  title="Đưa ý lên trên"
                                  className="p-0.5 text-on-surface-variant hover:text-primary rounded"
                                >
                                  <span className="material-symbols-outlined text-[13px]">arrow_upward</span>
                                </button>
                              )}
                              {/* Reorder Down */}
                              {idx < section.points.length - 1 && (
                                <button
                                  type="button"
                                  onClick={() => reorderOutlinePoints(section.id, idx, idx + 1)}
                                  title="Đưa ý xuống dưới"
                                  className="p-0.5 text-on-surface-variant hover:text-primary rounded"
                                >
                                  <span className="material-symbols-outlined text-[13px]">arrow_downward</span>
                                </button>
                              )}
                              {/* Edit Point */}
                              <button
                                type="button"
                                onClick={() => setEditingPoint({ sectionId: section.id, index: idx, text: point })}
                                title="Sửa ý này"
                                className="p-0.5 text-on-surface-variant hover:text-secondary rounded"
                              >
                                <span className="material-symbols-outlined text-[13px]">edit</span>
                              </button>
                              {/* Delete Point */}
                              <button
                                type="button"
                                onClick={() => removeOutlinePoint(section.id, idx)}
                                title="Xóa ý này"
                                className="p-0.5 text-on-surface-variant hover:text-error rounded"
                              >
                                <span className="material-symbols-outlined text-[13px]">delete</span>
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {/* Manual add input */}
                  {addingSectionId === section.id && (
                    <div className="mt-2 pt-2 border-t border-outline-variant/30 flex gap-1.5">
                      <input
                        type="text"
                        value={newPointText}
                        onChange={(e) => setNewPointText(e.target.value)}
                        placeholder="Nhập ý chính của em..."
                        className="flex-1 px-2.5 py-1 text-xs rounded border border-outline-variant/60 bg-surface"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddOutlinePointSubmit(section.id)}
                        className="px-2.5 py-1 bg-primary text-white rounded font-bold text-xs hover:bg-primary/90"
                      >
                        Thêm
                      </button>
                      <button
                        type="button"
                        onClick={() => setAddingSectionId(null)}
                        className="px-2 py-1 text-xs text-on-surface-variant"
                      >
                        Đóng
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {/* Structural Checklist Card (Replaces Hardcoded %) */}
              <div className="p-3 bg-surface-container-lowest rounded-xl border border-outline-variant/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-on-surface flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm text-secondary">checklist</span>
                    <span>Kiểm tra cấu trúc yêu cầu đề bài:</span>
                  </span>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${coverage.isReadyForSubmission ? 'bg-tertiary-container/40 text-tertiary' : 'bg-[#FEF9C3] text-[#CA8A04]'}`}>
                    {coverage.metCount}/{coverage.totalCount} yêu cầu
                  </span>
                </div>

                <div className="space-y-1 pt-1">
                  {coverage.items.map((item) => (
                    <div key={item.id} className="flex items-start gap-1.5 text-[11px]">
                      <span className={`material-symbols-outlined text-sm mt-0.5 shrink-0 ${item.isMet ? 'text-tertiary font-bold' : 'text-outline/50'}`}>
                        {item.isMet ? 'check_circle' : 'radio_button_unchecked'}
                      </span>
                      <div className="flex-1">
                        <span className={item.isMet ? 'font-medium text-on-surface' : 'text-on-surface-variant/70'}>
                          {item.label}
                        </span>
                        <p className="text-[10px] text-on-surface-variant/70 leading-tight">{item.description}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <p className="text-[10px] text-on-surface-variant/80 italic pt-1 border-t border-outline-variant/20">
                  * Hệ thống tự động đối chiếu các luận điểm trọng tâm dựa theo khung ma trận chuẩn GDPT 2018.
                </p>
              </div>
            </div>

            {/* Bottom Transition CTA */}
            <div className="p-3.5 border-t border-outline-variant/20 bg-surface-container-low/50 rounded-b-xl space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-on-surface">Đánh giá độ sẵn sàng:</span>
                <span className="text-[11px] font-semibold text-primary">
                  {coverage.readinessLabel}
                </span>
              </div>

              <button
                type="button"
                onClick={() => router.push(`/assignments/${assignmentId}/submit`)}
                className="w-full py-2.5 px-4 bg-primary text-white font-bold text-xs rounded-lg hover:bg-primary/90 transition-all shadow-sm flex items-center justify-center gap-1.5"
              >
                <span>Chuyển sang Bước 3: Viết tay &amp; Nộp ảnh</span>
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Reading & Poem Source Modal */}
      {readingModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-xl border border-outline-variant/40">
            <div className="p-4 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low/60 rounded-t-2xl">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">menu_book</span>
                <h3 className="font-bold text-sm text-on-surface font-merriweather">
                  Đề bài &amp; Bài thơ &ldquo;Màu tự do của đất&rdquo; (Trần Quang Quý)
                </h3>
              </div>
              <button
                onClick={() => setReadingModalOpen(false)}
                className="p-1 text-on-surface-variant hover:text-on-surface rounded-lg"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs leading-relaxed">
              {/* Assignment Instructions */}
              <div className="p-3.5 bg-surface-container-low rounded-xl border border-outline-variant/30 space-y-2">
                <span className="font-bold text-primary text-xs uppercase tracking-wider block">
                  Đề chính (Thang điểm: 4,0 điểm):
                </span>
                <p className="text-on-surface font-medium leading-relaxed">
                  Viết bài văn nghị luận khoảng 600 chữ phân tích cách nhà thơ Trần Quang Quý cảm nhận &ldquo;tự do&rdquo; qua những hình ảnh làng quê trong bài thơ &ldquo;Màu tự do của đất&rdquo;, đồng thời liên hệ với một bài thơ hoặc đoạn thơ khác viết về làng quê, đồng ruộng để làm rõ cách nhìn riêng của tác giả.
                </p>
              </div>

              {/* Poem Verbatim Content */}
              <div className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/30 space-y-2">
                <div className="text-center pb-2 border-b border-outline-variant/20">
                  <h4 className="font-bold text-sm font-merriweather text-primary uppercase">Màu tự do của đất</h4>
                  <span className="text-xs text-on-surface-variant italic">Trần Quang Quý</span>
                </div>

                <div className="font-serif text-[13px] leading-loose text-on-surface pl-2 border-l-2 border-secondary/40 space-y-1">
                  {POEM_TEXT_LINES.map((line, idx) => (
                    <div key={idx} className={line === '' ? 'h-3' : 'hover:bg-surface-container-low/40 px-1 rounded'}>
                      {line}
                    </div>
                  ))}
                </div>
              </div>

              {/* Source verification notes */}
              <div className="p-3 bg-secondary-fixed/20 rounded-xl border border-secondary/30 space-y-1.5 text-[11px] text-on-surface">
                <span className="font-bold text-secondary flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">info</span>
                  Ghi chú rà soát văn bản nguồn từ file DOCX:
                </span>
                {POEM_SOURCE_NOTES.map((note, idx) => (
                  <p key={idx} className="text-on-surface-variant">• {note}</p>
                ))}
              </div>
            </div>

            <div className="p-3 border-t border-outline-variant/20 flex justify-end bg-surface-container-low/40 rounded-b-2xl">
              <button
                onClick={() => setReadingModalOpen(false)}
                className="px-4 py-1.5 bg-primary text-white rounded-lg text-xs font-semibold"
              >
                Đóng (Esc)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rubric & DOCX Guide Modal */}
      {rubricModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-xl border border-outline-variant/40">
            <div className="p-4 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low/60 rounded-t-2xl">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">gavel</span>
                <h3 className="font-bold text-sm text-on-surface font-merriweather">
                  Barem Rubric Đề xuất &amp; Hướng dẫn chấm gốc DOCX (Thang 4,0 điểm)
                </h3>
              </div>
              <button
                onClick={() => setRubricModalOpen(false)}
                className="p-1 text-on-surface-variant hover:text-on-surface rounded-lg"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs leading-relaxed">
              {/* 4 Criteria Grid */}
              <div className="space-y-3">
                <span className="font-bold text-primary text-xs uppercase tracking-wider block">
                  Cấu trúc 4 tiêu chí Barem Rubric (Tổng: 4,00 điểm):
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {activeRubric.criteria.map((c) => (
                    <div key={c.id} className="p-3 bg-surface-container-low rounded-xl border border-outline-variant/30 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-on-surface">{c.name}</span>
                        <span className="font-bold text-secondary font-mono">{c.weight.toFixed(2)}đ</span>
                      </div>
                      <p className="text-[11px] text-on-surface-variant leading-relaxed">{c.guideNote}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Verbatim DOCX Guide Section */}
              <div className="p-4 bg-surface-container-low/60 rounded-xl border border-outline-variant/30 space-y-2">
                <span className="font-bold text-primary text-xs uppercase tracking-wider block">
                  Nội dung Hướng dẫn chấm nguyên gốc từ DOCX:
                </span>
                <pre className="font-sans text-[11px] text-on-surface whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto p-3 bg-surface-container-lowest rounded-lg border border-outline-variant/20">
                  {DOCX_ORIGINAL_GUIDE}
                </pre>
              </div>
            </div>

            <div className="p-3 border-t border-outline-variant/20 flex justify-end bg-surface-container-low/40 rounded-b-2xl">
              <button
                onClick={() => setRubricModalOpen(false)}
                className="px-4 py-1.5 bg-primary text-white rounded-lg text-xs font-semibold"
              >
                Đóng (Esc)
              </button>
            </div>
          </div>
        </div>
      )}
    </StudentShell>
  );
}
