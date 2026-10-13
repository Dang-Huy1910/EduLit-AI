'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import StudentShell from '@/components/StudentShell';
import AssignmentWorkflowStepper from '@/components/AssignmentWorkflowStepper';
import { useApiAuthStore } from '@/lib/api-auth-store';
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
      addToast('Đã lưu dàn ý trên máy chủ.', 'success');
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
        addToast('Dàn ý đã được lưu từ nơi khác. Hãy đối chiếu bản đang sửa.', 'warning');
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

  return (
    <StudentShell headerTitle="Dàn ý Socratic" headerSubtitle={session?.snapshot.title ?? 'Trợ lý gợi mở'}>
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-outline-variant/20">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs bg-primary-fixed text-primary font-bold px-2.5 py-0.5 rounded-full">Socratic Writing Scaffold</span>
              <span className="text-xs text-on-surface-variant font-medium">{session?.snapshot.code}</span>
            </div>
            <h1 className="font-headline-md text-xl font-bold text-on-surface font-merriweather">
              {session?.snapshot.title ?? 'Trợ lý Socratic'}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setReadingOpen(true)} className="px-3 py-1.5 rounded-lg border border-outline-variant/60 bg-surface-container-lowest text-xs font-semibold">
              Xem ngữ liệu
            </button>
            <button onClick={() => setRubricOpen(true)} className="px-3 py-1.5 rounded-lg border border-outline-variant/60 bg-surface-container-lowest text-xs font-semibold">
              Tiêu chí Rubric
            </button>
          </div>
        </div>

        <AssignmentWorkflowStepper currentStep="socratic" assignmentId={assignmentId} />

        {readOnly && session && (
          <div className="p-3 bg-surface-container-low rounded-lg text-xs text-on-surface-variant">
            Phiên chỉ đọc: {session.hasSubmission ? 'bài đã nộp' : session.assignmentStatus === 'CLOSED' ? 'đề đã đóng' : 'phiên đã kết thúc'}.
          </div>
        )}

        {error && (
          <div className="p-3 bg-error-container/60 border border-error/30 rounded-lg text-xs text-error flex items-center justify-between" data-testid="socratic-error">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => (retryable && pending ? void handleSend() : void loadSession())}
              className="px-2 py-1 bg-surface-container-lowest rounded font-semibold"
            >
              {retryable && pending ? 'Gửi lại' : 'Thử lại'}
            </button>
          </div>
        )}

        {conflict && (
          <div className="p-3 bg-[#FEF9C3] border border-[#FDE047] rounded-lg text-xs text-[#CA8A04]" data-testid="outline-conflict">
            Dàn ý trên máy chủ đã đổi. Bản em đang sửa được giữ lại để đối chiếu, chưa bị ghi đè.
          </div>
        )}

        {session && !readOnly && (
          <div className="p-3 bg-surface-container-low/50 rounded-xl border border-secondary/20 flex items-center gap-2 text-xs text-on-surface-variant">
            <span className="material-symbols-outlined text-secondary text-base">verified</span>
            <span>
              <strong>Dàn ý gợi ý lúc mở đề.</strong> Em giữ, sửa hoặc xóa ý bên phải. Chat với Trợ lý khi muốn đổi hướng.
              AI không viết đoạn văn mẫu.
            </span>
          </div>
        )}

        {loading || !session ? (
          <div className="flex items-center gap-2 text-sm text-on-surface-variant py-12">
            <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Đang soạn dàn ý gợi ý theo đề...
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-7 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm flex flex-col h-[640px]">
              <div className="flex-1 p-4 overflow-y-auto space-y-4" data-testid="socratic-messages">
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex flex-col ${msg.role === 'USER' ? 'items-end' : 'items-start'}`}>
                    <div className="text-[11px] text-on-surface-variant mb-1">
                      {msg.role === 'ASSISTANT' ? 'Trợ lý Sư phạm' : user?.displayName}
                      {' • '}
                      {new Date(msg.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div className={`p-3.5 rounded-xl max-w-[85%] text-xs leading-relaxed ${msg.role === 'USER' ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container-low border border-outline-variant/30'}`}>
                      <p>{msg.content}</p>
                    </div>
                  </div>
                ))}
                {pending && (
                  <div className="flex flex-col items-end" data-testid="pending-message">
                    <div className="p-3.5 rounded-xl max-w-[85%] text-xs bg-primary-container/70 text-on-primary-container">
                      <p>{pending.message}</p>
                      <p className="text-[10px] mt-1 italic">Đang gửi... (chưa ghi nhận sequence)</p>
                    </div>
                  </div>
                )}
                {sending && (
                  <div className="flex items-center gap-2 text-xs text-on-surface-variant italic">
                    <span className="w-3.5 h-3.5 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
                    Trợ lý Socratic đang suy nghĩ câu hỏi gợi mở...
                  </div>
                )}
              </div>
              <form onSubmit={handleSend} className="p-3 border-t border-outline-variant/30 flex gap-2">
                <input
                  data-testid="socratic-input"
                  type="text"
                  value={inputMessage}
                  onChange={(event) => setInputMessage(event.target.value)}
                  placeholder={dirty ? 'Hãy lưu dàn ý trước khi gửi chat' : 'Trao đổi ý tưởng với Trợ lý...'}
                  maxLength={4000}
                  disabled={chatLocked && !pending}
                  className="flex-1 px-3 py-2 text-xs rounded-lg border border-outline-variant/60 bg-surface"
                />
                <button
                  data-testid="socratic-send"
                  type="submit"
                  disabled={chatLocked || (!inputMessage.trim() && !pending)}
                  className="px-4 py-2 bg-primary-container text-on-primary-container font-bold text-xs rounded-lg disabled:opacity-50"
                >
                  {pending && retryable ? 'Gửi lại' : 'Gửi'}
                </button>
              </form>
            </div>

            <div className="lg:col-span-5 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm flex flex-col h-[640px]">
              <div className="p-4 border-b border-outline-variant/20 flex items-center justify-between">
                <div>
                  <h3 className="font-headline-sm text-sm font-bold font-merriweather">Dàn ý của em</h3>
                  <p className="text-[11px] text-on-surface-variant">Revision {outlineRevision}{dirty ? ' • chưa lưu' : ''}</p>
                </div>
                <button
                  data-testid="outline-save"
                  type="button"
                  disabled={readOnly || saving || !dirty}
                  onClick={() => void handleSaveOutline()}
                  className="px-2.5 py-1 text-xs border border-outline-variant/50 rounded disabled:opacity-50"
                >
                  {saving ? 'Đang lưu...' : 'Lưu dàn ý'}
                </button>
              </div>
              <div className="flex-1 p-4 overflow-y-auto space-y-4 text-xs" data-testid="outline-canvas">
                {outline.sections.map((section) => (
                  <div key={section.id} className="p-3 bg-surface-container-low/40 rounded-xl border border-outline-variant/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-primary font-merriweather">{section.title}</span>
                      {!readOnly && (
                        <button type="button" onClick={() => setAddingSectionId(section.id)} className="text-[11px] text-secondary font-semibold">
                          Thêm ý
                        </button>
                      )}
                    </div>
                    <ul className="space-y-1.5">
                      {section.points.map((point, index) => (
                        <li key={`${section.id}-${index}`} className="p-2 bg-surface-container-lowest rounded-lg border border-outline-variant/30 flex gap-2">
                          {readOnly ? (
                            <span className="flex-1">• {point}</span>
                          ) : (
                            <input
                              value={point}
                              onChange={(event) => updatePoint(section.id, index, event.target.value)}
                              className="flex-1 bg-transparent text-[11px]"
                            />
                          )}
                          {!readOnly && (
                            <button type="button" onClick={() => removePoint(section.id, index)} className="text-on-surface-variant">
                              <span className="material-symbols-outlined text-[14px]">delete</span>
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                    {addingSectionId === section.id && (
                      <div className="flex gap-1.5">
                        <input value={newPointText} onChange={(event) => setNewPointText(event.target.value)} placeholder="Nhập ý tưởng mới..." className="flex-1 px-2 py-1 text-xs rounded border" />
                        <button type="button" onClick={() => addPoint(section.id)} className="px-2 py-1 bg-primary-container rounded font-bold text-xs">
                          Thêm
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="p-4 border-t text-[11px] text-on-surface-variant">
                Nộp bài viết tay chưa có API trong feature này. Em sửa dàn ý trực tiếp; AI không ghi đè bản em đã lưu.
              </div>
            </div>
          </div>
        )}
      </div>

      {readingOpen && session && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-xl max-w-lg w-full p-6 space-y-3">
            <div className="flex justify-between">
              <h3 className="font-bold text-sm">Ngữ liệu của phiên</h3>
              <button onClick={() => setReadingOpen(false)}>Đóng</button>
            </div>
            <div className="p-3 bg-surface-container-low/50 rounded-lg text-xs font-merriweather whitespace-pre-line">
              {session.snapshot.learningMaterialText}
            </div>
          </div>
        </div>
      )}
      {rubricOpen && session && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-xl max-w-lg w-full p-6 space-y-3">
            <div className="flex justify-between">
              <h3 className="font-bold text-sm">Rubric snapshot (tối đa {session.snapshot.maxScore})</h3>
              <button onClick={() => setRubricOpen(false)}>Đóng</button>
            </div>
            <div className="space-y-2 text-xs">
              {session.snapshot.rubric.criteria.map((criterion) => (
                <div key={criterion.criterionId} className="p-2 bg-surface-container-low rounded">
                  <span className="font-bold text-primary block">{criterion.name} ({criterion.weight})</span>
                  {criterion.descriptor && <span className="text-on-surface-variant text-[11px]">{criterion.descriptor}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </StudentShell>
  );
}
