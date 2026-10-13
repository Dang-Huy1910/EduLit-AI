'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import TeacherShell from '@/components/TeacherShell';
import { useAppStore } from '@/lib/store';
import { RubricCriterion } from '@/lib/types';
import { isApiMode } from '@/lib/data-mode';
import { useApiAuthStore } from '@/lib/api-auth-store';
import ApiTeacherAssignmentEditor from '@/features/assignments/ApiTeacherAssignmentEditor';
import ApiAssignmentReadView from '@/features/assignments/ApiAssignmentReadView';

export default function AssignmentEditorPage() {
  const apiUser = useApiAuthStore((state) => state.user);
  if (isApiMode()) {
    return apiUser?.role === 'TEACHER' ? <ApiTeacherAssignmentEditor /> : <ApiAssignmentReadView />;
  }
  return <MockAssignmentEditorPage />;
}

function MockAssignmentEditorPage() {
  const params = useParams();
  const router = useRouter();
  const { assignments, activeRubric, updateRubricCriterion, publishAssignment, addToast } = useAppStore();

  const assignmentId = (params?.id as string) || 'assign-nlxh-01';
  const isNew = assignmentId === 'new';
  const assignment = assignments.find((a) => a.id === assignmentId);

  const [title, setTitle] = useState(
    assignment?.title ||
      (isNew
        ? 'Nghị luận xã hội: Ý thức trách nhiệm của thanh niên đối với cộng đồng'
        : 'Nghị luận xã hội: Ý nghĩa của tinh thần tự chủ trong kỷ nguyên chuyển đổi số')
  );
  const [instructions, setInstructions] = useState(
    assignment?.instructions ||
      (isNew
        ? `Anh/chị hãy viết một bài văn nghị luận (khoảng 600 chữ) bàn về tinh thần trách nhiệm của người trẻ trước những vấn đề thời sự của quê hương, đất nước.
Yêu cầu:
1. Giải thích ý niệm về trách nhiệm công dân của người trẻ trong kỷ nguyên mới.
2. Nêu dẫn chứng người thật việc thật trong đời sống thực tế năm 2024.
3. Phản biện thói vô cảm, bàng quan trước khó khăn của cộng đồng.
4. Rút ra bài học hành động cụ thể cho bản thân trong học tập và rèn luyện.`
        : '')
  );
  const [deadline, setDeadline] = useState(assignment?.deadline || '30/11/2024 23:59');

  // Criteria state
  const [criteria, setCriteria] = useState<RubricCriterion[]>(activeRubric.criteria);

  // Publish checklist
  const [checkPublicReport, setCheckPublicReport] = useState(false);

  // Calculate live total
  const totalWeight = criteria.reduce((sum, c) => sum + (Number(c.weight) || 0), 0);
  const isValidTotal = Math.abs(totalWeight - 10.0) < 0.01;

  const handleWeightChange = (id: string, newWeight: number) => {
    const updated = criteria.map((c) => (c.id === id ? { ...c, weight: newWeight } : c));
    setCriteria(updated);
    updateRubricCriterion(id, { weight: newWeight });
  };

  const handleSaveDraft = () => {
    const targetId = isNew ? `assign-draft-${Date.now()}` : assignmentId;
    publishAssignment(targetId, {
      title,
      studentTitle: title,
      topic: title,
      instructions,
      deadline,
      status: 'draft',
      statusLabel: 'Bản nháp',
    });
    addToast(`Đã lưu bản nháp đề bài "${title}" thành công.`, 'success');
    router.push('/assignments');
  };

  const handlePublish = () => {
    if (!isValidTotal) {
      addToast(`Tổng điểm Rubric hiện tại là ${totalWeight.toFixed(1)}đ. Tổng điểm bắt buộc phải bằng 10.0đ.`, 'error');
      return;
    }

    const targetId = isNew ? `assign-new-${Date.now()}` : assignmentId;
    publishAssignment(targetId, {
      title,
      studentTitle: title,
      topic: title,
      instructions,
      deadline,
      status: 'published',
      statusLabel: 'Đã giao',
    });
    addToast(`Đã áp dụng Barem Rubric v1.4 và giao đề "${title}" thành công cho Lớp 12A1!`, 'success');
    router.push('/assignments');
  };

  return (
    <TeacherShell
      breadcrumb={
        <div className="flex items-center gap-space-xs font-label-md text-sm text-on-surface-variant">
          <Link href="/assignments" className="hover:text-primary">
            Quản lý bài tập
          </Link>
          <span className="text-outline-variant">/</span>
          <span className="text-on-surface font-semibold">Soạn đề &amp; Cấu hình Rubric GDPT 2018</span>
        </div>
      }
    >
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top Header Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-outline-variant/20">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs bg-primary-fixed text-primary font-bold px-2 py-0.5 rounded-full">
                Barem Rubric v1.4
              </span>
              <span className="text-xs text-on-surface-variant font-medium">Bản chuẩn sư phạm 2024</span>
            </div>
            <h1 className="font-headline-lg text-2xl font-bold text-on-surface font-merriweather">
              Cấu hình Đề bài &amp; Thang tiêu chí Rubric
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveDraft}
              className="px-4 py-2 rounded-lg border border-outline-variant/60 bg-surface-container-lowest text-xs font-medium text-on-surface hover:bg-surface-container transition-all shadow-sm"
            >
              Lưu bản nháp
            </button>
            <button
              onClick={handlePublish}
              className="px-4 py-2 rounded-lg bg-primary-container text-on-primary-container text-xs font-bold hover:brightness-95 transition-all shadow-sm flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">verified</span>
              <span>Xác nhận Rubric &amp; Giao bài</span>
            </button>
          </div>
        </div>

        {/* Version preservation warning banner */}
        <div className="p-3.5 bg-surface-container-low/70 border border-outline-variant/30 rounded-xl flex items-center gap-3 text-xs text-on-surface-variant">
          <span className="material-symbols-outlined text-secondary text-lg">history_edu</span>
          <span>
            <strong>Lưu ý bảo toàn phiên bản:</strong> Các bài thi đã được chấm trước đó sẽ giữ nguyên phiên bản Rubric tại thời điểm chấm. Mọi điều chỉnh sau khi giao đề sẽ được áp dụng cho các lượt chấm mới.
          </span>
        </div>

        {/* Two-Column Editor Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Main Left Column (7 cols): Prompt & Criteria */}
          <div className="lg:col-span-8 space-y-6">
            {/* 1. Thông tin đề bài */}
            <div className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/30 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
                <span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm">edit_document</span>
                  1. Thông tin đề bài &amp; Yêu cầu sư phạm
                </span>
                <span className="text-xs text-on-surface-variant font-medium">Khối 12 THPT Đan Phượng</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-on-surface mb-1">Tiêu đề bài viết</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-semibold rounded-lg border border-outline-variant/60 bg-surface text-on-surface focus:outline-none focus:border-secondary font-merriweather"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-semibold text-on-surface mb-1">Lớp áp dụng</label>
                  <input
                    type="text"
                    disabled
                    value="Lớp 12A1 • THPT Đan Phượng (40 HS)"
                    className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 bg-surface-container-low text-on-surface-variant"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-on-surface mb-1">Hạn nộp bài</label>
                  <input
                    type="text"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-outline-variant/60 bg-surface text-on-surface focus:outline-none focus:border-secondary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-on-surface mb-1">
                  Đoạn lệnh đề bài &amp; Hướng dẫn triển khai (~600 chữ)
                </label>
                <div className="flex items-center gap-1 p-1 bg-surface-container-low rounded-t-lg border border-outline-variant/60 border-b-0 text-on-surface-variant text-xs">
                  <button type="button" className="p-1 hover:bg-surface-container rounded font-bold">B</button>
                  <button type="button" className="p-1 hover:bg-surface-container rounded italic font-serif">I</button>
                  <button type="button" className="p-1 hover:bg-surface-container rounded font-serif">“ ”</button>
                  <span className="text-[11px] text-outline ml-auto mr-2">Định dạng hỗ trợ soạn thảo</span>
                </div>
                <textarea
                  rows={6}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  className="w-full p-3 text-xs rounded-b-lg border border-outline-variant/60 bg-surface text-on-surface focus:outline-none focus:border-secondary font-merriweather leading-relaxed"
                />
              </div>
            </div>

            {/* 2. Barem Rubric (4 criteria totaling 10.0) */}
            <div className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/30 shadow-sm space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-outline-variant/20">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm">format_list_numbered</span>
                    2. Barem Rubric Đánh giá chi tiết (Tổng 10.0đ)
                  </span>
                  <span className="text-[11px] text-on-surface-variant">
                    Chuẩn hóa theo định dạng JSON Schema SRS §7.1
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-on-surface-variant font-medium">Tổng điểm:</span>
                  <span
                    className={`text-sm font-bold px-2.5 py-0.5 rounded-full font-mono ${
                      isValidTotal
                        ? 'bg-tertiary-container/30 text-tertiary'
                        : 'bg-error-container text-error animate-pulse'
                    }`}
                  >
                    {totalWeight.toFixed(1)} / 10.0đ
                  </span>
                  {isValidTotal && (
                    <span className="text-xs text-tertiary font-semibold flex items-center gap-0.5">
                      <span className="material-symbols-outlined text-sm">check_circle</span>
                      Hợp lệ 100%
                    </span>
                  )}
                </div>
              </div>

              {!isValidTotal && (
                <div className="p-3 bg-error-container/50 border border-error/30 rounded-lg text-xs text-error flex items-center gap-2">
                  <span className="material-symbols-outlined text-base">error</span>
                  <span>
                    Tổng điểm các tiêu chí phải bằng đúng 10.0đ (Hiện tại: {totalWeight.toFixed(1)}đ). Hãy điều chỉnh lại điểm của các tiêu chí dưới đây.
                  </span>
                </div>
              )}

              {/* Criteria Cards */}
              <div className="space-y-4">
                {criteria.map((c) => (
                  <div
                    key={c.id}
                    className="p-4 bg-surface-container-low/40 rounded-xl border border-outline-variant/30 space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2 border-b border-outline-variant/20">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold bg-surface-container px-2 py-0.5 rounded text-secondary">
                          {c.id}
                        </span>
                        <span className="text-xs sm:text-sm font-bold text-on-surface">{c.name}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-on-surface-variant">Điểm tối đa:</span>
                        <input
                          type="number"
                          step="0.25"
                          min="0"
                          max="10"
                          value={c.weight}
                          onChange={(e) => handleWeightChange(c.id, parseFloat(e.target.value) || 0)}
                          className="w-16 px-2 py-1 text-xs font-bold text-center rounded border border-outline-variant/60 bg-surface-container-lowest text-primary font-mono focus:outline-none focus:border-secondary"
                        />
                        <span className="text-xs text-on-surface-variant font-medium">điểm</span>
                      </div>
                    </div>

                    {/* Levels breakdown */}
                    {c.levels && (
                      <div className="space-y-1.5 text-xs">
                        <span className="text-[10px] font-semibold text-outline uppercase tracking-wider block">
                          Các mức đánh giá (Levels):
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          {c.levels.map((lvl, idx) => (
                            <div
                              key={idx}
                              className="p-2.5 bg-surface-container-lowest rounded-lg border border-outline-variant/30"
                            >
                              <span className="font-bold text-primary font-mono text-xs block mb-0.5">
                                {lvl.score.toFixed(1)} điểm
                              </span>
                              <p className="text-[11px] text-on-surface-variant leading-relaxed">
                                {lvl.descriptor}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Required elements if present */}
                    {c.requiredElements && (
                      <div className="p-2.5 bg-surface-container-lowest rounded-lg border border-outline-variant/30 text-xs">
                        <span className="text-[10px] font-semibold text-outline uppercase tracking-wider block mb-1">
                          Các yếu tố bắt buộc (Required Elements):
                        </span>
                        <ul className="list-disc list-inside space-y-0.5 text-[11px] text-on-surface-variant">
                          {c.requiredElements.map((el, idx) => (
                            <li key={idx}>{el}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Penalty notice if present */}
                    {c.penaltyPerError && (
                      <div className="p-2.5 bg-[#FEF9C3] rounded-lg border border-[#FDE047] text-xs text-[#CA8A04] flex items-center justify-between">
                        <span>Quy chuẩn trừ điểm vi phạm: <strong>-{c.penaltyPerError}đ / lỗi</strong> chính tả, câu què cụt</span>
                        <span className="text-[10px] font-semibold">Tối đa trừ {c.weight}đ</span>
                      </div>
                    )}

                    {/* Anti-patterns if present */}
                    {c.antiPatterns && (
                      <div className="text-[11px] text-on-surface-variant flex items-center gap-2">
                        <span className="text-outline font-semibold">Mẫu chống (Anti-patterns):</span>
                        {c.antiPatterns.map((ap, idx) => (
                          <span key={idx} className="bg-error-container/50 text-error px-2 py-0.5 rounded text-[10px]">
                            {ap}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => addToast('Chức năng thêm tiêu chí mở rộng đã ghi nhận mẫu.', 'info')}
                  className="px-3.5 py-2 rounded-lg border border-dashed border-outline-variant/80 text-xs text-secondary hover:bg-surface-container-low transition-all w-full flex items-center justify-center gap-1.5 font-medium"
                >
                  <span className="material-symbols-outlined text-base">add</span>
                  <span>Thêm tiêu chí đánh giá mới</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Column (4 cols): Linked Materials, Goals, Checklist */}
          <div className="lg:col-span-4 space-y-5">
            {/* Học liệu liên kết */}
            <div className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant/30 shadow-sm space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
                <span className="text-xs font-bold uppercase tracking-wider text-on-surface flex items-center gap-1">
                  <span className="material-symbols-outlined text-base text-secondary">menu_book</span>
                  Học liệu liên kết (2)
                </span>
                <span className="text-[10px] text-tertiary font-bold bg-tertiary-container/30 px-2 py-0.2 rounded">
                  Sẵn sàng
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="p-2.5 bg-surface-container-low/50 rounded-lg border border-outline-variant/20 flex items-start gap-2">
                  <span className="material-symbols-outlined text-secondary text-base mt-0.5">description</span>
                  <div className="flex-1">
                    <p className="font-semibold text-on-surface">Văn bản đọc hiểu số 04</p>
                    <p className="text-[11px] text-on-surface-variant">Ý nghĩa của tinh thần tự chủ trong thời đại số</p>
                  </div>
                </div>

                <div className="p-2.5 bg-surface-container-low/50 rounded-lg border border-outline-variant/20 flex items-start gap-2">
                  <span className="material-symbols-outlined text-primary text-base mt-0.5">gavel</span>
                  <div className="flex-1">
                    <p className="font-semibold text-on-surface">Barem thang điểm 2024</p>
                    <p className="text-[11px] text-on-surface-variant">Barem 4 tiêu chí chuẩn GDPT 2018</p>
                  </div>
                </div>
              </div>

              <Link
                href="/materials"
                className="w-full py-1.5 rounded border border-outline-variant/50 text-[11px] text-secondary font-semibold hover:bg-surface-container transition-all flex items-center justify-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                <span>Thêm học liệu từ Kho lưu trữ</span>
              </Link>
            </div>

            {/* Mục tiêu học tập gắn với tiêu chí */}
            <div className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant/30 shadow-sm space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-on-surface block pb-2 border-b border-outline-variant/20">
                Mục tiêu dạy học (Sư phạm)
              </span>

              <div className="space-y-2 text-xs">
                <div className="p-2.5 bg-surface-container-low/50 rounded-lg border-l-2 border-primary">
                  <p className="font-medium text-on-surface">1. Bố cục mạch lạc 3 phần</p>
                  <span className="text-[10px] text-outline">Gắn với C1 Bố cục</span>
                </div>
                <div className="p-2.5 bg-surface-container-low/50 rounded-lg border-l-2 border-primary">
                  <p className="font-medium text-on-surface">2. Đưa phản đề và dẫn chứng xác thực</p>
                  <span className="text-[10px] text-outline">Gắn với C2 Luận điểm</span>
                </div>
                <div className="p-2.5 bg-surface-container-low/50 rounded-lg border-l-2 border-primary">
                  <p className="font-medium text-on-surface">3. Tinh gọn câu phức, sạch lỗi chính tả</p>
                  <span className="text-[10px] text-outline">Gắn với C3 Diễn đạt</span>
                </div>
              </div>
            </div>

            {/* Checklist trước khi giao bài */}
            <div className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant/30 shadow-sm space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-on-surface block pb-2 border-b border-outline-variant/20">
                Điều kiện giao bài (Checklist)
              </span>

              <div className="space-y-2 text-xs text-on-surface">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked disabled className="rounded text-tertiary" />
                  <span className="text-tertiary font-medium">Đã liên kết học liệu sẵn sàng</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={isValidTotal} disabled className="rounded text-tertiary" />
                  <span className={isValidTotal ? 'text-tertiary font-medium' : 'text-error'}>
                    Tổng điểm Rubric đúng 10.0 điểm
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked disabled className="rounded text-tertiary" />
                  <span className="text-tertiary font-medium">Có đầy đủ phản đề và dẫn chứng</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checkPublicReport}
                    onChange={(e) => setCheckPublicReport(e.target.checked)}
                    className="rounded text-secondary focus:ring-secondary"
                  />
                  <span>Công khai báo cáo kết quả cho học sinh</span>
                </label>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handlePublish}
                  className="w-full py-2.5 bg-primary-container text-on-primary-container font-bold text-xs rounded-lg hover:brightness-95 transition-all shadow-sm flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-base">send</span>
                  <span>Xác nhận &amp; Giao bài cho Lớp 12A1</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </TeacherShell>
  );
}

