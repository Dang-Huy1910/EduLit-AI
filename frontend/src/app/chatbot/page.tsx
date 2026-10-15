'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import TeacherShell from '@/components/TeacherShell';
import StudentShell from '@/components/StudentShell';

interface Message {
  id: string;
  sender: 'ai' | 'user';
  text: string;
  timestamp: string;
  modelBadge?: string;
  suggestedAction?: {
    label: string;
    href: string;
  };
}

interface ChatSession {
  id: string;
  title: string;
  timeLabel: 'Hôm nay' | '7 ngày trước';
  preview: string;
}

export default function ChatbotPage() {
  const router = useRouter();
  const { currentUser, addToast } = useAppStore();

  const isTeacher = currentUser.role === 'teacher';

  const [activeSessionId, setActiveSessionId] = useState('session-1');
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [isHistoryOpen, setIsHistoryOpen] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Initial sessions list
  const initialSessions: ChatSession[] = isTeacher
    ? [
        {
          id: 'session-1',
          title: '📝 Gợi ý đề NLXH thời sự tuần 12',
          timeLabel: 'Hôm nay',
          preview: '3 đề bài về trí tuệ nhân tạo và tinh thần công dân số...',
        },
        {
          id: 'session-2',
          title: '📊 Đánh giá 3 bài nộp Lớp 12A1',
          timeLabel: 'Hôm nay',
          preview: 'So sánh bài làm của Bùi Hà My, Trần Minh Khôi, Nguyễn Lan Anh...',
        },
        {
          id: 'session-3',
          title: '🌱 Gợi mở nghịch lí bùn đất',
          timeLabel: '7 ngày trước',
          preview: 'Xây dựng câu hỏi Socratic giúp học sinh chạm vào chiều sâu tư tưởng...',
        },
        {
          id: 'session-4',
          title: '📖 Ngữ liệu Màu tự do của đất',
          timeLabel: '7 ngày trước',
          preview: 'Rà soát bài thơ Trần Quang Quý trên báo Văn nghệ số Tết 2019...',
        },
      ]
    : [
        {
          id: 'session-1',
          title: '💡 Phân tích hình ảnh khói rơm rạ',
          timeLabel: 'Hôm nay',
          preview: 'Sự chuyển đổi cảm giác trong "hít thở mầu tự do của đất"...',
        },
        {
          id: 'session-2',
          title: '🌾 Nghịch lí "không thoát ly bùn đất"',
          timeLabel: 'Hôm nay',
          preview: 'Phân biệt thoát nhọc nhằn cơ bắp với việc gắn bó cội rễ...',
        },
        {
          id: 'session-3',
          title: '🔗 Chuỗi liên kết buộc – neo – cởi',
          timeLabel: '7 ngày trước',
          preview: 'Đường dây tâm thức làng và kết cấu vòng tròn ngọn khói...',
        },
        {
          id: 'session-4',
          title: '🔥 Liên hệ mở rộng bài thơ Bếp lửa',
          timeLabel: '7 ngày trước',
          preview: 'Làm nổi bật nét riêng độc đáo của nhà thơ Trần Quang Quý...',
        },
      ];

  const [sessions, setSessions] = useState<ChatSession[]>(initialSessions);

  // Pre-loaded conversation for session-1
  const initialMessages: Message[] = isTeacher
    ? [
        {
          id: 'm-1',
          sender: 'ai',
          text: `Kính chào Cô Đặng Loan! Em là Trợ lý Sư phạm EduLit Co-Pilot của trường THPT Đan Phượng.\n\nEm đã sẵn sàng hỗ trợ cô:\n• Cấu hình thang điểm Rubric 4.0 điểm chuẩn cho đề bài "Màu tự do của đất".\n• Rà soát văn bản thơ và ghi chú đối chiếu ngữ liệu từ DOCX.\n• Phân tích kết quả và lỗi phổ biến của 3 học sinh (Bùi Hà My, Trần Minh Khôi, Nguyễn Lan Anh).\n\nCô muốn bắt đầu với nội dung nào ạ?`,
          timestamp: '08:00',
          modelBadge: 'EduLit Co-Pilot v2.4',
        },
      ]
    : [
        {
          id: 'm-1',
          sender: 'ai',
          text: `Chào bạn Bùi Hà My! Mình là Trợ lý Socratic AI đồng hành môn Ngữ văn 12 tại THPT Đan Phượng.\n\nTheo định hướng GDPT 2018, mình sẽ không viết bài hộ, mà sẽ đặt các câu hỏi gợi mở giúp bạn:\n• Phân tích hình ảnh làng quê và cảm nhận tự do của Trần Quang Quý.\n• Khai thác nghịch lí "không thoát ly bùn đất" và chuỗi buộc – neo – cởi.\n• Liên hệ mở rộng bài thơ ngoài để làm nổi bật nét riêng của tác giả.\n\nBạn đang muốn mài giũa ý tưởng cho phần nào trong bài viết?`,
          timestamp: '08:00',
          modelBadge: 'Socratic AI Engine',
          suggestedAction: {
            label: 'Xem đề bài & Lập dàn ý bài tập đang làm →',
            href: '/assignments/assign-nlvh-mau-tu-do-dat/socratic',
          },
        },
      ];

  const [messages, setMessages] = useState<Message[]>(initialMessages);

  // Sync when role switches
  useEffect(() => {
    setSessions(initialSessions);
    setMessages(initialMessages);
  }, [currentUser.role]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Handle new chat session
  const handleNewChat = () => {
    const newId = `session-${Date.now()}`;
    const newSession: ChatSession = {
      id: newId,
      title: isTeacher ? '📝 Đoạn chat sư phạm mới' : '💭 Ý tưởng bài viết mới',
      timeLabel: 'Hôm nay',
      preview: 'Bắt đầu cuộc trò chuyện mới cùng EduLit AI...',
    };
    setSessions([newSession, ...sessions]);
    setActiveSessionId(newId);
    setMessages([]);
    addToast('Đã tạo cuộc hội thoại mới.', 'info');
  };

  // Quick Prompt Cards for Empty State
  const quickCardsStudent = [
    {
      icon: 'lightbulb',
      title: 'Xác định yêu cầu đề',
      desc: 'Trọng tâm cảm nhận tự do qua hình ảnh làng quê',
      prompt: 'Đề này yêu cầu em tập trung phân tích điều gì?',
    },
    {
      icon: 'air',
      title: 'Khói, mùi & cảm giác',
      desc: 'Chi tiết khói rơm rạ và hít thở mầu tự do của đất',
      prompt: 'Em thấy hình ảnh khói rơm rạ và câu "tôi hít thở mầu tự do của đất" rất đặc biệt.',
    },
    {
      icon: 'psychology',
      title: 'Nghịch lí của tự do',
      desc: 'Vì sao tự do lại là không thoát ly bùn đất?',
      prompt: 'Vì sao tự do lại là không thoát ly bùn đất?',
    },
    {
      icon: 'compare_arrows',
      title: 'Liên hệ Bếp lửa',
      desc: 'Làm rõ nét riêng của Trần Quang Quý so với Bằng Việt',
      prompt: 'Em muốn liên hệ với Bếp lửa của Bằng Việt.',
    },
  ];

  const quickCardsTeacher = [
    {
      icon: 'assignment_add',
      title: 'Thang điểm 4.0 chuẩn',
      desc: 'Cấu trúc Barem 4 tiêu chí chuẩn GDPT 2018',
      prompt: 'Hướng dẫn cấu trúc Barem chấm 4.0 điểm cho bài nghị luận văn học 600 chữ bài Màu tự do của đất.',
    },
    {
      icon: 'analytics',
      title: 'Phân tích 3 bài nộp 12A1',
      desc: 'Bùi Hà My, Trần Minh Khôi, Nguyễn Lan Anh',
      prompt: 'Phân tích điểm mạnh và lỗi phổ biến của 3 học sinh trong bài Màu tự do của đất.',
    },
    {
      icon: 'psychology',
      title: 'Gợi mở nghịch lí bùn đất',
      desc: 'Phương pháp Socratic không viết hộ bài',
      prompt: 'Làm thế nào để hướng dẫn học sinh hiểu nghịch lí "không thoát ly bùn đất" mà không nói hộ lời giải?',
    },
    {
      icon: 'groups',
      title: 'Hoạt động nhóm 15 phút',
      desc: 'Rèn luyện kỹ năng liên hệ tác phẩm ngoài',
      prompt: 'Gợi ý 1 hoạt động dạy học 15 phút giúp học sinh rèn kỹ năng liên hệ tác phẩm ngoài làm nổi bật nét riêng của tác giả.',
    },
  ];

  const handleSend = (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text) return;

    const userMessage: Message = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputMessage('');
    setIsTyping(true);

    // AI Response generation
    setTimeout(() => {
      let replyText = '';
      let actionLink: { label: string; href: string } | undefined;
      const lower = text.toLowerCase();

      if (isTeacher) {
        if (lower.includes('barem') || lower.includes('rubric') || lower.includes('4.0') || lower.includes('tiêu chí')) {
          replyText = `Thưa Cô Đặng Loan, thang điểm 4.0 chuẩn của đề bài được phân bổ như sau:\n\n1. **C1. Nội dung, nghệ thuật & Liên hệ (2.50 điểm):** Phân tích cảm nhận về tự do qua hình ảnh làng quê (1.50đ); liên hệ tác phẩm ngoài và làm rõ nét riêng của tác giả (1.00đ - thiếu phần này trừ điểm nặng).\n2. **C2. Phân tích & Lập luận (0.75 điểm):** Lập luận chặt chẽ, khai thác nghịch lí "không thoát ly bùn đất" và chuỗi "buộc – neo – cởi".\n3. **C3. Diễn đạt & Ngôn ngữ (0.50 điểm):** Đúng chính tả, dùng từ chính xác, câu văn truyền cảm (-0.25đ/lỗi).\n4. **C4. Cấu trúc & Quy cách (0.25 điểm):** Đảm bảo bố cục 3 phần Mở - Thân - Kết của bài nghị luận văn học ~600 chữ.`;
        } else if (lower.includes('học sinh') || lower.includes('12a1') || lower.includes('bài nộp') || lower.includes('phân tích')) {
          replyText = `Thưa cô Đặng Loan, kết quả đối chiếu 3 bài nộp tiêu biểu của Lớp 12A1:\n\n• **Bùi Hà My (3.60/4.00đ - Giỏi):** Phân tích sâu nghịch lí tự do và chuỗi buộc – neo – cởi; liên hệ sắc sảo với *Bếp lửa* của Bằng Việt.\n• **Trần Minh Khôi (2.65/4.00đ - TB Khá):** Cảm nhận hình ảnh thơ tốt nhưng hoàn toàn thiếu phần liên hệ tác phẩm ngoài; bị trừ điểm theo đúng hướng dẫn chấm tiêu chí C1.\n• **Nguyễn Lan Anh (3.35/4.00đ - Khá):** Có liên hệ với *Quê hương* của Tế Hanh nhưng cần làm rõ hơn nét riêng trong cách nhìn của Trần Quang Quý.`;
          actionLink = {
            label: 'Xem chi tiết bảng tổng hợp báo cáo lớp →',
            href: '/reports',
          };
        } else if (lower.includes('hoạt động') || lower.includes('15 phút') || lower.includes('nhóm')) {
          replyText = `💡 **Kế hoạch hoạt động 15 phút đầu tiết:** *"Đối thoại hai ngọn khói quê hương"*\n\n1. **Khởi động (3 phút):** Chiếu 2 đoạn thơ: ngọn khói rơm rạ trong *Màu tự do của đất* (Trần Quang Quý) và mùi khói bếp trong *Bếp lửa* (Bằng Việt).\n2. **Thảo luận cặp đôi (7 phút):** Tìm 1 điểm gặp gỡ (nỗi nhớ quê hương, cội nguồn) và 1 nét riêng (Trần Quang Quý gắn khói với suy tưởng tự do và lao động; Bằng Việt gắn với ký ức tình bà cháu).\n3. **Đúc kết (5 phút):** Giáo viên chốt bí quyết liên hệ: không chỉ chỉ ra điểm giống mà bắt buộc phải làm bật nét độc đáo của tác giả chính.`;
        } else {
          replyText = `Thưa cô Đặng Loan, em đã ghi nhận yêu cầu: "${text}".\n\nEduLit Co-Pilot luôn sẵn sàng hỗ trợ cô đối chiếu rubric, rà soát văn bản thơ và xây dựng các câu hỏi gợi mở cho học sinh!`;
        }
      } else {
        // Student
        if (lower.includes('yêu cầu') || lower.includes('trọng tâm') || lower.includes('phân tích điều gì')) {
          replyText = `Trọng tâm là cách Trần Quang Quý cảm nhận 'tự do' qua những hình ảnh làng quê. Em cần đi từ hình ảnh và ngôn ngữ cụ thể để giải thích cách hiểu ấy, sau đó liên hệ một bài thơ khác nhằm làm rõ nét riêng của tác giả. Em muốn bắt đầu từ ngọn khói quê hay nghịch lí 'không thoát ly bùn đất'?`;
          actionLink = {
            label: 'Mở không gian đối thoại Socratic hoàn chỉnh →',
            href: '/assignments/assign-nlvh-mau-tu-do-dat/socratic',
          };
        } else if (lower.includes('khói') || lower.includes('mùi') || lower.includes('hít thở')) {
          replyText = `Em đã chọn được một chi tiết quan trọng. Khói rơm rạ gợi cảm giác cay và mùi hương, còn 'hít thở mầu tự do' khiến một khái niệm trừu tượng trở nên gần với cơ thể. Theo em, cách diễn đạt ấy cho thấy quê hương hiện diện trong con người như thế nào?`;
        } else if (lower.includes('nghịch lí') || lower.includes('bùn đất') || lower.includes('thoát ly')) {
          replyText = `Em hãy đặt câu này cạnh mong muốn 'được giải phóng mình khỏi nhọc nhằn cơ bắp'. Nhà thơ thừa nhận khát vọng bớt vất vả, đồng thời nhìn thấy giá trị của sự gắn bó với đất và lao động. Em có thể phân biệt mong muốn thoát nhọc nhằn với việc từ bỏ cội rễ ra sao?`;
        } else if (lower.includes('bếp lửa') || lower.includes('liên hệ') || lower.includes('quê hương')) {
          replyText = `Em có thể đặt hai tác phẩm cạnh nhau qua hình ảnh khói và sự gắn bó với cội nguồn. Với 'Bếp lửa', em cần chọn chi tiết phù hợp về kí ức và tình bà cháu; với 'Màu tự do của đất', cần trở lại suy tưởng về đất, lao động và tự do. Em sẽ nêu điểm khác biệt ấy bằng dẫn chứng nào?`;
        } else {
          replyText = `Câu hỏi của em gợi mở nhiều suy ngẫm! Trong bài thơ "Màu tự do của đất", em có thể tập trung vào các trục chính: hình ảnh làng quê (khói rơm, ngõ xóm), nghịch lí "không thoát ly bùn đất", chuỗi liên kết "buộc – neo – cởi", hoặc liên hệ với "Bếp lửa" / "Quê hương". Em muốn đi sâu vào ý nào trước?`;
        }
      }

      const aiMsg: Message = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: replyText,
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        modelBadge: isTeacher ? 'EduLit Co-Pilot' : 'Socratic AI Engine',
        suggestedAction: actionLink,
      };

      setMessages((prev) => [...prev, aiMsg]);
      setIsTyping(false);
    }, 700);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const Shell = isTeacher ? TeacherShell : StudentShell;

  const filteredSessions = sessions.filter(
    (s) =>
      s.title.toLowerCase().includes(historySearch.toLowerCase()) ||
      s.preview.toLowerCase().includes(historySearch.toLowerCase())
  );

  return (
    <Shell
      breadcrumb={
        <div className="flex items-center gap-space-xs font-label-md text-sm text-on-surface-variant">
          <Link href="/assignments" className="hover:text-primary">
            {isTeacher ? 'Không gian Giáo viên' : 'Bài tập của em'}
          </Link>
          <span className="text-outline-variant">/</span>
          <span className="text-on-surface font-semibold flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[18px] text-secondary">smart_toy</span>
            <span>{isTeacher ? 'Trợ lý Sư phạm EduLit (Teacher Co-Pilot)' : 'Trợ lý Văn học Socratic AI'}</span>
            <span className="text-[10px] bg-secondary-fixed/50 text-secondary font-bold px-1.5 py-0.2 rounded-full uppercase font-mono">
              GPT
            </span>
          </span>
        </div>
      }
    >
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Main 2-Column Container: Chat Area (Center-Left) + History Rail (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 h-[calc(100vh-140px)] min-h-[640px]">
          {/* 1. Left/Center Area (Main Chat Window - 8 cols when history open, 12 cols when collapsed) */}
          <div
            className={`${
              isHistoryOpen ? 'lg:col-span-8' : 'lg:col-span-12'
            } bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-sm flex flex-col h-full overflow-hidden transition-all duration-300`}
          >
            {/* Chat Window Top Bar */}
            <div className="p-3.5 px-4 sm:px-6 border-b border-outline-variant/20 bg-surface-container-low/30 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-xs ${
                    isTeacher
                      ? 'bg-gradient-to-tr from-[#6B21A8] to-primary'
                      : 'bg-gradient-to-tr from-secondary to-primary'
                  }`}
                >
                  <span className="material-symbols-outlined text-xl">smart_toy</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-bold text-sm text-on-surface">
                      {isTeacher ? 'EduLit Teacher Co-Pilot' : 'Trợ lý Socratic AI'}
                    </h2>
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                    <span className="text-[10px] text-secondary font-bold font-mono">v2.4</span>
                  </div>
                  <p className="text-[11px] text-on-surface-variant">
                    {isTeacher ? 'Hỗ trợ Cô Đặng Loan • THPT Đan Phượng' : 'Đồng hành cùng Bùi Hà My • GDPT 2018'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Collapsible History Toggle Button */}
                <button
                  type="button"
                  onClick={() => setIsHistoryOpen((prev) => !prev)}
                  title={isHistoryOpen ? 'Thu gọn thanh lịch sử hội thoại' : 'Mở thanh lịch sử hội thoại'}
                  className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-all shadow-2xs ${
                    isHistoryOpen
                      ? 'border-outline-variant/60 hover:bg-surface-container text-on-surface-variant'
                      : 'border-secondary/40 bg-secondary-fixed/40 text-secondary hover:bg-secondary-fixed/60 font-bold'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">
                    {isHistoryOpen ? 'dock_to_right' : 'history'}
                  </span>
                  <span>{isHistoryOpen ? 'Thu gọn lịch sử' : `Lịch sử (${sessions.length})`}</span>
                </button>

                <button
                  onClick={() => {
                    setMessages([]);
                    addToast('Đã làm mới khung trò chuyện.', 'info');
                  }}
                  title="Xóa ngữ cảnh hội thoại hiện tại"
                  className="px-2.5 py-1.5 rounded-lg border border-outline-variant/50 hover:bg-surface-container text-xs text-on-surface-variant flex items-center gap-1 transition-all"
                >
                  <span className="material-symbols-outlined text-sm">delete_sweep</span>
                  <span className="hidden sm:inline">Xóa chat</span>
                </button>

                <Link
                  href="/assignments"
                  className="px-3 py-1.5 rounded-lg bg-primary-container text-on-primary-container font-semibold text-xs hover:brightness-95 transition-all shadow-2xs flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-sm">assignment</span>
                  <span className="hidden sm:inline">Vào bài tập</span>
                </Link>
              </div>
            </div>

            {/* Chat Messages Body Area */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 scrollbar-thin bg-surface/40">
              {messages.length === 0 ? (
                /* Empty Welcome State */
                <div className="py-6 sm:py-10 text-center space-y-6 animate-in fade-in duration-300">
                  <div className="space-y-2">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-primary via-amber-600 to-secondary text-white mx-auto flex items-center justify-center shadow-lg">
                      <span className="material-symbols-outlined text-2xl">auto_stories</span>
                    </div>
                    <h3 className="text-xl sm:text-2xl font-bold font-merriweather text-on-surface">
                      {isTeacher ? 'Trợ lý Sư phạm EduLit Co-Pilot' : 'Trợ lý Văn học Socratic AI'}
                    </h3>
                    <p className="text-xs text-on-surface-variant max-w-md mx-auto leading-relaxed">
                      {isTeacher
                        ? 'Hỗ trợ Cô Đặng Loan soạn giảng, cấu hình thang điểm 4.0 và phân tích bài viết học sinh Lớp 12A1.'
                        : 'Đồng hành cùng Bùi Hà My mài giũa tư duy phân tích, khai thác nghịch lí tự do và lập dàn ý đạt điểm cao.'}
                    </p>
                  </div>

                  {/* 4 Prompt Cards Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-left max-w-2xl mx-auto">
                    {(isTeacher ? quickCardsTeacher : quickCardsStudent).map((card, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSend(card.prompt)}
                        className="p-3.5 rounded-xl bg-surface-container-lowest hover:bg-surface-container-low border border-outline-variant/40 hover:border-secondary transition-all text-left shadow-2xs group space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-on-surface group-hover:text-secondary flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-base text-secondary">
                              {card.icon}
                            </span>
                            {card.title}
                          </span>
                          <span className="material-symbols-outlined text-sm text-outline opacity-0 group-hover:opacity-100 transition-opacity">
                            arrow_forward
                          </span>
                        </div>
                        <p className="text-[11px] text-on-surface-variant leading-relaxed">
                          {card.desc}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                /* Message List */
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in duration-200`}
                  >
                    {/* AI Avatar */}
                    {msg.sender === 'ai' && (
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-primary to-amber-700 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                        <span className="material-symbols-outlined text-base">auto_awesome</span>
                      </div>
                    )}

                    {/* Message Bubble */}
                    <div
                      className={`max-w-[85%] sm:max-w-[80%] rounded-2xl p-4 space-y-2 leading-relaxed text-xs sm:text-sm ${
                        msg.sender === 'user'
                          ? 'bg-secondary text-white rounded-tr-xs shadow-xs'
                          : 'bg-surface-container-lowest text-on-surface border border-outline-variant/30 rounded-tl-xs shadow-2xs'
                      }`}
                    >
                      {msg.sender === 'ai' && msg.modelBadge && (
                        <div className="flex items-center justify-between pb-1.5 border-b border-outline-variant/20 text-[10px] text-on-surface-variant">
                          <span className="font-semibold text-secondary flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs">smart_toy</span>
                            {msg.modelBadge}
                          </span>
                          <span className="font-mono">{msg.timestamp}</span>
                        </div>
                      )}

                      <div className="whitespace-pre-line font-normal leading-relaxed text-xs sm:text-sm">
                        {msg.text}
                      </div>

                      {msg.suggestedAction && (
                        <div className="pt-2 border-t border-outline-variant/20">
                          <Link
                            href={msg.suggestedAction.href}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-secondary-fixed/30 hover:bg-secondary-fixed/50 text-secondary text-xs font-bold transition-all"
                          >
                            <span>{msg.suggestedAction.label}</span>
                            <span className="material-symbols-outlined text-xs">arrow_forward</span>
                          </Link>
                        </div>
                      )}

                      {msg.sender === 'user' && (
                        <div className="text-[10px] text-white/70 text-right font-mono">
                          {msg.timestamp}
                        </div>
                      )}
                    </div>

                    {/* User Avatar */}
                    {msg.sender === 'user' && (
                      <div className="w-8 h-8 rounded-xl bg-primary-container text-on-primary-container flex items-center justify-center font-bold text-xs shrink-0 shadow-xs mt-0.5">
                        {currentUser.avatarInitials}
                      </div>
                    )}
                  </div>
                ))
              )}

              {/* Typing indicator */}
              {isTyping && (
                <div className="flex gap-3 items-center text-xs text-on-surface-variant animate-in fade-in duration-150">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-primary to-amber-700 text-white flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-sm animate-spin">sync</span>
                  </div>
                  <div className="p-3 bg-surface-container-lowest rounded-2xl border border-outline-variant/30 flex items-center gap-2 shadow-2xs">
                    <span className="text-secondary font-medium">EduLit AI đang phản hồi...</span>
                    <div className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-secondary rounded-full animate-bounce"></span>
                      <span className="w-1.5 h-1.5 bg-secondary rounded-full animate-bounce [animation-delay:0.2s]"></span>
                      <span className="w-1.5 h-1.5 bg-secondary rounded-full animate-bounce [animation-delay:0.4s]"></span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Bottom Input Area */}
            <div className="p-3 sm:p-4 bg-surface-container-lowest border-t border-outline-variant/20 shrink-0 space-y-2">
              <div className="relative rounded-xl border border-outline-variant/60 bg-surface shadow-xs focus-within:border-secondary focus-within:ring-1 focus-within:ring-secondary/30 transition-all flex flex-col p-1.5">
                <textarea
                  ref={textareaRef}
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={2}
                  placeholder={
                    isTeacher
                      ? 'Hỏi Cô Đặng Loan: Cấu hình Barem 4.0, phân tích bài nộp 12A1, hoạt động nhóm 15 phút...'
                      : 'Hỏi Socratic AI: Trọng tâm đề, khói rơm rạ, nghịch lí bùn đất, liên hệ Bếp lửa...'
                  }
                  className="w-full px-3 py-1.5 text-xs sm:text-sm bg-transparent text-on-surface placeholder:text-outline focus:outline-none resize-none leading-relaxed"
                />

                <div className="flex items-center justify-between pt-1 px-1.5">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => addToast('Đã đính kèm ngữ liệu chuẩn GDPT 2018.', 'success')}
                      className="p-1 rounded-lg text-outline hover:text-on-surface hover:bg-surface-container transition-all"
                      title="Đính kèm tài liệu học liệu"
                    >
                      <span className="material-symbols-outlined text-base">attach_file</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => addToast('Đang kích hoạt micro nhận diện giọng nói tiếng Việt...', 'info')}
                      className="p-1 rounded-lg text-outline hover:text-on-surface hover:bg-surface-container transition-all"
                      title="Nhập bằng giọng nói"
                    >
                      <span className="material-symbols-outlined text-base">mic</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-outline hidden sm:inline font-mono">
                      Enter để gửi • Shift+Enter xuống dòng
                    </span>
                    <button
                      type="button"
                      onClick={() => handleSend()}
                      disabled={!inputMessage.trim() || isTyping}
                      className="w-7 h-7 rounded-lg bg-secondary text-white flex items-center justify-center hover:bg-secondary/90 active:scale-95 disabled:opacity-30 transition-all shadow-xs"
                    >
                      <span className="material-symbols-outlined text-base">arrow_upward</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] text-outline px-1">
                <span>Tuân thủ nguyên tắc Socratic GDPT 2018 — Gợi mở tư duy, không viết hộ.</span>
                <span>PII-Shield THPT Đan Phượng</span>
              </div>
            </div>
          </div>

          {/* 2. Right Rail: Lịch sử trò chuyện & Sổ tay ngữ liệu (4 cols when open) */}
          {isHistoryOpen && (
            <div className="lg:col-span-4 bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-sm p-4 flex flex-col h-full overflow-hidden space-y-4 animate-in fade-in duration-200">
              {/* Right Rail Top: Header & New Chat Button */}
              <div className="space-y-3 pb-3 border-b border-outline-variant/20 shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-lg text-secondary">history</span>
                    <h3 className="font-bold text-xs uppercase tracking-wider text-on-surface">
                      Lịch sử hội thoại AI
                    </h3>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-outline font-mono">
                      {sessions.length} phiên
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsHistoryOpen(false)}
                      title="Thu gọn cột lịch sử"
                      className="p-1 rounded-lg text-outline hover:text-on-surface hover:bg-surface-container transition-all flex items-center justify-center ml-1"
                    >
                      <span className="material-symbols-outlined text-base">dock_to_right</span>
                    </button>
                  </div>
                </div>

                {/* New Chat Button */}
              <button
                type="button"
                onClick={handleNewChat}
                className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-primary to-amber-700 text-white font-bold text-xs hover:brightness-105 active:scale-98 transition-all flex items-center justify-between shadow-xs group"
              >
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-base group-hover:rotate-90 transition-transform">
                    add
                  </span>
                  <span>+ Cuộc trò chuyện mới</span>
                </div>
                <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded font-mono">
                  Mới
                </span>
              </button>

              {/* Search History Filter */}
              <div className="relative">
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Tìm kiếm chủ đề đã hỏi..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-outline-variant/50 bg-surface text-on-surface placeholder:text-outline focus:outline-none focus:border-secondary"
                />
                <span className="material-symbols-outlined text-base text-outline absolute left-2 top-2">
                  search
                </span>
              </div>
            </div>

            {/* Scrollable Sessions List */}
            <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 scrollbar-thin text-xs">
              {/* Group: Hôm nay */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-outline px-1 block">
                  Gần đây (Hôm nay)
                </span>
                <div className="space-y-1">
                  {filteredSessions
                    .filter((s) => s.timeLabel === 'Hôm nay')
                    .map((session) => (
                      <button
                        key={session.id}
                        onClick={() => {
                          setActiveSessionId(session.id);
                          addToast(`Đã mở lại phiên: ${session.title}`, 'info');
                        }}
                        className={`w-full text-left p-2.5 rounded-xl transition-all flex items-start gap-2.5 border ${
                          activeSessionId === session.id
                            ? 'bg-secondary-fixed/20 border-secondary/40 text-secondary font-bold shadow-2xs'
                            : 'bg-surface-container-low/40 border-outline-variant/20 text-on-surface hover:bg-surface-container'
                        }`}
                      >
                        <span className="material-symbols-outlined text-base mt-0.5 shrink-0 text-secondary">
                          chat_bubble
                        </span>
                        <div className="truncate flex-1">
                          <div className="truncate text-xs">{session.title}</div>
                          <p className="text-[10px] text-on-surface-variant truncate font-normal mt-0.5">
                            {session.preview}
                          </p>
                        </div>
                      </button>
                    ))}
                </div>
              </div>

              {/* Group: 7 ngày trước */}
              <div className="space-y-1.5 pt-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-outline px-1 block">
                  7 ngày trước
                </span>
                <div className="space-y-1">
                  {filteredSessions
                    .filter((s) => s.timeLabel === '7 ngày trước')
                    .map((session) => (
                      <button
                        key={session.id}
                        onClick={() => {
                          setActiveSessionId(session.id);
                          addToast(`Đã mở lại phiên: ${session.title}`, 'info');
                        }}
                        className={`w-full text-left p-2.5 rounded-xl transition-all flex items-start gap-2.5 border ${
                          activeSessionId === session.id
                            ? 'bg-secondary-fixed/20 border-secondary/40 text-secondary font-bold shadow-2xs'
                            : 'bg-surface-container-low/40 border-outline-variant/20 text-on-surface hover:bg-surface-container'
                        }`}
                      >
                        <span className="material-symbols-outlined text-base mt-0.5 shrink-0 text-outline">
                          history
                        </span>
                        <div className="truncate flex-1">
                          <div className="truncate text-xs">{session.title}</div>
                          <p className="text-[10px] text-on-surface-variant truncate font-normal mt-0.5">
                            {session.preview}
                          </p>
                        </div>
                      </button>
                    ))}
                </div>
              </div>
            </div>

            {/* Right Rail Bottom: Tips Card & Quick Navigation */}
            <div className="pt-3 border-t border-outline-variant/20 shrink-0 space-y-2.5 text-xs">
              <div className="p-3 rounded-xl bg-surface-container-low/70 border border-secondary/20 space-y-1.5">
                <div className="flex items-center gap-1.5 text-secondary font-bold text-xs">
                  <span className="material-symbols-outlined text-sm">psychology</span>
                  <span>Nguyên tắc Socratic AI</span>
                </div>
                <p className="text-[11px] text-on-surface-variant leading-relaxed">
                  Trợ lý EduLit định hướng đặt câu hỏi gợi ý để người học tự nâng cao năng lực viết văn, bảo đảm tính liêm chính học thuật GDPT 2018.
                </p>
              </div>

              <div className="flex items-center justify-between gap-2 pt-0.5">
                <Link
                  href="/assignments"
                  className="w-1/2 py-2 rounded-lg border border-outline-variant/50 text-center text-xs font-semibold hover:bg-surface-container text-on-surface transition-all"
                >
                  Bài tập
                </Link>
                <Link
                  href="/materials"
                  className="w-1/2 py-2 rounded-lg bg-surface-container text-center text-xs font-semibold hover:bg-surface-container-high text-on-surface transition-all"
                >
                  Kho học liệu
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  </Shell>
  );
}
