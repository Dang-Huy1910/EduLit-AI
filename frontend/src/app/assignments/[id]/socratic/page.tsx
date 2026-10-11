'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import StudentShell from '@/components/StudentShell';
import AssignmentWorkflowStepper from '@/components/AssignmentWorkflowStepper';
import { useAppStore } from '@/lib/store';

export default function SocraticChatPage() {
  const router = useRouter();
  const params = useParams();
  const assignmentId = (params?.id as string) || 'assign-nlxh-01';
  const {
    assignments,
    socraticMessages,
    addSocraticMessage,
    outline,
    addOutlinePoint,
    updateOutlinePoint,
    removeOutlinePoint,
    addToast,
  } = useAppStore();

  const assignment = assignments.find((a) => a.id === assignmentId);

  const [inputMessage, setInputMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [readingModalOpen, setReadingModalOpen] = useState(false);
  const [rubricModalOpen, setRubricModalOpen] = useState(false);
  const [simConnectionError, setSimConnectionError] = useState(false);
  const [simIncompleteState, setSimIncompleteState] = useState(false);

  // New outline point dialog/input
  const [addingSectionId, setAddingSectionId] = useState<string | null>(null);
  const [newPointText, setNewPointText] = useState('');

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    if (simConnectionError) {
      addToast('Mất kết nối máy chủ. Vui lòng kiểm tra mạng và thử lại.', 'error');
      return;
    }

    setIsSubmitting(true);
    addSocraticMessage(inputMessage);
    setInputMessage('');

    setTimeout(() => {
      setIsSubmitting(false);
    }, 850);
  };

  const handleAddOutlinePoint = (sectionId: string) => {
    if (!newPointText.trim()) return;
    addOutlinePoint(sectionId, newPointText.trim());
    setNewPointText('');
    setAddingSectionId(null);
    addToast('Đã thêm ý mới vào dàn ý của em.', 'success');
  };

  const handleTransferToOutline = (point: string) => {
    addOutlinePoint('body', point);
    addToast('Đã chuyển luận điểm vào Thân bài / Phản đề.', 'success');
  };

  return (
    <StudentShell headerTitle="Khối 12 - Lớp 12A1" headerSubtitle="Trợ lý gợi mở dàn ý Socratic">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Top Breadcrumb & Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-outline-variant/20">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs bg-primary-fixed text-primary font-bold px-2.5 py-0.5 rounded-full">
                Socratic Writing Scaffold
              </span>
              <span className="text-xs text-on-surface-variant font-medium">
                {assignment?.title || 'Bài viết số 1: Ý chí và lòng kiên định'}
              </span>
            </div>
            <h1 className="font-headline-md text-xl font-bold text-on-surface font-merriweather">
              Trợ lý Socratic: Hướng dẫn xây dựng Dàn ý
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setReadingModalOpen(true)}
              className="px-3 py-1.5 rounded-lg border border-outline-variant/60 bg-surface-container-lowest text-xs font-semibold text-secondary hover:bg-surface-container transition-all flex items-center gap-1 shadow-sm"
            >
              <span className="material-symbols-outlined text-sm">menu_book</span>
              <span>Xem ngữ liệu đọc hiểu</span>
            </button>
            <button
              onClick={() => setRubricModalOpen(true)}
              className="px-3 py-1.5 rounded-lg border border-outline-variant/60 bg-surface-container-lowest text-xs font-semibold text-on-surface hover:bg-surface-container transition-all flex items-center gap-1 shadow-sm"
            >
              <span className="material-symbols-outlined text-sm">gavel</span>
              <span>Tiêu chí Rubric</span>
            </button>
          </div>
        </div>

        {/* Unified 5-Step Workflow Stepper */}
        <AssignmentWorkflowStepper currentStep="socratic" assignmentId={assignmentId} />

        {/* Demo Toolbar */}
        <div className="p-2.5 bg-surface-container-low/70 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs border border-outline-variant/20">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-sm text-secondary">tune</span>
            <span className="text-on-surface-variant font-medium">Mô phỏng trạng thái thử nghiệm:</span>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={simConnectionError}
                onChange={(e) => setSimConnectionError(e.target.checked)}
                className="rounded text-error focus:ring-error"
              />
              <span className="text-error font-medium">Lỗi mất mạng (Offline)</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={simIncompleteState}
                onChange={(e) => setSimIncompleteState(e.target.checked)}
                className="rounded text-[#CA8A04] focus:ring-[#CA8A04]"
              />
              <span className="text-[#CA8A04] font-medium">Dàn ý chưa đạt yêu cầu</span>
            </label>
          </div>
        </div>

        {/* Offline Banner if triggered */}
        {simConnectionError && (
          <div className="p-3 bg-error-container/60 border border-error/30 rounded-lg text-xs text-error flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-base">wifi_off</span>
              <span>Mất kết nối với dịch vụ AI Socratic. Nội dung đang nhập vẫn được lưu trên máy của em.</span>
            </div>
            <button
              onClick={() => setSimConnectionError(false)}
              className="px-2.5 py-1 bg-surface-container-lowest text-error rounded font-semibold text-[11px]"
            >
              Thử kết nối lại
            </button>
          </div>
        )}

        {/* Pedagogical Principle Banner */}
        <div className="p-3 bg-surface-container-low/50 rounded-xl border border-secondary/20 flex items-center gap-2 text-xs text-on-surface-variant">
          <span className="material-symbols-outlined text-secondary text-base">verified</span>
          <span>
            <strong>Nguyên tắc Trợ lý GDPT 2018:</strong> Trợ lý gợi mở để em tự xây dựng ý tưởng và dàn ý cá nhân. AI tuyệt đối <strong>không viết thay bài văn</strong>.
          </span>
        </div>

        {/* Main Desktop Split View: Left Chat (55%), Right Outline (45%) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Chat Area (7 cols) */}
          <div className="lg:col-span-7 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm flex flex-col h-[640px]">
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
                    className={`p-3.5 rounded-xl max-w-[85%] text-xs leading-relaxed ${
                      msg.sender === 'user'
                        ? 'bg-primary-container text-on-primary-container rounded-tr-none font-medium'
                        : 'bg-surface-container-low text-on-surface rounded-tl-none border border-outline-variant/30'
                    }`}
                  >
                    <p>{msg.text}</p>

                    {msg.canAddToOutline && msg.outlinePoint && (
                      <div className="mt-2 pt-2 border-t border-outline-variant/30 flex justify-end">
                        <button
                          onClick={() => handleTransferToOutline(msg.outlinePoint!)}
                          className="px-2.5 py-1 bg-surface-container-lowest text-secondary rounded text-[11px] font-semibold hover:bg-surface-container flex items-center gap-1 shadow-sm"
                        >
                          <span className="material-symbols-outlined text-[14px]">playlist_add</span>
                          <span>Chuyển ý này vào Dàn ý</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {isSubmitting && (
                <div className="flex items-center gap-2 text-xs text-on-surface-variant italic">
                  <span className="w-3.5 h-3.5 border-2 border-secondary border-t-transparent rounded-full animate-spin"></span>
                  <span>Trợ lý Socratic đang suy nghĩ câu hỏi gợi mở...</span>
                </div>
              )}
            </div>

            {/* Quick Chips */}
            <div className="p-2.5 bg-surface-container-low/40 border-t border-outline-variant/20 flex flex-wrap gap-1.5 text-xs">
              <span className="text-[11px] text-outline font-semibold self-center mr-1">Gợi ý nhanh:</span>
              <button
                type="button"
                onClick={() => setInputMessage('Em muốn đào sâu thêm về phần phản đề, khi nào kiên định trở thành cố chấp?')}
                className="px-2 py-1 bg-surface-container-lowest rounded-full border border-outline-variant/40 text-[11px] text-on-surface hover:bg-surface-container"
              >
                Xem lại phản đề
              </button>
              <button
                type="button"
                onClick={() => setInputMessage('Em chưa tìm được dẫn chứng thời sự về người trẻ kiên định, AI gợi ý hướng tìm kiếm giúp em với.')}
                className="px-2 py-1 bg-surface-container-lowest rounded-full border border-outline-variant/40 text-[11px] text-on-surface hover:bg-surface-container"
              >
                Kiểm tra dẫn chứng
              </button>
              <button
                type="button"
                onClick={() => setInputMessage('Em cần gợi ý bài học liên hệ bản thân thực tế cho học sinh lớp 12.')}
                className="px-2 py-1 bg-surface-container-lowest rounded-full border border-outline-variant/40 text-[11px] text-on-surface hover:bg-surface-container"
              >
                Liên hệ bản thân
              </button>
            </div>

            {/* Composer */}
            <form onSubmit={handleSendMessage} className="p-3 border-t border-outline-variant/30 flex gap-2">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Trao đổi ý tưởng, luận điểm với Trợ lý (tối đa 400 ký tự)..."
                maxLength={400}
                className="flex-1 px-3 py-2 text-xs rounded-lg border border-outline-variant/60 bg-surface text-on-surface focus:outline-none focus:border-secondary"
              />
              <button
                type="submit"
                disabled={isSubmitting || !inputMessage.trim()}
                className="px-4 py-2 bg-primary-container text-on-primary-container font-bold text-xs rounded-lg hover:brightness-95 transition-all shadow-sm flex items-center gap-1 disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-base">send</span>
                <span>Gửi</span>
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
                  Do chính em tự xây dựng, AI không tự động điền thay.
                </p>
              </div>
              <button
                onClick={() => addToast('Đã lưu nháp dàn ý thành công vào bộ nhớ tạm.', 'success')}
                className="px-2.5 py-1 text-xs border border-outline-variant/50 rounded text-on-surface-variant hover:bg-surface-container"
              >
                Lưu nháp
              </button>
            </div>

            {/* Outline Content List */}
            <div className="flex-1 p-4 overflow-y-auto space-y-4 text-xs">
              {outline.map((section) => (
                <div key={section.id} className="p-3 bg-surface-container-low/40 rounded-xl border border-outline-variant/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-primary font-merriweather">{section.title}</span>
                    <button
                      type="button"
                      onClick={() => setAddingSectionId(section.id)}
                      className="text-[11px] text-secondary font-semibold hover:underline flex items-center gap-0.5"
                    >
                      <span className="material-symbols-outlined text-[13px]">add</span>
                      Thêm ý
                    </button>
                  </div>

                  <ul className="space-y-1.5">
                    {section.points.map((point, idx) => (
                      <li
                        key={idx}
                        className="p-2 bg-surface-container-lowest rounded-lg border border-outline-variant/30 text-on-surface text-[11px] flex items-start justify-between gap-2 group"
                      >
                        <span className="leading-relaxed flex-1">• {point}</span>
                        <button
                          type="button"
                          onClick={() => removeOutlinePoint(section.id, idx)}
                          className="opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-error transition-opacity"
                        >
                          <span className="material-symbols-outlined text-[14px]">delete</span>
                        </button>
                      </li>
                    ))}
                  </ul>

                  {addingSectionId === section.id && (
                    <div className="mt-2 pt-2 border-t border-outline-variant/30 flex gap-1.5">
                      <input
                        type="text"
                        value={newPointText}
                        onChange={(e) => setNewPointText(e.target.value)}
                        placeholder="Nhập ý tưởng mới..."
                        className="flex-1 px-2 py-1 text-xs rounded border border-outline-variant/60 bg-surface"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddOutlinePoint(section.id)}
                        className="px-2 py-1 bg-primary-container text-on-primary-container rounded font-bold text-xs"
                      >
                        Lưu
                      </button>
                      <button
                        type="button"
                        onClick={() => setAddingSectionId(null)}
                        className="px-2 py-1 text-xs text-on-surface-variant"
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
                <span className="font-semibold text-on-surface">Độ bao phủ yêu cầu đề:</span>
                <span className="font-bold text-tertiary font-mono">
                  {simIncompleteState ? '45% (Chưa đạt)' : '82% (Đủ điều kiện)'}
                </span>
              </div>

              {simIncompleteState ? (
                <div className="p-2.5 bg-[#FEF9C3] rounded-lg border border-[#FDE047] text-[11px] text-[#CA8A04] flex items-start gap-1.5">
                  <span className="material-symbols-outlined text-sm mt-0.5">warning</span>
                  <span>Em cần bổ sung dẫn chứng thực tế hoặc phản đề trước khi chuyển sang bước viết bài.</span>
                </div>
              ) : (
                <div className="p-2.5 bg-tertiary-container/30 rounded-lg text-[11px] text-tertiary flex items-start gap-1.5">
                  <span className="material-symbols-outlined text-sm mt-0.5">check_circle</span>
                  <span>Dàn ý đã đủ 3 phần Mở - Thân - Kết và có phản đề. Em có thể bắt đầu viết tay!</span>
                </div>
              )}

              <button
                type="button"
                disabled={simIncompleteState}
                onClick={() => router.push(`/assignments/${assignmentId}/submit`)}
                className="w-full py-2.5 bg-primary-container text-on-primary-container font-bold text-xs rounded-lg hover:brightness-95 transition-all shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>Chuyển sang viết tay (Nộp ảnh bài viết)</span>
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Reading Text Modal */}
      {readingModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-xl max-w-lg w-full p-6 shadow-xl border border-outline-variant/30 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
              <h3 className="font-headline-sm text-sm font-bold text-on-surface font-merriweather">
                Văn bản đọc hiểu số 04
              </h3>
              <button onClick={() => setReadingModalOpen(false)}>
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>
            <div className="p-3 bg-surface-container-low/50 rounded-lg text-xs font-merriweather italic leading-relaxed text-on-surface">
              “Trong một thế giới đầy biến động và ngập tràn thông tin, người trẻ dễ rơi vào bẫy cuốn theo số đông. Tinh thần tự chủ không đơn thuần là làm theo ý mình, mà là khả năng tự định hướng, giữ vững nguyên tắc đạo đức và kiên định với những giá trị chân chính…”
            </div>
            <div className="text-right">
              <button
                onClick={() => setReadingModalOpen(false)}
                className="px-3 py-1.5 bg-surface-container text-xs font-semibold rounded-lg"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rubric Modal */}
      {rubricModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-xl max-w-lg w-full p-6 shadow-xl border border-outline-variant/30 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
              <h3 className="font-headline-sm text-sm font-bold text-on-surface font-merriweather">
                Thang tiêu chí Rubric (Tổng 10.0đ)
              </h3>
              <button onClick={() => setRubricModalOpen(false)}>
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>
            <div className="space-y-2 text-xs">
              <div className="p-2 bg-surface-container-low rounded">
                <span className="font-bold text-primary block">C1. Bố cục (2.0đ)</span>
                <span className="text-on-surface-variant text-[11px]">Đủ 3 phần Mở - Thân - Kết logic.</span>
              </div>
              <div className="p-2 bg-surface-container-low rounded">
                <span className="font-bold text-primary block">C2. Luận điểm &amp; Dẫn chứng (4.0đ)</span>
                <span className="text-on-surface-variant text-[11px]">Có phản đề, dẫn chứng thực tế xác thực.</span>
              </div>
              <div className="p-2 bg-surface-container-low rounded">
                <span className="font-bold text-primary block">C3. Diễn đạt &amp; Chính tả (2.0đ)</span>
                <span className="text-on-surface-variant text-[11px]">Trừ 0.25đ mỗi lỗi sai chính tả/ngữ pháp.</span>
              </div>
              <div className="p-2 bg-surface-container-low rounded">
                <span className="font-bold text-primary block">C4. Sáng tạo (2.0đ)</span>
                <span className="text-on-surface-variant text-[11px]">Cảm xúc cá nhân chân thành, không dùng văn mẫu.</span>
              </div>
            </div>
            <div className="text-right">
              <button
                onClick={() => setRubricModalOpen(false)}
                className="px-3 py-1.5 bg-surface-container text-xs font-semibold rounded-lg"
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

