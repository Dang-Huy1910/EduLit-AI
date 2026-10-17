'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import TeacherShell from '@/components/TeacherShell';
import { useAppStore } from '@/lib/store';
import { RubricCriterion, Rubric } from '@/lib/types';
import {
  CENTRAL_ASSIGNMENT_ID,
  CENTRAL_ASSIGNMENT,
  CENTRAL_RUBRIC_ID,
  RUBRIC_CAPACITY_CREATIVE_ID,
} from '@/lib/mock/assignmentData';

export default function AssignmentEditorPage() {
  const params = useParams();
  const router = useRouter();
  const {
    assignments,
    activeRubric,
    rubrics,
    selectAssignmentRubric,
    setActiveRubricById,
    updateRubricCriterion,
    publishAssignment,
    addToast,
  } = useAppStore();

  const assignmentId = (params?.id as string) || CENTRAL_ASSIGNMENT_ID;
  const isNew = assignmentId === 'new';
  const assignment = assignments.find((a) => a.id === assignmentId) || CENTRAL_ASSIGNMENT;

  const [title, setTitle] = useState(assignment.title);
  const [instructions, setInstructions] = useState(assignment.instructions);
  const [deadline, setDeadline] = useState(assignment.deadline || '20/10/2026 23:59');

  // Selected rubric state for this assignment
  const initialRubric =
    rubrics.find((r) => r.id === assignment.rubricId) ||
    rubrics.find((r) => r.id === activeRubric.id) ||
    rubrics[0] ||
    activeRubric;
  const [selectedRubricId, setSelectedRubricId] = useState<string>(initialRubric.id);
  const currentRubric = rubrics.find((r) => r.id === selectedRubricId) || initialRubric;

  // Criteria state
  const [criteria, setCriteria] = useState<RubricCriterion[]>(currentRubric.criteria);

  // Switch rubric handler
  const handleSelectRubric = (newRubricId: string) => {
    setSelectedRubricId(newRubricId);
    const chosen = rubrics.find((r) => r.id === newRubricId);
    if (chosen) {
      setCriteria(chosen.criteria);
      setActiveRubricById(newRubricId);
      addToast(
        `Đã chuyển sang ${chosen.shortTitle || chosen.name} (${chosen.criteria.length} tiêu chí) cho đề bài này!`,
        'success'
      );
    }
  };

  // Publish checklist
  const [checkPublicReport, setCheckPublicReport] = useState(false);

  // Calculate live total (Thang điểm 4.0)
  const totalWeight = criteria.reduce((sum, c) => sum + (Number(c.weight) || 0), 0);
  const isValidTotal = Math.abs(totalWeight - 4.0) < 0.01;

  const handleWeightChange = (id: string, newWeight: number) => {
    const updated = criteria.map((c) => (c.id === id ? { ...c, weight: newWeight } : c));
    setCriteria(updated);
    updateRubricCriterion(id, { weight: newWeight });
  };

  const handleSaveDraft = () => {
    const targetId = isNew ? CENTRAL_ASSIGNMENT_ID : assignmentId;
    publishAssignment(targetId, {
      title,
      studentTitle: title,
      topic: title,
      instructions,
      deadline,
      rubricId: selectedRubricId,
      status: 'draft',
      statusLabel: 'Bản nháp',
    });
    addToast(`Đã lưu bản nháp đề bài "${title}" thành công.`, 'success');
    router.push('/assignments');
  };

  const handlePublish = () => {
    if (!isValidTotal) {
      addToast(`Tổng điểm Rubric hiện tại là ${totalWeight.toFixed(2)}đ. Tổng điểm bắt buộc phải bằng 4.0đ.`, 'error');
      return;
    }

    const targetId = isNew ? CENTRAL_ASSIGNMENT_ID : assignmentId;
    publishAssignment(targetId, {
      title,
      studentTitle: title,
      topic: title,
      instructions,
      deadline,
      rubricId: selectedRubricId,
      status: 'published',
      statusLabel: 'Đang mở nộp bài',
    });
    addToast(`Đã áp dụng ${currentRubric.shortTitle || currentRubric.name} và giao đề "${title}" thành công cho Lớp 11A14!`, 'success');
    router.push('/assignments');
  };

  const handleLoadDemoTemplate = () => {
    setTitle(CENTRAL_ASSIGNMENT.title);
    setInstructions(CENTRAL_ASSIGNMENT.instructions);
    setDeadline(CENTRAL_ASSIGNMENT.deadline || '28/10/2026 23:59');
    setSelectedRubricId(CENTRAL_RUBRIC_ID);
    const chosen = rubrics.find((r) => r.id === CENTRAL_RUBRIC_ID) || rubrics[0];
    if (chosen) {
      setCriteria(chosen.criteria);
      setActiveRubricById(chosen.id);
    }
    addToast('Đã nạp lại mẫu đề bài: "Màu tự do của đất" (Trần Quang Quý)', 'info');
  };

  return (
    <TeacherShell
      breadcrumb={
        <div className="flex items-center gap-space-xs font-label-md text-sm text-on-surface-variant">
          <Link href="/assignments" className="hover:text-primary">
            Quản lý bài tập
          </Link>
          <span className="text-outline-variant">/</span>
          <span className="text-on-surface font-semibold">
            {isNew ? 'Tạo bài tập mới cho lớp' : 'Soạn đề & Cấu hình Rubric GDPT 2018'}
          </span>
        </div>
      }
    >
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top Header Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-outline-variant/20">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs bg-primary-fixed text-primary font-bold px-2 py-0.5 rounded-full font-mono">
                {currentRubric.version}
              </span>
              <span className="text-xs text-on-surface-variant font-medium">
                {currentRubric.shortTitle || currentRubric.name}
              </span>
            </div>
            <h1 className="font-headline-lg text-2xl font-bold text-on-surface font-merriweather">
              {isNew ? 'Tạo đề bài mới & Thiết lập Rubric GDPT 2018' : 'Cấu hình Đề bài & Thang tiêu chí Rubric'}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {isNew && (
              <button
                type="button"
                onClick={handleLoadDemoTemplate}
                className="px-3 py-2 rounded-lg border border-secondary/40 text-secondary bg-surface-container-lowest text-xs font-semibold hover:bg-secondary/10 transition-all flex items-center gap-1.5 shadow-sm"
              >
                <span className="material-symbols-outlined text-[16px]">restart_alt</span>
                <span>Nạp mẫu demo</span>
              </button>
            )}
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
              <span>Xác nhận Rubric &amp; Giao bài cho Lớp 11A14</span>
            </button>
          </div>
        </div>

        {/* Banner for New Assignment Demo */}
        {isNew && (
          <div className="p-4 bg-primary-container/20 border border-primary/30 rounded-xl flex items-start gap-3 text-xs text-on-surface">
            <span className="material-symbols-outlined text-primary text-xl mt-0.5">auto_awesome</span>
            <div className="space-y-1">
              <p className="font-semibold text-primary">
                Quy trình demo: Giáo viên khởi tạo và giao đề bài mới
              </p>
              <p className="text-on-surface-variant leading-relaxed">
                Hệ thống đã nạp sẵn ngữ liệu bài thơ <strong>&quot;Màu tự do của đất&quot; (Trần Quang Quý)</strong> và hướng dẫn chấm từ file DOCX gốc. Cô giáo chỉ cần chọn Barem phù hợp (Chuẩn 4 tiêu chí hoặc Năng lực sáng tạo 5 tiêu chí), tinh chỉnh trọng số nếu muốn, rồi bấm <strong>&quot;Xác nhận Rubric &amp; Giao bài cho Lớp 11A14&quot;</strong>.
              </p>
            </div>
          </div>
        )}

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
                <span className="text-xs text-on-surface-variant font-medium">Khối 11 THPT Đan Phượng</span>
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
                    value="Lớp 11A14 • THPT Đan Phượng (41 HS)"
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

            {/* 2. Barem Rubric (4 criteria totaling 4.0) */}
            <div className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/30 shadow-sm space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-outline-variant/20">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm">format_list_numbered</span>
                    2. Barem Rubric Đánh giá chi tiết (Tổng 4.0đ)
                  </span>
                  <span className="text-[11px] text-on-surface-variant">
                    Chuẩn hóa theo định dạng JSON Schema GDPT 2018 (Thang 4.0đ)
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
                    {totalWeight.toFixed(2)} / 4.0đ
                  </span>
                  {isValidTotal && (
                    <span className="text-xs text-tertiary font-semibold flex items-center gap-0.5">
                      <span className="material-symbols-outlined text-sm">check_circle</span>
                      Hợp lệ 100%
                    </span>
                  )}
                </div>
              </div>

              {/* Barem Template Selector Cards */}
              <div className="p-4 bg-surface-container-low/60 rounded-xl border border-outline-variant/40 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-secondary text-base">rule_folder</span>
                    <label className="text-xs font-bold text-on-surface">
                      Chọn Barem đánh giá áp dụng cho đề này:
                    </label>
                  </div>
                  <span className="text-[11px] text-on-surface-variant font-medium">
                    (Hệ thống hỗ trợ nhiều barem GDPT 2018 theo từng mục tiêu kiểm tra)
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {rubrics.map((r) => {
                    const isSelected = r.id === selectedRubricId;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => handleSelectRubric(r.id)}
                        className={`p-3.5 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
                          isSelected
                            ? 'bg-surface-container-lowest border-secondary ring-2 ring-secondary/25 shadow-xs'
                            : 'bg-surface-container-lowest/70 border-outline-variant/50 hover:border-outline hover:bg-surface-container-lowest'
                        }`}
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-on-surface flex items-center gap-2">
                              <span
                                className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                  isSelected
                                    ? 'border-secondary bg-secondary'
                                    : 'border-outline-variant bg-transparent'
                                }`}
                              >
                                {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white"></span>}
                              </span>
                              <span>{r.shortTitle || r.name}</span>
                            </span>
                            <span className="text-[10px] font-mono font-bold bg-primary-fixed text-primary px-1.5 py-0.2 rounded-full shrink-0">
                              {r.version}
                            </span>
                          </div>

                          <p className="text-[11px] text-on-surface-variant leading-relaxed pl-6">
                            {r.description || `Thang điểm ${r.maxScore}đ gồm ${r.criteria.length} tiêu chí đánh giá GDPT 2018.`}
                          </p>
                        </div>

                        <div className="mt-3 pt-2.5 border-t border-outline-variant/20 pl-6 flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-secondary flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm">checklist</span>
                            <span>{r.criteria.length} tiêu chí • Tổng {r.maxScore.toFixed(1)}đ</span>
                          </span>
                          {isSelected ? (
                            <span className="text-tertiary font-bold flex items-center gap-0.5">
                              <span className="material-symbols-outlined text-sm">check_circle</span>
                              Đang áp dụng cho đề này
                            </span>
                          ) : (
                            <span className="text-primary font-medium hover:underline flex items-center gap-0.5">
                              <span>Chọn barem này</span>
                              <span className="material-symbols-outlined text-xs">arrow_forward</span>
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {!isValidTotal && (
                <div className="p-3 bg-error-container/50 border border-error/30 rounded-lg text-xs text-error flex items-center gap-2">
                  <span className="material-symbols-outlined text-base">error</span>
                  <span>
                    Tổng điểm các tiêu chí phải bằng đúng 4.0đ (Hiện tại: {totalWeight.toFixed(2)}đ). Hãy điều chỉnh lại điểm của các tiêu chí dưới đây.
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
                  Học liệu liên kết (3)
                </span>
                <span className="text-[10px] text-tertiary font-bold bg-tertiary-container/30 px-2 py-0.2 rounded">
                  Sẵn sàng
                </span>
              </div>

              <div className="space-y-2 text-xs">
                {/* 1. Ngữ liệu chính */}
                <div className="p-2.5 bg-surface-container-low/50 rounded-lg border border-outline-variant/20 flex items-start gap-2">
                  <span className="material-symbols-outlined text-secondary text-base mt-0.5">description</span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-on-surface">Ngữ liệu chính: Bài thơ &quot;Màu tự do của đất&quot;</p>
                      <span className="text-[9px] font-bold text-secondary bg-secondary-fixed/50 px-1.5 py-0.2 rounded">
                        Ngữ liệu
                      </span>
                    </div>
                    <p className="text-[11px] text-on-surface-variant">Tác giả: Trần Quang Quý • Báo Văn nghệ số Tết 2019</p>
                  </div>
                </div>

                {/* 2. Barem 1: Chuẩn 4 Tiêu chí */}
                <div
                  onClick={() => handleSelectRubric(CENTRAL_RUBRIC_ID)}
                  className={`p-2.5 rounded-lg border transition-all cursor-pointer flex items-start gap-2 ${
                    currentRubric.id === CENTRAL_RUBRIC_ID
                      ? 'bg-secondary-fixed/20 border-secondary ring-1 ring-secondary/50 shadow-xs'
                      : 'bg-surface-container-low/50 border-outline-variant/20 hover:border-outline-variant/60'
                  }`}
                >
                  <span className="material-symbols-outlined text-primary text-base mt-0.5">gavel</span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-on-surface">Barem 1: Hướng dẫn chấm gốc DOCX (4 Tiêu chí)</p>
                      {currentRubric.id === CENTRAL_RUBRIC_ID ? (
                        <span className="text-[9px] font-bold text-tertiary bg-tertiary-container/40 px-1.5 py-0.2 rounded flex items-center gap-0.5">
                          <span className="material-symbols-outlined text-[11px]">check</span>
                          Đang áp dụng
                        </span>
                      ) : (
                        <span className="text-[9px] text-outline hover:text-primary font-medium">Bấm để chọn</span>
                      )}
                    </div>
                    <p className="text-[11px] text-on-surface-variant">
                      Thang 4.0 điểm • Chuẩn Bộ GD&amp;ĐT (v2.0-GDPT2018)
                    </p>
                  </div>
                </div>

                {/* 3. Barem 2: Năng lực & Sáng tạo 5 Tiêu chí */}
                <div
                  onClick={() => handleSelectRubric(RUBRIC_CAPACITY_CREATIVE_ID)}
                  className={`p-2.5 rounded-lg border transition-all cursor-pointer flex items-start gap-2 ${
                    currentRubric.id === RUBRIC_CAPACITY_CREATIVE_ID
                      ? 'bg-secondary-fixed/20 border-secondary ring-1 ring-secondary/50 shadow-xs'
                      : 'bg-surface-container-low/50 border-outline-variant/20 hover:border-outline-variant/60'
                  }`}
                >
                  <span className="material-symbols-outlined text-purple-600 text-base mt-0.5">auto_awesome</span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-on-surface">Barem 2: Barem Năng lực &amp; Sáng tạo (5 Tiêu chí)</p>
                      {currentRubric.id === RUBRIC_CAPACITY_CREATIVE_ID ? (
                        <span className="text-[9px] font-bold text-tertiary bg-tertiary-container/40 px-1.5 py-0.2 rounded flex items-center gap-0.5">
                          <span className="material-symbols-outlined text-[11px]">check</span>
                          Đang áp dụng
                        </span>
                      ) : (
                        <span className="text-[9px] text-outline hover:text-primary font-medium">Bấm để chọn</span>
                      )}
                    </div>
                    <p className="text-[11px] text-on-surface-variant">
                      Thang 4.0 điểm • Chuẩn Sở GD&amp;ĐT Hà Nội (v2.2-NLC-2024)
                    </p>
                  </div>
                </div>
              </div>

              <Link
                href="/materials"
                className="w-full py-1.5 rounded border border-outline-variant/50 text-[11px] text-secondary font-semibold hover:bg-surface-container transition-all flex items-center justify-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">menu_book</span>
                <span>Xem toàn văn ngữ liệu &amp; Ghi chú rà soát</span>
              </Link>
            </div>

            {/* Mục tiêu học tập gắn với tiêu chí */}
            <div className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant/30 shadow-sm space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
                <span className="text-xs font-bold uppercase tracking-wider text-on-surface">
                  Mục tiêu dạy học (Sư phạm)
                </span>
                <span className="text-[10px] text-primary font-bold font-mono">
                  {currentRubric.criteria.length} tiêu chí
                </span>
              </div>

              <div className="space-y-2 text-xs">
                {currentRubric.criteria.map((c, idx) => (
                  <div key={c.id} className="p-2.5 bg-surface-container-low/50 rounded-lg border-l-2 border-primary space-y-0.5">
                    <p className="font-medium text-on-surface">
                      {idx + 1}. {c.name}
                    </p>
                    <div className="flex items-center justify-between text-[10px] text-outline">
                      <span>Mã tiêu chí: {c.id}</span>
                      <span className="font-bold text-secondary">Tối đa {c.weight.toFixed(2)}đ</span>
                    </div>
                  </div>
                ))}
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
                  <span className="text-tertiary font-medium">Đã liên kết ngữ liệu &quot;Màu tự do của đất&quot;</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={isValidTotal} disabled className="rounded text-tertiary" />
                  <span className={isValidTotal ? 'text-tertiary font-medium' : 'text-error'}>
                    Tổng điểm Rubric đúng 4.0 điểm
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked disabled className="rounded text-tertiary" />
                  <span className="text-tertiary font-medium">Có yêu cầu liên hệ tác phẩm ngoài</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checkPublicReport}
                    onChange={(e) => setCheckPublicReport(e.target.checked)}
                    className="rounded text-secondary focus:ring-secondary"
                  />
                  <span>Công khai kết quả đánh giá cho học sinh</span>
                </label>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handlePublish}
                  className="w-full py-2.5 bg-primary-container text-on-primary-container font-bold text-xs rounded-lg hover:brightness-95 transition-all shadow-sm flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-base">send</span>
                  <span>Xác nhận &amp; Giao bài cho Lớp 11A14</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </TeacherShell>
  );
}

