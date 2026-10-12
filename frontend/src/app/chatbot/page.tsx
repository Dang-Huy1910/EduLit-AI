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
          title: '📊 Phân tích lỗi lập luận Lớp 12A1',
          timeLabel: 'Hôm nay',
          preview: 'Tóm tắt các lỗi sai thiếu phản đề của 35 bài chấm Rubric...',
        },
        {
          id: 'session-3',
          title: '⚖️ Soạn khung Barem 4 mức GDPT 2018',
          timeLabel: '7 ngày trước',
          preview: 'Xây dựng tiêu chí phân hóa Nhận biết, Thông hiểu, Vận dụng...',
        },
        {
          id: 'session-4',
          title: '📖 Ngữ liệu bổ trợ bài thơ Tây Tiến',
          timeLabel: '7 ngày trước',
          preview: 'Khai thác bối cảnh lịch sử và tinh thần bi tráng đoàn quân...',
        },
      ]
    : [
        {
          id: 'session-1',
          title: '💡 Mở bài NLXH về lòng kiên định',
          timeLabel: 'Hôm nay',
          preview: 'Công thức đi từ bối cảnh chuyển đổi số vào vấn đề tư tưởng...',
        },
        {
          id: 'session-2',
          title: '🎯 Tiêu chí Sáng tạo (C4) trong Barem',
          timeLabel: 'Hôm nay',
          preview: 'Cách tạo dấu ấn cá nhân và hình ảnh ẩn dụ độc đáo...',
        },
        {
          id: 'session-3',
          title: '📰 Dẫn chứng thời sự người trẻ 2024',
          timeLabel: '7 ngày trước',
          preview: 'Tấm gương kỹ sư công nghệ nông nghiệp bền bỉ vượt khó...',
        },
        {
          id: 'session-4',
          title: '✍️ Dàn ý bài viết số 1 (Đan Phượng)',
          timeLabel: '7 ngày trước',
          preview: 'Phân tách 3 luận điểm thân bài kèm phản đề sâu sắc...',
        },
      ];

  const [sessions, setSessions] = useState<ChatSession[]>(initialSessions);

  // Pre-loaded conversation for session-1
  const initialMessages: Message[] = isTeacher
    ? [
        {
          id: 'm-1',
          sender: 'ai',
          text: `Kính chào Cô Đặng Loan! Em là Trợ lý Sư phạm EduLit Co-Pilot của trường THPT Đan Phượng.\n\nEm đã sẵn sàng hỗ trợ cô:\n• Gợi ý đề bài Nghị luận xã hội & Nghị luận văn học gắn với thực tiễn 2024.\n• Soạn thảo và chuẩn hóa thang điểm Rubric 4 mức (Nhận biết, Thông hiểu, Vận dụng, Vận dụng cao).\n• Phân tích điểm nghẽn học lực của Lớp 12A1 để điều chỉnh giáo án kịp thời.\n\nCô muốn bắt đầu với nội dung nào ạ?`,
          timestamp: '08:00',
          modelBadge: 'EduLit Co-Pilot v2.4',
        },
      ]
    : [
        {
          id: 'm-1',
          sender: 'ai',
          text: `Chào bạn Bùi Hà My! Mình là Trợ lý Socratic AI đồng hành môn Ngữ văn 12 tại THPT Đan Phượng.\n\nTheo định hướng GDPT 2018, mình sẽ không viết bài hộ, mà sẽ đặt các câu hỏi gợi mở giúp bạn:\n• Tìm kiếm góc nhìn độc lập, sâu sắc cho đề bài.\n• Xây dựng luận điểm phản đề chặt chẽ.\n• Lựa chọn dẫn chứng thực tế giàu sức thuyết phục.\n\nBạn đang muốn mài giũa ý tưởng cho phần nào trong bài viết?`,
          timestamp: '08:00',
          modelBadge: 'Socratic AI Engine',
          suggestedAction: {
            label: 'Xem đề bài & Lập dàn ý bài tập đang làm →',
            href: '/assignments/assign-nlxh-01/socratic',
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
      title: 'Mở bài ấn tượng',
      desc: 'Cách dẫn dắt từ hiện thực chuyển đổi số vào tư tưởng',
      prompt: 'Hướng dẫn em cách viết một đoạn mở bài nghị luận xã hội về ý chí kiên định thật tự nhiên và tránh lối mòn.',
    },
    {
      icon: 'verified',
      title: 'Tiêu chí Sáng tạo C4',
      desc: 'Bí quyết đạt điểm tối đa phần Sáng tạo GDPT 2018',
      prompt: 'Tiêu chí Sáng tạo (2.0 điểm) trong Barem chấm bài thi đòi hỏi những yếu tố gì cụ thể?',
    },
    {
      icon: 'history_edu',
      title: 'Dẫn chứng mới 2024',
      desc: 'Tấm gương người thật việc thật thời đại số',
      prompt: 'Gợi ý cho em 2 dẫn chứng thời sự năm 2024 về người trẻ Việt Nam kiên định theo đuổi mục tiêu.',
    },
    {
      icon: 'psychology',
      title: 'Xây dựng phản đề',
      desc: 'Phân biệt kiên định với bảo thủ mù quáng',
      prompt: 'Làm thế nào để viết đoạn phản đề sắc sảo, phân biệt giữa lòng kiên định và sự bảo thủ thiếu linh hoạt?',
    },
  ];

  const quickCardsTeacher = [
    {
      icon: 'assignment_add',
      title: 'Gợi ý 3 đề bài tuần này',
      desc: 'Đề bài thời sự gắn liền trách nhiệm số và thấu cảm',
      prompt: 'Gợi ý 3 đề bài Nghị luận xã hội thời sự bám sát chương trình GDPT 2018 cho khối 12 tuần này.',
    },
    {
      icon: 'analytics',
      title: 'Phân tích lỗi Lớp 12A1',
      desc: 'Tổng hợp điểm nghẽn phổ biến qua 35 bài chấm',
      prompt: 'Tóm tắt các lỗi sai phổ biến nhất về lập luận và ngữ pháp của học sinh Lớp 12A1 trong bài vừa qua.',
    },
    {
      icon: 'balance',
      title: 'Khung Barem 4 mức chuẩn',
      desc: 'Thang điểm phân hóa Nhận biết - Vận dụng cao',
      prompt: 'Hướng dẫn cấu trúc Barem chấm 4 mức cho bài viết nghị luận 600 chữ đạt chuẩn Bộ GD&ĐT.',
    },
    {
      icon: 'groups',
      title: 'Hoạt động nhóm 15 phút',
      desc: 'Kế hoạch sư phạm khắc phục lỗi thiếu phản đề',
      prompt: 'Gợi ý 1 hoạt động dạy học 15 phút đầu tiết tới giúp học sinh rèn luyện kỹ năng viết phản đề đa chiều.',
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
        if (lower.includes('đề bài') || lower.includes('gợi ý') || lower.includes('tuần')) {
          replyText = `Dạ thưa Cô Đặng Loan, em xin gợi ý 3 đề bài Nghị luận xã hội chất lượng cao bám sát thực tiễn 2024:\n\n1. **Đề số 1 (Về bản sắc & trí tuệ số):**\n"Anh/chị hãy viết bài văn nghị luận (khoảng 600 chữ) bàn về trách nhiệm giữ gìn sự thấu cảm và tính nhân văn của người trẻ trong kỷ nguyên bùng nổ trí tuệ nhân tạo (AI)."\n\n2. **Đề số 2 (Về tinh thần kiên định):**\n"Bàn về sự khác biệt giữa lòng kiên định theo đuổi lý tưởng với sự bảo thủ mù quáng trước những biến đổi nhanh chóng của thời đại."\n\n3. **Đề số 3 (Về ý thức công dân địa phương):**\n"Từ truyền thống quê hương Đan Phượng anh hùng đến khát vọng cống hiến xây dựng quê hương số của thế hệ trẻ ngày nay."\n\nCô có thể bấm áp dụng đề bài này trực tiếp vào hệ thống ngay bên dưới!`;
          actionLink = {
            label: 'Khởi tạo bài tập mới từ đề này →',
            href: '/assignments/new',
          };
        } else if (lower.includes('lỗi') || lower.includes('12a1') || lower.includes('học sinh')) {
          replyText = `Thưa cô Đặng Loan, dữ liệu đối chiếu Rubric của 35 bài làm Lớp 12A1 cho thấy:\n\n• **54.3% (19 bài)**: Thiếu luận điểm phản đề đa chiều. Học sinh lập luận một chiều, chưa làm rõ ranh giới giữa kiên trì và bảo thủ.\n• **37.1% (13 bài)**: Mắc lỗi ngữ pháp câu phức (thiếu chủ vị vế chính, lặp từ nối khẩu ngữ).\n• **28.6% (10 bài)**: Dẫn chứng lối mòn (sử dụng lại các ví dụ quen thuộc thay vì người thật việc thật thời đại số 2024).\n\n💡 **Hành động sư phạm khuyến nghị:** Dành 15 phút đầu tiết tới tổ chức hoạt động *"Đối thoại phản biện"* để học sinh tìm ít nhất 2 góc nhìn phản đề cho bài viết.`;
          actionLink = {
            label: 'Xem chi tiết bảng phân tích năng lực Lớp 12A1 →',
            href: '/reports',
          };
        } else if (lower.includes('barem') || lower.includes('rubric') || lower.includes('4 mức')) {
          replyText = `Thưa cô, khung Barem 4 mức chuẩn GDPT 2018 cho bài nghị luận 600 chữ:\n\n1. **Nhận biết (10–20%):** Xác định đúng vấn đề nghị luận; bảo đảm cấu trúc 3 phần Mở - Thân - Kết.\n2. **Thông hiểu (30–40%):** Giải thích rõ ràng các khái niệm; lập luận mạch lạc, liên kết câu chặt chẽ.\n3. **Vận dụng (20–30%):** Dẫn chứng xác thực, thời sự; có góc nhìn phản đề đối thoại sâu sắc.\n4. **Vận dụng cao (10–20%):** Tính sáng tạo, diễn đạt giàu hình ảnh và cảm xúc, thể hiện bản lĩnh tư duy độc lập của người viết.`;
        } else {
          replyText = `Thưa cô Đặng Loan, em đã ghi nhận câu hỏi: "${text}".\n\nVới vai trò Trợ lý Sư phạm EduLit Co-Pilot, em luôn đồng hành cùng cô trong việc tối ưu hóa thời gian soạn bài, tra cứu ngữ liệu chuẩn mực và xây dựng tiêu chí đánh giá công bằng, khách quan cho học sinh THPT Đan Phượng!`;
        }
      } else {
        // Student
        if (lower.includes('mở bài') || lower.includes('mở')) {
          replyText = `Để mở bài nghị luận xã hội hấp dẫn và tránh lối mòn, em hãy áp dụng công thức **"Khởi từ hiện thực – Điểm vào tư tưởng"**:\n\n1. **Gợi mở (1–2 câu):** Bắt đầu bằng một hiện tượng thực tế quen thuộc trong đời sống người trẻ (như áp lực thành công sớm, hội chứng sợ bỏ lỡ FOMO, hay sự chuyển động chóng mặt của công nghệ).\n2. **Dẫn dắt (1 câu):** Đặt ra câu hỏi: Giữa những biến đổi ấy, điều gì giữ cho người trẻ không bị chao đảo?\n3. **Khẳng định vấn đề (1 câu):** Đó chính là ý chí kiên định – chiếc la bàn định hình bản lĩnh và phẩm giá con người.\n\n*Tránh tuyệt đối các câu mở đầu sáo rỗng như: "Từ xưa đến nay...", "Xã hội ngày càng phát triển..."*!`;
        } else if (lower.includes('sáng tạo') || lower.includes('c4')) {
          replyText = `Tiêu chí Sáng tạo (C4 - 2.0 điểm) trong Barem GDPT 2018 không đòi hỏi em phải dùng từ ngữ đao to búa lớn!\n\nĐiều giám khảo và cô giáo đánh giá cao nhất là:\n• **Góc nhìn cá nhân độc lập:** Em dám nêu suy nghĩ chân thực của mình, không sao chép văn mẫu.\n• **Hình ảnh ẩn dụ giàu sức gợi:** Ví dụ ví lòng kiên định như "bộ rễ bám sâu trong giông bão" thay vì chỉ nói "cần phải kiên trì".\n• **Liên hệ bản thân thực chất:** Nêu bài học hành động gắn liền với thói quen học tập nhỏ mỗi ngày, tránh khẩu hiệu hô hào sáo rỗng.`;
        } else if (lower.includes('dẫn chứng') || lower.includes('2024') || lower.includes('kiên định')) {
          replyText = `Gợi ý 2 dẫn chứng thời sự năm 2024 rất đắt giá cho em:\n\n1. **Kỹ sư trẻ nông nghiệp thông minh tại Đan Phượng:** Hình ảnh các bạn trẻ khởi nghiệp ứng dụng AI và IoT vào nhà màng nông nghiệp địa phương; dù trải qua nhiều mùa vụ thử nghiệm thất bại và khó khăn nguồn vốn nhưng vẫn bền bỉ hoàn thiện công nghệ để giúp bà con nông dân nâng cao năng suất.\n2. **Vận động viên thể thao người khuyết tật Việt Nam tại Paralympic 2024:** Tấm gương kiên trì tập luyện hàng chục năm trong lặng lẽ để mang lại niềm tự hào cho Tổ quốc.\n\n💡 *Bí quyết phân tích:* Không chỉ kể tên người, mà hãy phân tích **động lực ý chí** giúp họ vượt qua nghịch cảnh!`;
          actionLink = {
            label: 'Đưa dẫn chứng này vào Dàn ý bài viết của em →',
            href: '/assignments/assign-nlxh-01/socratic',
          };
        } else if (lower.includes('phản đề') || lower.includes('bảo thủ')) {
          replyText = `Em đặt câu hỏi rất thông minh! Luận điểm phản đề chính là chìa khóa để bài viết đạt điểm 8.0+.\n\nEm hãy phân biệt rõ:\n• **Kiên định:** Bền bỉ giữ vững mục tiêu và giá trị cốt lõi, nhưng biết linh hoạt điều chỉnh phương pháp khi hoàn cảnh thay đổi.\n• **Bảo thủ:** Khăng khăng giữ lấy ý kiến cũ dù đã sai lệch, từ chối lắng nghe phản biện và đóng cửa trước cái mới.\n\n*Em có thể viết:* "Kiên định không đồng nghĩa với cố chấp ngoan cố. Người có bản lĩnh kiên định thực sự là người biết cúi mình học hỏi, kiên trì với lý tưởng nhưng luôn sáng suốt cập nhật tri thức mới."`;
        } else {
          replyText = `Em đã đặt một câu hỏi rất thú vị! Theo góc nhìn gợi mở Socratic:\n\nNếu người đọc bài viết của em đặt câu hỏi ngược lại: *"Tại sao trong một số trường hợp, người ta lại khuyên nên biết từ bỏ đúng lúc thay vì kiên định đến cùng?"*, em sẽ trả lời và phân định ranh giới giữa hai điều này như thế nào để thuyết phục họ?`;
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
                        ? 'Hỗ trợ Cô Đặng Loan soạn giảng, lập barem 4 mức và phân tích bài viết học sinh Lớp 12A1.'
                        : 'Đồng hành cùng Bùi Hà My mài giũa tư duy phản biện, tìm dẫn chứng thời sự và hoàn thiện dàn ý đạt điểm cao.'}
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
                      ? 'Hỏi Cô Đặng Loan: Gợi ý đề bài thời sự, soạn Barem 4 mức, phân tích lỗi Lớp 12A1...'
                      : 'Hỏi Socratic AI: Cách viết mở bài, dẫn chứng thời sự 2024, tiêu chí Sáng tạo C4...'
                  }
                  className="w-full px-3 py-1.5 text-xs sm:text-sm bg-transparent text-on-surface placeholder:text-outline focus:outline-none resize-none leading-relaxed"
                />

                <div className="flex items-center justify-between pt-1 px-1.5">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => addToast('Đính kèm ngữ liệu chuẩn GDPT 2018 (Tính năng prototype)', 'info')}
                      className="p-1 rounded-lg text-outline hover:text-on-surface hover:bg-surface-container transition-all"
                      title="Đính kèm tài liệu học liệu"
                    >
                      <span className="material-symbols-outlined text-base">attach_file</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => addToast('Nhập liệu giọng nói tiếng Việt (Tính năng prototype)', 'info')}
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
