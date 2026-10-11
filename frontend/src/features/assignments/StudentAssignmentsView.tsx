'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import StudentShell from '@/components/StudentShell';
import { useAppStore } from '@/lib/store';

export default function StudentAssignmentsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { addToast } = useAppStore();

  const initialTab = searchParams.get('tab') === 'submitted' ? 'submitted' : 'todo';
  const [activeTab, setActiveTab] = useState<'todo' | 'submitted'>(initialTab);
  const [codeInput, setCodeInput] = useState('VAN12-NLXH-01');
  const [codeError, setCodeError] = useState(false);
  const [showEmptyState, setShowEmptyState] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [rubricOpen, setRubricOpen] = useState(false);

  const handleOpenCode = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = codeInput.trim().toUpperCase();
    if (clean === 'VAN12-NLXH-01') {
      setCodeError(false);
      addToast('Mở thành công: Bài viết số 1 — Nghị luận xã hội', 'success');
      router.push('/assignments/assign-nlxh-01/socratic');
    } else if (clean === 'VAN12-NLVH-02') {
      setCodeError(false);
      addToast('Mở thành công: Bài viết số 2 — Ai đã đặt tên cho dòng sông?', 'success');
    } else {
      setCodeError(true);
      addToast('Mã đề thi không tồn tại hoặc đã hết hạn truy cập.', 'error');
    }
  };

  return (
    <StudentShell headerTitle="Không gian học sinh" headerSubtitle="Bài tập của em & Bài đã nộp">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Hero Section */}
        <div className="p-6 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs bg-secondary-fixed/50 text-secondary font-bold px-2 py-0.5 rounded-full">
                Học sinh 48 (Lớp 12A1)
              </span>
              <span className="text-xs bg-surface-container text-on-surface-variant font-medium px-2 py-0.5 rounded-full">
                Dữ liệu minh họa (Prototype Demo)
              </span>
            </div>
            <h1 className="font-headline-lg text-2xl font-bold text-on-surface font-merriweather">
              Không gian học tập &amp; Bài viết của em
            </h1>
            <p className="text-xs sm:text-sm text-on-surface-variant mt-1">
              Rèn luyện năng lực nghị luận theo quy trình GDPT 2018: Đọc hiểu &rarr; Lập dàn ý Socratic &rarr; Viết tay &rarr; Đánh giá Rubric.
            </p>
          </div>

          {/* Quick Enter Code Box */}
          <div className="bg-surface-container-low/70 p-3.5 rounded-xl border border-outline-variant/40 sm:max-w-xs w-full">
            <span className="text-xs font-semibold text-on-surface block mb-1.5 flex items-center gap-1">
              <span className="material-symbols-outlined text-sm text-secondary">pin</span>
              Nhập mã đề bài từ giáo viên
            </span>
            <form onSubmit={handleOpenCode} className="flex gap-2">
              <input
                type="text"
                value={codeInput}
                onChange={(e) => {
                  setCodeInput(e.target.value);
                  setCodeError(false);
                }}
                placeholder="VD: VAN12-NLXH-01"
                className="w-full px-2.5 py-1.5 text-xs font-mono uppercase rounded-lg border border-outline-variant/60 bg-surface-container-lowest text-on-surface focus:outline-none focus:border-secondary"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-primary-container text-on-primary-container font-semibold text-xs rounded-lg hover:brightness-95 shrink-0 transition-all shadow-sm"
              >
                Mở bài
              </button>
            </form>
            {codeError && (
              <p className="text-[11px] text-error mt-1 flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px]">error</span>
                Mã không hợp lệ hoặc đã hết hạn truy cập.
              </p>
            )}
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-outline-variant/20 text-[10px] text-on-surface-variant">
              <span>Mã mẫu: VAN12-NLXH-01</span>
              <button
                type="button"
                onClick={() => {
                  setCodeInput('SAI-MA-DE-99');
                  setCodeError(true);
                }}
                className="text-secondary hover:underline"
              >
                Mô phỏng lỗi
              </button>
            </div>
          </div>
        </div>

        {/* Learning Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm">
            <span className="text-xs text-on-surface-variant block">Bài tập cần làm</span>
            <span className="text-xl font-bold text-on-surface font-merriweather">02</span>
            <span className="text-[10px] text-secondary font-medium block mt-0.5">1 bài sắp đến hạn</span>
          </div>

          <div className="p-3.5 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm">
            <span className="text-xs text-on-surface-variant block">Đã có kết quả AI</span>
            <span className="text-xl font-bold text-tertiary font-merriweather">01</span>
            <span className="text-[10px] text-tertiary font-medium block mt-0.5">Đạt chuẩn Rubric</span>
          </div>

          <div className="p-3.5 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm">
            <span className="text-xs text-on-surface-variant block">Tiến độ Socratic</span>
            <span className="text-xl font-bold text-primary font-merriweather">50%</span>
            <span className="text-[10px] text-primary font-medium block mt-0.5">Đã hoàn thành 3/4 ý</span>
          </div>

          <div className="p-3.5 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm">
            <span className="text-xs text-on-surface-variant block">Điểm trung bình</span>
            <span className="text-xl font-bold text-secondary font-merriweather">7.5 / 10</span>
            <span className="text-[10px] text-secondary font-medium block mt-0.5">Mức Khá (Phát triển tốt)</span>
          </div>
        </div>

        {/* Tab & Demo Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-2 border-b border-outline-variant/30 pb-1">
            <button
              onClick={() => setActiveTab('todo')}
              className={`pb-2 px-3 text-sm font-semibold transition-all relative ${
                activeTab === 'todo'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Bài tập cần làm (2)
            </button>
            <button
              onClick={() => setActiveTab('submitted')}
              className={`pb-2 px-3 text-sm font-semibold transition-all relative ${
                activeTab === 'submitted'
                  ? 'text-secondary border-b-2 border-secondary'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Bài đã nộp &amp; Lịch sử chấm (1)
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowEmptyState(!showEmptyState)}
              className="text-xs px-2.5 py-1 rounded border border-outline-variant/50 text-secondary hover:bg-surface-container-low transition-all"
            >
              {showEmptyState ? '↩ Khôi phục bài tập' : '⚡ Trạng thái Rỗng'}
            </button>
          </div>
        </div>

        {/* Content by Tab */}
        {showEmptyState ? (
          <div className="bg-surface-container-lowest rounded-xl p-12 text-center border border-outline-variant/30 shadow-sm max-w-md mx-auto my-6">
            <div className="w-14 h-14 rounded-full bg-surface-container-low flex items-center justify-center text-on-surface-variant mx-auto mb-3">
              <span className="material-symbols-outlined text-3xl">task_alt</span>
            </div>
            <h3 className="text-base font-bold text-on-surface mb-1">Hiện không có bài tập nào cần nộp</h3>
            <p className="text-xs text-on-surface-variant mb-4">
              Em đã hoàn thành xuất sắc các bài tập được giao. Hãy chờ đề bài tiếp theo từ cô giáo nhé!
            </p>
          </div>
        ) : activeTab === 'todo' ? (
          /* Tab Todo Cards */
          <div className="space-y-4">
            {/* Card 1: NLXH (In progress) */}
            <div className="p-5 bg-surface-container-lowest rounded-xl border-2 border-primary-container/60 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-outline-variant/20">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-on-primary-container bg-primary-container px-2.5 py-0.5 rounded-full">
                    Đang lập dàn ý (Bước 2/4)
                  </span>
                  <span className="text-xs text-secondary font-mono font-semibold">VAN12-NLXH-01</span>
                </div>
                <span className="text-xs text-[#DC2626] font-medium flex items-center gap-1">
                  <span className="material-symbols-outlined text-[15px]">timer</span>
                  Hạn nộp: 25/10/2024 23:59 (Còn 3 ngày)
                </span>
              </div>

              <div>
                <h3 className="font-headline-md text-lg font-bold text-on-surface font-merriweather">
                  Bài viết số 1: Ý chí và lòng kiên định của giới trẻ
                </h3>
                <p className="text-xs text-on-surface-variant mt-1">
                  Dạng bài: Nghị luận xã hội • Khối 12 THPT Đan Phượng
                </p>
              </div>

              {/* Progress 4 Steps */}
              <div className="p-3 bg-surface-container-low/50 rounded-lg">
                <span className="text-[11px] font-semibold text-outline uppercase tracking-wider block mb-2">
                  Tiến độ bài làm
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="flex items-center gap-1.5 text-tertiary font-medium">
                    <span className="material-symbols-outlined text-base">check_circle</span>
                    <span>1. Đọc hiểu</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-primary font-bold">
                    <span className="material-symbols-outlined text-base">pending</span>
                    <span>2. Dàn ý Socratic</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-outline-variant">
                    <span className="material-symbols-outlined text-base">radio_button_unchecked</span>
                    <span>3. Viết tay &amp; Nộp ảnh</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-outline-variant">
                    <span className="material-symbols-outlined text-base">radio_button_unchecked</span>
                    <span>4. Phản hồi Rubric</span>
                  </div>
                </div>
              </div>

              {/* Collapsible Instructions Excerpt */}
              <div>
                <button
                  type="button"
                  onClick={() => setInstructionsOpen(!instructionsOpen)}
                  className="text-xs font-semibold text-secondary flex items-center gap-1 hover:underline"
                >
                  <span className="material-symbols-outlined text-base">
                    {instructionsOpen ? 'expand_less' : 'expand_more'}
                  </span>
                  {instructionsOpen ? 'Thu gọn yêu cầu đề bài' : 'Xem chi tiết yêu cầu đề bài (~600 chữ)'}
                </button>
                {instructionsOpen && (
                  <div className="mt-2 p-3 bg-surface-container-low/60 rounded-lg text-xs leading-relaxed text-on-surface-variant space-y-1.5">
                    <p className="font-medium text-on-surface">Yêu cầu cụ thể của giáo viên:</p>
                    <p>1. Giải thích khái niệm lòng kiên định và tầm quan trọng của nó trong đời sống.</p>
                    <p>2. Dẫn chứng thực tế xác thực từ thời sự, không dùng dẫn chứng quá chung chung.</p>
                    <p>3. Phản đề: Phân biệt rõ kiên định với thói bảo thủ cố chấp.</p>
                    <p>4. Rút ra bài học hành động thiết thực cho người trẻ.</p>
                  </div>
                )}
              </div>

              {/* Rubric Summary Collapsible */}
              <div>
                <button
                  type="button"
                  onClick={() => setRubricOpen(!rubricOpen)}
                  className="text-xs font-semibold text-on-surface-variant flex items-center gap-1 hover:underline"
                >
                  <span className="material-symbols-outlined text-base">
                    {rubricOpen ? 'expand_less' : 'expand_more'}
                  </span>
                  Thang điểm Rubric chuẩn GDPT 2018 (Tổng 10.0đ)
                </button>
                {rubricOpen && (
                  <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="p-2 bg-surface-container-low rounded border border-outline-variant/30">
                      <span className="font-semibold block text-primary">C1. Bố cục</span>
                      <span className="text-on-surface-variant text-[11px]">2.0 điểm tối đa</span>
                    </div>
                    <div className="p-2 bg-surface-container-low rounded border border-outline-variant/30">
                      <span className="font-semibold block text-primary">C2. Luận điểm</span>
                      <span className="text-on-surface-variant text-[11px]">4.0 điểm tối đa</span>
                    </div>
                    <div className="p-2 bg-surface-container-low rounded border border-outline-variant/30">
                      <span className="font-semibold block text-primary">C3. Diễn đạt</span>
                      <span className="text-on-surface-variant text-[11px]">2.0 điểm (-0.25đ/lỗi)</span>
                    </div>
                    <div className="p-2 bg-surface-container-low rounded border border-outline-variant/30">
                      <span className="font-semibold block text-primary">C4. Sáng tạo</span>
                      <span className="text-on-surface-variant text-[11px]">2.0 điểm tối đa</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-outline-variant/20 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                  <span className="material-symbols-outlined text-tertiary text-base">menu_book</span>
                  <span>Đã kèm Văn bản đọc hiểu số 04</span>
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    href="/assignments/assign-nlxh-01/submit"
                    className="px-3.5 py-2 rounded-lg border border-outline-variant/60 text-xs font-medium text-on-surface hover:bg-surface-container transition-all"
                  >
                    Nộp ảnh viết tay
                  </Link>
                  <Link
                    href="/assignments/assign-nlxh-01/socratic"
                    className="px-4 py-2 rounded-lg bg-primary-container text-on-primary-container text-xs font-semibold hover:brightness-95 transition-all shadow-sm flex items-center gap-1.5"
                  >
                    <span>Tiếp tục lập dàn ý Socratic</span>
                    <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                  </Link>
                </div>
              </div>
            </div>

            {/* Card 2: Sông Hương */}
            <div className="p-5 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="bg-surface-container px-2 py-0.5 rounded-full text-on-surface-variant font-semibold">
                  Chưa bắt đầu
                </span>
                <span className="text-on-surface-variant">Hạn nộp: 05/11/2024 23:59</span>
              </div>
              <h3 className="font-headline-sm text-base font-bold text-on-surface font-merriweather">
                Bài viết số 2: Vẻ đẹp sông Hương qua ngòi bút Hoàng Phủ Ngọc Tường
              </h3>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                Nghị luận văn học: Phân tích nét trữ tình và chất triết lý trong vẻ đẹp sông Hương ở thượng nguồn.
              </p>
              <div className="pt-3 border-t border-outline-variant/20 flex justify-end">
                <button
                  type="button"
                  onClick={() => addToast('Bài tập này sẽ mở sau khi hoàn thành Bài viết số 1.', 'info')}
                  className="px-3.5 py-1.5 rounded-lg border border-outline-variant/50 text-xs font-medium text-on-surface hover:bg-surface-container transition-all"
                >
                  Bắt đầu lập dàn ý
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Tab Submitted Cards */
          <div className="space-y-4">
            <div className="p-5 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-outline-variant/20">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-tertiary bg-tertiary-container/30 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">verified</span>
                    Đã có kết quả (7.5 / 10.0)
                  </span>
                  <span className="text-xs text-on-surface-variant">Mã bài nộp: SUB_20261012_001</span>
                </div>
                <span className="text-xs text-on-surface-variant">Nộp ngày: 12/10/2024 10:20</span>
              </div>

              <div>
                <h3 className="font-headline-md text-base font-bold text-on-surface font-merriweather">
                  Bài viết số 1: Ý chí và lòng kiên định của giới trẻ
                </h3>
                <p className="text-xs text-on-surface-variant mt-1">
                  Xếp loại: <strong>Khá (Phát triển năng lực)</strong> • Điểm chi tiết: Bố cục 2.0 | Luận điểm 3.0 | Diễn đạt 1.25 | Sáng tạo 1.25
                </p>
              </div>

              <div className="p-3 bg-surface-container-low/50 rounded-lg text-xs flex items-center justify-between">
                <div className="flex items-center gap-2 text-on-surface-variant">
                  <span className="material-symbols-outlined text-secondary text-base">photo_library</span>
                  <span>Đã nhận dạng OCR 2 trang giấy • Độ tin cậy 94%</span>
                </div>
                <span className="text-tertiary font-semibold">Đã ẩn danh PII hợp lệ</span>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <Link
                  href="/assignments/assign-nlxh-01/ocr"
                  className="px-3.5 py-1.5 rounded-lg border border-outline-variant/60 text-xs font-medium text-on-surface hover:bg-surface-container transition-all flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-sm">document_scanner</span>
                  <span>Bản chép OCR</span>
                </Link>
                <Link
                  href="/assignments/assign-nlxh-01/result"
                  className="px-4 py-1.5 rounded-lg bg-secondary text-white text-xs font-semibold hover:bg-secondary/90 transition-all flex items-center gap-1.5 shadow-sm"
                >
                  <span className="material-symbols-outlined text-sm">visibility</span>
                  <span>Xem kết quả &amp; Nhận xét chi tiết</span>
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </StudentShell>
  );
}

