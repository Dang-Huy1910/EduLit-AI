'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import TeacherShell from '@/components/TeacherShell';
import StudentShell from '@/components/StudentShell';
import { useAppStore } from '@/lib/store';
import { AuthApiError } from '@/lib/auth-types';
import { catalogApi } from '@/features/catalog/api';
import ImportReview from '@/features/catalog/ImportReview';
import StudentMaterialsView from '@/features/catalog/StudentMaterialsView';
import InlineDeleteButton from '@/components/InlineDeleteButton';
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
import { MaterialPassage, PreviewLabel, PreviewNote, WritingTaskCallout } from '@/features/catalog/PreviewBlocks';
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

const KIND_TABS: { value: ListKind; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'prompt', label: 'Đề nguồn' },
  { value: 'material', label: 'Ngữ liệu' },
  { value: 'rubric', label: 'Barem' },
];

const KIND_META: Record<ListItem['kind'], { label: string; icon: string; tone: string }> = {
  prompt: { label: 'Đề nguồn', icon: 'description', tone: 'text-secondary' },
  material: { label: 'Ngữ liệu', icon: 'menu_book', tone: 'text-on-surface-variant' },
  rubric: { label: 'Barem', icon: 'fact_check', tone: 'text-primary' },
};

const GROUP_HEADER_HEIGHT = 32;

function itemMeta(item: ListItem) {
  if (item.kind === 'prompt') return `${item.data.genre} · Khối ${item.data.gradeLevel} · ${item.data.materialCount} ngữ liệu`;
  if (item.kind === 'material') return `${item.data.author || 'Chưa có tác giả'} · Khối ${item.data.gradeLevel}`;
  return `Thang ${item.data.maxScore}đ · ${item.data.criteriaCount} tiêu chí`;
}

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
  const draftScope = useMemo(
    () => ({ userId: currentUser?.id, assignmentId: assignmentId || 'new' }),
    [currentUser?.id, assignmentId]
  );
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
    if (deletingPromptId) return;
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

  const load = useCallback(async () => {
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
  }, [isTeacher, pickMode]);

  useEffect(() => {
    void load();
  }, [load]);

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
  }, [pickMode, classroomId, draftScope]);

  const matchesFilters = useCallback(
    (item: ListItem) => {
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
    },
    [searchQuery, filterTopic, filterGrade, filterGenre, filterStatus]
  );

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
      return matchesFilters(item);
    });
  }, [prompts, materials, rubrics, filterKind, matchesFilters, pickMode, selectedKey]);

  const kindCounts = useMemo(() => {
    const prompt = prompts.filter((data) => matchesFilters({ kind: 'prompt', data })).length;
    const material = materials.filter((data) => matchesFilters({ kind: 'material', data })).length;
    const rubric = rubrics.filter((data) => matchesFilters({ kind: 'rubric', data })).length;
    return { all: prompt + material + rubric, prompt, material, rubric };
  }, [prompts, materials, rubrics, matchesFilters]);

  const hasActiveFilters =
    Boolean(searchQuery) || filterTopic !== 'all' || filterGrade !== 'all' || filterGenre !== 'all' || filterStatus !== 'all';
  const clearFilters = () => {
    setSearchQuery('');
    setFilterTopic('all');
    setFilterGrade('all');
    setFilterGenre('all');
    setFilterStatus('all');
  };

  // Group by kind only when every kind is listed; pick mode stays a flat list of prompts.
  const showGroups = !pickMode && filterKind === 'all';
  const groups = showGroups
    ? (['prompt', 'material', 'rubric'] as const)
        .map((kind) => ({ key: kind, label: KIND_META[kind].label, items: items.filter((item) => item.kind === kind) }))
        .filter((group) => group.items.length > 0)
    : [{ key: 'list', label: '', items }];

  const selected = items.find((item) => `${item.kind}:${item.data.id}` === selectedKey) || items[0];
  const selectedKind = selected?.kind;
  const selectedItemId = selected?.data.id;

  const listRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const selectItem = (key: string) => {
    setSelectedKey(key);
    // Below lg the preview sits under the list, so bring it into view.
    if (window.matchMedia('(max-width: 1023px)').matches) {
      window.requestAnimationFrame(() => previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  };

  // Keep the selected row visible inside the list (after an import or a ?select= link) without scrolling the page.
  useEffect(() => {
    const list = listRef.current;
    const row = selectedKind && selectedItemId ? document.getElementById(`catalog-row-${selectedKind}-${selectedItemId}`) : null;
    if (!list || !row) return;
    const top = row.offsetTop - (showGroups ? GROUP_HEADER_HEIGHT : 0);
    const bottom = row.offsetTop + row.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  }, [selectedKind, selectedItemId, showGroups]);

  useEffect(() => {
    setPreviewPrompt(null);
    setPreviewMaterial(null);
    setPreviewRubric(null);
    setPreviewError('');
    setFullMaterial(false);
    if (!selectedKind || !selectedItemId) {
      setPreviewLoading(false);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    void (async () => {
      try {
        if (selectedKind === 'prompt') {
          const full = await catalogApi.getPrompt(selectedItemId);
          if (!cancelled) setPreviewPrompt(full);
        } else if (selectedKind === 'material') {
          const full = await catalogApi.getMaterial(selectedItemId);
          if (!cancelled) setPreviewMaterial(full);
        } else {
          const full = await catalogApi.getRubric(selectedItemId);
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
  }, [selectedKind, selectedItemId, previewNonce]);

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

      <div className="space-y-3">
        {!pickMode && (
          <div className="flex gap-1 border-b border-outline-variant/40 overflow-x-auto" aria-label="Phân loại học liệu">
            {KIND_TABS.map((tab) => {
              const active = filterKind === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilterKind(tab.value)}
                  className={`-mb-px px-3 py-2 border-b-2 text-sm whitespace-nowrap transition-colors ${
                    active
                      ? 'border-primary text-on-surface font-semibold'
                      : 'border-transparent text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {tab.label}{' '}
                  <span className="text-xs font-normal tabular-nums text-on-surface-variant">{kindCounts[tab.value]}</span>
                </button>
              );
            })}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-outline text-[18px] pointer-events-none">
              search
            </span>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo tiêu đề..."
              aria-label="Tìm theo tiêu đề"
              className="w-full h-9 pl-9 pr-3 text-sm rounded-lg border border-outline-variant/60 bg-surface-container-lowest text-on-surface focus:outline-none focus:border-secondary"
            />
          </div>
          <select
            value={filterTopic}
            onChange={(e) => setFilterTopic(e.target.value)}
            aria-label="Chuyên đề"
            className="h-9 max-w-[14rem] px-2.5 text-sm rounded-lg border border-outline-variant/60 bg-surface-container-lowest text-on-surface"
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
            aria-label="Khối lớp"
            className="h-9 px-2.5 text-sm rounded-lg border border-outline-variant/60 bg-surface-container-lowest text-on-surface"
          >
            <option value="all">Tất cả khối</option>
            <option value="10">Khối 10</option>
            <option value="11">Khối 11</option>
            <option value="12">Khối 12</option>
          </select>
          <select
            value={filterGenre}
            onChange={(e) => setFilterGenre(e.target.value)}
            aria-label="Dạng bài"
            className="h-9 px-2.5 text-sm rounded-lg border border-outline-variant/60 bg-surface-container-lowest text-on-surface"
          >
            <option value="all">Tất cả dạng bài</option>
            <option value="NLVH">NLVH</option>
            <option value="NLXH">NLXH</option>
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            aria-label="Trạng thái"
            className="h-9 px-2.5 text-sm rounded-lg border border-outline-variant/60 bg-surface-container-lowest text-on-surface"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="READY">Sẵn sàng</option>
            <option value="INCOMPLETE">Chưa đủ dữ liệu</option>
            <option value="DRAFT">Bản nháp</option>
          </select>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="h-9 px-2 text-sm font-semibold text-secondary hover:underline"
            >
              Bỏ lọc
            </button>
          )}
        </div>
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
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-6 items-start">
          {/* The list and the preview each scroll on their own and stay pinned under the header, so a large
              catalog never makes the page itself long. */}
          <section
            aria-label="Danh sách học liệu"
            className="flex flex-col rounded-xl border border-outline-variant/40 bg-surface-container-lowest overflow-hidden max-h-[60vh] lg:max-h-[calc(100dvh-6.5rem)] lg:sticky lg:top-20"
          >
            <div className="px-4 py-2.5 border-b border-outline-variant/30 text-xs text-on-surface-variant">
              <strong className="font-semibold text-on-surface tabular-nums">{items.length}</strong> mục
              {hasActiveFilters ? ' khớp bộ lọc' : ''}
            </div>
            <div ref={listRef} className="relative flex-1 min-h-0 overflow-y-auto overscroll-contain">
              {items.length === 0 ? (
                <p className="p-8 text-center text-sm text-on-surface-variant">Chưa có mục phù hợp.</p>
              ) : (
                groups.map((group) => (
                  <div key={group.key} role={showGroups ? 'group' : undefined} aria-label={showGroups ? group.label : undefined}>
                    {showGroups && (
                      <p className="sticky top-0 z-20 h-8 px-4 flex items-center gap-1.5 bg-surface-container-low border-b border-outline-variant/30 text-xs font-semibold text-on-surface-variant">
                        {group.label}
                        <span className="font-normal tabular-nums">{group.items.length}</span>
                      </p>
                    )}
                    <ul>
                      {group.items.map((item) => {
                        const key = `${item.kind}:${item.data.id}`;
                        const isSelected = selected && key === `${selected.kind}:${selected.data.id}`;
                        const kind = KIND_META[item.kind];
                        const badge = statusBadge(item);
                        const meta = itemMeta(item);
                        return (
                          <li
                            key={key}
                            id={`catalog-row-${item.kind}-${item.data.id}`}
                            className={`relative flex items-start gap-3 px-4 py-3 border-b border-outline-variant/20 last:border-b-0 transition-colors ${
                              isSelected ? 'bg-surface-container-low' : 'hover:bg-surface-container-low/60'
                            }`}
                          >
                            {isSelected && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-primary" />}
                            <span aria-hidden="true" className={`material-symbols-outlined text-[20px] mt-0.5 shrink-0 ${kind.tone}`}>
                              {kind.icon}
                            </span>
                            {/* The button's ::after covers the row, so the whole row selects; actions sit above it. */}
                            <button
                              type="button"
                              onClick={() => selectItem(key)}
                              aria-current={isSelected ? 'true' : undefined}
                              className="flex-1 min-w-0 text-left after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-secondary"
                            >
                              <span className="block text-sm font-semibold text-on-surface leading-snug line-clamp-2">
                                {item.data.title}
                              </span>
                              <span className="mt-0.5 flex items-center gap-2 min-w-0 text-xs text-on-surface-variant">
                                <span className="truncate">
                                  {showGroups || item.kind === filterKind ? meta : `${kind.label} · ${meta}`}
                                </span>
                                {/* Narrow screens: status moves under the title so it does not squeeze it. */}
                                <span className={`sm:hidden shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${badge.className}`}>
                                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                                  {badge.label}
                                </span>
                              </span>
                            </button>
                            <div className="relative z-10 flex items-center gap-1 shrink-0">
                              <span className={`hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${badge.className}`}>
                                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                                {badge.label}
                              </span>
                              {item.kind === 'prompt' && (
                                <InlineDeleteButton
                                  label={`Xóa đề nguồn ${item.data.title}`}
                                  title="Xóa đề nguồn khỏi kho?"
                                  description="Các bài tập đã giao từ đề này vẫn được giữ nguyên."
                                  busy={deletingPromptId === item.data.id}
                                  disabled={Boolean(deletingPromptId)}
                                  onConfirm={() => handleDeletePrompt(item.data)}
                                />
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </section>

          <div
            ref={previewRef}
            className="scroll-mt-20 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6.5rem)] lg:overflow-y-auto overscroll-contain rounded-xl"
          >
            {selected ? (
              <div className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 sm:p-7 space-y-6 shadow-sm">
                <div className="flex items-start justify-between gap-4 pb-5 border-b border-outline-variant/20">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${purposeBadge(selected.kind)}`}>
                        {selected.kind === 'prompt' ? 'Đề nguồn' : selected.kind === 'material' ? 'Ngữ liệu' : 'Barem'}
                      </span>
                      {'gradeLevel' in selected.data && (
                        <span className="text-xs text-on-surface-variant font-medium">Khối {selected.data.gradeLevel}</span>
                      )}
                    </div>
                    <h2 className="font-headline-md text-xl sm:text-2xl font-bold text-on-surface font-merriweather leading-snug">
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
                      className="shrink-0 px-3 py-1.5 rounded-xl border border-secondary/30 text-xs font-semibold text-secondary hover:bg-secondary/5 transition-all flex items-center gap-1 disabled:opacity-40"
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
                      <span className="material-symbols-outlined text-[16px]" aria-hidden="true">edit</span>
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
                      <PreviewNote icon="summarize" label="Tóm tắt yêu cầu" text={selectedPrompt.writingTaskSummary} />
                    )}
                    <WritingTaskCallout label="Yêu cầu viết" text={selectedPrompt.writingTask || 'Chưa có yêu cầu viết.'} />
                    {selectedPrompt.extraGuidance && (
                      <PreviewNote icon="lightbulb" label="Gợi ý / các ý còn lại" text={selectedPrompt.extraGuidance} />
                    )}
                    <div className="space-y-2.5">
                      <PreviewLabel
                        icon="auto_stories"
                        aside={
                          <span className="text-[11px] font-semibold text-on-surface-variant">
                            {selectedPrompt.materials.length} văn bản
                          </span>
                        }
                      >
                        Ngữ liệu liên kết
                      </PreviewLabel>
                      {selectedPrompt.materials.map((material, index) => (
                        <MaterialPassage key={material.id} material={material} index={index} />
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
                    <div className="relative px-5 sm:px-6 py-5 rounded-xl bg-[#fffcf7] border border-outline-variant/40">
                      <span aria-hidden="true" className="absolute left-0 top-4 bottom-4 w-1 rounded-full bg-primary/60" />
                      <pre className="whitespace-pre-wrap font-merriweather text-[13.5px] leading-[1.9] text-on-surface">
                        {fullMaterial
                          ? selectedMaterial.content || selectedMaterial.excerpt || 'Chưa có nội dung.'
                          : (selectedMaterial.content || selectedMaterial.excerpt || 'Chưa có nội dung.').slice(0, 800)}
                        {!fullMaterial && (selectedMaterial.content || selectedMaterial.excerpt || '').length > 800 ? '…' : ''}
                      </pre>
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
                    {selectedRubric.description && (
                      <p className="text-sm leading-relaxed text-on-surface-variant">{selectedRubric.description}</p>
                    )}
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { icon: 'scoreboard', label: 'Thang điểm', value: `${selectedRubric.maxScore}đ` },
                        { icon: 'linear_scale', label: 'Bước điểm', value: `${selectedRubric.scoreStep}` },
                        { icon: 'checklist', label: 'Tiêu chí', value: `${selectedRubric.criteriaCount}` },
                      ].map((stat) => (
                        <div key={stat.label} className="p-3 rounded-xl bg-surface-container-low/60 border border-outline-variant/30">
                          <span className="text-[10px] font-semibold text-on-surface-variant flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px] text-primary" aria-hidden="true">{stat.icon}</span>
                            {stat.label}
                          </span>
                          <span className="block text-lg font-bold text-on-surface font-mono mt-0.5">{stat.value}</span>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-2.5">
                      <PreviewLabel icon="format_list_numbered">Tiêu chí đánh giá</PreviewLabel>
                      {(selectedRubric.criteria || []).map((criterion, index) => {
                        const share = selectedRubric.maxScore > 0 ? Math.min(100, (criterion.weight / selectedRubric.maxScore) * 100) : 0;
                        return (
                          <div key={criterion.id} className="p-3.5 rounded-xl bg-surface-container-lowest border border-outline-variant/40 space-y-2">
                            <div className="flex items-start gap-3">
                              <span className="w-7 h-7 rounded-lg bg-primary-fixed/60 text-primary text-xs font-bold font-mono flex items-center justify-center shrink-0">
                                {index + 1}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-on-surface leading-snug">{criterion.name}</p>
                                {criterion.guideNote && (
                                  <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">{criterion.guideNote}</p>
                                )}
                              </div>
                              <span className="text-xs font-bold font-mono px-2 py-0.5 rounded-full bg-secondary/10 text-secondary shrink-0">
                                {criterion.weight}đ
                              </span>
                            </div>
                            <div className="ml-10 h-1 rounded-full bg-surface-container-high overflow-hidden" aria-hidden="true">
                              <div className="h-full bg-secondary/70 rounded-full" style={{ width: `${share}%` }} />
                            </div>
                            {(criterion.levels || []).length > 0 && (
                              <div className="ml-10 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                {(criterion.levels || []).map((level, levelIndex) => (
                                  <div
                                    key={`${criterion.id}-${level.score}-${levelIndex}`}
                                    className="px-2.5 py-2 rounded-lg bg-surface-container-low/60 text-[11px] text-on-surface-variant flex gap-2"
                                  >
                                    <span className="font-bold font-mono text-primary shrink-0">{level.score}đ</span>
                                    <span className="leading-relaxed">{level.descriptor}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-on-surface-variant flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[14px]" aria-hidden="true">info</span>
                      Chọn barem này tại màn tạo bài tập, không áp dụng từ kho.
                    </p>
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
      <StudentShell headerTitle="Tra cứu ngữ liệu" headerSubtitle="Ngữ liệu giáo viên chia sẻ • Chỉ xem">
        <StudentMaterialsView />
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
