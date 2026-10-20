'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import TeacherShell from '@/components/TeacherShell';
import StudentShell from '@/components/StudentShell';
import { useAppStore } from '@/lib/store';
import { AuthApiError } from '@/lib/auth-types';
import { catalogApi } from '@/features/catalog/api';
import ImportReview from '@/features/catalog/ImportReview';
import {
  catalogHref,
  createAssignmentHref,
  isCatalogUuid,
  loadAssignmentDraft,
  promptMissingLabels,
  saveAssignmentDraft,
} from '@/features/catalog/draft';
import { downloadOriginalDocument } from '@/features/catalog/download';
import { boundPreview, canActOnPreview } from '@/features/catalog/preview';
import { parseRubricJson, RUBRIC_JSON_HELP } from '@/features/catalog/rubric';
import {
  CatalogMaterial,
  CatalogPrompt,
  CatalogRubric,
  CatalogTopic,
  IMPORT_DOCUMENT_LABEL,
  IMPORT_FORMAT_HELP,
  MISSING_LABELS,
  PICK_PROMPT_NOTICE,
  RUBRIC_IMPORT_SUCCESS,
  TeacherDocument,
} from '@/features/catalog/types';

type ListKind = 'all' | 'prompt' | 'material' | 'rubric';

type ListItem =
  | { kind: 'prompt'; data: CatalogPrompt }
  | { kind: 'material'; data: CatalogMaterial }
  | { kind: 'rubric'; data: CatalogRubric };

function MaterialsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { currentUser, addToast } = useAppStore();
  const isTeacher = currentUser?.role === 'teacher';
  const pickMode = searchParams.get('mode') === 'pick-prompt';
  const classroomId = searchParams.get('classroomId') || '';
  const assignmentId = isCatalogUuid(searchParams.get('assignmentId')) ? searchParams.get('assignmentId') || '' : '';
  const importId = isCatalogUuid(searchParams.get('importId')) ? searchParams.get('importId') || '' : '';
  const selectParam = searchParams.get('select') || '';
  const kindParam = searchParams.get('kind') as ListKind | null;
  const draftScope = { userId: currentUser?.id, assignmentId: assignmentId || 'new' };
  const catalogState = {
    mode: pickMode ? 'pick-prompt' : undefined,
    classroomId: classroomId || undefined,
    assignmentId: assignmentId || undefined,
  };

  const [topics, setTopics] = useState<CatalogTopic[]>([]);
  const [prompts, setPrompts] = useState<CatalogPrompt[]>([]);
  const [materials, setMaterials] = useState<CatalogMaterial[]>([]);
  const [rubrics, setRubrics] = useState<CatalogRubric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterKind, setFilterKind] = useState<ListKind>(pickMode ? 'prompt' : kindParam && ['all', 'prompt', 'material', 'rubric'].includes(kindParam) ? kindParam : 'all');
  const [filterTopic, setFilterTopic] = useState('all');
  const [filterGrade, setFilterGrade] = useState('all');
  const [filterGenre, setFilterGenre] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedKey, setSelectedKey] = useState(selectParam);
  const [previewPrompt, setPreviewPrompt] = useState<CatalogPrompt | null>(null);
  const [previewMaterial, setPreviewMaterial] = useState<CatalogMaterial | null>(null);
  const [previewRubric, setPreviewRubric] = useState<CatalogRubric | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [importNotice, setImportNotice] = useState('');

  const [drawer, setDrawer] = useState<null | 'material' | 'prompt' | 'rubric' | 'topic'>(null);
  const [editingId, setEditingId] = useState('');
  const [topicTitle, setTopicTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [materialTitle, setMaterialTitle] = useState('');
  const [materialAuthor, setMaterialAuthor] = useState('');
  const [materialSource, setMaterialSource] = useState('');
  const [materialContent, setMaterialContent] = useState('');
  const [materialTopicId, setMaterialTopicId] = useState('');
  const [materialGradeLevel, setMaterialGradeLevel] = useState(11);
  const [promptTitle, setPromptTitle] = useState('');
  const [promptTask, setPromptTask] = useState('');
  const [promptGenre, setPromptGenre] = useState('NLVH');
  const [promptTopicId, setPromptTopicId] = useState('');
  const [promptGradeLevel, setPromptGradeLevel] = useState(11);
  const [promptMaterialIds, setPromptMaterialIds] = useState<string[]>([]);
  const [topicGradeLevel, setTopicGradeLevel] = useState(11);
  const [topicGenre, setTopicGenre] = useState('NLXH');
  const [rubricText, setRubricText] = useState('');
  const [rubricParseError, setRubricParseError] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importIntent, setImportIntent] = useState('MIXED');
  const [importGrade, setImportGrade] = useState(11);
  const [importGenre, setImportGenre] = useState('NLXH');
  const [importTopicId, setImportTopicId] = useState('');
  const [importError, setImportError] = useState('');
  const [fullMaterial, setFullMaterial] = useState(false);
  const [previewNonce, setPreviewNonce] = useState(0);
  const [deletingPromptId, setDeletingPromptId] = useState('');

  const handleDeletePrompt = async (prompt: CatalogPrompt) => {
    if (deletingPromptId || !window.confirm(
      `Xóa đề nguồn “${prompt.title}” khỏi kho?\nCác bài tập đã giao từ đề này vẫn được giữ nguyên.`
    )) return;
    setDeletingPromptId(prompt.id);
    try {
      await catalogApi.deletePrompt(prompt.id);
      setPrompts((current) => current.filter((item) => item.id !== prompt.id));
      setSelectedKey((current) => current === `prompt:${prompt.id}` ? '' : current);
      addToast('Đã xóa đề nguồn.', 'success');
    } catch (err) {
      addToast(err instanceof AuthApiError ? err.message : 'Không xóa được đề nguồn. Hãy thử lại.', 'error');
    } finally {
      setDeletingPromptId('');
    }
  };

  const load = async () => {
    if (!isTeacher) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [topicRes, promptRes, materialRes, rubricRes] = await Promise.all([
        catalogApi.listTopics(),
        catalogApi.listPrompts(pickMode ? { readyOnly: false } : undefined),
        catalogApi.listMaterials(),
        catalogApi.listRubrics(),
      ]);
      setTopics(topicRes.items);
      setPrompts(promptRes.items);
      setMaterials(materialRes.items);
      setRubrics(rubricRes.items);
    } catch (err) {
      const message = err instanceof AuthApiError ? err.message : 'Không tải được kho học liệu.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [isTeacher, pickMode]);

  useEffect(() => {
    if (selectParam) setSelectedKey(selectParam);
  }, [selectParam]);

  useEffect(() => {
    if (pickMode) {
      const previous = loadAssignmentDraft(draftScope);
      saveAssignmentDraft(
        {
          classroomId: classroomId || previous.classroomId,
          title: previous.title,
          extraInstructions: previous.extraInstructions,
          dueAt: previous.dueAt,
          rubricId: previous.rubricId,
          criteria: previous.criteria,
          maxScore: previous.maxScore,
          scoreStep: previous.scoreStep,
          recipientStudentIds: previous.recipientStudentIds,
          assignToWholeClass: previous.assignToWholeClass,
          promptId: previous.promptId,
        },
        draftScope
      );
    }
  }, [pickMode, classroomId, assignmentId, currentUser?.id]);

  const items: ListItem[] = useMemo(() => {
    const kind = pickMode ? 'prompt' : filterKind;
    const list: ListItem[] = [];
    if (kind === 'all' || kind === 'prompt') {
      prompts.forEach((data) => list.push({ kind: 'prompt', data }));
    }
    if (!pickMode && (kind === 'all' || kind === 'material')) {
      materials.forEach((data) => list.push({ kind: 'material', data }));
    }
    if (!pickMode && (kind === 'all' || kind === 'rubric')) {
      rubrics.forEach((data) => list.push({ kind: 'rubric', data }));
    }
    if (pickMode && selectedKey.startsWith('material:')) {
      const material = materials.find((item) => `material:${item.id}` === selectedKey);
      if (material) list.unshift({ kind: 'material', data: material });
    }
    if (pickMode && selectedKey.startsWith('rubric:')) {
      const rubric = rubrics.find((item) => `rubric:${item.id}` === selectedKey);
      if (rubric) list.unshift({ kind: 'rubric', data: rubric });
    }
    return list.filter((item) => {
      if (pickMode && `${item.kind}:${item.data.id}` === selectedKey) return true;
      const title = item.data.title.toLowerCase();
      if (searchQuery && !title.includes(searchQuery.toLowerCase())) return false;
      if (filterTopic !== 'all') {
        const topicId = 'topicId' in item.data ? item.data.topicId : null;
        if (topicId !== filterTopic) return false;
      }
      if (filterGrade !== 'all' && 'gradeLevel' in item.data && String(item.data.gradeLevel) !== filterGrade) {
        return false;
      }
      if (filterGenre !== 'all' && 'genre' in item.data && item.data.genre !== filterGenre) return false;
      if (filterStatus !== 'all') {
        const status = item.kind === 'prompt' ? (item.data.ready ? 'READY' : 'INCOMPLETE') : item.data.status;
        if (status !== filterStatus) return false;
      }
      return true;
    });
  }, [prompts, materials, rubrics, filterKind, filterTopic, filterGrade, filterGenre, filterStatus, searchQuery, pickMode, selectedKey]);

  const selected = items.find((item) => `${item.kind}:${item.data.id}` === selectedKey) || items[0];

  useEffect(() => {
    setPreviewPrompt(null);
    setPreviewMaterial(null);
    setPreviewRubric(null);
    setPreviewError('');
    setFullMaterial(false);
    if (!selected) {
      setPreviewLoading(false);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    void (async () => {
      try {
        if (selected.kind === 'prompt') {
          const full = await catalogApi.getPrompt(selected.data.id);
          if (!cancelled) setPreviewPrompt(full);
        } else if (selected.kind === 'material') {
          const full = await catalogApi.getMaterial(selected.data.id);
          if (!cancelled) setPreviewMaterial(full);
        } else {
          const full = await catalogApi.getRubric(selected.data.id);
          if (!cancelled) setPreviewRubric(full);
        }
        if (!cancelled) setPreviewError('');
      } catch {
        if (!cancelled) {
          setPreviewPrompt(null);
          setPreviewMaterial(null);
          setPreviewRubric(null);
          setPreviewError('Không tải được nội dung xem trước.');
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected?.kind, selected?.data.id, previewNonce]);

  const selectedPrompt =
    selected?.kind === 'prompt'
      ? boundPreview(selected.kind, selected.data.id, 'prompt', previewPrompt)
      : null;
  const selectedMaterial =
    selected?.kind === 'material'
      ? boundPreview(selected.kind, selected.data.id, 'material', previewMaterial)
      : null;
  const selectedRubric =
    selected?.kind === 'rubric' ? boundPreview(selected.kind, selected.data.id, 'rubric', previewRubric) : null;
  const previewReady = canActOnPreview(
    selected?.data.id,
    selectedPrompt?.id || selectedMaterial?.id || selectedRubric?.id,
    previewLoading
  );

  const assignmentDraft = {
    classroomId: classroomId || loadAssignmentDraft(draftScope).classroomId,
    assignmentId: assignmentId || undefined,
  };

  const openPromptForm = (opts?: { editing?: CatalogPrompt; materialIds?: string[] }) => {
    if (opts?.editing) {
      setEditingId(opts.editing.id);
      setPromptTitle(opts.editing.title);
      setPromptTask(opts.editing.writingTask);
      setPromptGenre(opts.editing.genre || 'NLVH');
      setPromptTopicId(opts.editing.topicId || '');
      setPromptGradeLevel(opts.editing.gradeLevel || 11);
      setPromptMaterialIds(opts.editing.materials.map((item) => item.id));
    } else {
      setEditingId('');
      setPromptTitle('');
      setPromptTask('');
      setPromptMaterialIds(opts?.materialIds || []);
      setPromptTopicId('');
      setPromptGradeLevel(11);
      setPromptGenre('NLVH');
    }
    setDrawer('prompt');
  };

  const handleImportConfirmed = async (doc: TeacherDocument) => {
    const createdPromptIds = doc.createdPromptIds || [];
    const createdMaterialIds = doc.createdMaterialIds || [];
    const createdRubricIds = doc.createdRubricIds || [];
    await load();
    setFilterStatus('all');
    setSearchQuery('');
    let nextSelect = '';
    let nextKind: ListKind = pickMode ? 'prompt' : 'all';
    if (createdPromptIds.length) {
      nextSelect = `prompt:${createdPromptIds[0]}`;
      nextKind = 'prompt';
      setFilterKind('prompt');
      if (createdPromptIds.length > 1) {
        setImportNotice(`Đã lưu ${createdPromptIds.length} đề nguồn. Hãy chọn đề thầy/cô muốn dùng.`);
        addToast(`Đã lưu ${createdPromptIds.length} đề nguồn vào kho.`, 'success');
      } else {
        setImportNotice('Đã lưu đề nguồn. Có thể tạo bài tập từ đề này.');
        addToast('Đã lưu đề nguồn vào kho.', 'success');
      }
    } else if (createdMaterialIds.length) {
      nextSelect = `material:${createdMaterialIds[0]}`;
      nextKind = 'material';
      if (!pickMode) setFilterKind('material');
      setImportNotice('Đã lưu ngữ liệu. Hãy tạo đề nguồn từ ngữ liệu này rồi tiếp tục giao bài.');
      addToast('Đã lưu ngữ liệu vào kho.', 'success');
      openPromptForm({ materialIds: createdMaterialIds });
    } else if (createdRubricIds.length) {
      nextSelect = `rubric:${createdRubricIds[0]}`;
      nextKind = 'rubric';
      if (!pickMode) setFilterKind('rubric');
      setImportNotice('Đã lưu barem vào kho. Thầy/cô chọn barem này tại màn tạo bài tập.');
      addToast('Đã lưu barem vào kho. Chọn barem khi tạo bài tập.', 'success');
    } else {
      addToast('Đã xác nhận tài liệu nhưng chưa có mục nào được lưu.', 'warning');
    }
    if (nextSelect) setSelectedKey(nextSelect);
    router.replace(
      catalogHref({
        ...catalogState,
        select: nextSelect || undefined,
        kind: pickMode ? undefined : nextKind === 'all' ? undefined : nextKind,
      })
    );
  };

  const handleImportRubric = async (raw: string) => {
    const parsed = parseRubricJson(raw);
    if (!parsed.ok) {
      setRubricParseError(parsed.error);
      return;
    }
    setSaving(true);
    setRubricParseError('');
    try {
      const created = await catalogApi.createRubric(parsed.rubric);
      addToast(RUBRIC_IMPORT_SUCCESS, 'success');
      setDrawer(null);
      setRubricText('');
      await load();
      setFilterKind('rubric');
      setSelectedKey(`rubric:${created.id}`);
    } catch (err) {
      const message = err instanceof AuthApiError ? err.message : 'Không lưu được barem.';
      setRubricParseError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadOriginal = async (documentId?: string | null) => {
    if (!documentId) return;
    try {
      await downloadOriginalDocument(documentId);
    } catch (err) {
      addToast(err instanceof AuthApiError ? err.message : 'Không tải được file gốc.', 'error');
    }
  };

  const purposeBadge = (kind: ListItem['kind']) => {
    if (kind === 'prompt') return 'bg-secondary-fixed/60 text-secondary';
    if (kind === 'rubric') return 'bg-primary-fixed text-primary';
    return 'bg-surface-container text-on-surface-variant';
  };

  const statusBadge = (item: ListItem) => {
    const ready = item.kind === 'prompt' ? item.data.ready : item.data.status === 'READY';
    const failed = item.kind !== 'prompt' && item.data.status === 'FAILED';
    if (failed) return { className: 'bg-error-container text-error', label: 'Thất bại' };
    if (ready) return { className: 'bg-tertiary-container/30 text-tertiary', label: 'Sẵn sàng' };
    return { className: 'bg-surface-container-high text-[#CA8A04]', label: 'Chưa đủ dữ liệu' };
  };

  const content = (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-headline-lg text-2xl sm:text-3xl font-bold text-on-surface font-merriweather">
            {pickMode ? 'Bước 1: Chọn đề để tạo bài tập' : 'Kho Học liệu & Quản lý Ngữ liệu GDPT 2018'}
          </h1>
          <p className="text-xs sm:text-sm text-on-surface-variant mt-1">
            {pickMode
              ? 'Chọn đề nguồn hợp lệ. Barem được chọn ở bước tạo bài tập, không chọn tại kho.'
              : 'Ngữ liệu, chuyên đề và đề nguồn lưu trên máy chủ. Làm mới trang vẫn giữ nguyên dữ liệu đã lưu.'}
          </p>
        </div>
        {isTeacher && (
          <button
            onClick={() => {
              setImportFile(null);
              setImportError('');
              setImportIntent('MIXED');
              setImportOpen(true);
            }}
            className="px-4 py-2 bg-primary-container text-on-primary-container font-semibold rounded-lg text-sm hover:brightness-95 flex items-center gap-2 shadow-sm shrink-0"
          >
            <span className="material-symbols-outlined text-[18px]">upload_file</span>
            {IMPORT_DOCUMENT_LABEL}
          </button>
        )}
      </div>

      {pickMode && (
        <div className="p-4 bg-secondary-fixed/40 border border-secondary/40 rounded-xl text-sm text-on-surface whitespace-pre-line">
          {PICK_PROMPT_NOTICE}
        </div>
      )}

      {importNotice && (
        <div className="p-3.5 bg-tertiary-container/20 border border-tertiary/30 rounded-xl text-sm text-on-surface">
          {importNotice}
        </div>
      )}

      <div className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          <div className="relative flex-1 max-w-xs">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo tiêu đề..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-outline-variant/60 bg-surface text-on-surface focus:outline-none focus:border-secondary"
            />
            <span className="material-symbols-outlined absolute left-2.5 top-2 text-outline text-base">search</span>
          </div>
          {!pickMode && (
            <select
              value={filterKind}
              onChange={(e) => setFilterKind(e.target.value as ListKind)}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-outline-variant/60 bg-surface"
            >
              <option value="all">Tất cả phân loại</option>
              <option value="prompt">Đề nguồn</option>
              <option value="material">Ngữ liệu</option>
              <option value="rubric">Barem</option>
            </select>
          )}
          <select
            value={filterTopic}
            onChange={(e) => setFilterTopic(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-outline-variant/60 bg-surface"
          >
            <option value="all">Tất cả chuyên đề</option>
            {topics.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.title}
              </option>
            ))}
          </select>
          <select
            value={filterGrade}
            onChange={(e) => setFilterGrade(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-outline-variant/60 bg-surface"
          >
            <option value="all">Tất cả khối</option>
            <option value="10">Khối 10</option>
            <option value="11">Khối 11</option>
            <option value="12">Khối 12</option>
          </select>
          <select
            value={filterGenre}
            onChange={(e) => setFilterGenre(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-outline-variant/60 bg-surface"
          >
            <option value="all">Tất cả dạng bài</option>
            <option value="NLVH">NLVH</option>
            <option value="NLXH">NLXH</option>
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-outline-variant/60 bg-surface"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="READY">Sẵn sàng</option>
            <option value="INCOMPLETE">Chưa đủ dữ liệu</option>
            <option value="DRAFT">Bản nháp</option>
          </select>
        </div>
        <span className="text-xs text-on-surface-variant">
          Hiển thị <strong>{items.length}</strong> mục
        </span>
      </div>

      {error && (
        <div className="p-3 bg-error-container/50 text-error text-sm rounded-xl flex items-center justify-between gap-3">
          <span>{error}</span>
          <button type="button" onClick={() => void load()} className="px-3 py-1.5 rounded-lg border text-xs font-semibold">
            Thử lại
          </button>
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-sm text-on-surface-variant">Đang tải kho học liệu...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 space-y-3">
            {items.map((item) => {
              const key = `${item.kind}:${item.data.id}`;
              const isSelected = selected && key === `${selected.kind}:${selected.data.id}`;
              const purpose = item.kind === 'prompt' ? 'Đề nguồn' : item.kind === 'material' ? 'Ngữ liệu' : 'Barem';
              const badge = statusBadge(item);
              return (
                <div
                  key={key}
                  onClick={() => setSelectedKey(key)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'glass-card border-secondary shadow-md ring-2 ring-secondary/30 scale-[1.01]'
                      : 'glass-card border-outline-variant/30 hover:border-secondary/40 shadow-xs'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${purposeBadge(item.kind)}`}>
                      {purpose}
                    </span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${badge.className}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                      {badge.label}
                    </span>
                  </div>
                  <h3 className="font-headline-sm text-sm font-bold text-on-surface font-merriweather line-clamp-2">
                    {item.data.title}
                  </h3>
                  <div className="mt-3 flex items-center justify-between text-[11px] text-on-surface-variant">
                    <span>
                      {item.kind === 'prompt'
                        ? `${item.data.genre} • Khối ${item.data.gradeLevel} • ${item.data.materialCount} ngữ liệu`
                        : item.kind === 'material'
                          ? `${item.data.author || 'Chưa có tác giả'} • Khối ${item.data.gradeLevel}`
                          : `Thang ${item.data.maxScore}đ • ${item.data.criteriaCount} tiêu chí`}
                    </span>
                    {item.kind === 'prompt' && (
                      <button
                        type="button"
                        aria-label={`Xóa đề nguồn ${item.data.title}`}
                        disabled={Boolean(deletingPromptId)}
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleDeletePrompt(item.data);
                        }}
                        className="inline-flex items-center gap-1 shrink-0 px-2 py-1 rounded-lg text-error text-xs font-semibold hover:bg-error/10 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                      >
                        <span className="material-symbols-outlined text-[16px]" aria-hidden="true">delete</span>
                        {deletingPromptId === item.data.id ? 'Đang xóa...' : 'Xóa'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {items.length === 0 && (
              <div className="p-8 text-center text-sm text-on-surface-variant border border-dashed rounded-xl">
                Chưa có mục phù hợp.
              </div>
            )}
          </div>

          <div className="lg:col-span-7">
            {selected ? (
              <div className="glass-panel rounded-2xl p-6 sm:p-7 border border-white/60 shadow-sm space-y-5">
                <div className="flex items-start justify-between gap-4 pb-4 border-b border-outline-variant/20">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${purposeBadge(selected.kind)}`}>
                        {selected.kind === 'prompt' ? 'Đề nguồn' : selected.kind === 'material' ? 'Ngữ liệu' : 'Barem'}
                      </span>
                      {'gradeLevel' in selected.data && (
                        <span className="text-xs text-on-surface-variant font-medium">Khối {selected.data.gradeLevel}</span>
                      )}
                    </div>
                    <h2 className="font-headline-md text-lg sm:text-xl font-bold text-on-surface font-merriweather">
                      {selected.data.title}
                    </h2>
                    <p className="text-xs text-on-surface-variant mt-1">
                      {selected.kind === 'prompt'
                        ? `${selected.data.genre} • ${selected.data.materialCount} ngữ liệu liên kết`
                        : selected.kind === 'material'
                          ? `${selected.data.author || 'Chưa có tác giả'} • ${selected.data.sourceInfo || 'Chưa có thông tin nguồn'}`
                          : `Thang ${selected.data.maxScore}đ • ${selected.data.criteriaCount} tiêu chí`}
                    </p>
                  </div>
                  {isTeacher && selected.kind !== 'rubric' && !pickMode && (
                    <button
                      type="button"
                      className="text-xs font-semibold text-secondary disabled:opacity-40"
                      disabled={!previewReady}
                      onClick={() => {
                        if (!previewReady) return;
                        if (selected.kind === 'material' && selectedMaterial) {
                          setEditingId(selectedMaterial.id);
                          setMaterialTitle(selectedMaterial.title);
                          setMaterialAuthor(selectedMaterial.author || '');
                          setMaterialSource(selectedMaterial.sourceInfo || '');
                          setMaterialContent(selectedMaterial.content || selectedMaterial.excerpt || '');
                          setMaterialTopicId(selectedMaterial.topicId || '');
                          setMaterialGradeLevel(selectedMaterial.gradeLevel || 11);
                          setDrawer('material');
                        }
                        if (selected.kind === 'prompt' && selectedPrompt) {
                          openPromptForm({ editing: selectedPrompt });
                        }
                      }}
                    >
                      Chỉnh sửa
                    </button>
                  )}
                </div>

                {previewLoading && (
                  <p className="text-sm text-on-surface-variant">Đang tải nội dung xem trước...</p>
                )}
                {previewError && (
                  <div className="p-3 bg-error-container/50 text-error text-sm rounded-lg flex items-center justify-between gap-2">
                    <span>{previewError}</span>
                    <button
                      type="button"
                      className="text-xs font-semibold"
                      onClick={() => setPreviewNonce((value) => value + 1)}
                    >
                      Thử lại
                    </button>
                  </div>
                )}

                {selected.kind === 'prompt' && selectedPrompt && previewReady && (
                  <>
                    {selectedPrompt.writingTaskSummary && (
                      <div className="space-y-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-outline block">Tóm tắt yêu cầu</span>
                        <p className="text-sm leading-relaxed whitespace-pre-line">{selectedPrompt.writingTaskSummary}</p>
                      </div>
                    )}
                    <div className="space-y-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-outline block">Yêu cầu viết</span>
                      <p className="text-sm leading-relaxed whitespace-pre-line">
                        {selectedPrompt.writingTask || 'Chưa có yêu cầu viết.'}
                      </p>
                    </div>
                    {selectedPrompt.extraGuidance && (
                      <div className="space-y-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-outline block">Gợi ý / các ý còn lại</span>
                        <p className="text-sm leading-relaxed whitespace-pre-line">{selectedPrompt.extraGuidance}</p>
                      </div>
                    )}
                    <div className="space-y-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-outline block">Ngữ liệu liên kết</span>
                      {selectedPrompt.materials.map((material) => (
                        <div key={material.id} className="p-3 rounded-lg bg-surface-container-low/50 text-xs space-y-1">
                          <p className="font-semibold">{material.title}</p>
                          <p className="text-on-surface-variant">
                            {material.author ? `${material.author} • ` : ''}
                            {material.sourceInfo || 'Chưa có thông tin nguồn'}
                          </p>
                          {(material.content || material.excerpt) && (
                            <pre className="mt-2 whitespace-pre-wrap font-merriweather text-[12px] leading-relaxed">
                              {material.content || material.excerpt}
                            </pre>
                          )}
                        </div>
                      ))}
                      {selectedPrompt.materials.length === 0 && (
                        <p className="text-xs text-error">Chưa gắn ngữ liệu.</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedPrompt.sourceDocumentId && (
                        <button
                          type="button"
                          onClick={() => void handleDownloadOriginal(selectedPrompt.sourceDocumentId)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 border border-outline-variant/60 text-xs font-semibold rounded-lg hover:bg-surface-container"
                        >
                          Tải file gốc
                        </button>
                      )}
                      {selectedPrompt.ready ? (
                        <Link
                          href={createAssignmentHref(selectedPrompt.id, assignmentDraft)}
                          onClick={() =>
                            saveAssignmentDraft(
                              {
                                ...loadAssignmentDraft(draftScope),
                                promptId: selectedPrompt.id,
                                classroomId: assignmentDraft.classroomId,
                                assignmentId: assignmentDraft.assignmentId,
                              },
                              draftScope
                            )
                          }
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary-container text-on-primary-container text-xs font-semibold rounded-lg shadow-sm hover:brightness-95"
                        >
                          {pickMode ? 'Dùng đề này & Tiếp tục' : 'Tạo bài tập từ đề này'}
                          <span className="material-symbols-outlined text-sm">arrow_forward</span>
                        </Link>
                      ) : (
                        <div className="w-full p-3 bg-[#FEF9C3] rounded-lg text-xs text-[#CA8A04] space-y-2">
                          <p>
                            Đề chưa đủ dữ liệu: cần bổ sung {promptMissingLabels(selectedPrompt.missing, MISSING_LABELS)}.
                            Chỉ tạo bài tập khi đề đã sẵn sàng.
                          </p>
                          <button
                            type="button"
                            onClick={() => openPromptForm({ editing: selectedPrompt })}
                            className="px-3 py-1.5 bg-surface-container-lowest border border-[#CA8A04]/40 rounded-lg font-semibold"
                          >
                            Bổ sung ngữ liệu / yêu cầu viết
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {selected.kind === 'material' && selectedMaterial && previewReady && (
                  <>
                    <p className="text-xs text-on-surface-variant">
                      {selectedMaterial.author ? `${selectedMaterial.author} • ` : ''}
                      {selectedMaterial.sourceInfo || 'Chưa có thông tin nguồn'}
                    </p>
                    <div className="p-4 bg-surface-container-low/40 rounded-xl border-l-4 border-primary text-sm font-merriweather whitespace-pre-wrap">
                      {fullMaterial
                        ? selectedMaterial.content || selectedMaterial.excerpt || 'Chưa có nội dung.'
                        : (selectedMaterial.content || selectedMaterial.excerpt || 'Chưa có nội dung.').slice(0, 800)}
                      {!fullMaterial && (selectedMaterial.content || selectedMaterial.excerpt || '').length > 800 ? '…' : ''}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(selectedMaterial.content || selectedMaterial.excerpt || '').length > 800 && (
                        <button
                          type="button"
                          onClick={() => setFullMaterial((value) => !value)}
                          className="text-xs font-semibold text-secondary"
                        >
                          {fullMaterial ? 'Thu gọn' : 'Xem toàn văn'}
                        </button>
                      )}
                      {selectedMaterial.sourceDocumentId && (
                        <button
                          type="button"
                          onClick={() => void handleDownloadOriginal(selectedMaterial.sourceDocumentId)}
                          className="px-3 py-1.5 border border-outline-variant/60 text-xs font-semibold rounded-lg"
                        >
                          Tải file gốc
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openPromptForm({ materialIds: [selectedMaterial.id] })}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary-container text-on-primary-container text-xs font-semibold rounded-lg shadow-sm hover:brightness-95"
                      >
                        Tạo đề nguồn từ ngữ liệu này
                        <span className="material-symbols-outlined text-sm">arrow_forward</span>
                      </button>
                    </div>
                  </>
                )}

                {selected.kind === 'rubric' && selectedRubric && previewReady && (
                  <>
                    <p className="text-sm text-on-surface-variant">{selectedRubric.description}</p>
                    <p className="text-xs">
                      Thang {selectedRubric.maxScore}đ • bước {selectedRubric.scoreStep} • {selectedRubric.criteriaCount} tiêu
                      chí. Chọn barem này tại màn tạo bài tập, không áp dụng từ kho.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {(selectedRubric.criteria || []).map((criterion) => (
                        <div key={criterion.id} className="p-2.5 bg-surface-container-low/50 rounded-lg border border-outline-variant/20 text-xs">
                          <span className="font-bold text-primary block">
                            {criterion.name} ({criterion.weight}đ)
                          </span>
                          {criterion.guideNote && (
                            <p className="text-[11px] text-on-surface-variant mt-1">{criterion.guideNote}</p>
                          )}
                        </div>
                      ))}
                    </div>
                    {selectedRubric.sourceDocumentId && (
                      <button
                        type="button"
                        onClick={() => void handleDownloadOriginal(selectedRubric.sourceDocumentId)}
                        className="px-3 py-1.5 border border-outline-variant/60 text-xs font-semibold rounded-lg"
                      >
                        Tải file gốc
                      </button>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className="p-8 text-center text-sm text-on-surface-variant">Chọn một mục để xem trước.</div>
            )}
          </div>
        </div>
      )}

      {drawer === 'material' && (
        <Modal title={editingId ? 'Chỉnh sửa ngữ liệu' : 'Thêm ngữ liệu (dán nội dung thật)'} onClose={() => setDrawer(null)}>
          <form
            className="space-y-3 text-xs"
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              const body = {
                title: materialTitle,
                author: materialAuthor,
                sourceInfo: materialSource,
                content: materialContent,
                topicId: materialTopicId || null,
                gradeLevel: materialGradeLevel,
              };
              try {
                const saved = editingId
                  ? await catalogApi.updateMaterial(editingId, body)
                  : await catalogApi.createMaterial(body);
                addToast(editingId ? 'Đã cập nhật ngữ liệu.' : 'Đã lưu ngữ liệu vào kho.', 'success');
                setDrawer(null);
                setEditingId('');
                setMaterialTitle('');
                setMaterialContent('');
                await load();
                setSelectedKey(`material:${saved.id}`);
              } catch (err) {
                addToast(err instanceof AuthApiError ? err.message : 'Không lưu được ngữ liệu.', 'error');
              } finally {
                setSaving(false);
              }
            }}
          >
            <Field label="Tiêu đề" value={materialTitle} onChange={setMaterialTitle} required />
            <Field label="Tác giả" value={materialAuthor} onChange={setMaterialAuthor} />
            <Field label="Nguồn" value={materialSource} onChange={setMaterialSource} />
            <label className="block font-semibold">Chuyên đề</label>
            <select
              value={materialTopicId}
              onChange={(e) => setMaterialTopicId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-outline-variant/60"
            >
              <option value="">Không gắn chuyên đề</option>
              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.title}
                </option>
              ))}
            </select>
            <label className="block font-semibold">Khối lớp</label>
            <select
              value={materialGradeLevel}
              onChange={(e) => setMaterialGradeLevel(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-outline-variant/60"
            >
              <option value={10}>Khối 10</option>
              <option value={11}>Khối 11</option>
              <option value={12}>Khối 12</option>
            </select>
            <label className="block font-semibold">Nội dung văn bản</label>
            <textarea
              required
              rows={8}
              value={materialContent}
              onChange={(e) => setMaterialContent(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-outline-variant/60 font-mono text-[11px]"
              placeholder="Dán toàn văn ngữ liệu. Hệ thống không giả lập phân tích file."
            />
            <p className="text-[11px] text-on-surface-variant">
              Có thể dán văn bản tại đây, hoặc dùng {IMPORT_DOCUMENT_LABEL} để tải DOCX/PDF/XLSX.
            </p>
            <ModalActions saving={saving} onCancel={() => setDrawer(null)} submitLabel={editingId ? 'Cập nhật ngữ liệu' : 'Lưu ngữ liệu'} />
          </form>
        </Modal>
      )}

      {drawer === 'prompt' && (
        <Modal title={editingId ? 'Chỉnh sửa đề nguồn' : 'Thêm đề nguồn'} onClose={() => setDrawer(null)}>
          <form
            className="space-y-3 text-xs"
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              const body = {
                title: promptTitle,
                writingTask: promptTask,
                genre: promptGenre,
                gradeLevel: promptGradeLevel,
                topicId: promptTopicId || null,
                materialIds: promptMaterialIds,
              };
              try {
                const saved = editingId
                  ? await catalogApi.updatePrompt(editingId, body)
                  : await catalogApi.createPrompt(body);
                addToast(editingId ? 'Đã cập nhật đề nguồn.' : 'Đã lưu đề nguồn.', 'success');
                setDrawer(null);
                setEditingId('');
                setPromptTitle('');
                setPromptTask('');
                await load();
                setFilterKind(pickMode ? 'prompt' : 'prompt');
                setSelectedKey(`prompt:${saved.id}`);
                setImportNotice(saved.ready ? 'Đề nguồn đã sẵn sàng. Có thể tạo bài tập từ đề này.' : 'Đề đã lưu. Hãy bổ sung phần còn thiếu trước khi tạo bài.');
                router.replace(catalogHref({ ...catalogState, select: `prompt:${saved.id}`, kind: pickMode ? undefined : 'prompt' }));
              } catch (err) {
                addToast(err instanceof AuthApiError ? err.message : 'Không lưu được đề nguồn.', 'error');
              } finally {
                setSaving(false);
              }
            }}
          >
            <Field label="Tiêu đề đề nguồn" value={promptTitle} onChange={setPromptTitle} required />
            <label className="block font-semibold">Yêu cầu viết</label>
            <textarea
              rows={5}
              value={promptTask}
              onChange={(e) => setPromptTask(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-outline-variant/60"
            />
            <label className="block font-semibold">Dạng bài</label>
            <select
              value={promptGenre}
              onChange={(e) => setPromptGenre(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-outline-variant/60"
            >
              <option value="NLVH">NLVH</option>
              <option value="NLXH">NLXH</option>
            </select>
            <label className="block font-semibold">Chuyên đề</label>
            <select
              value={promptTopicId}
              onChange={(e) => setPromptTopicId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-outline-variant/60"
            >
              <option value="">Không gắn chuyên đề</option>
              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.title}
                </option>
              ))}
            </select>
            <label className="block font-semibold">Khối lớp</label>
            <select
              value={promptGradeLevel}
              onChange={(e) => setPromptGradeLevel(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-outline-variant/60"
            >
              <option value={10}>Khối 10</option>
              <option value={11}>Khối 11</option>
              <option value={12}>Khối 12</option>
            </select>
            <label className="block font-semibold">Ngữ liệu liên kết</label>
            <div className="max-h-40 overflow-y-auto space-y-1 border rounded-lg p-2">
              {materials.map((material) => (
                <label key={material.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={promptMaterialIds.includes(material.id)}
                    onChange={(e) => {
                      setPromptMaterialIds((prev) =>
                        e.target.checked ? [...prev, material.id] : prev.filter((id) => id !== material.id)
                      );
                    }}
                  />
                  <span>{material.title}</span>
                </label>
              ))}
              {materials.length === 0 && <p className="text-on-surface-variant">Chưa có ngữ liệu trong kho.</p>}
            </div>
            {promptMaterialIds.length === 0 && (
              <p className="text-[#CA8A04]">Đề chưa gắn ngữ liệu. Có thể lưu rồi bổ sung sau; chỉ tạo bài khi đề sẵn sàng.</p>
            )}
            <ModalActions saving={saving} onCancel={() => setDrawer(null)} submitLabel={editingId ? 'Cập nhật đề nguồn' : 'Lưu đề nguồn'} />
          </form>
        </Modal>
      )}

      {drawer === 'topic' && (
        <Modal title="Thêm chuyên đề" onClose={() => setDrawer(null)}>
          <form
            className="space-y-3 text-xs"
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              try {
                await catalogApi.createTopic({ title: topicTitle, gradeLevel: topicGradeLevel, genre: topicGenre });
                addToast('Đã lưu chuyên đề.', 'success');
                setDrawer(null);
                setTopicTitle('');
                await load();
              } catch (err) {
                addToast(err instanceof AuthApiError ? err.message : 'Không lưu được chuyên đề.', 'error');
              } finally {
                setSaving(false);
              }
            }}
          >
            <Field label="Tên chuyên đề" value={topicTitle} onChange={setTopicTitle} required />
            <label className="block font-semibold">Khối lớp</label>
            <select
              value={topicGradeLevel}
              onChange={(e) => setTopicGradeLevel(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-outline-variant/60"
            >
              <option value={10}>Khối 10</option>
              <option value={11}>Khối 11</option>
              <option value={12}>Khối 12</option>
            </select>
            <label className="block font-semibold">Dạng bài</label>
            <select
              value={topicGenre}
              onChange={(e) => setTopicGenre(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-outline-variant/60"
            >
              <option value="NLVH">NLVH</option>
              <option value="NLXH">NLXH</option>
            </select>
            <ModalActions saving={saving} onCancel={() => setDrawer(null)} submitLabel="Lưu chuyên đề" />
          </form>
        </Modal>
      )}

      {importOpen && (
        <Modal title={IMPORT_DOCUMENT_LABEL} onClose={() => setImportOpen(false)}>
          <form
            className="space-y-3 text-xs"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!importFile) {
                setImportError('Hãy chọn file từ máy.');
                return;
              }
              setSaving(true);
              setImportError('');
              const form = new FormData();
              form.append('file', importFile);
              form.append('intent', importIntent);
              form.append('gradeLevel', String(importGrade));
              form.append('genre', importGenre);
              if (importTopicId) form.append('topicId', importTopicId);
              try {
                const created = await catalogApi.uploadDocument(form);
                setImportOpen(false);
                setImportFile(null);
                addToast('Đã lưu file gốc. Hãy rà soát bản phân tích.', 'success');
                router.replace(catalogHref({ ...catalogState, importId: created.id }));
              } catch (err) {
                setImportError(err instanceof AuthApiError ? err.message : 'Không import được tài liệu.');
              } finally {
                setSaving(false);
              }
            }}
          >
            <p className="text-on-surface-variant">{IMPORT_FORMAT_HELP}</p>
            <label className="block font-semibold">Loại tài liệu</label>
            <select
              value={importIntent}
              onChange={(e) => setImportIntent(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-outline-variant/60"
            >
              <option value="MATERIAL">Ngữ liệu</option>
              <option value="PROMPT">Đề nguồn</option>
              <option value="RUBRIC">Barem</option>
              <option value="MIXED">Tài liệu tổng hợp</option>
            </select>
            <label className="block font-semibold">Khối lớp</label>
            <select
              value={importGrade}
              onChange={(e) => setImportGrade(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-outline-variant/60"
            >
              <option value={10}>Khối 10</option>
              <option value={11}>Khối 11</option>
              <option value={12}>Khối 12</option>
            </select>
            <label className="block font-semibold">Dạng bài</label>
            <select
              value={importGenre}
              onChange={(e) => setImportGenre(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-outline-variant/60"
            >
              <option value="NLVH">NLVH</option>
              <option value="NLXH">NLXH</option>
            </select>
            <label className="block font-semibold">Chuyên đề</label>
            <select
              value={importTopicId}
              onChange={(e) => setImportTopicId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-outline-variant/60"
            >
              <option value="">Không gắn chuyên đề</option>
              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.title}
                </option>
              ))}
            </select>
            <input
              type="file"
              accept=".docx,.pdf,.txt,.md,.xlsx,application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => setImportFile(e.target.files?.[0] || null)}
            />
            {importError && <p className="text-error">{importError}</p>}
            <ModalActions saving={saving} onCancel={() => setImportOpen(false)} submitLabel="Tải lên và phân tích" />
          </form>
        </Modal>
      )}

      {importId && (
        <ImportReview
          documentId={importId}
          topics={topics}
          catalogMaterials={materials}
          onClose={() => router.replace(catalogHref(catalogState))}
          onConfirmed={(doc) => {
            void handleImportConfirmed(doc);
          }}
        />
      )}

      {drawer === 'rubric' && (
        <Modal title="Nhập barem JSON vào kho" onClose={() => setDrawer(null)}>
          <div className="space-y-3 text-xs">
            <pre className="p-3 bg-surface-container-low rounded-lg whitespace-pre-wrap text-[11px]">{RUBRIC_JSON_HELP}</pre>
            <textarea
              rows={10}
              value={rubricText}
              onChange={(e) => setRubricText(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-outline-variant/60 font-mono text-[11px]"
              placeholder="Dán JSON barem..."
            />
            <input
              type="file"
              accept="application/json,.json"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setRubricText(await file.text());
              }}
            />
            {rubricParseError && <p className="text-error">{rubricParseError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDrawer(null)} className="px-3 py-2">
                Hủy
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleImportRubric(rubricText)}
                className="px-4 py-2 bg-primary-container text-on-primary-container rounded-lg font-semibold disabled:opacity-40"
              >
                {saving ? 'Đang lưu...' : 'Xác nhận nhập kho'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );

  if (!isTeacher) {
    return (
      <StudentShell>
        <div className="max-w-lg mx-auto p-8 text-sm text-on-surface-variant">
          Kho học liệu dành cho giáo viên. Em hãy mở bài tập đã được giao.
        </div>
      </StudentShell>
    );
  }

  return <TeacherShell>{content}</TeacherShell>;
}

function Field({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block font-semibold mb-1">{label}</label>
      <input
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-outline-variant/60"
      />
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-surface-container-lowest rounded-xl max-w-lg w-full p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-outline-variant/20">
          <h3 className="font-headline-sm text-base font-bold font-merriweather">{title}</h3>
          <button onClick={onClose} className="p-1" aria-label="Đóng">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalActions({
  saving,
  onCancel,
  submitLabel,
}: {
  saving: boolean;
  onCancel: () => void;
  submitLabel: string;
}) {
  return (
    <div className="pt-3 border-t flex justify-end gap-2">
      <button type="button" onClick={onCancel} className="px-3 py-2">
        Hủy
      </button>
      <button
        type="submit"
        disabled={saving}
        className="px-4 py-2 bg-primary-container text-on-primary-container rounded-lg font-semibold disabled:opacity-40"
      >
        {saving ? 'Đang lưu...' : submitLabel}
      </button>
    </div>
  );
}

export default function MaterialsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <span className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <MaterialsContent />
    </Suspense>
  );
}
