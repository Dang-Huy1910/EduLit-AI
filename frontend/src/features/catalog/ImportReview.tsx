'use client';

import React, { useEffect, useState } from 'react';
import { AuthApiError } from '@/lib/auth-types';
import { catalogApi } from './api';
import SafeMarkdown from './SafeMarkdown';
import {
  CatalogTopic,
  DocumentAnalysis,
  ExtractedMaterialDraft,
  ExtractedPromptDraft,
  ExtractedRubricDraft,
  IMPORT_FORMAT_HELP,
  TeacherDocument,
} from './types';

const PROCESSING = new Set(['UPLOADED', 'CONVERTING', 'ANALYZING']);

function emptyAnalysis(): DocumentAnalysis {
  return { documentKind: 'MIXED', materials: [], prompts: [], rubrics: [], warnings: [], missing: [] };
}

export default function ImportReview({
  documentId,
  topics,
  onClose,
  onConfirmed,
}: {
  documentId: string;
  topics: CatalogTopic[];
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const [doc, setDoc] = useState<TeacherDocument | null>(null);
  const [markdown, setMarkdown] = useState('');
  const [draft, setDraft] = useState<DocumentAnalysis>(emptyAnalysis());
  const [selected, setSelected] = useState<string[]>([]);
  const [intent, setIntent] = useState('MIXED');
  const [gradeLevel, setGradeLevel] = useState(11);
  const [genre, setGenre] = useState('NLVH');
  const [topicId, setTopicId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = async () => {
    const payload = await catalogApi.getDocument(documentId);
    setDoc(payload);
    setMarkdown(payload.markdown || payload.convertedMarkdown || '');
    setDraft(payload.draft || payload.analysis || emptyAnalysis());
    setSelected(payload.selectedItemIds || []);
    setIntent(payload.intent || 'MIXED');
    setGradeLevel(payload.gradeLevel || 11);
    setGenre(payload.genre || 'NLVH');
    setTopicId(payload.topicId || '');
    return payload;
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const payload = await load();
        if (cancelled) return;
        setError(payload.errorMessage || '');
      } catch (err) {
        if (!cancelled) setError(err instanceof AuthApiError ? err.message : 'Không tải được bản import.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  useEffect(() => {
    if (!doc || !PROCESSING.has(doc.status)) return;
    const timer = window.setInterval(() => {
      void load().catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [doc?.status, documentId]);

  const persistDraft = async (next = draft, nextMarkdown = markdown, nextSelected = selected) => {
    return catalogApi.saveDocumentDraft(documentId, {
      markdown: nextMarkdown,
      draft: next,
      selectedItemIds: nextSelected,
      intent,
      gradeLevel,
      genre,
      topicId: topicId || null,
    });
  };

  const handleDownload = async () => {
    try {
      const { blob, filename } = await catalogApi.downloadDocumentOriginal(documentId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : 'Không tải được file gốc.');
    }
  };

  const handleAnalyze = async () => {
    setBusy('analyze');
    setError('');
    try {
      const saved = await persistDraft();
      const payload = await catalogApi.analyzeDocument(documentId, {
        markdown,
        expectedMarkdownSha256: saved.markdownSha256,
      });
      setDoc(payload);
      setMarkdown(payload.markdown || markdown);
      setDraft(payload.draft || payload.analysis || draft);
      setSelected(payload.selectedItemIds || selected);
      setError(payload.errorMessage || '');
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : 'Không phân tích được tài liệu.');
    } finally {
      setBusy('');
    }
  };

  const handleConfirm = async () => {
    setBusy('confirm');
    setError('');
    try {
      const saved = await persistDraft();
      const payload = await catalogApi.confirmDocument(documentId, {
        draft: saved.draft || draft,
        selectedItemIds: saved.selectedItemIds || selected,
        gradeLevel,
        genre,
        topicId: topicId || null,
      });
      setDoc(payload);
      if (payload.status === 'CONFIRMED') onConfirmed();
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : 'Không lưu được vào kho.');
    } finally {
      setBusy('');
    }
  };

  const toggleSelected = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const updateMaterial = (index: number, patch: Partial<ExtractedMaterialDraft>) => {
    setDraft((prev) => {
      const materials = prev.materials.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      );
      return { ...prev, materials };
    });
  };

  const updatePrompt = (index: number, patch: Partial<ExtractedPromptDraft>) => {
    setDraft((prev) => {
      const prompts = prev.prompts.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item));
      return { ...prev, prompts };
    });
  };

  const updateRubric = (index: number, patch: Partial<ExtractedRubricDraft>) => {
    setDraft((prev) => {
      const rubrics = prev.rubrics.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item));
      return { ...prev, rubrics };
    });
  };

  const processing = Boolean(doc && PROCESSING.has(doc.status));
  const confirmed = doc?.status === 'CONFIRMED';
  const needsOcr = Boolean(doc?.needsOcr || doc?.status === 'NEEDS_OCR');

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3">
      <div className="bg-surface-container-lowest rounded-xl w-full max-w-5xl p-5 shadow-xl space-y-4 max-h-[94vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-outline-variant/20">
          <div>
            <h3 className="font-headline-sm text-base font-bold font-merriweather">Rà soát tài liệu import</h3>
            <p className="text-xs text-on-surface-variant mt-1">
              {doc?.originalFilename} • {doc?.status || 'Đang tải'} • {IMPORT_FORMAT_HELP}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {error && <div className="p-3 rounded-lg bg-error-container/50 text-error text-xs">{error}</div>}
        {doc?.conversionWarning && (
          <div className="p-3 rounded-lg bg-[#FEF9C3] text-[#CA8A04] text-xs">{doc.conversionWarning}</div>
        )}
        {needsOcr && (
          <div className="p-3 rounded-lg bg-[#FEF9C3] text-[#CA8A04] text-xs">
            PDF không có lớp văn bản đọc được. File gốc vẫn còn. Hãy dùng bản chữ hoặc OCR sau; agent không đoán nội dung.
          </div>
        )}
        {processing && <p className="text-xs text-on-surface-variant">Đang xử lý trên máy chủ. Trạng thái lấy từ API, không giả lập.</p>}

        <div className="flex flex-wrap gap-2 text-xs">
          <button type="button" onClick={() => void handleDownload()} className="px-3 py-1.5 rounded-lg border">
            Tải file gốc
          </button>
          <button
            type="button"
            disabled={busy !== '' || needsOcr || confirmed || processing}
            onClick={() => void handleAnalyze()}
            className="px-3 py-1.5 rounded-lg border"
          >
            {busy === 'analyze' ? 'Đang phân tích...' : 'Phân tích lại'}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-outline">Markdown (có thể sửa)</span>
            <textarea
              rows={14}
              value={markdown}
              disabled={confirmed}
              onChange={(e) => setMarkdown(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-outline-variant/60 font-mono text-[11px]"
            />
            <span className="text-xs font-bold uppercase tracking-wider text-outline">Xem Markdown</span>
            <div className="p-3 rounded-lg border border-outline-variant/30 bg-surface-container-low/40 max-h-64 overflow-y-auto">
              <SafeMarkdown markdown={markdown} />
            </div>
          </div>
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <label className="block font-semibold">
                Loại tài liệu
                <select
                  value={intent}
                  disabled={confirmed}
                  onChange={(e) => setIntent(e.target.value)}
                  className="mt-1 w-full px-2 py-1.5 rounded-lg border"
                >
                  <option value="MATERIAL">Ngữ liệu</option>
                  <option value="PROMPT">Đề nguồn</option>
                  <option value="RUBRIC">Barem</option>
                  <option value="MIXED">Tài liệu tổng hợp</option>
                </select>
              </label>
              <label className="block font-semibold">
                Dạng bài
                <select
                  value={genre}
                  disabled={confirmed}
                  onChange={(e) => setGenre(e.target.value)}
                  className="mt-1 w-full px-2 py-1.5 rounded-lg border"
                >
                  <option value="NLVH">NLVH</option>
                  <option value="NLXH">NLXH</option>
                </select>
              </label>
              <label className="block font-semibold">
                Khối lớp
                <select
                  value={gradeLevel}
                  disabled={confirmed}
                  onChange={(e) => setGradeLevel(Number(e.target.value))}
                  className="mt-1 w-full px-2 py-1.5 rounded-lg border"
                >
                  <option value={10}>Khối 10</option>
                  <option value={11}>Khối 11</option>
                  <option value={12}>Khối 12</option>
                </select>
              </label>
              <label className="block font-semibold">
                Chuyên đề
                <select
                  value={topicId}
                  disabled={confirmed}
                  onChange={(e) => setTopicId(e.target.value)}
                  className="mt-1 w-full px-2 py-1.5 rounded-lg border"
                >
                  <option value="">Không gắn</option>
                  {topics.map((topic) => (
                    <option key={topic.id} value={topic.id}>
                      {topic.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {draft.warnings.map((warning) => (
              <p key={warning} className="text-[#CA8A04]">
                {warning}
              </p>
            ))}

            {draft.materials.map((item, index) => (
              <fieldset key={item.id} className="p-3 rounded-lg border space-y-2">
                <label className="flex items-center gap-2 font-semibold">
                  <input
                    type="checkbox"
                    checked={selected.includes(item.id)}
                    disabled={confirmed}
                    onChange={() => toggleSelected(item.id)}
                  />
                  Ngữ liệu đầy đủ
                </label>
                <input
                  value={item.title}
                  disabled={confirmed}
                  onChange={(e) => updateMaterial(index, { title: e.target.value })}
                  className="w-full px-2 py-1.5 rounded border"
                />
                <textarea
                  rows={6}
                  value={item.content}
                  disabled={confirmed}
                  onChange={(e) => updateMaterial(index, { content: e.target.value })}
                  className="w-full px-2 py-1.5 rounded border font-merriweather"
                />
              </fieldset>
            ))}

            {draft.prompts.map((item, index) => (
              <fieldset key={item.id} className="p-3 rounded-lg border space-y-2">
                <label className="flex items-center gap-2 font-semibold">
                  <input
                    type="checkbox"
                    checked={selected.includes(item.id)}
                    disabled={confirmed}
                    onChange={() => toggleSelected(item.id)}
                  />
                  Đề nguồn
                </label>
                <input
                  value={item.title}
                  disabled={confirmed}
                  onChange={(e) => updatePrompt(index, { title: e.target.value })}
                  className="w-full px-2 py-1.5 rounded border"
                />
                <label className="font-semibold">Tóm tắt yêu cầu (đọc nhanh)</label>
                <textarea
                  rows={2}
                  value={item.writingTaskSummary}
                  disabled={confirmed}
                  onChange={(e) => updatePrompt(index, { writingTaskSummary: e.target.value })}
                  className="w-full px-2 py-1.5 rounded border"
                />
                <label className="font-semibold">Yêu cầu viết đầy đủ</label>
                <textarea
                  rows={5}
                  value={item.writingTask}
                  disabled={confirmed}
                  onChange={(e) => updatePrompt(index, { writingTask: e.target.value })}
                  className="w-full px-2 py-1.5 rounded border"
                />
                <label className="font-semibold">Gợi ý / các ý còn lại</label>
                <textarea
                  rows={3}
                  value={item.extraGuidance}
                  disabled={confirmed}
                  onChange={(e) => updatePrompt(index, { extraGuidance: e.target.value })}
                  className="w-full px-2 py-1.5 rounded border"
                />
                {(item.constraints || []).map((constraint) => (
                  <p key={constraint.text} className="text-on-surface-variant">
                    {constraint.kind}: {constraint.text}
                  </p>
                ))}
              </fieldset>
            ))}

            {draft.rubrics.map((item, index) => (
              <fieldset key={item.id} className="p-3 rounded-lg border space-y-2">
                <label className="flex items-center gap-2 font-semibold">
                  <input
                    type="checkbox"
                    checked={selected.includes(item.id)}
                    disabled={confirmed}
                    onChange={() => toggleSelected(item.id)}
                  />
                  Barem
                </label>
                <input
                  value={item.title}
                  disabled={confirmed}
                  onChange={(e) => updateRubric(index, { title: e.target.value })}
                  className="w-full px-2 py-1.5 rounded border"
                />
                <p>
                  Thang {item.maxScore} • bước {item.scoreStep}. Cho phép mức 0; không tự chia điểm.
                </p>
                {(item.criteria || []).map((criterion) => (
                  <div key={criterion.id} className="p-2 rounded bg-surface-container-low/50">
                    <p className="font-semibold">
                      {criterion.name} ({criterion.weight}đ)
                    </p>
                    {(criterion.levels || []).map((level) => (
                      <p key={`${criterion.id}-${level.score}`}>
                        Mức {level.score}: {level.descriptor}
                      </p>
                    ))}
                  </div>
                ))}
              </fieldset>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <button type="button" onClick={onClose} className="px-3 py-2 text-xs">
            Đóng
          </button>
          <button
            type="button"
            disabled={busy !== '' || confirmed || needsOcr || processing || selected.length === 0}
            onClick={() => void handleConfirm()}
            className="px-4 py-2 bg-primary-container text-on-primary-container rounded-lg font-semibold text-xs"
          >
            {busy === 'confirm' ? 'Đang lưu...' : confirmed ? 'Đã lưu vào kho' : 'Xác nhận lưu vào kho'}
          </button>
        </div>
      </div>
    </div>
  );
}
