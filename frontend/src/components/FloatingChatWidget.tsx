'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAppStore } from '@/lib/store';

interface QuickMessage {
  id: string;
  sender: 'ai' | 'user';
  text: string;
  timestamp: string;
}

export default function FloatingChatWidget() {
  const pathname = usePathname();
  const { currentUser, addToast } = useAppStore();
  const isTeacher = currentUser.role === 'teacher';

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
    text: isTeacher
      ? `Kính chào Cô Đặng Hoàng Loan! Em là Trợ lý Sư phạm EduLit Co-Pilot. Cô cần hướng dẫn Barem 4.0 điểm, phân tích tiến độ chấm bài Lớp 11A14 hay phương pháp gợi mở Socratic ạ?`
      : `Chào bạn ${currentUser.name || 'Đỗ Đăng An'}! Mình là Trợ lý Socratic AI. Bạn muốn trao đổi về trọng tâm đề bài, ngọn khói rơm rạ, nghịch lí bùn đất hay liên hệ tác phẩm ngoài hôm nay?`,
    timestamp: 'Vừa xong',
  };

  const [messages, setMessages] = useState<QuickMessage[]>([initialAIMessage]);

  // Sync initial message when role changes
  useEffect(() => {
    setMessages([
      {
        id: `msg-${Date.now()}`,
        sender: 'ai',
        text: isTeacher
          ? `Kính chào Cô Đặng Hoàng Loan! Em là Trợ lý Sư phạm EduLit Co-Pilot. Cô cần hỗ trợ gì cho bài học Màu tự do của đất ạ?`
          : `Chào bạn ${currentUser.name || 'Đỗ Đăng An'}! Socratic AI sẵn sàng gợi mở ý tưởng phân tích bài thơ Màu tự do của đất giúp bạn!`,
        timestamp: 'Vừa xong',
      },
    ]);
  }, [currentUser.role, currentUser.name, isTeacher]);

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

  const quickPrompts = isTeacher
    ? [
        { label: '⚖️ Barem 4.0 điểm', text: 'Hướng dẫn cấu trúc Barem chấm 4.0 điểm cho bài nghị luận văn học Màu tự do của đất.' },
        { label: '📊 Tiến độ bài nộp 11A14', text: 'Tóm tắt kết quả chấm và các điểm cần lưu ý của Lớp 11A14.' },
        { label: '🌱 Gợi mở nghịch lí', text: 'Gợi ý câu hỏi Socratic giúp học sinh hiểu nghịch lí "không thoát ly bùn đất".' },
      ]
    : [
        { label: '🎯 Trọng tâm đề bài', text: 'Đề này yêu cầu em tập trung phân tích điều gì?' },
        { label: '💨 Khói rơm & cảm giác', text: 'Em thấy hình ảnh khói rơm rạ và câu "tôi hít thở mầu tự do của đất" rất đặc biệt.' },
        { label: '🔥 Liên hệ Bếp lửa', text: 'Em muốn liên hệ với Bếp lửa của Bằng Việt để làm rõ nét riêng của tác giả.' },
      ];

  const handleSend = (textToSend?: string) => {
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

    setTimeout(() => {
      let reply = '';
      const lower = text.toLowerCase();

      if (isTeacher) {
        if (lower.includes('barem') || lower.includes('4.0')) {
          reply = `Dạ thưa Cô Đặng Hoàng Loan, thang 4.0 chuẩn gồm:\n• C1 (2.50đ): Phân tích tự do qua làng quê & Liên hệ tác phẩm ngoài\n• C2 (0.75đ): Nghịch lí bùn đất & chuỗi buộc-neo-cởi\n• C3 (0.50đ): Diễn đạt & ngữ pháp\n• C4 (0.25đ): Bố cục bài 600 chữ.`;
        } else if (lower.includes('bài nộp') || lower.includes('11a14') || lower.includes('12a1') || lower.includes('tiến độ')) {
          reply = `Dạ tiến độ chấm bài Lớp 11A14: Đã nộp 41/41 học sinh. Các bài nộp tiêu biểu: Đỗ Đăng An (3.60/4.00đ - Giỏi), Bùi Hà Chi (3.50/4.00đ - Giỏi), Nguyễn Trung Dũng (3.20/4.00đ - Khá).`;
        } else {
          reply = `Dạ em đã ghi nhận yêu cầu của cô Đặng Hoàng Loan: "${text}". Cô có thể bấm nút phóng to (⛶) để trao đổi chuyên sâu hơn cùng EduLit Co-Pilot nhé cô!`;
        }
      } else {
        if (lower.includes('yêu cầu') || lower.includes('trọng tâm')) {
          reply = `Trọng tâm là cảm nhận về 'tự do' qua hình ảnh làng quê trong bài thơ của Trần Quang Quý, sau đó liên hệ một bài thơ khác để làm nổi bật nét riêng của tác giả.`;
        } else if (lower.includes('khói') || lower.includes('rơm') || lower.includes('hít thở')) {
          reply = `Chi tiết rất đắt giá! Khói rơm rạ gợi mùi hương thân thuộc, còn 'hít thở mầu tự do' giúp cụ thể hóa tự do thành hơi thở của làng quê và sự sống.`;
        } else if (lower.includes('bếp lửa') || lower.includes('liên hệ')) {
          reply = `Rất phù hợp! Cả hai đều có hình ảnh ngọn khói và sự gắn bó cội rễ, nhưng Trần Quang Quý nhấn mạnh tự do trong lao động còn Bằng Việt gắn với ký ức tình bà cháu.`;
        } else {
          reply = `Ý kiến rất thú vị! Trong bài thơ "Màu tự do của đất", bạn có thể bám sát: hình ảnh làng quê, nghịch lí "không thoát ly bùn đất", chuỗi buộc – neo – cởi, hoặc liên hệ tác phẩm ngoài!`;
        }
      }

      const aiMsg: QuickMessage = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: reply,
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, aiMsg]);
      setIsTyping(false);
    }, 600);
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
          className={`fixed w-[92vw] sm:w-[390px] h-[520px] max-h-[80vh] z-50 bg-surface-container-lowest rounded-2xl shadow-2xl border border-outline-variant/40 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 ${
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
                    {isTeacher ? 'Trợ lý sư phạm' : 'Socratic AI'}
                  </h3>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span className="text-[9px] bg-white/20 px-1 py-0.2 rounded font-mono font-bold">
                    v2.4
                  </span>
                </div>
                <p className="text-[10px] text-white/80 mt-0.5">
                  {isTeacher ? 'Hỗ trợ Cô Đặng Hoàng Loan • THPT Đan Phượng' : `Đồng hành cùng ${currentUser.name || 'Đỗ Đăng An'}`}
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
                  isTeacher ? 'Nhắn tin hỏi Trợ lý sư phạm...' : 'Hỏi Socratic AI về dàn ý, mở bài...'
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
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          isDraggingRef.current = false;
        }}
        style={
          position
            ? { left: `${position.x}px`, top: `${position.y}px`, bottom: 'auto', right: 'auto' }
            : { bottom: '24px', right: '24px' }
        }
        className="fixed z-50 flex items-center gap-2 select-none touch-none cursor-grab active:cursor-grabbing group"
      >
        {!isOpen && (
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container-lowest border border-outline-variant/50 shadow-md text-xs font-semibold text-on-surface animate-in fade-in slide-in-from-right-3 duration-200 pointer-events-none">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            <span>{isTeacher ? 'Trợ lý sư phạm' : 'Hỏi Socratic AI'}</span>
          </div>
        )}

        <button
          type="button"
          onClick={handleButtonClick}
          title={isOpen ? 'Đóng hộp thoại AI' : isTeacher ? 'Mở Trợ lý sư phạm (Kéo để di chuyển vị trí)' : 'Mở trợ lý EduLit AI (Kéo để di chuyển vị trí)'}
          className={`relative w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-xl hover:scale-105 active:scale-95 transition-transform duration-200 cursor-grab active:cursor-grabbing ${
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

