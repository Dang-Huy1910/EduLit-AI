'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useAppStore } from '@/lib/store';
import { apiSend } from '@/lib/api/http';
import { AuthApiError } from '@/lib/auth-types';
import TeacherShell from '@/components/TeacherShell';
import StudentShell from '@/components/StudentShell';
import AssistantMark from '@/components/AssistantMark';
import {
  MESSAGE_MAX_CHARS,
  appendMessage,
  createConversation,
  groupByDay,
  lastQuestion,
  loadConversations,
  newId,
  saveConversations,
  uniqueSources,
  upsertConversation,
  type ChatMessage,
  type ChatSource,
  type Conversation,
} from '@/features/chatbot/conversations';
import { parseRichText, type Inline } from '@/features/chatbot/rich-text';
import { suggestionsFor } from '@/features/chatbot/suggestions';

interface ChatbotResponse {
  answer: string;
  sources: ChatSource[];
}

const COUNTER_FROM = 1500;

function timeLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function shortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  if (date.toDateString() === new Date().toDateString()) return timeLabel(iso);
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

function withoutKey<T>(state: Record<string, T>, key: string): Record<string, T> {
  const next = { ...state };
  delete next[key];
  return next;
}

/** Vietnamese names put the given name last: "Nguyễn Hà My" → "My". */
function givenName(name: string | undefined): string {
  const words = (name || '').trim().split(/\s+/).filter(Boolean);
  return words.length ? words[words.length - 1] : '';
}

function InlineText({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((part, index) =>
        part.kind === 'bold' ? (
          <strong key={index} className="font-semibold text-on-surface">
            {part.text}
          </strong>
        ) : part.kind === 'code' ? (
          <code key={index} className="px-1 py-0.5 rounded bg-surface-container text-[0.9em] font-mono">
            {part.text}
          </code>
        ) : (
          <React.Fragment key={index}>{part.text}</React.Fragment>
        )
      )}
    </>
  );
}

function RichText({ text }: { text: string }) {
  const blocks = useMemo(() => parseRichText(text), [text]);
  return (
    <div className="space-y-2.5">
      {blocks.map((block, index) => {
        if (block.kind === 'heading') {
          return (
            <p key={index} className="font-bold text-on-surface pt-1">
              <InlineText parts={block.inlines} />
            </p>
          );
        }
        if (block.kind === 'bullets') {
          return (
            <ul key={index} className="space-y-1.5 pl-1">
              {block.items.map((item, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-[0.6em] w-1.5 h-1.5 rounded-full bg-secondary/70 shrink-0" />
                  <span className="min-w-0">
                    <InlineText parts={item} />
                  </span>
                </li>
              ))}
            </ul>
          );
        }
        if (block.kind === 'numbers') {
          return (
            <ol key={index} className="space-y-1.5">
              {block.items.map((item, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="mt-0.5 w-5 h-5 rounded-full bg-secondary/10 text-secondary text-[11px] font-bold flex items-center justify-center shrink-0">
                    {block.start + i}
                  </span>
                  <span className="min-w-0">
                    <InlineText parts={item} />
                  </span>
                </li>
              ))}
            </ol>
          );
        }
        return (
          <p key={index} className="whitespace-pre-line">
            <InlineText parts={block.inlines} />
          </p>
        );
      })}
    </div>
  );
}

function Sources({ sources }: { sources?: ChatSource[] }) {
  const items = uniqueSources(sources);
  if (items.length === 0) return null;
  return (
    <div className="pt-3 mt-3 border-t border-outline-variant/25">
      <p className="text-[11px] font-semibold text-on-surface-variant mb-1.5">Nguồn tham khảo</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((source) => {
          const guide = source.source_name !== 'Ngữ liệu';
          const label = source.title ? `${source.material_title} · ${source.title}` : source.material_title;
          return (
            <span
              key={`${source.chunk_id}-${label}`}
              title={label}
              className="inline-flex items-center gap-1 max-w-full px-2 py-1 rounded-lg bg-surface-container-low border border-outline-variant/30 text-[11px] text-on-surface-variant"
            >
              <span className={`material-symbols-outlined text-[14px] ${guide ? 'text-primary' : 'text-secondary'}`}>
                {guide ? 'help_center' : 'menu_book'}
              </span>
              <span className="truncate max-w-[240px]">{label}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function AssistantAvatar() {
  return (
    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-secondary to-primary text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
      <AssistantMark className="w-[18px] h-[18px]" />
    </div>
  );
}

export default function ChatbotPage() {
  const { currentUser, addToast } = useAppStore();
  const isTeacher = currentUser?.role === 'teacher';
  const userId = currentUser?.id || '';
  const suggestions = suggestionsFor(isTeacher);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [draft, setDraft] = useState<Conversation>(() => createConversation());
  const [activeId, setActiveId] = useState(draft.id);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [historyOpen, setHistoryOpen] = useState(true);
  const [mobileHistory, setMobileHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [copiedId, setCopiedId] = useState('');

  const draftRef = useRef(draft);
  draftRef.current = draft;
  const userRef = useRef(userId);
  const loadedFor = useRef('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Each account has its own history; entering the page always opens a new chat.
  useEffect(() => {
    userRef.current = userId;
    const fresh = createConversation();
    setDraft(fresh);
    setActiveId(fresh.id);
    setPending({});
    setErrors({});
    setInput('');
    setConversations(userId ? loadConversations(userId) : []);
    loadedFor.current = userId;
  }, [userId]);

  useEffect(() => {
    if (userId && loadedFor.current === userId) saveConversations(userId, conversations);
  }, [conversations, userId]);

  const active = conversations.find((item) => item.id === activeId) || draft;
  const isPending = Boolean(pending[active.id]);
  const activeError = errors[active.id] || '';

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
  }, [active.messages.length, isPending, activeError, active.id]);

  const resizeInput = useCallback(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, 168)}px`;
  }, []);

  useEffect(() => {
    resizeInput();
  }, [input, resizeInput]);

  const focusInput = () => window.setTimeout(() => textareaRef.current?.focus(), 30);

  const updateConversation = (id: string, change: (conversation: Conversation) => Conversation) => {
    setConversations((list) => {
      const current = list.find((item) => item.id === id) || (draftRef.current.id === id ? draftRef.current : null);
      return current ? upsertConversation(list, change(current)) : list;
    });
  };

  const send = async (raw?: string, options: { retry?: boolean } = {}) => {
    const text = (raw ?? input).trim();
    const conversationId = active.id;
    if (!text || !userId || pending[conversationId]) return;
    if (text.length > MESSAGE_MAX_CHARS) {
      addToast(`Câu hỏi tối đa ${MESSAGE_MAX_CHARS} ký tự.`, 'warning');
      return;
    }
    if (!options.retry) {
      const question: ChatMessage = { id: newId('m'), role: 'user', text, createdAt: new Date().toISOString() };
      updateConversation(conversationId, (conversation) => appendMessage(conversation, question));
      if (raw === undefined) setInput('');
    }
    const owner = userRef.current;
    setPending((state) => ({ ...state, [conversationId]: true }));
    setErrors((state) => withoutKey(state, conversationId));
    try {
      const data = await apiSend<ChatbotResponse>('/chatbot', 'POST', { message: text });
      if (userRef.current !== owner) return;
      const answer: ChatMessage = {
        id: newId('m'),
        role: 'assistant',
        text: (data.answer || '').trim() || 'Mình chưa có câu trả lời cho câu hỏi này.',
        createdAt: new Date().toISOString(),
        sources: data.sources || [],
      };
      updateConversation(conversationId, (conversation) => appendMessage(conversation, answer));
    } catch (err) {
      if (userRef.current !== owner) return;
      const message =
        err instanceof AuthApiError ? err.message : 'Không gửi được câu hỏi. Kiểm tra kết nối rồi thử lại.';
      setErrors((state) => ({ ...state, [conversationId]: message }));
    } finally {
      if (userRef.current === owner) setPending((state) => withoutKey(state, conversationId));
    }
  };

  const openFresh = () => {
    const fresh = createConversation();
    setDraft(fresh);
    setActiveId(fresh.id);
  };

  const startNewChat = () => {
    setMobileHistory(false);
    if (active.messages.length > 0) {
      openFresh();
      setInput('');
    }
    focusInput();
  };

  const openConversation = (id: string) => {
    setActiveId(id);
    setMobileHistory(false);
    focusInput();
  };

  const deleteConversation = (conversation: Conversation) => {
    if (!window.confirm(`Xóa cuộc trò chuyện “${conversation.title}”?`)) return;
    setConversations((list) => list.filter((item) => item.id !== conversation.id));
    if (conversation.id === activeId) openFresh();
  };

  const clearAll = () => {
    if (!conversations.length || !window.confirm('Xóa toàn bộ lịch sử trò chuyện trên trình duyệt này?')) return;
    setConversations([]);
    openFresh();
    addToast('Đã xóa lịch sử trò chuyện.', 'info');
  };

  const copyAnswer = async (message: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(message.text);
      setCopiedId(message.id);
      window.setTimeout(() => setCopiedId((current) => (current === message.id ? '' : current)), 1600);
    } catch {
      addToast('Không sao chép được. Hãy bôi đen nội dung rồi sao chép thủ công.', 'warning');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  };

  const filtered = useMemo(() => {
    const needle = historySearch.trim().toLocaleLowerCase('vi');
    if (!needle) return conversations;
    return conversations.filter(
      (item) =>
        item.title.toLocaleLowerCase('vi').includes(needle) ||
        item.messages.some((message) => message.text.toLocaleLowerCase('vi').includes(needle))
    );
  }, [conversations, historySearch]);
  const groups = useMemo(() => groupByDay(filtered), [filtered]);

  const you = isTeacher ? 'thầy cô' : 'em';
  const assistantSubtitle = isTeacher
    ? 'Trả lời từ kho ngữ liệu của thầy cô và hướng dẫn sử dụng'
    : 'Trả lời từ ngữ liệu bài tập được giao và hướng dẫn sử dụng';
  const greetingName = isTeacher ? currentUser?.name || 'thầy cô' : givenName(currentUser?.name) || 'em';
  const overLimit = input.length > MESSAGE_MAX_CHARS;

  const historyPanel = (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-4 space-y-3 border-b border-outline-variant/20 shrink-0">
        <div className="flex items-center justify-between pr-8 lg:pr-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-lg text-secondary">history</span>
            <h3 className="font-bold text-sm text-on-surface">Lịch sử trò chuyện</h3>
          </div>
          <span className="text-[11px] font-semibold text-outline">{conversations.length}</span>
        </div>
        <button
          type="button"
          onClick={startNewChat}
          className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-secondary to-primary text-white font-semibold text-sm hover:brightness-105 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-sm"
        >
          <span className="material-symbols-outlined text-lg">edit_square</span>
          Cuộc trò chuyện mới
        </button>
        {conversations.length > 0 && (
          <div className="relative">
            <span className="material-symbols-outlined text-base text-outline absolute left-2.5 top-1/2 -translate-y-1/2">
              search
            </span>
            <input
              type="search"
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              aria-label="Tìm trong lịch sử"
              placeholder="Tìm trong lịch sử..."
              className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-outline-variant/50 bg-surface text-on-surface placeholder:text-outline focus:outline-none focus:border-secondary"
            />
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-4 scrollbar-thin">
        {conversations.length === 0 ? (
          <div className="px-3 py-10 text-center space-y-2">
            <span className="material-symbols-outlined text-3xl text-outline-variant">forum</span>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Chưa có cuộc trò chuyện nào. Câu hỏi của {you} sẽ xuất hiện ở đây.
            </p>
          </div>
        ) : groups.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-on-surface-variant">Không tìm thấy cuộc trò chuyện phù hợp.</p>
        ) : (
          groups.map((group) => (
            <div key={group.label} className="space-y-1">
              <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-outline">{group.label}</p>
              {group.items.map((conversation) => {
                const selected = conversation.id === activeId;
                return (
                  <div
                    key={conversation.id}
                    className={`group relative rounded-xl border transition-all ${
                      selected
                        ? 'bg-secondary-fixed/35 border-secondary/40'
                        : 'border-transparent hover:bg-surface-container-low hover:border-outline-variant/30'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => openConversation(conversation.id)}
                      aria-current={selected ? 'true' : undefined}
                      className="w-full text-left px-3 py-2.5 pr-9"
                    >
                      <span className="flex items-center gap-1.5">
                        {pending[conversation.id] && (
                          <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse shrink-0" />
                        )}
                        <span
                          className={`text-xs truncate ${selected ? 'font-bold text-secondary' : 'font-medium text-on-surface'}`}
                        >
                          {conversation.title}
                        </span>
                      </span>
                      <span className="block text-[10px] text-outline mt-0.5">
                        {shortDate(conversation.updatedAt)} • {conversation.messages.length} tin nhắn
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteConversation(conversation)}
                      aria-label={`Xóa cuộc trò chuyện ${conversation.title}`}
                      title="Xóa cuộc trò chuyện"
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-outline hover:text-error hover:bg-error/10 lg:opacity-0 lg:group-hover:opacity-100 focus:opacity-100 transition-all"
                    >
                      <span className="material-symbols-outlined text-base">delete</span>
                    </button>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      <div className="p-4 border-t border-outline-variant/20 shrink-0 space-y-3">
        <div className="flex items-start gap-2 text-[11px] text-on-surface-variant leading-relaxed">
          <span className="material-symbols-outlined text-sm text-outline shrink-0">lock</span>
          <span>Lịch sử chỉ lưu trên trình duyệt này, theo tài khoản đang đăng nhập.</span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/assignments"
            className="flex-1 py-2 rounded-xl border border-outline-variant/50 text-center text-xs font-semibold text-on-surface hover:bg-surface-container-low transition-all"
          >
            Bài tập
          </Link>
          <Link
            href="/materials"
            className="flex-1 py-2 rounded-xl border border-outline-variant/50 text-center text-xs font-semibold text-on-surface hover:bg-surface-container-low transition-all"
          >
            {isTeacher ? 'Kho học liệu' : 'Ngữ liệu'}
          </Link>
        </div>
        {conversations.length > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="w-full text-[11px] font-semibold text-outline hover:text-error transition-colors"
          >
            Xóa toàn bộ lịch sử
          </button>
        )}
      </div>
    </div>
  );

  const body = (
    <div className="max-w-7xl mx-auto flex gap-5 h-[calc(100dvh-7rem)] min-h-[560px]">
      {/* Chat window */}
      <section className="flex-1 min-w-0 glass-panel rounded-3xl shadow-sm flex flex-col overflow-hidden">
        <header className="px-4 sm:px-6 py-3.5 border-b border-outline-variant/20 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative w-10 h-10 rounded-2xl bg-gradient-to-br from-secondary to-primary text-white flex items-center justify-center shadow-sm shrink-0">
              <AssistantMark className="w-[22px] h-[22px]" />
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-sm sm:text-base text-on-surface truncate">Trợ lý EduLit AI</h1>
              <p className="text-[11px] sm:text-xs text-on-surface-variant truncate">{assistantSubtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={startNewChat}
              title="Cuộc trò chuyện mới"
              className="h-9 px-3 rounded-xl border border-outline-variant/50 text-xs font-semibold text-on-surface hover:bg-surface-container-low active:scale-95 transition-all flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-base">edit_square</span>
              <span className="hidden sm:inline">Trò chuyện mới</span>
            </button>
            <button
              type="button"
              onClick={() => setMobileHistory(true)}
              aria-label="Mở lịch sử trò chuyện"
              className="lg:hidden h-9 w-9 rounded-xl border border-outline-variant/50 text-on-surface-variant hover:bg-surface-container-low flex items-center justify-center"
            >
              <span className="material-symbols-outlined text-base">history</span>
            </button>
            <button
              type="button"
              onClick={() => setHistoryOpen((open) => !open)}
              title={historyOpen ? 'Ẩn lịch sử' : 'Hiện lịch sử'}
              aria-pressed={historyOpen}
              className="hidden lg:flex h-9 w-9 rounded-xl border border-outline-variant/50 text-on-surface-variant hover:bg-surface-container-low items-center justify-center"
            >
              <span className="material-symbols-outlined text-base">
                {historyOpen ? 'right_panel_close' : 'right_panel_open'}
              </span>
            </button>
          </div>
        </header>

        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto scrollbar-thin bg-gradient-to-b from-surface/40 to-surface-container-low/30"
          aria-live="polite"
        >
          {active.messages.length === 0 && !isPending ? (
            <div className="min-h-full flex flex-col items-center justify-center px-4 sm:px-8 py-10 text-center">
              <div className="relative mb-5">
                <div className="absolute inset-0 rounded-[28px] bg-gradient-to-br from-secondary to-primary blur-xl opacity-30" />
                <div className="relative w-16 h-16 rounded-[22px] bg-gradient-to-br from-secondary to-primary text-white flex items-center justify-center shadow-lg">
                  <AssistantMark className="w-8 h-8" />
                </div>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold font-merriweather text-on-surface">Chào {greetingName}!</h2>
              <p className="mt-2 text-sm text-on-surface-variant max-w-lg leading-relaxed">
                {isTeacher
                  ? 'Thầy cô có thể hỏi về ngữ liệu trong kho và cách dùng EduLit: import tài liệu, giao bài, chấm và công bố kết quả.'
                  : 'Em có thể hỏi về ngữ liệu trong bài tập được giao và cách dùng EduLit. Trợ lý gợi mở để em tự viết, không viết bài hộ.'}
              </p>

              <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl text-left">
                {suggestions.map((card) => (
                  <button
                    key={card.title}
                    type="button"
                    onClick={() => void send(card.prompt)}
                    disabled={!userId}
                    className="group p-4 rounded-2xl bg-surface-container-lowest border border-outline-variant/40 hover:border-secondary/50 hover:shadow-md active:scale-[0.99] transition-all flex items-start gap-3 disabled:opacity-60"
                  >
                    <span className="w-9 h-9 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center shrink-0 group-hover:bg-secondary group-hover:text-white transition-colors">
                      <span className="material-symbols-outlined text-lg">{card.icon}</span>
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-on-surface">{card.title}</span>
                      <span className="block text-xs text-on-surface-variant mt-0.5 leading-relaxed">{card.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">
              {active.messages.map((message) =>
                message.role === 'user' ? (
                  <div key={message.id} className="flex justify-end">
                    <div className="max-w-[85%] sm:max-w-[75%] space-y-1">
                      <div className="px-4 py-2.5 rounded-2xl rounded-br-md bg-secondary text-white text-sm leading-relaxed whitespace-pre-wrap break-words shadow-sm">
                        {message.text}
                      </div>
                      <p className="text-[10px] text-outline text-right pr-1">{timeLabel(message.createdAt)}</p>
                    </div>
                  </div>
                ) : (
                  <div key={message.id} className="flex gap-3">
                    <AssistantAvatar />
                    <div className="min-w-0 flex-1">
                      <div className="px-4 py-3 rounded-2xl rounded-tl-md bg-surface-container-lowest border border-outline-variant/35 shadow-xs text-sm text-on-surface leading-relaxed break-words">
                        <RichText text={message.text} />
                        <Sources sources={message.sources} />
                      </div>
                      <div className="flex items-center gap-3 mt-1 pl-1 text-[10px] text-outline">
                        <span>{timeLabel(message.createdAt)}</span>
                        <button
                          type="button"
                          onClick={() => void copyAnswer(message)}
                          className="inline-flex items-center gap-1 hover:text-secondary transition-colors"
                        >
                          <span className="material-symbols-outlined text-[14px]">
                            {copiedId === message.id ? 'check' : 'content_copy'}
                          </span>
                          {copiedId === message.id ? 'Đã sao chép' : 'Sao chép'}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              )}

              {isPending && (
                <div className="flex gap-3" role="status">
                  <AssistantAvatar />
                  <div className="px-4 py-3 rounded-2xl rounded-tl-md bg-surface-container-lowest border border-outline-variant/35 shadow-xs flex items-center gap-2.5">
                    <span className="flex items-center gap-1" aria-hidden="true">
                      <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-bounce" />
                      <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-bounce [animation-delay:0.15s]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-bounce [animation-delay:0.3s]" />
                    </span>
                    <span className="text-xs text-on-surface-variant">Đang tìm trong ngữ liệu và hướng dẫn…</span>
                  </div>
                </div>
              )}

              {activeError && !isPending && (
                <div
                  role="alert"
                  className="sm:ml-11 p-3 rounded-xl border border-error/30 bg-error-container/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div className="flex items-start gap-2 text-xs text-on-error-container">
                    <span className="material-symbols-outlined text-base text-error shrink-0">error</span>
                    <span className="leading-relaxed">{activeError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void send(lastQuestion(active), { retry: true })}
                    className="self-end sm:self-auto px-3 py-1.5 rounded-lg border border-error/40 text-error text-xs font-semibold hover:bg-error/5 shrink-0"
                  >
                    Thử lại
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="px-3 sm:px-6 pt-2 pb-3 sm:pb-4 shrink-0 border-t border-outline-variant/15 bg-surface/40">
          <div className="max-w-3xl mx-auto">
            <div
              className={`flex items-end gap-2 p-2 pl-4 rounded-2xl bg-surface-container-lowest border shadow-sm transition-all focus-within:ring-2 ${
                overLimit
                  ? 'border-error/60 focus-within:ring-error/20'
                  : 'border-outline-variant/50 focus-within:border-secondary/60 focus-within:ring-secondary/15'
              }`}
            >
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                aria-label="Nhập câu hỏi"
                placeholder={
                  isTeacher ? 'Hỏi về ngữ liệu hoặc cách dùng EduLit...' : 'Hỏi về bài tập, ngữ liệu hoặc cách dùng EduLit...'
                }
                className="flex-1 min-w-0 py-2 text-sm bg-transparent text-on-surface placeholder:text-outline focus:outline-none resize-none leading-relaxed max-h-[168px]"
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={!input.trim() || isPending || overLimit || !userId}
                aria-label="Gửi câu hỏi"
                className="w-10 h-10 rounded-xl bg-gradient-to-br from-secondary to-primary text-white flex items-center justify-center shadow-sm hover:brightness-110 active:scale-95 disabled:opacity-35 disabled:active:scale-100 transition-all shrink-0"
              >
                <span className="material-symbols-outlined text-xl">{isPending ? 'hourglass_top' : 'arrow_upward'}</span>
              </button>
            </div>
            <div className="flex items-center justify-between gap-3 mt-2 px-1 text-[10px] sm:text-[11px] text-outline">
              <span className="line-clamp-2 sm:truncate">
                Trợ lý trả lời từng câu hỏi dựa trên ngữ liệu được phép xem và hướng dẫn sử dụng. Hãy kiểm tra lại thông tin quan trọng.
              </span>
              {input.length >= COUNTER_FROM ? (
                <span className={`shrink-0 font-mono ${overLimit ? 'text-error font-semibold' : ''}`}>
                  {input.length}/{MESSAGE_MAX_CHARS}
                </span>
              ) : (
                <span className="shrink-0 hidden sm:inline">Enter gửi · Shift+Enter xuống dòng</span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* History rail (desktop) */}
      {historyOpen && (
        <aside className="hidden lg:flex w-80 shrink-0 glass-panel rounded-3xl shadow-sm overflow-hidden flex-col">
          {historyPanel}
        </aside>
      )}

      {/* History drawer (mobile) */}
      {mobileHistory && (
        <div className="lg:hidden fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Lịch sử trò chuyện">
          <button
            type="button"
            aria-label="Đóng lịch sử"
            onClick={() => setMobileHistory(false)}
            className="absolute inset-0 bg-black/30"
          />
          <div className="relative w-[86%] max-w-sm h-full bg-surface-container-lowest shadow-2xl flex flex-col">
            <button
              type="button"
              onClick={() => setMobileHistory(false)}
              aria-label="Đóng"
              className="absolute right-3 top-3 z-10 p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container"
            >
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
            {historyPanel}
          </div>
        </div>
      )}
    </div>
  );

  if (isTeacher) {
    return (
      <TeacherShell
        breadcrumb={
          <div className="flex items-center gap-2 text-sm text-on-surface-variant">
            <Link href="/assignments" className="hover:text-primary">
              Không gian giáo viên
            </Link>
            <span className="text-outline-variant">/</span>
            <span className="text-on-surface font-semibold">Trợ lý EduLit AI</span>
          </div>
        }
      >
        {body}
      </TeacherShell>
    );
  }

  return (
    <StudentShell headerTitle="Trợ lý học tập AI" headerSubtitle="Trợ lý EduLit AI">
      {body}
    </StudentShell>
  );
}
