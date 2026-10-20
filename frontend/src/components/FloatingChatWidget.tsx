'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { apiSend } from '@/lib/api/http';
import { suggestionsFor } from '@/features/chatbot/suggestions';

interface QuickMessage {
  id: string;
  sender: 'ai' | 'user';
  text: string;
  timestamp: string;
  sources?: {
    chunk_id: string;
    title: string;
    material_title: string;
    source_name: string;
  }[];
}

interface ChatbotResponse {
  answer: string;
  sources: {
    chunk_id: string;
    title: string;
    material_title: string;
    source_name: string;
  }[];
}

function greetingFor(isTeacher: boolean, name?: string): string {
  const who = name ? ` ${name}` : '';
  return isTeacher
    ? `Chào${who}! Thầy cô có thể hỏi về ngữ liệu trong kho và cách dùng EduLit.`
    : `Chào${who}! Em có thể hỏi về ngữ liệu bài tập được giao và cách dùng EduLit.`;
}

export default function FloatingChatWidget() {
  const pathname = usePathname();
  const { currentUser, addToast } = useAppStore();
  const isTeacher = currentUser?.role === 'teacher';

  // Do not render floating widget on full chatbot page
  if (pathname === '/chatbot') {
    return null;
  }

  const [isOpen, setIsOpen] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Draggable FAB state
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ clientX: number; clientY: number; startX: number; startY: number }>({
    clientX: 0,
    clientY: 0,
    startX: 0,
    startY: 0,
  });
  const movedRef = useRef(false);
  const justDraggedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();

    isDraggingRef.current = true;
    movedRef.current = false;
    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      startX: rect.left,
      startY: rect.top,
    };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;

    const dx = e.clientX - dragStartRef.current.clientX;
    const dy = e.clientY - dragStartRef.current.clientY;

    if (!movedRef.current && Math.hypot(dx, dy) > 4) {
      movedRef.current = true;
    }

    if (movedRef.current) {
      const el = containerRef.current;
      const width = el ? el.offsetWidth : 60;
      const height = el ? el.offsetHeight : 60;

      const rawX = dragStartRef.current.startX + dx;
      const rawY = dragStartRef.current.startY + dy;

      const clampX = Math.min(Math.max(12, rawX), window.innerWidth - width - 12);
      const clampY = Math.min(Math.max(12, rawY), window.innerHeight - height - 12);

      setPosition({ x: clampX, y: clampY });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}

    if (movedRef.current) {
      justDraggedRef.current = true;
      setTimeout(() => {
        justDraggedRef.current = false;
      }, 100);
    }
  };

  const handleButtonClick = (e: React.MouseEvent) => {
    if (justDraggedRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    setIsOpen((prev) => !prev);
  };

  // Re-clamp position on window resize
  useEffect(() => {
    const handleResize = () => {
      setPosition((prev) => {
        if (!prev) return null;
        const width = 60;
        const height = 60;
        const clampX = Math.min(Math.max(12, prev.x), window.innerWidth - width - 12);
        const clampY = Math.min(Math.max(12, prev.y), window.innerHeight - height - 12);
        return { x: clampX, y: clampY };
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const getPanelStyle = (): React.CSSProperties => {
    if (!position || typeof window === 'undefined') {
      return {};
    }
    const panelWidth = Math.min(390, window.innerWidth - 32);
    const panelHeight = Math.min(520, window.innerHeight - 32);

    let top: number;
    if (position.y > window.innerHeight / 2) {
      top = Math.max(16, position.y - panelHeight - 12);
    } else {
      top = Math.min(window.innerHeight - panelHeight - 16, position.y + 64 + 12);
    }

    let left: number;
    if (position.x > window.innerWidth / 2) {
      left = Math.max(16, position.x + 56 - panelWidth);
    } else {
      left = Math.min(window.innerWidth - panelWidth - 16, position.x);
    }

    return {
      top: `${top}px`,
      left: `${left}px`,
      right: 'auto',
      bottom: 'auto',
    };
  };

  const initialAIMessage: QuickMessage = {
    id: 'msg-init',
    sender: 'ai',
    text: greetingFor(isTeacher, currentUser?.name),
    timestamp: 'Vừa xong',
  };

  const [messages, setMessages] = useState<QuickMessage[]>([initialAIMessage]);

  // Sync initial message when role changes
  useEffect(() => {
    setMessages([
      {
        id: `msg-${Date.now()}`,
        sender: 'ai',
        text: greetingFor(isTeacher, currentUser?.name),
        timestamp: 'Vừa xong',
      },
    ]);
  }, [currentUser?.role, currentUser?.name, isTeacher]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isTyping, isOpen]);

  // Auto focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  const quickPrompts = suggestionsFor(isTeacher).map((item) => ({ label: item.title, text: item.prompt }));

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text) return;

    const userMsg: QuickMessage = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage('');
    setIsTyping(true);

    try {
      const data = await apiSend<ChatbotResponse>('/chatbot', 'POST', { message: text });

      const aiMsg: QuickMessage = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: data.answer,
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        sources: data.sources,
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Có lỗi xảy ra';
      addToast(errorMessage, 'error');

      // Add error message to chat
      const aiMsg: QuickMessage = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: 'Xin lỗi, mình gặp chút trục trặc khi xử lý câu hỏi. Bạn có thể thử lại sau không?',
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* 1. Messenger-style Popup Chat Window */}
      {isOpen && (
        <div
          style={getPanelStyle()}
          className={`fixed w-[92vw] sm:w-[390px] h-[520px] max-h-[80vh] z-50 glass-panel rounded-3xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.35)] border border-white/60 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 ${
            !position ? 'bottom-24 right-4 sm:right-6' : ''
          }`}
        >
          {/* Header */}
          <div
            className={`p-3.5 px-4 text-white flex items-center justify-between shrink-0 shadow-xs ${
              isTeacher
                ? 'bg-gradient-to-r from-[#4A154B] via-[#6B21A8] to-primary'
                : 'bg-gradient-to-r from-secondary to-primary'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center text-white ring-1 ring-white/20">
                <span className="material-symbols-outlined text-lg">smart_toy</span>
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="font-bold text-xs sm:text-sm leading-none">
                    Trợ lý EduLit AI
                  </h3>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                </div>
                <p className="text-[10px] text-white/80 mt-0.5">
                  {currentUser?.name ? `Đang hỗ trợ ${currentUser.name}` : 'Hỏi đáp theo ngữ liệu và hướng dẫn'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {/* Fullscreen Chatbot Link */}
              <Link
                href="/chatbot"
                onClick={() => setIsOpen(false)}
                title="Mở toàn màn hình Chatbot"
                className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-all flex items-center justify-center"
              >
                <span className="material-symbols-outlined text-base">open_in_full</span>
              </Link>

              {/* Close Button */}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="Thu nhỏ khung chat"
                className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-all flex items-center justify-center"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>
          </div>

          {/* Messages Body */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-surface/50 scrollbar-thin text-xs">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2 ${
                  msg.sender === 'user' ? 'justify-end' : 'justify-start'
                } animate-in fade-in duration-150`}
              >
                {msg.sender === 'ai' && (
                  <div className="w-6 h-6 rounded-lg bg-secondary text-white flex items-center justify-center shrink-0 mt-0.5 text-[11px] shadow-2xs">
                    <span className="material-symbols-outlined text-xs">smart_toy</span>
                  </div>
                )}
                <div
                  className={`max-w-[82%] rounded-2xl p-2.5 px-3 leading-relaxed whitespace-pre-line text-xs ${
                    msg.sender === 'user'
                      ? 'bg-secondary text-white rounded-tr-xs shadow-2xs'
                      : 'bg-surface-container-lowest text-on-surface border border-outline-variant/30 rounded-tl-xs shadow-2xs'
                  }`}
                >
                  {msg.text}

                  {/* Sources for AI messages */}
                  {msg.sender === 'ai' && msg.sources && msg.sources.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-outline-variant/20">
                      <p className="text-[9px] font-semibold text-on-surface-variant">Nguồn:</p>
                      <div className="space-y-0.5">
                        {msg.sources.slice(0, 2).map((source, idx) => (
                          <div key={idx} className="text-[9px] text-secondary truncate">
                            • {source.material_title}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex gap-2 items-center text-xs text-on-surface-variant">
                <div className="w-6 h-6 rounded-lg bg-secondary text-white flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-xs animate-spin">sync</span>
                </div>
                <div className="p-2 px-3 bg-surface-container-lowest rounded-2xl border border-outline-variant/30 flex items-center gap-1 shadow-2xs">
                  <span className="w-1.5 h-1.5 bg-secondary rounded-full animate-bounce"></span>
                  <span className="w-1.5 h-1.5 bg-secondary rounded-full animate-bounce [animation-delay:0.2s]"></span>
                  <span className="w-1.5 h-1.5 bg-secondary rounded-full animate-bounce [animation-delay:0.4s]"></span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompts Bar */}
          <div className="px-3 py-1.5 bg-surface-container-low/40 border-t border-outline-variant/20 flex gap-1.5 overflow-x-auto scrollbar-none shrink-0">
            {quickPrompts.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSend(p.text)}
                className="whitespace-nowrap px-2.5 py-1 rounded-full bg-surface-container-lowest hover:bg-surface-container border border-outline-variant/40 text-[11px] font-medium text-on-surface hover:text-secondary transition-all shrink-0 shadow-2xs"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Input Box Footer */}
          <div className="p-2.5 bg-surface-container-lowest border-t border-outline-variant/30 shrink-0 space-y-1.5">
            <div className="flex items-center gap-1.5 bg-surface rounded-xl border border-outline-variant/50 px-2 py-1 focus-within:border-secondary focus-within:ring-1 focus-within:ring-secondary/30 transition-all">
              <input
                ref={inputRef}
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  isTeacher ? 'Hỏi về ngữ liệu hoặc cách dùng EduLit...' : 'Hỏi về bài tập, ngữ liệu hoặc cách dùng EduLit...'
                }
                className="flex-1 bg-transparent text-xs text-on-surface placeholder:text-outline focus:outline-none py-1"
              />
              <button
                type="button"
                onClick={() => handleSend()}
                disabled={!inputMessage.trim() || isTyping}
                className="w-7 h-7 rounded-lg bg-secondary text-white flex items-center justify-center hover:bg-secondary/90 disabled:opacity-30 transition-all shrink-0"
              >
                <span className="material-symbols-outlined text-sm">arrow_upward</span>
              </button>
            </div>

            <div className="flex items-center justify-between text-[10px] text-outline px-1">
              <span>GDPT 2018 Socratic Engine</span>
              <Link
                href="/chatbot"
                onClick={() => setIsOpen(false)}
                className="text-secondary font-semibold hover:underline flex items-center gap-0.5"
              >
                <span>Mở bản đầy đủ</span>
                <span className="material-symbols-outlined text-[10px]">arrow_forward</span>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* 2. Floating Action Button (FAB) - Draggable */}
      <div
        ref={containerRef}
        style={
          position
            ? { left: `${position.x}px`, top: `${position.y}px`, bottom: 'auto', right: 'auto' }
            : { bottom: '24px', right: '24px' }
        }
        className="fixed z-50 flex items-center gap-2 select-none group"
      >
        {!isOpen && (
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container-lowest border border-outline-variant/50 shadow-md text-xs font-semibold text-on-surface animate-in fade-in slide-in-from-right-3 duration-200 pointer-events-none">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            <span>Hỏi Trợ lý AI</span>
          </div>
        )}

        <button
          type="button"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => {
            isDraggingRef.current = false;
          }}
          onClick={handleButtonClick}
          title={isOpen ? 'Đóng hộp thoại AI' : isTeacher ? 'Mở Trợ lý sư phạm (Kéo để di chuyển vị trí)' : 'Mở trợ lý EduLit AI (Kéo để di chuyển vị trí)'}
          className={`relative w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-xl hover:scale-105 active:scale-95 transition-transform duration-200 cursor-grab active:cursor-grabbing touch-none ${
            isOpen
              ? 'bg-on-surface text-surface'
              : isTeacher
              ? 'bg-gradient-to-tr from-[#4A154B] via-[#6B21A8] to-primary ring-4 ring-primary/20'
              : 'bg-gradient-to-tr from-secondary via-teal-700 to-primary ring-4 ring-secondary/20'
          }`}
        >
          {isOpen ? (
            <span className="material-symbols-outlined text-2xl">close</span>
          ) : (
            <>
              <span className="material-symbols-outlined text-2xl animate-in zoom-in-50">smart_toy</span>
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white ring-1 ring-green-600 animate-pulse"></span>
            </>
          )}
        </button>
      </div>
    </>
  );
}
