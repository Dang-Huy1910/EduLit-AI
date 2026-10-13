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
  if (process.env.NEXT_PUBLIC_DATA_MODE === 'api') {
    return null;
  }

  // Do not render floating widget on full chatbot page
  if (pathname === '/chatbot') {
    return null;
  }

  const [isOpen, setIsOpen] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const initialAIMessage: QuickMessage = {
    id: 'msg-init',
    sender: 'ai',
    text: isTeacher
      ? `Kính chào Cô Đặng Loan! Em là Trợ lý Sư phạm EduLit Co-Pilot. Cô cần gợi ý đề bài, chuẩn hóa Barem 4 mức hay kiểm tra lỗi làm văn của Lớp 12A1 ạ?`
      : `Chào bạn Bùi Hà My! Mình là Trợ lý Socratic AI. Bạn cần gợi ý cách mở bài, tìm dẫn chứng thời sự 2024 hay xây dựng phản đề cho bài viết hôm nay?`,
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
          ? `Kính chào Cô Đặng Loan! Em là Trợ lý Sư phạm EduLit Co-Pilot. Cô cần hỗ trợ gì cho bài học tuần này ạ?`
          : `Chào bạn Bùi Hà My! Socratic AI sẵn sàng gợi mở ý tưởng làm văn giúp bạn!`,
        timestamp: 'Vừa xong',
      },
    ]);
  }, [currentUser.role, isTeacher]);

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
        { label: '📝 Gợi ý 3 đề bài tuần này', text: 'Gợi ý 3 đề bài Nghị luận xã hội thời sự bám sát GDPT 2018 cho khối 12 tuần này.' },
        { label: '📊 Lỗi làm văn Lớp 12A1', text: 'Tóm tắt các lỗi sai phổ biến nhất về lập luận và phản đề của học sinh Lớp 12A1.' },
        { label: '⚖️ Barem 4 mức chuẩn', text: 'Hướng dẫn cấu trúc Barem chấm 4 mức cho bài viết nghị luận 600 chữ đạt chuẩn Bộ GD&ĐT.' },
      ]
    : [
        { label: '💡 Cách viết mở bài', text: 'Hướng dẫn em cách viết một đoạn mở bài nghị luận xã hội về ý chí kiên định thật tự nhiên và tránh lối mòn.' },
        { label: '📰 Dẫn chứng mới 2024', text: 'Gợi ý cho em 2 dẫn chứng thời sự năm 2024 về người trẻ Việt Nam kiên định theo đuổi mục tiêu.' },
        { label: '🎯 Tiêu chí Sáng tạo C4', text: 'Tiêu chí Sáng tạo (2.0 điểm) trong Barem chấm bài thi đòi hỏi những yếu tố gì cụ thể?' },
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
        if (lower.includes('đề bài') || lower.includes('gợi ý')) {
          reply = `Dạ thưa Cô Đặng Loan, em gợi ý 2 đề NLXH nổi bật:\n1. Trách nhiệm giữ gìn sự thấu cảm của người trẻ trong kỷ nguyên AI.\n2. Phân biệt ý chí kiên định với sự bảo thủ mù quáng.\nCô có thể bấm vào nút toàn màn hình (⛶) để xem trọn bộ 3 đề chi tiết ạ!`;
        } else if (lower.includes('lỗi') || lower.includes('12a1')) {
          reply = `Dạ dữ liệu 35 bài chấm của 12A1 cho thấy 54.3% bài thiếu luận điểm phản đề đa chiều và 37.1% lỗi liên kết câu phức. Cô có thể mở tab Báo cáo để xem biểu đồ chi tiết!`;
        } else {
          reply = `Dạ em đã ghi nhận yêu cầu của cô Đặng Loan: "${text}". Cô có thể bấm nút mở rộng toàn màn hình để trao đổi chuyên sâu hơn cùng EduLit Co-Pilot nhé cô!`;
        }
      } else {
        if (lower.includes('mở bài')) {
          reply = `Công thức mở bài hay: "Khởi từ hiện thực – Điểm vào tư tưởng". Hãy bắt đầu bằng áp lực thành công sớm của Gen Z rồi dẫn vào giá trị của lòng kiên định như một chiếc la bàn nội tâm!`;
        } else if (lower.includes('dẫn chứng')) {
          reply = `Gợi ý cho bạn 2 dẫn chứng 2024: Kỹ sư trẻ khởi nghiệp nông nghiệp công nghệ cao tại Đan Phượng, và các VĐV kiên trì tại Paralympic 2024!`;
        } else {
          reply = `Ý kiến rất thú vị! Theo hướng gợi mở Socratic: Nếu người đọc cho rằng kiên định đôi khi là cố chấp, bạn sẽ đưa ra phản đề gì để bảo vệ luận điểm của mình?`;
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
        <div className="fixed bottom-24 right-4 sm:right-6 w-[92vw] sm:w-[390px] h-[520px] max-h-[80vh] z-50 bg-surface-container-lowest rounded-2xl shadow-2xl border border-outline-variant/40 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
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
                    {isTeacher ? 'EduLit Co-Pilot' : 'Socratic AI'}
                  </h3>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span className="text-[9px] bg-white/20 px-1 py-0.2 rounded font-mono font-bold">
                    v2.4
                  </span>
                </div>
                <p className="text-[10px] text-white/80 mt-0.5">
                  {isTeacher ? 'Hỗ trợ Cô Đặng Loan • THPT Đan Phượng' : 'Đồng hành cùng Bùi Hà My'}
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
                  isTeacher ? 'Nhắn tin hỏi EduLit Co-Pilot...' : 'Hỏi Socratic AI về dàn ý, mở bài...'
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

      {/* 2. Floating Action Button (FAB) at Bottom-Right */}
      <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 group">
        {!isOpen && (
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container-lowest border border-outline-variant/50 shadow-md text-xs font-semibold text-on-surface animate-in fade-in slide-in-from-right-3 duration-200">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            <span>{isTeacher ? 'Hỏi Cô Đặng Loan Co-Pilot' : 'Hỏi Socratic AI'}</span>
          </div>
        )}

        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          title={isOpen ? 'Đóng hộp thoại AI' : 'Mở trợ lý EduLit AI'}
          className={`relative w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-xl hover:scale-105 active:scale-95 transition-all duration-200 ${
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

