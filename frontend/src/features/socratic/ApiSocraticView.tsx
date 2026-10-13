'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import StudentShell from '@/components/StudentShell';
import AssignmentWorkflowStepper from '@/components/AssignmentWorkflowStepper';
import { initialsFromName, useApiAuthStore } from '@/lib/api-auth-store';
import { ApiError, type ApiChatMessage, type ApiOutline, type ApiSession } from '@/lib/api/types';
import { getSocraticSession, openOrResumeSession, saveOutline, sendTurn } from '@/lib/api/socratic';
import { loadSocraticDraft, saveSocraticDraft, type PendingTurn } from '@/lib/socratic-draft';
import { useAppStore } from '@/lib/store';

function isReadOnly(session: ApiSession): boolean {
  return session.status === 'COMPLETED' || session.assignmentStatus === 'CLOSED' || session.hasSubmission;
}

function mergeMessages(server: ApiChatMessage[]): ApiChatMessage[] {
  const byId = new Map<string, ApiChatMessage>();
  for (const item of server) {
    byId.set(item.id, item);
  }
  return [...byId.values()].sort((a, b) => a.sequence - b.sequence);
}

function emptyOutline(): ApiOutline {
  return {
    sections: [
      { id: 'open', title: 'Mở bài', points: [] },
      { id: 'body', title: 'Thân bài', points: [] },
      { id: 'close', title: 'Kết bài', points: [] },
    ],
  };
}

function outlinesEqual(a: ApiOutline, b: ApiOutline): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export default function ApiSocraticView() {
  const params = useParams();
  const searchParams = useSearchParams();
  const assignmentId = params?.id as string;
  const urlSessionId = searchParams.get('sessionId');
  const user = useApiAuthStore((state) => state.user);
  const addToast = useAppStore((state) => state.addToast);
  const userInitials = initialsFromName(user?.displayName || 'Học sinh');

  const [session, setSession] = useState<ApiSession | null>(null);
  const [outline, setOutline] = useState<ApiOutline>(emptyOutline());
  const [savedOutline, setSavedOutline] = useState<ApiOutline>(emptyOutline());
  const [outlineRevision, setOutlineRevision] = useState(1);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [pending, setPending] = useState<PendingTurn | null>(null);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryable, setRetryable] = useState(false);
  const [readingOpen, setReadingOpen] = useState(false);
  const [rubricOpen, setRubricOpen] = useState(false);
  const [addingSectionId, setAddingSectionId] = useState<string | null>(null);
  const [newPointText, setNewPointText] = useState('');
  const requestSeq = useRef(0);

  const persistDraft = useCallback(
    (next: Partial<{ outline: ApiOutline; outlineRevision: number; dirty: boolean; inputMessage: string; pending: PendingTurn | null }>) => {
      if (!user || !session) return;
      saveSocraticDraft(user.id, session.sessionId, {
        outline: next.outline ?? outline,
        outlineRevision: next.outlineRevision ?? outlineRevision,
        dirty: next.dirty ?? dirty,
        inputMessage: next.inputMessage ?? inputMessage,
        pending: next.pending === undefined ? pending : next.pending,
      });
    },
    [user, session, outline, outlineRevision, dirty, inputMessage, pending],
  );

  const applySession = useCallback(
    (view: ApiSession, opts: { keepDirty?: boolean } = {}) => {
      setSession(view);
      setOutlineRevision(view.outlineRevision);
      const stored = user ? loadSocraticDraft(user.id, view.sessionId) : null;
      const keepDirty = opts.keepDirty ?? Boolean(stored?.dirty);
      if (keepDirty && stored && stored.dirty) {
        setOutline(stored.outline);
        setDirty(true);
        setConflict(!outlinesEqual(stored.outline, view.outline) && stored.outlineRevision !== view.outlineRevision);
      } else {
        setOutline(view.outline.sections.length > 0 ? view.outline : emptyOutline());
        setDirty(false);
        setConflict(false);
      }
      setSavedOutline(view.outline);
      if (stored?.inputMessage) {
        setInputMessage(stored.inputMessage);
      }
      if (stored?.pending) {
        setPending(stored.pending);
      }
    },
    [user],
  );

  const loadSession = useCallback(async () => {
    if (!assignmentId) return;
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      let view: ApiSession;
      if (urlSessionId) {
        try {
          view = await getSocraticSession(urlSessionId);
        } catch {
          view = await openOrResumeSession(assignmentId);
        }
      } else {
        view = await openOrResumeSession(assignmentId);
      }
      if (seq !== requestSeq.current) return;
      applySession(view);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setError(err instanceof ApiError ? err.message : 'Không mở được phiên Socratic.');
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false);
      }
    }
  }, [assignmentId, urlSessionId, applySession]);

  useEffect(() => {
    requestSeq.current += 1;
    setSession(null);
    setPending(null);
    void loadSession();
  }, [loadSession, user?.id, assignmentId]);

  useEffect(() => {
    if (user && session) {
      persistDraft({});
    }
  }, [user, session, outline, dirty, inputMessage, pending, persistDraft]);

  const readOnly = session ? isReadOnly(session) : true;
  const chatLocked = readOnly || dirty || saving || sending;
  const messages = useMemo(() => mergeMessages(session?.messages ?? []), [session]);

  const handleSaveOutline = async () => {
    if (!session) return;
    setSaving(true);
    setError(null);
    try {
      const result = await saveOutline(session.sessionId, outline, outlineRevision);
      setOutline(result.outline);
      setSavedOutline(result.outline);
      setOutlineRevision(result.outlineRevision);
      setDirty(false);
      setConflict(false);
      persistDraft({
        outline: result.outline,
        outlineRevision: result.outlineRevision,
        dirty: false,
      });
      addToast('Đã lưu dàn ý thành công vào máy chủ.', 'success');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'OUTLINE_VERSION') {
        setConflict(true);
        try {
          const latest = await getSocraticSession(session.sessionId);
          setSession(latest);
          setSavedOutline(latest.outline);
          setOutlineRevision(latest.outlineRevision);
        } catch {
          // keep local draft
        }
        addToast('Dàn ý đã được lưu từ phiên khác. Hãy đối chiếu bản đang sửa.', 'warning');
      } else {
        const message = err instanceof ApiError ? err.message : 'Không lưu được dàn ý.';
        setError(message);
        addToast(message, 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSend = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!session || chatLocked) return;
    const message = pending?.message ?? inputMessage.trim();
    if (!message) return;
    const requestId = pending?.requestId ?? crypto.randomUUID();
    const expectedLastSequence = pending?.expectedLastSequence ?? session.lastSequence;
    const nextPending = { requestId, message, expectedLastSequence };
    setPending(nextPending);
    setSending(true);
    setRetryable(false);
    setError(null);
    setInputMessage('');
    persistDraft({ pending: nextPending, inputMessage: '' });
    try {
      const result = await sendTurn(session.sessionId, nextPending);
      setSession((current) =>
        current
          ? {
              ...current,
              messages: mergeMessages([...current.messages, result.userMessage, result.assistantMessage]),
              lastSequence: result.lastSequence,
              outlineRevision: result.outlineRevision,
            }
          : current,
      );
      setPending(null);
      persistDraft({ pending: null });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'STALE') {
        return;
      }
      if (err instanceof ApiError && err.code === 'TURN_CONFLICT') {
        try {
          const latest = await getSocraticSession(session.sessionId);
          applySession(latest, { keepDirty: true });
          if (latest.messages.some((item) => item.requestId === requestId)) {
            setPending(null);
            persistDraft({ pending: null });
            addToast('Lượt chat đã được lưu. Đã tải lại lịch sử.', 'info');
            return;
          }
        } catch {
          // fall through
        }
        addToast('Lịch sử đã thay đổi. Hãy xem lại trước khi gửi tiếp.', 'warning');
        setPending(null);
        return;
      }
      const retry = err instanceof ApiError ? err.retryable || err.code === 'NETWORK_TIMEOUT' : true;
      setRetryable(retry);
      const messageText = err instanceof ApiError ? err.message : 'Không gửi được lượt chat.';
      setError(messageText);
      addToast(messageText, 'error');
      if (!retry) {
        setInputMessage(message);
        setPending(null);
      }
    } finally {
      setSending(false);
    }
  };

  const updatePoint = (sectionId: string, index: number, value: string) => {
    setOutline((current) => ({
      sections: current.sections.map((section) =>
        section.id === sectionId
          ? { ...section, points: section.points.map((point, i) => (i === index ? value : point)) }
          : section,
      ),
    }));
    setDirty(true);
  };

  const removePoint = (sectionId: string, index: number) => {
    setOutline((current) => ({
      sections: current.sections.map((section) =>
        section.id === sectionId
          ? { ...section, points: section.points.filter((_, i) => i !== index) }
          : section,
      ),
    }));
    setDirty(true);
  };

  const addPoint = (sectionId: string) => {
    if (!newPointText.trim()) return;
    setOutline((current) => ({
      sections: current.sections.map((section) =>
        section.id === sectionId ? { ...section, points: [...section.points, newPointText.trim()] } : section,
      ),
    }));
    setNewPointText('');
    setAddingSectionId(null);
    setDirty(true);
  };

  const totalPoints = outline.sections.reduce((sum, s) => sum + s.points.length, 0);

  return (
    <StudentShell
      headerTitle="Khối 12 - Lớp 12A1"
      headerSubtitle={session?.snapshot.title ?? 'Trợ lý gợi mở dàn ý Socratic'}
    >
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Top Breadcrumb & Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-outline-variant/20">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs bg-primary-fixed text-primary font-bold px-2.5 py-0.5 rounded-full">
                Socratic Writing Scaffold
              </span>
              <span className="text-xs text-on-surface-variant font-medium">
                {session?.snapshot.title || 'Bài tập Nghị luận'}
              </span>
            </div>
            <h1 className="font-headline-md text-xl font-bold text-on-surface font-merriweather">
              Trợ lý Socratic: Hướng dẫn xây dựng Dàn ý
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setReadingOpen(true)}
              className="px-3 py-1.5 rounded-lg border border-outline-variant/60 bg-surface-container-lowest text-xs font-semibold text-secondary hover:bg-surface-container transition-all flex items-center gap-1 shadow-sm"
            >
              <span className="material-symbols-outlined text-sm">menu_book</span>
              <span>Xem ngữ liệu đọc hiểu</span>
            </button>
            <button
              onClick={() => setRubricOpen(true)}
              className="px-3 py-1.5 rounded-lg border border-outline-variant/60 bg-surface-container-lowest text-xs font-semibold text-on-surface hover:bg-surface-container transition-all flex items-center gap-1 shadow-sm"
            >
              <span className="material-symbols-outlined text-sm">gavel</span>
              <span>Tiêu chí Rubric</span>
            </button>
          </div>
        </div>

        {/* Unified 5-Step Workflow Stepper */}
        <AssignmentWorkflowStepper currentStep="socratic" assignmentId={assignmentId} />

        {/* Read-Only Notice */}
        {readOnly && session && (
          <div className="p-3 bg-surface-container-low rounded-xl text-xs text-on-surface-variant border border-outline-variant/30 flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary text-base">lock</span>
            <span>
              <strong>Phiên chỉ đọc:</strong> {session.hasSubmission ? 'bài làm đã nộp' : session.assignmentStatus === 'CLOSED' ? 'đề bài đã đóng' : 'phiên đã kết thúc'}.
            </span>
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div
            className="p-3 bg-error-container/60 border border-error/30 rounded-lg text-xs text-error flex items-center justify-between"
            data-testid="socratic-error"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={() => (retryable && pending ? void handleSend() : void loadSession())}
              className="px-2.5 py-1 bg-surface-container-lowest rounded font-semibold text-xs shadow-xs"
            >
              {retryable && pending ? 'Gửi lại' : 'Thử lại'}
            </button>
          </div>
        )}

        {/* Outline Conflict Warning */}
        {conflict && (
          <div
            className="p-3 bg-[#FEF9C3] border border-[#FDE047] rounded-lg text-xs text-[#CA8A04] flex items-center gap-2"
            data-testid="outline-conflict"
          >
            <span className="material-symbols-outlined text-base">warning</span>
            <span>Dàn ý trên máy chủ đã đổi. Bản em đang sửa được giữ lại để đối chiếu, chưa bị ghi đè.</span>
          </div>
        )}

        {/* Pedagogical Principle Banner */}
        {session && !readOnly && (
          <div className="p-3 bg-surface-container-low/50 rounded-xl border border-secondary/20 flex items-center gap-2 text-xs text-on-surface-variant">
            <span className="material-symbols-outlined text-secondary text-base">verified</span>
            <span>
              <strong>Nguyên tắc Trợ lý GDPT 2018:</strong> Trợ lý gợi mở để em tự xây dựng ý tưởng và dàn ý cá nhân. AI tuyệt đối <strong>không viết thay bài văn</strong>.
            </span>
          </div>
        )}

        {/* Main Desktop Split View: Left Chat (7 cols), Right Outline (5 cols) */}
        {loading || !session ? (
          <div className="flex items-center justify-center gap-2 text-sm text-on-surface-variant py-20 bg-surface-container-lowest rounded-xl border border-outline-variant/30">
            <span className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span>Đang nạp dữ liệu phiên Socratic và dàn ý...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left Chat Area (7 cols) */}
            <div className="lg:col-span-7 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm flex flex-col h-[640px]">
              {/* Messages Scroll Area */}
              <div className="flex-1 p-4 overflow-y-auto space-y-4" data-testid="socratic-messages">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${msg.role === 'USER' ? 'items-end' : 'items-start'}`}
                  >
                    <div className="flex items-center gap-1.5 mb-1 text-[11px] text-on-surface-variant">
                      {msg.role === 'ASSISTANT' ? (
                        <>
                          <span className="w-5 h-5 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-bold text-[10px]">
                            AI
                          </span>
                          <span className="font-semibold text-secondary">Trợ lý Sư phạm</span>
                        </>
                      ) : (
                        <>
                          <span className="font-semibold text-on-surface">{user?.displayName || 'Học sinh'}</span>
                          <span className="w-5 h-5 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-bold text-[10px]">
                            {userInitials}
                          </span>
                        </>
                      )}
                      <span>• {new Date(msg.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>

                    <div
                      className={`p-3.5 rounded-xl max-w-[85%] text-xs leading-relaxed ${
                        msg.role === 'USER'
                          ? 'bg-primary-container text-on-primary-container rounded-tr-none font-medium'
                          : 'bg-surface-container-low text-on-surface rounded-tl-none border border-outline-variant/30'
                      }`}
                    >
                      <p className="whitespace-pre-line">{msg.content}</p>
                    </div>
                  </div>
                ))}

                {pending && (
                  <div className="flex flex-col items-end" data-testid="pending-message">
                    <div className="flex items-center gap-1.5 mb-1 text-[11px] text-on-surface-variant">
                      <span className="font-semibold text-on-surface">{user?.displayName || 'Học sinh'}</span>
                      <span className="w-5 h-5 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-bold text-[10px]">
                        {userInitials}
                      </span>
                    </div>
                    <div className="p-3.5 rounded-xl max-w-[85%] text-xs bg-primary-container/80 text-on-primary-container rounded-tr-none font-medium">
                      <p>{pending.message}</p>
                      <p className="text-[10px] mt-1 text-on-primary-container/80 italic flex items-center gap-1">
                        <span className="w-2.5 h-2.5 border border-on-primary-container border-t-transparent rounded-full animate-spin inline-block" />
                        Đang gửi tin nhắn...
                      </p>
                    </div>
                  </div>
                )}

                {sending && (
                  <div className="flex items-center gap-2 text-xs text-on-surface-variant italic py-1">
                    <span className="w-3.5 h-3.5 border-2 border-secondary border-t-transparent rounded-full animate-spin"></span>
                    <span>Trợ lý Socratic đang suy nghĩ câu hỏi gợi mở...</span>
                  </div>
                )}
              </div>

              {/* Quick Chips */}
              {!readOnly && (
                <div className="p-2.5 bg-surface-container-low/40 border-t border-outline-variant/20 flex flex-wrap gap-1.5 text-xs">
                  <span className="text-[11px] text-outline font-semibold self-center mr-1">Gợi ý nhanh:</span>
                  <button
                    type="button"
                    onClick={() => setInputMessage('Em muốn đào sâu thêm về phần phản đề, khi nào kiên định trở thành cố chấp?')}
                    className="px-2 py-1 bg-surface-container-lowest rounded-full border border-outline-variant/40 text-[11px] text-on-surface hover:bg-surface-container transition-colors"
                  >
                    Xem lại phản đề
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputMessage('Em chưa tìm được dẫn chứng thời sự người thật việc thật, AI gợi ý hướng tìm kiếm giúp em với.')}
                    className="px-2 py-1 bg-surface-container-lowest rounded-full border border-outline-variant/40 text-[11px] text-on-surface hover:bg-surface-container transition-colors"
                  >
                    Kiểm tra dẫn chứng
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputMessage('Em cần gợi ý bài học liên hệ bản thân thực tế cho học sinh lớp 12.')}
                    className="px-2 py-1 bg-surface-container-lowest rounded-full border border-outline-variant/40 text-[11px] text-on-surface hover:bg-surface-container transition-colors"
                  >
                    Liên hệ bản thân
                  </button>
                </div>
              )}

              {/* Composer */}
              <form onSubmit={handleSend} className="p-3 border-t border-outline-variant/30 flex gap-2">
                <input
                  data-testid="socratic-input"
                  type="text"
                  value={inputMessage}
                  onChange={(event) => setInputMessage(event.target.value)}
                  placeholder={
                    readOnly
                      ? 'Phiên Socratic đã kết thúc'
                      : dirty
                      ? 'Hãy lưu dàn ý trước khi gửi chat'
                      : 'Trao đổi ý tưởng, luận điểm với Trợ lý (tối đa 4000 ký tự)...'
                  }
                  maxLength={4000}
                  disabled={chatLocked && !pending}
                  className="flex-1 px-3 py-2 text-xs rounded-lg border border-outline-variant/60 bg-surface text-on-surface focus:outline-none focus:border-secondary disabled:opacity-50"
                />
                <button
                  data-testid="socratic-send"
                  type="submit"
                  disabled={chatLocked || (!inputMessage.trim() && !pending)}
                  className="px-4 py-2 bg-primary-container text-on-primary-container font-bold text-xs rounded-lg hover:brightness-95 transition-all shadow-sm flex items-center gap-1 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-base">send</span>
                  <span>{pending && retryable ? 'Gửi lại' : 'Gửi'}</span>
                </button>
              </form>
            </div>

            {/* Right Outline Canvas (5 cols) */}
            <div className="lg:col-span-5 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm flex flex-col h-[640px]">
              <div className="p-4 border-b border-outline-variant/20 flex items-center justify-between">
                <div>
                  <h3 className="font-headline-sm text-sm font-bold text-on-surface font-merriweather">
                    Dàn ý chi tiết của em (Outline Canvas)
                  </h3>
                  <p className="text-[11px] text-on-surface-variant">
                    Revision {outlineRevision} {dirty ? '• có thay đổi chưa lưu' : '• đã đồng bộ'}
                  </p>
                </div>
                <button
                  data-testid="outline-save"
                  type="button"
                  disabled={readOnly || saving || !dirty}
                  onClick={() => void handleSaveOutline()}
                  className="px-2.5 py-1 text-xs border border-outline-variant/50 rounded text-on-surface-variant hover:bg-surface-container transition-all disabled:opacity-40"
                >
                  {saving ? 'Đang lưu...' : 'Lưu dàn ý'}
                </button>
              </div>

              {/* Outline Content List */}
              <div className="flex-1 p-4 overflow-y-auto space-y-4 text-xs" data-testid="outline-canvas">
                {outline.sections.map((section) => (
                  <div
                    key={section.id}
                    className="p-3 bg-surface-container-low/40 rounded-xl border border-outline-variant/30 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-primary font-merriweather">{section.title}</span>
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => setAddingSectionId(section.id)}
                          className="text-[11px] text-secondary font-semibold hover:underline flex items-center gap-0.5"
                        >
                          <span className="material-symbols-outlined text-[13px]">add</span>
                          Thêm ý
                        </button>
                      )}
                    </div>

                    <ul className="space-y-1.5">
                      {section.points.map((point, index) => (
                        <li
                          key={`${section.id}-${index}`}
                          className="p-2 bg-surface-container-lowest rounded-lg border border-outline-variant/30 text-on-surface text-[11px] flex items-start justify-between gap-2 group"
                        >
                          {readOnly ? (
                            <span className="leading-relaxed flex-1">• {point}</span>
                          ) : (
                            <input
                              value={point}
                              onChange={(event) => updatePoint(section.id, index, event.target.value)}
                              className="flex-1 bg-transparent text-[11px] focus:outline-none focus:ring-1 focus:ring-secondary rounded px-1"
                            />
                          )}
                          {!readOnly && (
                            <button
                              type="button"
                              onClick={() => removePoint(section.id, index)}
                              className="opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-error transition-opacity"
                              title="Xóa ý này"
                            >
                              <span className="material-symbols-outlined text-[14px]">delete</span>
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>

                    {addingSectionId === section.id && (
                      <div className="mt-2 pt-2 border-t border-outline-variant/30 flex gap-1.5">
                        <input
                          value={newPointText}
                          onChange={(event) => setNewPointText(event.target.value)}
                          placeholder="Nhập ý tưởng mới..."
                          className="flex-1 px-2 py-1 text-xs rounded border border-outline-variant/60 bg-surface focus:outline-none focus:border-secondary"
                        />
                        <button
                          type="button"
                          onClick={() => addPoint(section.id)}
                          className="px-2.5 py-1 bg-primary-container text-on-primary-container rounded font-bold text-xs shadow-xs"
                        >
                          Lưu
                        </button>
                        <button
                          type="button"
                          onClick={() => setAddingSectionId(null)}
                          className="px-2 py-1 text-xs text-on-surface-variant hover:underline"
                        >
                          Hủy
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Bottom Readiness Card & Transition CTA */}
              <div className="p-4 border-t border-outline-variant/20 bg-surface-container-low/50 rounded-b-xl space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-on-surface">Độ hoàn thiện dàn ý:</span>
                  <span className="font-bold text-tertiary font-mono">
                    {totalPoints >= 3 ? 'Đủ điều kiện viết bài' : `${totalPoints} ý (Đang hoàn thiện)`}
                  </span>
                </div>

                <div className="p-2.5 bg-tertiary-container/30 rounded-lg text-[11px] text-tertiary flex items-start gap-1.5">
                  <span className="material-symbols-outlined text-sm mt-0.5">check_circle</span>
                  <span>Em sửa dàn ý trực tiếp; AI không tự ý ghi đè. Em có thể bắt đầu viết tay khi đã chốt ý!</span>
                </div>

                <Link
                  data-testid="continue-to-write"
                  href={`/assignments/${assignmentId}/submit`}
                  onClick={(event) => {
                    if (dirty) {
                      const ok = window.confirm('Dàn ý có thay đổi chưa lưu vào máy chủ. Vẫn chuyển sang bước viết tay?');
                      if (!ok) event.preventDefault();
                    }
                  }}
                  className="w-full py-2.5 bg-primary-container text-on-primary-container font-bold text-xs rounded-lg hover:brightness-95 transition-all shadow-sm flex items-center justify-center gap-1.5"
                >
                  <span>Chuyển sang viết tay (Nộp ảnh bài viết)</span>
                  <span className="material-symbols-outlined text-sm">arrow_forward</span>
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Reading Modal */}
      {readingOpen && session && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-outline-variant/30 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-lg">menu_book</span>
                <h3 className="font-headline-sm text-base font-bold text-on-surface font-merriweather">
                  Ngữ liệu đọc hiểu đính kèm
                </h3>
              </div>
              <button
                onClick={() => setReadingOpen(false)}
                className="p-1 rounded-lg text-on-surface-variant hover:bg-surface-container"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>
            <div className="p-4 bg-surface-container-low/40 rounded-xl max-h-[60vh] overflow-y-auto text-xs sm:text-sm font-merriweather leading-relaxed whitespace-pre-line text-on-surface">
              {session.snapshot.learningMaterialText}
            </div>
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setReadingOpen(false)}
                className="px-4 py-2 bg-secondary text-white text-xs font-semibold rounded-lg hover:bg-secondary/90 transition-all shadow-sm"
              >
                Đã hiểu &amp; Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rubric Modal */}
      {rubricOpen && session && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-outline-variant/30 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-lg">gavel</span>
                <h3 className="font-headline-sm text-base font-bold text-on-surface font-merriweather">
                  Thang điểm Rubric (Tổng {session.snapshot.maxScore}đ)
                </h3>
              </div>
              <button
                onClick={() => setRubricOpen(false)}
                className="p-1 rounded-lg text-on-surface-variant hover:bg-surface-container"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {session.snapshot.rubric.criteria.map((criterion) => (
                <div
                  key={criterion.criterionId}
                  className="p-3.5 bg-surface-container-low/50 rounded-xl border border-outline-variant/30 space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-primary text-xs sm:text-sm">
                      {criterion.criterionId}. {criterion.name}
                    </span>
                    <span className="font-mono text-xs font-bold bg-surface-container px-2 py-0.5 rounded text-on-surface">
                      {criterion.weight} điểm
                    </span>
                  </div>
                  {criterion.descriptor && (
                    <p className="text-xs text-on-surface-variant leading-relaxed">
                      {criterion.descriptor}
                    </p>
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setRubricOpen(false)}
                className="px-4 py-2 bg-primary-container text-on-primary-container text-xs font-semibold rounded-lg hover:brightness-95 transition-all shadow-sm"
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
