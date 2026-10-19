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
  createAssignmentHref,
  loadAssignmentDraft,
  promptMissingLabels,
  saveAssignmentDraft,
} from '@/features/catalog/draft';
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
  const assignmentId = searchParams.get('assignmentId') || '';
  const importId = searchParams.get('importId') || '';
  const draftScope = { userId: currentUser?.id, assignmentId: assignmentId || 'new' };

  const [topics, setTopics] = useState<CatalogTopic[]>([]);
  const [prompts, setPrompts] = useState<CatalogPrompt[]>([]);
  const [materials, setMaterials] = useState<CatalogMaterial[]>([]);
  const [rubrics, setRubrics] = useState<CatalogRubric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterKind, setFilterKind] = useState<ListKind>(pickMode ? 'prompt' : 'all');
  const [filterTopic, setFilterTopic] = useState('all');
  const [filterGrade, setFilterGrade] = useState('all');
  const [filterGenre, setFilterGenre] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedKey, setSelectedKey] = useState('');
  const [previewPrompt, setPreviewPrompt] = useState<CatalogPrompt | null>(null);
  const [previewMaterial, setPreviewMaterial] = useState<CatalogMaterial | null>(null);
  const [previewRubric, setPreviewRubric] = useState<CatalogRubric | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

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
    if (pickMode) {
      const previous = loadAssignmentDraft(draftScope);
      saveAssignmentDraft(
        { ...previous, classroomId: classroomId || previous.classroomId, assignmentId: assignmentId || previous.assignmentId },
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
    return list.filter((item) => {
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
  }, [prompts, materials, rubrics, filterKind, filterTopic, filterGrade, filterGenre, filterStatus, searchQuery, pickMode]);

  const selected = items.find((item) => `${item.kind}:${item.data.id}` === selectedKey) || items[0];

  useEffect(() => {
    setPreviewPrompt(null);
    setPreviewMaterial(null);
    setPreviewRubric(null);
    setPreviewError('');
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
  }, [selected?.kind, selected?.data.id]);

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

  const handleImportRubric = async (raw: string) => {
    const parsed = parseRubricJson(raw);
    if (!parsed.ok) {
      setRubricParseError(parsed.error);
      return;
    }
    setSaving(true);
    setRubricParseError('');
    try {
      await catalogApi.createRubric(parsed.rubric);
      addToast(RUBRIC_IMPORT_SUCCESS, 'success');
      setDrawer(null);
      setRubricText('');
      await load();
    } catch (err) {
      const message = err instanceof AuthApiError ? err.message : 'Không lưu được barem.';
      setRubricParseError(message);
    } finally {
      setSaving(false);
    }
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
        {isTeacher && !pickMode && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                setImportFile(null);
                setImportError('');
                setImportIntent('MIXED');
                setImportOpen(true);
              }}
              className="px-4 py-2 bg-primary-container text-on-primary-container font-semibold rounded-lg text-sm hover:brightness-95 flex items-center gap-2 shadow-sm"
            >
              <span className="material-symbols-outlined text-[18px]">upload_file</span>
              {IMPORT_DOCUMENT_LABEL}
            </button>
            <button
              onClick={() => {
                setEditingId('');
                setMaterialTitle('');
                setMaterialAuthor('');
                setMaterialSource('');
                setMaterialContent('');
                setMaterialTopicId('');
                setMaterialGradeLevel(11);
                setDrawer('material');
              }}
              className="px-4 py-2 bg-primary-container text-on-primary-container font-semibold rounded-lg text-sm hover:brightness-95 flex items-center gap-2 shadow-sm"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              Thêm ngữ liệu
            </button>
            <button
              onClick={() => {
                setEditingId('');
                setPromptTitle('');
                setPromptTask('');
                setPromptMaterialIds([]);
                setPromptTopicId('');
                setPromptGradeLevel(11);
                setPromptGenre('NLVH');
                setDrawer('prompt');
              }}
              className="px-4 py-2 border border-outline-variant/60 bg-surface-container-lowest font-semibold rounded-lg text-sm hover:bg-surface-container flex items-center gap-2"
            >
              Thêm đề nguồn
            </button>
            <button
              onClick={() => {
                setTopicTitle('');
                setTopicGradeLevel(11);
                setTopicGenre('NLXH');
                setDrawer('topic');
              }}
              className="px-4 py-2 border border-outline-variant/60 bg-surface-container-lowest font-semibold rounded-lg text-sm hover:bg-surface-container flex items-center gap-2"
            >
              Thêm chuyên đề
            </button>
            <button
              onClick={() => setDrawer('rubric')}
              className="px-4 py-2 border border-outline-variant/60 bg-surface-container-lowest font-semibold rounded-lg text-sm hover:bg-surface-container flex items-center gap-2"
            >
              Nhập barem JSON
            </button>
          </div>
        )}
      </div>

      {pickMode && (
        <div className="p-4 bg-secondary-fixed/40 border border-secondary/40 rounded-xl text-sm text-on-surface whitespace-pre-line">
          {PICK_PROMPT_NOTICE}
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
        <div className="p-3 bg-error-container/50 text-error text-sm rounded-xl">{error}</div>
      )}

      {loading ? (
        <div className="p-12 text-center text-sm text-on-surface-variant">Đang tải kho học liệu...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 space-y-3">
            {items.map((item) => {
              const key = `${item.kind}:${item.data.id}`;
              const isSelected = selected && key === `${selected.kind}:${selected.data.id}`;
              const purpose =
                item.kind === 'prompt' ? 'Đề nguồn' : item.kind === 'material' ? 'Ngữ liệu' : 'Barem';
              return (
                <div
                  key={key}
                  onClick={() => setSelectedKey(key)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-surface-container-lowest border-secondary shadow-md ring-1 ring-secondary'
                      : 'bg-surface-container-lowest border-outline-variant/30 hover:border-outline-variant/70 shadow-sm'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-secondary-fixed/60 text-secondary">
                      {purpose}
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-tertiary-container/30 text-tertiary">
                      {item.kind === 'prompt'
                        ? item.data.ready
                          ? 'Sẵn sàng'
                          : 'Chưa đủ dữ liệu'
                        : item.data.status === 'READY'
                        ? 'Sẵn sàng'
                        : item.data.status}
                    </span>
                  </div>
                  <h3 className="font-headline-sm text-sm font-bold text-on-surface font-merriweather line-clamp-2">
                    {item.data.title}
                  </h3>
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
              <div className="bg-surface-container-lowest rounded-xl p-6 border border-outline-variant/30 shadow-sm space-y-5">
                <div className="flex items-start justify-between gap-4 pb-4 border-b border-outline-variant/20">
                  <div>
                    <h2 className="font-headline-md text-lg sm:text-xl font-bold text-on-surface font-merriweather">
                      {selected.data.title}
                    </h2>
                    <p className="text-xs text-on-surface-variant mt-1">
                      {selected.kind === 'prompt'
                        ? `${selected.data.genre} • Khối ${selected.data.gradeLevel}`
                        : selected.kind === 'material'
                        ? `${selected.data.author || 'Chưa có tác giả'} • Khối ${selected.data.gradeLevel}`
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
                          setEditingId(selectedPrompt.id);
                          setPromptTitle(selectedPrompt.title);
                          setPromptTask(selectedPrompt.writingTask);
                          setPromptGenre(selectedPrompt.genre);
                          setPromptTopicId(selectedPrompt.topicId || '');
                          setPromptGradeLevel(selectedPrompt.gradeLevel || 11);
                          setPromptMaterialIds(selectedPrompt.materials.map((item) => item.id));
                          setDrawer('prompt');
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
                {previewError && <p className="text-sm text-error">{previewError}</p>}

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
                    <div className="space-y-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-outline block">Ngữ liệu liên kết</span>
                      {selectedPrompt.materials.map((material) => (
                        <div key={material.id} className="p-3 rounded-lg bg-surface-container-low/50 text-xs">
                          <p className="font-semibold">{material.title}</p>
                          <p className="text-on-surface-variant mt-1">{material.sourceInfo || material.excerpt}</p>
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
                    {selectedPrompt.ready ? (
                      <Link
                        href={createAssignmentHref(selectedPrompt.id, {
                          classroomId,
                          assignmentId: assignmentId || loadAssignmentDraft(draftScope).assignmentId,
                        })}
                        onClick={() =>
                          saveAssignmentDraft(
                            {
                              ...loadAssignmentDraft(draftScope),
                              promptId: selectedPrompt.id,
                              classroomId,
                              assignmentId: assignmentId || loadAssignmentDraft(draftScope).assignmentId,
                            },
                            draftScope
                          )
                        }
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary-container text-on-primary-container text-xs font-semibold rounded-lg"
                      >
                        {pickMode ? 'Dùng đề này & Tiếp tục' : 'Tạo bài tập từ đề này'}
                        <span className="material-symbols-outlined text-sm">arrow_forward</span>
                      </Link>
                    ) : (
                      <div className="p-3 bg-[#FEF9C3] rounded-lg text-xs text-[#CA8A04]">
                        Đề chưa đủ dữ liệu: cần bổ sung {promptMissingLabels(selectedPrompt.missing, MISSING_LABELS)}.
                        Không thể dùng đề này để tạo bài tập.
                      </div>
                    )}
                  </>
                )}

                {selected.kind === 'material' && selectedMaterial && previewReady && (
                  <>
                    <p className="text-xs text-on-surface-variant">{selectedMaterial.sourceInfo}</p>
                    <div className="p-4 bg-surface-container-low/40 rounded-xl border-l-4 border-primary text-sm font-merriweather whitespace-pre-wrap">
                      {selectedMaterial.content || selectedMaterial.excerpt || 'Chưa có nội dung.'}
                    </div>
                  </>
                )}

                {selected.kind === 'rubric' && selectedRubric && previewReady && (
                  <>
                    <p className="text-sm text-on-surface-variant">{selectedRubric.description}</p>
                    <p className="text-xs">
                      Thang {selectedRubric.maxScore}đ • bước {selectedRubric.scoreStep} • {selectedRubric.criteriaCount} tiêu chí.
                      Chọn barem này tại màn tạo đề, không áp dụng từ kho.
                    </p>
                    {(selectedRubric.criteria || []).map((criterion) => (
                      <div key={criterion.id} className="p-2.5 bg-surface-container-low/50 rounded-lg text-xs">
                        <span className="font-bold text-primary">
                          {criterion.name} ({criterion.weight}đ)
                        </span>
                        {criterion.guideNote && (
                          <p className="text-on-surface-variant mt-1">{criterion.guideNote}</p>
                        )}
                      </div>
                    ))}
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
                if (editingId) {
                  await catalogApi.updateMaterial(editingId, body);
                  addToast('Đã cập nhật ngữ liệu.', 'success');
                } else {
                  await catalogApi.createMaterial(body);
                  addToast('Đã lưu ngữ liệu vào kho.', 'success');
                }
                setDrawer(null);
                setEditingId('');
                setMaterialTitle('');
                setMaterialContent('');
                await load();
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
                if (editingId) {
                  await catalogApi.updatePrompt(editingId, body);
                  addToast('Đã cập nhật đề nguồn.', 'success');
                } else {
                  await catalogApi.createPrompt(body);
                  addToast('Đã lưu đề nguồn.', 'success');
                }
                setDrawer(null);
                setEditingId('');
                setPromptTitle('');
                setPromptTask('');
                await load();
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
            </div>
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
                router.replace(`/materials?importId=${created.id}`);
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
          onClose={() => router.replace('/materials')}
          onConfirmed={() => {
            addToast('Đã lưu ngữ liệu/đề/barem vào kho. Barem chỉ chọn khi tạo bài tập.', 'success');
            router.replace('/materials');
            void load();
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
                className="px-4 py-2 bg-primary-container text-on-primary-container rounded-lg font-semibold"
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
          <button onClick={onClose} className="p-1">
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
        className="px-4 py-2 bg-primary-container text-on-primary-container rounded-lg font-semibold"
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
