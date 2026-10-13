'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import TeacherShell from '@/components/TeacherShell';
import {
  createTeacherAssignment,
  getTeacherAssignment,
  publishTeacherAssignment,
  updateTeacherAssignment,
} from '@/lib/api/teacher-assignments';
import { ApiError, type ApiTeacherAssignment, type AssignmentDraftInput } from '@/lib/api/types';
import { useAppStore } from '@/lib/store';

type Criterion = AssignmentDraftInput['rubric']['criteria'][number];

const baseInput: AssignmentDraftInput = {
  title: '',
  instructions: '',
  genre: 'NLXH',
  gradeLevel: 12,
  learningMaterialText: '',
  maxScore: '10.00',
  scoreStep: '0.25',
  rubric: {
    criteria: [
      { criterionId: 'C1', name: 'Bố cục & Luận điểm', weight: '5.00', descriptor: 'Hệ thống luận điểm mạch lạc, đúng trọng tâm đề bài.' },
      { criterionId: 'C2', name: 'Dẫn chứng & Diễn đạt', weight: '5.00', descriptor: 'Dẫn chứng thực tế, thuyết phục; diễn đạt chuẩn ngữ pháp.' },
    ],
  },
  dueAt: null,
};

function toInput(row: ApiTeacherAssignment): AssignmentDraftInput {
  return {
    code: row.code,
    title: row.title,
    instructions: row.instructions,
    genre: row.genre,
    gradeLevel: row.gradeLevel,
    learningMaterialText: row.learningMaterialText,
    rubric: row.rubric,
    maxScore: row.maxScore,
    scoreStep: row.scoreStep,
    dueAt: row.dueAt,
  };
}

export default function ApiTeacherAssignmentEditor() {
  const params = useParams();
  const router = useRouter();
  const addToast = useAppStore((state) => state.addToast);
  const id = String(params?.id ?? 'new');
  const isNew = id === 'new';

  const [input, setInput] = useState<AssignmentDraftInput>(baseInput);
  const [server, setServer] = useState<ApiTeacherAssignment | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [busy, setBusy] = useState<'save' | 'publish' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isNew) {
      void (async () => {
        try {
          const row = await getTeacherAssignment(id);
          setServer(row);
          setInput(toInput(row));
        } catch (cause) {
          setError(cause instanceof ApiError ? cause.message : 'Không tải được đề.');
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [id, isNew]);

  const total = useMemo(
    () => input.rubric.criteria.reduce((sum, item) => sum + (Number(item.weight) || 0), 0),
    [input.rubric.criteria],
  );
  const maxScoreNum = Number(input.maxScore) || 10.0;
  const isValidTotal = Math.abs(total - maxScoreNum) < 0.01;

  const field = <K extends keyof AssignmentDraftInput>(key: K, value: AssignmentDraftInput[K]) => {
    setInput((prev) => ({ ...prev, [key]: value }));
  };

  const handleWeightChange = (criterionId: string, newWeight: string) => {
    setInput((prev) => ({
      ...prev,
      rubric: {
        criteria: prev.rubric.criteria.map((c) =>
          c.criterionId === criterionId ? { ...c, weight: newWeight } : c,
        ),
      },
    }));
  };

  const save = async () => {
    if (!input.title.trim()) {
      addToast('Vui lòng nhập tiêu đề bài viết.', 'warning');
      return;
    }
    setBusy('save');
    setError(null);
    try {
      const row = isNew
        ? await createTeacherAssignment(input)
        : await updateTeacherAssignment(id, input, server!.updatedAt);
      setServer(row);
      setInput(toInput(row));
      addToast(`Đã lưu bản nháp đề bài "${row.title}" thành công.`, 'success');
      if (isNew) {
        router.replace(`/assignments/${row.id}`);
      }
    } catch (cause) {
      const msg = cause instanceof ApiError ? cause.message : 'Không lưu được bản nháp.';
      setError(msg);
      addToast(msg, 'error');
    } finally {
      setBusy(null);
    }
  };

  const publish = async () => {
    if (!isValidTotal) {
      addToast(
        `Tổng điểm Rubric hiện tại là ${total.toFixed(1)}đ. Bắt buộc phải bằng đúng ${maxScoreNum.toFixed(1)}đ.`,
        'error',
      );
      return;
    }
    if (isNew) {
      await save();
      return;
    }
    setBusy('publish');
    setError(null);
    try {
      const row = await publishTeacherAssignment(id);
      setServer(row);
      setInput(toInput(row));
      addToast(`Đã xác nhận Rubric và công bố đề "${row.title}" (Mã: ${row.code})!`, 'success');
    } catch (cause) {
      const msg = cause instanceof ApiError ? cause.message : 'Không thể công bố đề.';
      setError(msg);
      addToast(msg, 'error');
    } finally {
      setBusy(null);
    }
  };

  const editable = !server || server.status === 'DRAFT';

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
                Barem Rubric GDPT 2018
              </span>
              <span className="text-xs text-on-surface-variant font-medium">
                {server ? `Mã đề: ${server.code}` : 'Tạo đề mới'}
              </span>
            </div>
            <h1 className="font-headline-lg text-2xl font-bold text-on-surface font-merriweather">
              {isNew ? 'Khởi tạo Đề bài & Cấu hình Rubric' : `Cấu hình: ${server?.title}`}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <button
              data-testid="assignment-save"
              disabled={!editable || busy !== null}
              onClick={() => void save()}
              className="px-4 py-2 rounded-lg border border-outline-variant/60 bg-surface-container-lowest text-xs font-medium text-on-surface hover:bg-surface-container transition-all shadow-sm disabled:opacity-40"
            >
              {busy === 'save' ? 'Đang lưu…' : 'Lưu bản nháp'}
            </button>
            <button
              data-testid="assignment-publish"
              disabled={!editable || busy !== null || !isValidTotal}
              onClick={() => void publish()}
              className="px-4 py-2 rounded-lg bg-primary-container text-on-primary-container text-xs font-bold hover:brightness-95 transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-[16px]">verified</span>
              <span>{busy === 'publish' ? 'Đang công bố…' : 'Xác nhận Rubric & Giao bài'}</span>
            </button>
          </div>
        </div>

        {/* Version preservation warning banner */}
        <div className="p-3.5 bg-surface-container-low/70 border border-outline-variant/30 rounded-xl flex items-center gap-3 text-xs text-on-surface-variant">
          <span className="material-symbols-outlined text-secondary text-lg">history_edu</span>
          <span>
            <strong>Lưu ý bảo toàn phiên bản:</strong> Các bài thi đã nộp sẽ giữ nguyên phiên bản Rubric tại thời điểm chấm. Khi đề đã công bố, cấu hình barem sẽ được khóa để đảm bảo tính khách quan.
          </span>
        </div>

        {error && (
          <div role="alert" className="p-3 rounded-lg border border-error/30 bg-error-container/40 text-xs text-error">
            {error}
          </div>
        )}

        {server?.status === 'PUBLISHED' && (
          <div className="p-4 rounded-xl border border-secondary/30 bg-secondary-fixed/20 text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <span className="font-semibold text-secondary block">Đề đã được công bố cho học sinh:</span>
              <span className="text-on-surface mt-0.5 block">
                Mã truy cập: <strong data-testid="assignment-code" className="font-mono text-sm text-secondary ml-1">{server.code}</strong>
              </span>
            </div>
            <button
              type="button"
              data-testid="assignment-copy-code"
              onClick={() => {
                void navigator.clipboard.writeText(server.code);
                addToast(`Đã sao chép mã đề: ${server.code}`, 'success');
              }}
              className="px-3 py-1.5 rounded-lg bg-surface-container-lowest border border-secondary/40 text-secondary font-bold hover:bg-secondary hover:text-white transition-all text-xs"
            >
              Sao chép mã đề
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-on-surface-variant">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            Đang tải dữ liệu đề...
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left 8 Cols: Form & Criteria */}
            <div className="lg:col-span-8 space-y-6">
              {/* 1. Thông tin đề bài */}
              <div className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/30 shadow-sm space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
                  <span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm">edit_document</span>
                    1. Thông tin đề bài &amp; Yêu cầu sư phạm
                  </span>
                  <span className="text-xs text-on-surface-variant font-medium">Khối {input.gradeLevel} THPT Đan Phượng</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-on-surface mb-1">Tiêu đề bài viết</label>
                  <input
                    data-testid="assignment-title"
                    disabled={!editable}
                    type="text"
                    value={input.title}
                    onChange={(e) => field('title', e.target.value)}
                    placeholder="VD: Nghị luận xã hội: Ý thức trách nhiệm của thanh niên..."
                    className="w-full px-3 py-2 text-sm font-semibold rounded-lg border border-outline-variant/60 bg-surface text-on-surface focus:outline-none focus:border-secondary font-merriweather disabled:opacity-60"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="block font-semibold text-on-surface mb-1">Dạng bài</label>
                    <select
                      data-testid="assignment-genre"
                      disabled={!editable}
                      value={input.genre}
                      onChange={(e) => field('genre', e.target.value as AssignmentDraftInput['genre'])}
                      className="w-full px-3 py-2 rounded-lg border border-outline-variant/60 bg-surface text-on-surface focus:outline-none focus:border-secondary disabled:opacity-60"
                    >
                      <option value="NLXH">Nghị luận xã hội (NLXH)</option>
                      <option value="NLVH">Nghị luận văn học (NLVH)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-on-surface mb-1">Khối lớp</label>
                    <select
                      disabled={!editable}
                      value={input.gradeLevel}
                      onChange={(e) => field('gradeLevel', Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg border border-outline-variant/60 bg-surface text-on-surface focus:outline-none focus:border-secondary disabled:opacity-60"
                    >
                      <option value={10}>Khối 10</option>
                      <option value={11}>Khối 11</option>
                      <option value={12}>Khối 12</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-on-surface mb-1">Hạn nộp (tùy chọn)</label>
                    <input
                      disabled={!editable}
                      type="datetime-local"
                      value={input.dueAt ? input.dueAt.slice(0, 16) : ''}
                      onChange={(e) => field('dueAt', e.target.value ? new Date(e.target.value).toISOString() : null)}
                      className="w-full px-3 py-2 rounded-lg border border-outline-variant/60 bg-surface text-on-surface focus:outline-none focus:border-secondary disabled:opacity-60"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-on-surface mb-1">
                    Đoạn lệnh đề bài &amp; Hướng dẫn triển khai (~600 chữ)
                  </label>
                  <textarea
                    data-testid="assignment-instructions"
                    disabled={!editable}
                    rows={5}
                    value={input.instructions}
                    onChange={(e) => field('instructions', e.target.value)}
                    placeholder="Nhập yêu cầu đề bài chi tiết..."
                    className="w-full p-3 text-xs rounded-lg border border-outline-variant/60 bg-surface text-on-surface focus:outline-none focus:border-secondary font-merriweather leading-relaxed disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-on-surface mb-1">
                    Ngữ liệu đọc hiểu đính kèm
                  </label>
                  <textarea
                    data-testid="assignment-material"
                    disabled={!editable}
                    rows={6}
                    value={input.learningMaterialText}
                    onChange={(e) => field('learningMaterialText', e.target.value)}
                    placeholder="Trích đoạn ngữ liệu đọc hiểu để học sinh tham chiếu khi viết..."
                    className="w-full p-3 text-xs rounded-lg border border-outline-variant/60 bg-surface text-on-surface focus:outline-none focus:border-secondary font-merriweather leading-relaxed disabled:opacity-60"
                  />
                </div>
              </div>

              {/* 2. Barem Rubric */}
              <div className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/30 shadow-sm space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-outline-variant/20">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-sm">format_list_numbered</span>
                      2. Barem Rubric Đánh giá chi tiết (Tổng {input.maxScore}đ)
                    </span>
                    <span className="text-[11px] text-on-surface-variant">
                      Chuẩn hóa theo định dạng barem Bộ GD&amp;ĐT
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
                      {total.toFixed(2)} / {maxScoreNum.toFixed(2)}đ
                    </span>
                    {isValidTotal && (
                      <span className="text-xs text-tertiary font-semibold flex items-center gap-0.5">
                        <span className="material-symbols-outlined text-sm">check_circle</span>
                        Hợp lệ
                      </span>
                    )}
                  </div>
                </div>

                {!isValidTotal && (
                  <div className="p-3 bg-error-container/50 border border-error/30 rounded-lg text-xs text-error flex items-center gap-2">
                    <span className="material-symbols-outlined text-base">error</span>
                    <span>
                      Tổng điểm các tiêu chí phải bằng đúng {maxScoreNum.toFixed(1)}đ (Hiện tại: {total.toFixed(2)}đ).
                    </span>
                  </div>
                )}

                {/* Criteria List */}
                <div className="space-y-4">
                  {input.rubric.criteria.map((c, index) => (
                    <div
                      key={c.criterionId}
                      className="p-4 bg-surface-container-low/40 rounded-xl border border-outline-variant/30 space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2 border-b border-outline-variant/20">
                        <div className="flex items-center gap-2 flex-1">
                          <input
                            disabled={!editable}
                            value={c.criterionId}
                            onChange={(e) => {
                              const updated = [...input.rubric.criteria];
                              updated[index] = { ...c, criterionId: e.target.value };
                              field('rubric', { criteria: updated });
                            }}
                            className="w-16 px-2 py-1 text-xs font-mono font-bold bg-surface-container text-secondary rounded border border-outline-variant/40"
                          />
                          <input
                            disabled={!editable}
                            value={c.name}
                            onChange={(e) => {
                              const updated = [...input.rubric.criteria];
                              updated[index] = { ...c, name: e.target.value };
                              field('rubric', { criteria: updated });
                            }}
                            placeholder="Tên tiêu chí..."
                            className="flex-1 px-2.5 py-1 text-xs sm:text-sm font-bold text-on-surface bg-surface rounded border border-outline-variant/50"
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-xs text-on-surface-variant">Điểm tối đa:</span>
                          <input
                            disabled={!editable}
                            type="number"
                            step="0.25"
                            min="0"
                            max="10"
                            value={c.weight}
                            onChange={(e) => handleWeightChange(c.criterionId, e.target.value)}
                            className="w-16 px-2 py-1 text-xs font-bold text-center rounded border border-outline-variant/60 bg-surface text-primary font-mono focus:outline-none focus:border-secondary"
                          />
                          <span className="text-xs text-on-surface-variant font-medium">điểm</span>

                          {editable && input.rubric.criteria.length > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                const updated = input.rubric.criteria.filter((_, i) => i !== index);
                                field('rubric', { criteria: updated });
                              }}
                              className="p-1 text-on-surface-variant hover:text-error"
                              title="Xóa tiêu chí"
                            >
                              <span className="material-symbols-outlined text-base">delete</span>
                            </button>
                          )}
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-outline uppercase tracking-wider mb-1">
                          Mô tả mức độ cần đạt (Descriptor):
                        </label>
                        <textarea
                          disabled={!editable}
                          rows={2}
                          value={c.descriptor ?? ''}
                          onChange={(e) => {
                            const updated = [...input.rubric.criteria];
                            updated[index] = { ...c, descriptor: e.target.value };
                            field('rubric', { criteria: updated });
                          }}
                          placeholder="Mô tả các yêu cầu cần đạt để đạt điểm tối đa..."
                          className="w-full p-2.5 text-xs rounded-lg border border-outline-variant/40 bg-surface text-on-surface focus:outline-none focus:border-secondary leading-relaxed disabled:opacity-60"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {editable && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        const nextId = `C${input.rubric.criteria.length + 1}`;
                        field('rubric', {
                          criteria: [
                            ...input.rubric.criteria,
                            { criterionId: nextId, name: '', weight: '0.00', descriptor: '' },
                          ],
                        });
                      }}
                      className="px-3.5 py-2 rounded-lg border border-dashed border-outline-variant/80 text-xs text-secondary hover:bg-surface-container-low transition-all w-full flex items-center justify-center gap-1.5 font-medium"
                    >
                      <span className="material-symbols-outlined text-base">add</span>
                      <span>Thêm tiêu chí đánh giá mới</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Right 4 Cols: Status & Guidelines */}
            <div className="lg:col-span-4 space-y-5">
              {/* Học liệu liên kết */}
              <div className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant/30 shadow-sm space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
                  <span className="text-xs font-bold uppercase tracking-wider text-on-surface flex items-center gap-1">
                    <span className="material-symbols-outlined text-base text-secondary">menu_book</span>
                    Tình trạng học liệu
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      input.learningMaterialText.trim()
                        ? 'bg-tertiary-container/30 text-tertiary'
                        : 'bg-[#FEF9C3] text-[#CA8A04]'
                    }`}
                  >
                    {input.learningMaterialText.trim() ? 'Đã nạp' : 'Chưa có'}
                  </span>
                </div>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Ngữ liệu đính kèm sẽ hiển thị ở Bước 1 để học sinh đọc hiểu và được Trợ lý Socratic tham chiếu khi gợi ý câu hỏi.
                </p>
              </div>

              {/* Socratic Goal */}
              <div className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant/30 shadow-sm space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
                  <span className="material-symbols-outlined text-base">psychology</span>
                  Định hướng sư phạm Socratic AI
                </div>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  AI sẽ dựa trên đoạn lệnh đề bài và thang điểm Rubric để đặt các câu hỏi gợi mở, giúp học sinh tự tìm tòi và hoàn thiện dàn ý 3 phần (Mở bài, Thân bài, Kết bài).
                </p>
              </div>

              {/* Checklist */}
              <div className="p-5 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm space-y-3">
                <span className="text-xs font-bold uppercase tracking-wider text-outline block">
                  Kiểm tra trước khi giao bài
                </span>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-on-surface-variant">
                    <span
                      className={`material-symbols-outlined text-sm ${
                        input.title.trim() ? 'text-tertiary' : 'text-outline-variant'
                      }`}
                    >
                      {input.title.trim() ? 'check_circle' : 'radio_button_unchecked'}
                    </span>
                    <span>Tiêu đề bài viết đã rõ ràng</span>
                  </div>
                  <div className="flex items-center gap-2 text-on-surface-variant">
                    <span
                      className={`material-symbols-outlined text-sm ${
                        isValidTotal ? 'text-tertiary' : 'text-outline-variant'
                      }`}
                    >
                      {isValidTotal ? 'check_circle' : 'radio_button_unchecked'}
                    </span>
                    <span>Tổng điểm Rubric bằng {maxScoreNum.toFixed(1)}đ</span>
                  </div>
                  <div className="flex items-center gap-2 text-on-surface-variant">
                    <span
                      className={`material-symbols-outlined text-sm ${
                        input.learningMaterialText.trim() ? 'text-tertiary' : 'text-outline-variant'
                      }`}
                    >
                      {input.learningMaterialText.trim() ? 'check_circle' : 'radio_button_unchecked'}
                    </span>
                    <span>Đã nạp văn bản ngữ liệu đọc hiểu</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </TeacherShell>
  );
}
