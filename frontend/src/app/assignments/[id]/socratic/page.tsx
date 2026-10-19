'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import StudentShell from '@/components/StudentShell';
import AssignmentWorkflowStepper from '@/components/AssignmentWorkflowStepper';
import { useAppStore } from '@/lib/store';
import { useSocraticStore, setOnUnauthorizedHandler } from '@/features/socratic/store';
import { useAuthStore } from '@/lib/auth-store';
import { UIOutlineSection, itemsOfSection, isValidOutlineProposal, CLARIFICATION_REASON_LABEL } from '@/features/socratic/types';
import { catalogApi } from '@/features/catalog/api';
import type { StudentAssignment } from '@/features/catalog/types';
import { shouldResetSocraticSession, socraticSessionKey } from '@/features/socratic/lifecycle';
import { CENTRAL_ASSIGNMENT_ID } from '@/lib/mock/assignmentData';

const ASSIGNMENT_CODE_MAP: Record<string, string> = {
  'assign-nlvh-mau-tu-do-dat': 'VAN11-NLVH-01',
};

export default function SocraticChatPage() {
  const router = useRouter();
  const params = useParams();
  const assignmentId = (params?.id as string) || CENTRAL_ASSIGNMENT_ID;

  // Auth state
  const authStore = useAuthStore();
  const isAuthenticated = authStore.status === 'authenticated';
  const authUser = authStore.user;
  const { addToast } = useAppStore();
  const [assignmentDetail, setAssignmentDetail] = useState<StudentAssignment | null>(null);
  const [assignmentLoadError, setAssignmentLoadError] = useState('');

  const assignmentCode = assignmentDetail?.code || ASSIGNMENT_CODE_MAP[assignmentId] || assignmentId;

  // Socratic store state
  const {
    session,
    messages,
    isLoadingMessages,
    hasMoreMessages,
    outline,
    isSavingOutline,
    outlineConflict,
    isInitializingOutline,
    outlineInitFailed,
    error,
    errorCode,
    selectedPoint,
    highlightedPointIds,
    isSending,
    isAiResponding,
    pendingOperation,
    initializeSession,
    ensureOutlineInit,
    loadMessages,
    sendMessage,
    retryPendingMessage,
    addOutlinePoint,
    updateOutlinePoint,
    removeOutlinePoint,
    reorderOutlinePoints,
    saveOutline,
    resolveOutlineConflict,
    reviewOutline,
    selectPoint,
    clearPointSelection,
    reset,
  } = useSocraticStore();

  const { currentUser } = useAppStore();
  const assignmentTitle = assignmentDetail?.title || 'Bài tập';
  const assignmentInstructions =
    assignmentDetail?.writingTask || assignmentDetail?.instructions || assignmentDetail?.extraInstructions || '';
  const assignmentMaterials = assignmentDetail?.materials || [];
  const assignmentRubric = assignmentDetail?.rubric;

  // Local UI state
  const [inputMessage, setInputMessage] = useState('');
  const [readingModalOpen, setReadingModalOpen] = useState(false);
  const [rubricModalOpen, setRubricModalOpen] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);

  // Outline manual addition & inline editing
  const [addingSectionId, setAddingSectionId] = useState<string | null>(null);
  const [newPointText, setNewPointText] = useState('');
  const [editingPoint, setEditingPoint] = useState<{ sectionId: string; index: number; text: string } | null>(null);

  // Section targets for adding to outline from chat messages
  const [selectedTargetSection, setSelectedTargetSection] = useState<Record<string, 'intro' | 'body' | 'conclusion'>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const sessionIdentityRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    catalogApi
      .getAssignment(ASSIGNMENT_CODE_MAP[assignmentId] || assignmentId)
      .then((detail) => {
        if (!cancelled) setAssignmentDetail(detail);
      })
      .catch((err) => {
        if (!cancelled) {
          setAssignmentLoadError(err instanceof Error ? err.message : 'Không tải được đề bài.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, assignmentId]);

  useEffect(() => {
    setOnUnauthorizedHandler(() => {
      authStore.clear();
    });
  }, [authStore]);

  const sessionIdentity = socraticSessionKey(authUser?.id, assignmentDetail?.code);

  useEffect(() => {
    const previous = sessionIdentityRef.current;
    if (shouldResetSocraticSession(previous, sessionIdentity)) {
      reset();
      setIsInitialized(false);
    }
    sessionIdentityRef.current = sessionIdentity;
  }, [sessionIdentity, reset]);

  useEffect(() => {
    if (!isAuthenticated || !assignmentDetail?.code || !authUser) {
      return;
    }
    let cancelled = false;
    initializeSession(assignmentDetail.code, authUser.id)
      .then(() => {
        if (!cancelled) setIsInitialized(true);
      })
      .catch((err) => {
        console.error('Failed to initialize session:', err);
        if (!cancelled) setIsInitialized(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, assignmentDetail?.code, authUser?.id, initializeSession]);

  useEffect(() => {
    return () => {
      reset();
    };
  }, [reset]);

  useEffect(() => {
    if (!isAuthenticated) {
      reset();
      setIsInitialized(false);
    }
  }, [isAuthenticated, reset]);

  // Auto-scroll chat when messages update or during response
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAiResponding]);

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

  // Handle API errors
  useEffect(() => {
    if (error) {
      addToast(error, 'error');
    }
  }, [error, addToast]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || isAiResponding || isSending) return;
    const textToSend = inputMessage.trim();
    setInputMessage('');
    await sendMessage(textToSend);
  };

  const handleRetry = async () => {
    await retryPendingMessage();
  };

  const handleLoadMoreMessages = async () => {
    const container = chatScrollRef.current;
    if (!container) return;
    const prevScrollHeight = container.scrollHeight;
    const prevScrollTop = container.scrollTop;

    await loadMessages(true);

    requestAnimationFrame(() => {
      if (container) {
        const newScrollHeight = container.scrollHeight;
        container.scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight);
      }
    });
  };

  const handleAddOutlinePointSubmit = async (sectionId: string) => {
    if (!newPointText.trim()) return;
    const added = addOutlinePoint(sectionId, newPointText.trim());
    if (added) {
      setNewPointText('');
      setAddingSectionId(null);
      const saved = await saveOutline();
      if (saved) {
        addToast('Đã thêm ý mới vào dàn ý của em.', 'success');
      } else {
        addToast('Đã thêm ý vào bản nháp, nhưng chưa lưu được lên máy chủ.', 'warning');
      }
    } else {
      addToast('Ý này đã có trong dàn ý của em (tránh trùng lặp).', 'warning');
    }
  };

  const handleSaveInlineEdit = async () => {
    if (!editingPoint) return;
    if (!editingPoint.text.trim()) {
      addToast('Nội dung ý không được để trống.', 'warning');
      return;
    }
    updateOutlinePoint(editingPoint.sectionId, editingPoint.index, editingPoint.text.trim());
    setEditingPoint(null);
    const saved = await saveOutline();
    if (saved) {
      addToast('Đã cập nhật ý trong dàn ý.', 'success');
    } else {
      addToast('Đã sửa bản nháp, nhưng chưa lưu được lên máy chủ.', 'warning');
    }
  };

  const handleTransferToOutline = async (msgId: string, point: string, defaultSectionId: 'intro' | 'body' | 'conclusion' = 'body') => {
    const targetSection = selectedTargetSection[msgId] || defaultSectionId;
    const added = addOutlinePoint(targetSection, point);
    if (added) {
      const sectionName =
        targetSection === 'intro' ? 'Mở bài' : targetSection === 'body' ? 'Thân bài' : 'Kết bài';
      const saved = await saveOutline();
      if (saved) {
        addToast(`Đã thêm ý vào phần ${sectionName}.`, 'success');
      } else {
        addToast(`Đã thêm ý vào bản nháp phần ${sectionName}, nhưng chưa lưu được lên máy chủ.`, 'warning');
      }
    } else {
      addToast('Ý này đã có trong dàn ý của em (tránh thêm trùng lặp).', 'info');
    }
  };

  const handleSaveOutline = async () => {
    const saved = await saveOutline();
    if (saved) {
      addToast('Dàn ý đã được lưu.', 'success');
    } else {
      addToast('Không thể lưu dàn ý. Vui lòng kiểm tra lại.', 'error');
    }
  };

  const handleReviewOutline = async () => {
    setIsReviewing(true);
    try {
      const result = await reviewOutline();
      if (result) {
        const readinessLabel = result.readiness === 'READY' ? 'Sẵn sàng nộp bài'
          : result.readiness === 'NOT_READY' ? 'Chưa sẵn sàng'
          : 'Cần thêm ý kiến';
        addToast(`Đã rà soát: ${readinessLabel}`, 'info');
      } else {
        addToast('Không thể rà soát dàn ý. Vui lòng kiểm tra lại.', 'error');
      }
    } catch {
      addToast('Không thể rà soát dàn ý. Vui lòng thử lại.', 'error');
    } finally {
      setIsReviewing(false);
    }
  };

  // Get readiness from session
  const readiness = session?.readiness || 'INCONCLUSIVE';
  const readinessLabel = readiness === 'READY' ? 'Sẵn sàng nộp bài'
    : readiness === 'NOT_READY' ? 'Cần hoàn thiện thêm'
    : 'Đang đánh giá...';

  // Loading state
  const isLoading = (isLoadingMessages && messages.length === 0 && !isInitializingOutline);

  return (
    <StudentShell headerTitle="Khối 11 - Lớp 11A14" headerSubtitle="Trợ lý gợi mở Socratic & Lập dàn ý">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Top Breadcrumb & Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-outline-variant/20">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs bg-primary-fixed text-primary font-bold px-2.5 py-0.5 rounded-full">
                Socratic Writing Scaffold
              </span>
              <span className="text-xs text-on-surface-variant font-medium">
                {assignmentDetail?.code || assignmentCode}: {assignmentTitle}
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
            <div ref={chatScrollRef} className="flex-1 p-4 overflow-y-auto space-y-4">
              {/* Pagination button for older turns */}
              {hasMoreMessages && (
                <div className="flex justify-center pb-2">
                  <button
                    type="button"
                    onClick={handleLoadMoreMessages}
                    disabled={isLoadingMessages}
                    className="px-3 py-1 bg-surface-container hover:bg-surface-container-high rounded-full text-[11px] font-semibold text-primary transition-all flex items-center gap-1 shadow-2xs disabled:opacity-50"
                  >
                    {isLoadingMessages ? (
                      <span className="w-3 h-3 border border-primary border-t-transparent rounded-full animate-spin"></span>
                    ) : (
                      <span className="material-symbols-outlined text-[13px]">history</span>
                    )}
                    <span>Tải tin nhắn cũ hơn</span>
                  </button>
                </div>
              )}

              {isInitializingOutline && messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-xs text-on-surface-variant">
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-secondary border-t-transparent rounded-full animate-spin"></span>
                    <span>Đang soạn dàn ý gợi ý theo đề...</span>
                  </div>
                </div>
              ) : isLoading ? (
                <div className="flex items-center justify-center h-full text-xs text-on-surface-variant">
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-secondary border-t-transparent rounded-full animate-spin"></span>
                    <span>Đang tải cuộc trò chuyện...</span>
                  </div>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-xs text-on-surface-variant">
                  <div className="text-center p-4">
                    <span className="material-symbols-outlined text-3xl text-outline mb-2">chat</span>
                    <p>Chưa có tin nhắn. Hãy bắt đầu cuộc trò chuyện với trợ lý Socratic!</p>
                  </div>
                </div>
              ) : (
                messages.map((msg) => (
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
                          <span className="font-semibold text-on-surface">{currentUser?.name || authUser?.displayName || 'Học sinh'}</span>
                          <span className="w-5 h-5 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-bold text-[10px]">
                            {currentUser?.avatarInitials || (authUser?.displayName?.charAt(0) || 'HS')}
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

                      {/* Display source references from backend */}
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="mt-2.5 pt-2 border-t border-outline-variant/30 space-y-1">
                          <div className="text-[10px] font-bold text-secondary flex items-center gap-1">
                            <span className="material-symbols-outlined text-[12px]">format_quote</span>
                            <span>Nguồn ngữ liệu tham chiếu:</span>
                          </div>
                          <div className="space-y-1">
                            {msg.sources.map((src, idx) => (
                              <div key={idx} className="text-[11px] text-on-surface-variant italic pl-2 border-l-2 border-secondary/40">
                                &ldquo;{src.quote}&rdquo; {src.chunk_id ? <span className="not-italic text-[10px] font-mono opacity-70">({src.chunk_id})</span> : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {msg.clarificationReason ? (
                        <div className="mt-2.5 pt-2 border-t border-error/20 text-[11px] text-error">
                          {CLARIFICATION_REASON_LABEL[msg.clarificationReason] ||
                            'Thao tác dàn ý chưa được áp dụng. Bản nháp của em được giữ nguyên.'}
                        </div>
                      ) : null}

                      {(msg.proposals || []).filter(isValidOutlineProposal).map((proposal, proposalIdx) => {
                        const key = `${msg.id}-p-${proposalIdx}`;
                        const defaultSection = (proposal.sectionId === 'intro' || proposal.sectionId === 'conclusion' || proposal.sectionId === 'body')
                          ? proposal.sectionId
                          : 'body';
                        return (
                          <div
                            key={key}
                            className="mt-3 pt-2.5 border-t border-outline-variant/30 space-y-2 bg-surface-container-lowest/60 p-2.5 rounded-lg border border-outline-variant/20"
                          >
                            <div className="text-[11px] text-on-surface flex items-start gap-1.5">
                              <span className="material-symbols-outlined text-secondary text-sm shrink-0 mt-0.5">lightbulb</span>
                              <span className="leading-snug"><strong className="text-secondary font-semibold">Gợi ý ý dàn ý:</strong> {proposal.text}</span>
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-outline-variant/20">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] text-on-surface-variant font-medium">Chuyển vào:</span>
                                <select
                                  value={selectedTargetSection[key] || defaultSection}
                                  onChange={(e) =>
                                    setSelectedTargetSection({
                                      ...selectedTargetSection,
                                      [key]: e.target.value as 'intro' | 'body' | 'conclusion',
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
                                type="button"
                                onClick={() =>
                                  handleTransferToOutline(
                                    key,
                                    proposal.text,
                                    selectedTargetSection[key] || defaultSection
                                  )
                                }
                                className="px-2.5 py-1 bg-secondary text-white rounded text-[11px] font-semibold hover:bg-secondary/90 flex items-center gap-1 shadow-sm transition-all"
                              >
                                <span className="material-symbols-outlined text-[14px]">playlist_add</span>
                                <span>Thêm vào dàn ý</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Retry button for failed message */}
                    {msg.isFailed && (
                      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-error font-medium">
                        <span className="material-symbols-outlined text-xs">error</span>
                        <span>Chưa gửi được tin nhắn.</span>
                        {pendingOperation && (
                          <button
                            type="button"
                            onClick={handleRetry}
                            disabled={isSending || isAiResponding}
                            className="underline hover:text-error/80 font-semibold ml-1 cursor-pointer"
                          >
                            Thử lại
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}

              {isAiResponding && (
                <div className="flex items-center gap-2.5 p-3.5 bg-surface-container-low/70 rounded-xl max-w-[80%] text-xs text-on-surface-variant border border-outline-variant/30 shadow-xs">
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="w-2 h-2 rounded-full bg-secondary animate-bounce [animation-delay:-0.3s]"></span>
                    <span className="w-2 h-2 rounded-full bg-secondary animate-bounce [animation-delay:-0.15s]"></span>
                    <span className="w-2 h-2 rounded-full bg-secondary animate-bounce"></span>
                  </div>
                  <span className="italic font-medium">Trợ lý Socratic đang phân tích và soạn phản hồi...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Chat Composer Form */}
            <form onSubmit={handleSendMessage} className="p-3 border-t border-outline-variant/30 flex gap-2 bg-surface-container-lowest rounded-b-xl">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                disabled={isAiResponding || !isAuthenticated || isSending}
                placeholder={
                  !isAuthenticated
                    ? 'Vui lòng đăng nhập để chat...'
                    : selectedPoint
                      ? 'Hỏi về ý đang chọn, hoặc yêu cầu thêm/sửa/xóa ý đó...'
                      : 'Nhập câu hỏi hoặc chia sẻ ý tưởng để cùng Trợ lý Socratic phát triển dàn ý...'
                }
                maxLength={400}
                className="flex-1 px-3 py-2 text-xs rounded-lg border border-outline-variant/60 bg-surface text-on-surface focus:outline-none focus:border-secondary disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={isAiResponding || !inputMessage.trim() || !isAuthenticated || isSending}
                className="px-4 py-2 bg-primary text-white font-bold text-xs rounded-lg hover:bg-primary/90 transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50 shrink-0"
              >
                {isAiResponding || isSending ? (
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
                  {selectedPoint
                    ? 'Đang chọn một ý — tin nhắn tiếp theo sẽ hỏi/sửa đúng ý này.'
                    : 'Chọn một ý để hỏi, hoặc tự chỉnh sửa và sắp xếp thứ tự.'}
                </p>
              </div>
              <button
                onClick={handleSaveOutline}
                disabled={isSavingOutline}
                className="px-2.5 py-1 text-xs border border-outline-variant/50 rounded-md text-on-surface hover:bg-surface-container flex items-center gap-1 disabled:opacity-50"
              >
                {isSavingOutline ? (
                  <span className="w-3 h-3 border border-on-surface border-t-transparent rounded-full animate-spin"></span>
                ) : (
                  <span className="material-symbols-outlined text-[14px]">save</span>
                )}
                <span>Lưu nháp</span>
              </button>
            </div>

            {/* Conflict resolution banner */}
            {outlineConflict && (
              <div className="p-3 mx-3.5 mt-3 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-amber-800 dark:text-amber-400">
                  <span className="material-symbols-outlined text-sm">warning</span>
                  <span>Xung đột phiên bản dàn ý với máy chủ</span>
                </div>
                <p className="text-[11px] text-on-surface-variant">
                  Dàn ý trên máy chủ có phiên bản mới hơn. Em muốn ghi đè bằng bản nháp hiện tại hay tải lại từ máy chủ?
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => resolveOutlineConflict('keep_draft')}
                    className="px-2.5 py-1 bg-primary text-white rounded text-[11px] font-semibold hover:bg-primary/90"
                  >
                    Ghi đè bản nháp
                  </button>
                  <button
                    type="button"
                    onClick={() => resolveOutlineConflict('load_server')}
                    className="px-2.5 py-1 bg-surface-container border border-outline-variant/60 rounded text-[11px] font-semibold text-on-surface hover:bg-surface-container-high"
                  >
                    Tải lại từ máy chủ
                  </button>
                </div>
              </div>
            )}

            {isInitializingOutline && (
              <div className="mx-3.5 mt-3 p-3 bg-secondary/5 border border-secondary/20 rounded-xl text-xs flex items-center gap-2 text-on-surface-variant">
                <span className="w-3.5 h-3.5 border-2 border-secondary border-t-transparent rounded-full animate-spin shrink-0"></span>
                <span>Đang soạn dàn ý gợi ý theo đề, ngữ liệu và rubric...</span>
              </div>
            )}
            {outlineInitFailed && !isInitializingOutline && (
              <div className="mx-3.5 mt-3 p-3 bg-error/5 border border-error/20 rounded-xl text-xs space-y-2">
                <p className="text-error font-semibold">
                  {error || 'Chưa tạo được dàn ý gợi ý lần này.'}
                </p>
                <p className="text-[11px] text-on-surface-variant leading-relaxed">
                  {errorCode === 'AI_UNAVAILABLE' || errorCode === 'SERVICE_UNAVAILABLE'
                    ? 'Em đợi một lát rồi bấm Thử lại. Đề, ngữ liệu và rubric vẫn còn trên bài tập.'
                    : 'Em bấm Thử lại để hệ thống soạn lại từ đề, ngữ liệu và rubric đã có. Không cần import hay nhập lại đề.'}
                </p>
                <button
                  type="button"
                  onClick={() => ensureOutlineInit(true)}
                  className="px-2.5 py-1 bg-primary text-white rounded text-[11px] font-semibold"
                >
                  Thử lại
                </button>
              </div>
            )}

            {/* Outline Sections & Points */}
            <div className="flex-1 p-3.5 overflow-y-auto space-y-3.5 text-xs">
              {outline.sections.map((section: UIOutlineSection) => (
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

                  {itemsOfSection(section).length === 0 ? (
                    <div className="p-2.5 border border-dashed border-outline-variant/40 rounded-lg text-center text-[11px] text-on-surface-variant/70 italic">
                      Chưa có ý nào. Hãy trao đổi với trợ lý AI hoặc bấm &ldquo;Thêm ý&rdquo;.
                    </div>
                  ) : (
                    <ul className="space-y-1.5">
                      {itemsOfSection(section).map((item, idx: number) => {
                        const point = item.text;
                        const isEditingThis =
                          editingPoint !== null && editingPoint?.sectionId === section.id && editingPoint?.index === idx;

                        if (isEditingThis && editingPoint) {
                          return (
                            <li key={item.id || idx} className="p-2 bg-surface-container-lowest rounded-lg border border-secondary space-y-1.5">
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

                        const pointId = item.id;
                        const isSelected =
                          selectedPoint?.id === pointId ||
                          (selectedPoint?.sectionId === section.id && selectedPoint?.index === idx);
                        const isHighlighted = Boolean(pointId && highlightedPointIds.includes(pointId));

                        return (
                          <li
                            key={pointId || idx}
                            className={`p-2 bg-surface-container-lowest rounded-lg border text-on-surface text-[11px] flex items-start justify-between gap-2 group transition-all ${
                              isSelected
                                ? 'border-secondary ring-1 ring-secondary/40'
                                : isHighlighted
                                  ? 'border-tertiary bg-tertiary-container/20'
                                  : 'border-outline-variant/30 hover:border-secondary/40'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                if (isSelected) {
                                  clearPointSelection();
                                } else {
                                  selectPoint(section.id, idx);
                                }
                              }}
                              className="leading-relaxed flex-1 text-left"
                              title={isSelected ? 'Bỏ chọn ý này' : 'Chọn ý này để hỏi hoặc chỉnh'}
                            >
                              • {point}
                            </button>
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
                                onClick={async () => {
                                  removeOutlinePoint(section.id, idx);
                                  const saved = await saveOutline();
                                  if (saved) {
                                    addToast('Đã xóa ý khỏi dàn ý.', 'info');
                                  } else {
                                    addToast('Đã xóa trong bản nháp, nhưng chưa lưu được lên máy chủ.', 'warning');
                                  }
                                }}
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

              {/* Readiness Status Card - from Backend */}
              <div className="p-3 bg-surface-container-lowest rounded-xl border border-outline-variant/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-on-surface flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm text-secondary">checklist</span>
                    <span>Kiểm tra cấu trúc yêu cầu đề bài:</span>
                  </span>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                    readiness === 'READY'
                      ? 'bg-tertiary-container/40 text-tertiary'
                      : readiness === 'NOT_READY'
                      ? 'bg-[#FEF9C3] text-[#CA8A04]'
                      : 'bg-surface-container text-on-surface-variant'
                  }`}>
                    {readiness === 'READY' ? '✓ Đạt chuẩn'
                      : readiness === 'NOT_READY' ? '⚠ Cần thêm'
                      : '⏳ Đang đánh giá'}
                  </span>
                </div>

                <div className="text-[10px] text-on-surface-variant/70 italic pt-1 border-t border-outline-variant/20">
                  * Đánh giá độ sẵn sàng dựa trên kết quả rà soát từ hệ thống. Sử dụng nút &ldquo;Rà soát&rdquo; để cập nhật.
                </div>

                <button
                  type="button"
                  onClick={handleReviewOutline}
                  disabled={isReviewing}
                  className="w-full py-2 px-3 bg-secondary-container text-on-secondary-container text-xs font-semibold rounded-lg hover:bg-secondary-container/80 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {isReviewing ? (
                    <span className="w-3 h-3 border border-secondary border-t-transparent rounded-full animate-spin"></span>
                  ) : (
                    <span className="material-symbols-outlined text-sm">refresh</span>
                  )}
                  <span>Rà soát dàn ý</span>
                </button>
              </div>
            </div>

            {/* Bottom Transition CTA */}
            <div className="p-3.5 border-t border-outline-variant/20 bg-surface-container-low/50 rounded-b-xl space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-on-surface">Đánh giá độ sẵn sàng:</span>
                <span className={`text-[11px] font-semibold ${
                  readiness === 'READY' ? 'text-tertiary'
                  : readiness === 'NOT_READY' ? 'text-[#CA8A04]'
                  : 'text-primary'
                }`}>
                  {readinessLabel}
                </span>
              </div>

              <button
                type="button"
                onClick={() => router.push(`/assignments/${assignmentId}/submit`)}
                className="w-full py-2.5 px-4 bg-primary text-white font-bold text-xs rounded-lg hover:bg-primary/90 transition-all shadow-sm flex items-center justify-center gap-1.5"
              >
                <span>Chuyển sang bước viết bài &amp; Nộp ảnh</span>
                <span className="material-symbols-outlined text-base">arrow_forward</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Reading Material Modal */}
      {readingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setReadingModalOpen(false)}>
          <div className="bg-surface-container-lowest rounded-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-outline-variant/20 flex items-center justify-between">
              <h2 className="font-headline-sm text-lg font-bold text-on-surface font-merriweather">
                Đề bài &amp; Ngữ liệu
              </h2>
              <button onClick={() => setReadingModalOpen(false)} className="p-1 text-on-surface-variant hover:bg-surface-container rounded">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <h3 className="font-bold text-on-surface mb-2">{assignmentTitle}</h3>
                <p className="text-sm text-on-surface-variant mb-4 whitespace-pre-line">{assignmentInstructions}</p>
                {assignmentLoadError && <p className="text-xs text-error">{assignmentLoadError}</p>}
              </div>
              {assignmentMaterials.map((material) => (
                <div key={material.id} className="p-4 bg-surface-container-low rounded-lg border-l-4 border-primary">
                  <h4 className="font-bold text-primary mb-2">{material.title}</h4>
                  {material.sourceInfo && (
                    <p className="text-xs text-on-surface-variant mb-2">{material.sourceInfo}</p>
                  )}
                  <p className="font-merriweather text-sm leading-relaxed whitespace-pre-line">
                    {material.content || material.excerpt}
                  </p>
                  {(material.sourceNotes || []).length > 0 && (
                    <ul className="text-xs text-on-surface-variant space-y-1 mt-3">
                      {material.sourceNotes!.map((note, idx) => (
                        <li key={idx}>• {note}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
              {assignmentMaterials.length === 0 && (
                <p className="text-sm text-on-surface-variant">Chưa tải được ngữ liệu của bài này.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Rubric Modal */}
      {rubricModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setRubricModalOpen(false)}>
          <div className="bg-surface-container-lowest rounded-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-outline-variant/20 flex items-center justify-between">
              <h2 className="font-headline-sm text-lg font-bold text-on-surface font-merriweather">
                Barem Rubric {assignmentRubric?.maxScore ? `(${assignmentRubric.maxScore}đ)` : ''}
              </h2>
              <button onClick={() => setRubricModalOpen(false)} className="p-1 text-on-surface-variant hover:bg-surface-container rounded">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-6">
              {assignmentRubric?.criteria?.length ? (
                <div className="space-y-4">
                  <div className="text-sm text-on-surface-variant">{assignmentRubric.title || assignmentRubric.description}</div>
                  {assignmentRubric.criteria.map((criterion) => (
                    <div key={criterion.id} className="p-3 bg-surface-container-low rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-on-surface">{criterion.name}</span>
                        <span className="text-xs bg-primary-container text-on-primary-container px-2 py-0.5 rounded-full">
                          {criterion.weight} điểm
                        </span>
                      </div>
                      {criterion.guideNote && (
                        <p className="text-xs text-on-surface-variant">{criterion.guideNote}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-on-surface-variant">Chưa có rubric cho bài tập này.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </StudentShell>
  );
}
