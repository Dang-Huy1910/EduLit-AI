'use client';

import React, { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import TeacherShell from '@/components/TeacherShell';
import { useAppStore } from '@/lib/store';
import { AuthApiError } from '@/lib/auth-types';
import { catalogApi } from '@/features/catalog/api';
import {
  beginNewAssignmentDraft,
  clearAssignmentDraft,
  isCatalogUuid,
  loadAssignmentDraft,
  pickPromptHref,
  saveAssignmentDraft,
} from '@/features/catalog/draft';
import { downloadOriginalDocument } from '@/features/catalog/download';
import { PICK_PROMPT_NOTICE } from '@/features/catalog/types';
import type {
  AssignmentDraftState,
  CatalogPrompt,
  CatalogRubric,
  CatalogRubricCriterion,
  ClassroomMember,
  ClassroomSummary,
  TeacherAssignment,
} from '@/features/catalog/types';
import AssignmentSubmissionsPanel from '@/features/assessment/AssignmentSubmissionsPanel';
import AssignmentStatisticsPanel from '@/features/assessment/AssignmentStatisticsPanel';

type PageIssueKind =
  | 'missing-prompt'
  | 'prompt-not-found'
  | 'prompt-load'
  | 'assignment-load'
  | 'rubric-load'
  | 'classroom-load';

type PageIssue = { kind: PageIssueKind; message: string };

function isNotFound(err: unknown): boolean {
  return (
    err instanceof AuthApiError &&
    (err.status === 404 || err.status === 403 || err.status === 422 || err.code === 'NOT_FOUND' || err.code === 'ACCESS_DENIED')
  );
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof AuthApiError ? err.message : fallback;
}

function AssignmentEditorPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { addToast, currentUser } = useAppStore();

  const assignmentId = (params?.id as string) || 'new';
  const isNew = assignmentId === 'new';
  const tabParam = searchParams.get('tab') || 'details';
  const promptId = searchParams.get('promptId') || '';
  const queryAssignmentId = isCatalogUuid(searchParams.get('assignmentId')) ? searchParams.get('assignmentId') || '' : '';
  const existingAssignmentId = !isNew && isCatalogUuid(assignmentId) ? assignmentId : queryAssignmentId;
  const draftScope = { userId: currentUser?.id, assignmentId: existingAssignmentId || 'new' };
  const storedDraft = loadAssignmentDraft(draftScope);
  const classroomFromQuery = searchParams.get('classroomId') || storedDraft.classroomId || '';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [issue, setIssue] = useState<PageIssue | null>(null);
  const [rubricIssue, setRubricIssue] = useState('');
  const [classroomIssue, setClassroomIssue] = useState('');
  const [memberIssue, setMemberIssue] = useState('');
  const [prompt, setPrompt] = useState<CatalogPrompt | null>(null);
  const [rubrics, setRubrics] = useState<CatalogRubric[]>([]);
  const [classrooms, setClassrooms] = useState<ClassroomSummary[]>([]);
  const [members, setMembers] = useState<ClassroomMember[]>([]);
  const [assignment, setAssignment] = useState<TeacherAssignment | null>(null);
  const assignmentRef = useRef<TeacherAssignment | null>(null);
  const loadGen = useRef(0);
  const previousPromptTitle = useRef('');

  const [title, setTitle] = useState(storedDraft.title || '');
  const [extraInstructions, setExtraInstructions] = useState(storedDraft.extraInstructions || '');
  const [classroomId, setClassroomId] = useState(classroomFromQuery);
  const [dueAt, setDueAt] = useState(storedDraft.dueAt || '');
  const [selectedRubricId, setSelectedRubricId] = useState(storedDraft.rubricId || '');
  const [criteria, setCriteria] = useState<CatalogRubricCriterion[]>(storedDraft.criteria || []);
  const [maxScore, setMaxScore] = useState(storedDraft.maxScore || 0);
  const [scoreStep, setScoreStep] = useState(storedDraft.scoreStep || 0.25);
  const [recipientIds, setRecipientIds] = useState<string[]>(storedDraft.recipientStudentIds || []);
  const [assignToWholeClass, setAssignToWholeClass] = useState(storedDraft.assignToWholeClass ?? true);
  const assignToWholeClassRef = useRef(assignToWholeClass);
  const [fullPreview, setFullPreview] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [loadNonce, setLoadNonce] = useState(0);
  const [memberNonce, setMemberNonce] = useState(0);

  assignToWholeClassRef.current = assignToWholeClass;

  const totalWeight = criteria.reduce((sum, item) => sum + (Number(item.weight) || 0), 0);
  const isValidTotal = maxScore > 0 && Math.abs(totalWeight - maxScore) < 0.001;
  const currentRubric = rubrics.find((item) => item.id === selectedRubricId);
  const sourceDocumentId = prompt?.sourceDocumentId || prompt?.materials.find((item) => item.sourceDocumentId)?.sourceDocumentId;
  const isPublished = assignment?.status === 'PUBLISHED';
  const activeTab =
    isPublished && (tabParam === 'submissions' || tabParam === 'statistics' || tabParam === 'details')
      ? tabParam
      : 'details';
  const setActiveTab = (tab: 'details' | 'submissions' | 'statistics') => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    if (tab !== 'statistics') params.delete('mode');
    router.replace(`/assignments/${assignmentId}?${params.toString()}`, { scroll: false });
  };
  const snapshot = assignment?.publishedSnapshot;
  const displayWritingTask = isPublished
    ? snapshot?.writingTask || assignment?.publishedWritingTask || prompt?.writingTask
    : prompt?.writingTask;
  const displayWritingSummary = isPublished ? snapshot?.writingTaskSummary : prompt?.writingTaskSummary;
  const displayMaterials = isPublished ? assignment?.publishedMaterials || snapshot?.materials || prompt?.materials : prompt?.materials;
  const displayExtra = isPublished ? assignment?.publishedExtraInstructions ?? snapshot?.extraInstructions ?? extraInstructions : extraInstructions;

  useEffect(() => {
    const gen = ++loadGen.current;
    let cancelled = false;
    const stillActive = () => !cancelled && gen === loadGen.current;

    setLoading(true);
    setIssue(null);
    setRubricIssue('');
    setClassroomIssue('');

    void (async () => {
      let rubricItems: CatalogRubric[] = [];
      try {
        const rubricRes = await catalogApi.listRubrics();
        rubricItems = await Promise.all(rubricRes.items.map((item) => catalogApi.getRubric(item.id).catch(() => item)));
        if (stillActive()) setRubrics(rubricItems);
      } catch (err) {
        if (stillActive()) {
          setRubrics([]);
          setRubricIssue(errorText(err, 'Không tải được danh sách barem.'));
        }
      }

      try {
        const classRes = await catalogApi.listClassrooms();
        if (stillActive()) {
          setClassrooms(classRes.items);
          const draft = loadAssignmentDraft(draftScope);
          if (!searchParams.get('classroomId') && !draft.classroomId && classRes.items[0]) {
            setClassroomId(classRes.items[0].id);
          }
        }
      } catch (err) {
        if (stillActive()) {
          setClassrooms([]);
          setClassroomIssue(errorText(err, 'Không tải được danh sách lớp.'));
        }
      }

      if (!stillActive()) return;
      const draft = loadAssignmentDraft(draftScope);

      if (existingAssignmentId) {
        try {
          const existing = await catalogApi.getTeacherAssignment(existingAssignmentId);
          if (!stillActive()) return;
          assignmentRef.current = existing;
          setAssignment(existing);
          applyLoadedAssignment(existing, draft);
          const promptToLoad = isCatalogUuid(promptId) ? promptId : existing.sourcePromptId;
          await hydratePrompt(promptToLoad, draft, stillActive, rubricItems, existing);
        } catch (err) {
          if (!stillActive()) return;
          setIssue({
            kind: 'assignment-load',
            message: isNotFound(err)
              ? 'Không tìm thấy bài tập hoặc không có quyền mở bài này.'
              : errorText(err, 'Không tải được bài tập.'),
          });
        }
      } else if (isCatalogUuid(promptId)) {
        await hydratePrompt(promptId, draft, stillActive, rubricItems);
      } else if (promptId) {
        setIssue({
          kind: 'prompt-not-found',
          message: 'Mã đề không hợp lệ. Hãy chọn lại đề nguồn từ kho.',
        });
      } else {
        setIssue({
          kind: 'missing-prompt',
          message: 'Cần chọn đề nguồn trước khi tạo bài tập.',
        });
      }

      if (stillActive()) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [assignmentId, isNew, promptId, existingAssignmentId, currentUser?.id, loadNonce]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!classrooms.length && !classroomId) {
        setMembers([]);
        return;
      }
      setMemberIssue('');
      try {
        let students: ClassroomMember[] = [];
        if (classroomId) {
          const detail = await catalogApi.getClassroom(classroomId);
          students = detail.members.filter((member) => member.role === 'STUDENT');
        } else {
          const details = await Promise.all(classrooms.map((item) => catalogApi.getClassroom(item.id)));
          const seen = new Set<string>();
          for (const detail of details) {
            for (const member of detail.members.filter((row) => row.role === 'STUDENT')) {
              if (!seen.has(member.userId)) {
                seen.add(member.userId);
                students.push(member);
              }
            }
          }
        }
        if (cancelled) return;
        setMembers(students);
        setRecipientIds((current) => {
          if (classroomId && assignToWholeClassRef.current) {
            return students.map((member) => member.userId);
          }
          const allowed = new Set(students.map((member) => member.userId));
          return current.filter((id) => allowed.has(id));
        });
      } catch (err) {
        if (cancelled) return;
        setMembers([]);
        setMemberIssue(errorText(err, 'Không tải được danh sách học sinh.'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [classroomId, classrooms, memberNonce]);

  async function hydratePrompt(
    id: string,
    draft: AssignmentDraftState,
    stillActive: () => boolean,
    rubricItems: CatalogRubric[],
    existing?: TeacherAssignment
  ) {
    try {
      const loaded = await catalogApi.getPrompt(id);
      if (!stillActive()) return;
      setPrompt(loaded);
      applyPromptFields(draft, loaded, existing);
      if (!draft.rubricId && !draft.criteria?.length && !existing?.assignmentRubric?.criteria?.length && rubricItems[0]?.criteria?.length) {
        applyRubric(rubricItems[0], false);
      }
      setIssue(null);
    } catch (err) {
      if (!stillActive()) return;
      setPrompt(null);
      if (isNotFound(err)) {
        setIssue({
          kind: 'prompt-not-found',
          message: 'Không tìm thấy đề nguồn hoặc không có quyền xem đề này.',
        });
      } else {
        setIssue({
          kind: 'prompt-load',
          message: errorText(err, 'Không tải được đề nguồn.'),
        });
      }
    }
  }

  function applyPromptFields(draft: AssignmentDraftState, loadedPrompt: CatalogPrompt, existing?: TeacherAssignment) {
    const changingSource = Boolean(draft.promptId && draft.promptId !== loadedPrompt.id);
    if (changingSource) {
      const keepCustomTitle = Boolean(draft.title && draft.title !== previousPromptTitle.current);
      setTitle(keepCustomTitle ? draft.title || loadedPrompt.title : loadedPrompt.title);
    } else if (draft.title) {
      setTitle(draft.title);
    } else if (existing?.title) {
      setTitle(existing.title);
    } else {
      setTitle(loadedPrompt.title);
    }
    previousPromptTitle.current = loadedPrompt.title;
    if (draft.extraInstructions != null) setExtraInstructions(draft.extraInstructions);
    else if (existing) setExtraInstructions(existing.extraInstructions ?? '');
    if (draft.classroomId) setClassroomId(draft.classroomId);
    else if (existing?.classroomId) setClassroomId(existing.classroomId);
    if (draft.dueAt) setDueAt(draft.dueAt);
    else if (existing) setDueAt(toDateTimeLocal(existing.dueAt));
    if (draft.recipientStudentIds) setRecipientIds(draft.recipientStudentIds);
    else if (existing?.recipientStudentIds) setRecipientIds(existing.recipientStudentIds);
    if (typeof draft.assignToWholeClass === 'boolean') setAssignToWholeClass(draft.assignToWholeClass);
    else if (existing) setAssignToWholeClass(Boolean(existing.assignToWholeClass));
  }

  function applyLoadedAssignment(existing: TeacherAssignment, draft: AssignmentDraftState) {
    if (draft.rubricId) setSelectedRubricId(draft.rubricId);
    else if (existing.rubricId) setSelectedRubricId(existing.rubricId);
    if (draft.criteria?.length) {
      setCriteria(draft.criteria);
      if (draft.maxScore) setMaxScore(draft.maxScore);
      if (draft.scoreStep) setScoreStep(draft.scoreStep);
    } else if (existing.assignmentRubric?.criteria) {
      setCriteria(existing.assignmentRubric.criteria);
      setMaxScore(existing.assignmentRubric.maxScore);
      setScoreStep(existing.assignmentRubric.scoreStep);
    }
  }

  const localDraftPayload = (): AssignmentDraftState => ({
    assignmentId: assignmentRef.current?.id || existingAssignmentId || undefined,
    classroomId,
    promptId: prompt?.id || (isCatalogUuid(promptId) ? promptId : undefined),
    title,
    extraInstructions,
    dueAt,
    rubricId: selectedRubricId,
    recipientStudentIds: recipientIds,
    assignToWholeClass,
    maxScore,
    scoreStep,
    criteria,
  });

  const persistLocalDraft = (extra: AssignmentDraftState = {}) => {
    const payload = { ...localDraftPayload(), ...extra };
    if (assignment?.status === 'PUBLISHED') return payload;
    const scopeId = isCatalogUuid(payload.assignmentId) ? payload.assignmentId : 'new';
    saveAssignmentDraft(payload, { userId: currentUser?.id, assignmentId: scopeId });
    return payload;
  };

  useEffect(() => {
    if (loading || issue || assignment?.status === 'PUBLISHED') return;
    persistLocalDraft();
  }, [title, extraInstructions, classroomId, dueAt, selectedRubricId, criteria, maxScore, scoreStep, recipientIds, assignToWholeClass, prompt?.id, loading, assignment?.status]);

  const applyRubric = (rubric: CatalogRubric, toast = true) => {
    setSelectedRubricId(rubric.id);
    setCriteria(JSON.parse(JSON.stringify(rubric.criteria || [])));
    setMaxScore(rubric.maxScore);
    setScoreStep(rubric.scoreStep);
    if (toast) addToast(`Đã chọn ${rubric.shortTitle || rubric.title} cho bài đang tạo.`, 'success');
  };

  const assignmentRubricPayload = () => ({
    title: currentRubric?.title || title,
    shortTitle: currentRubric?.shortTitle || currentRubric?.title || 'Barem bài tập',
    description: currentRubric?.description || '',
    version: String(currentRubric?.version || 'v1'),
    gradeLevel: prompt?.gradeLevel || 11,
    maxScore,
    scoreStep,
    criteria,
  });

  const persistDraft = async () => {
    if (!prompt?.id) {
      addToast('Cần chọn đề nguồn trước khi lưu.', 'warning');
      return null;
    }
    if (!selectedRubricId && criteria.length === 0) {
      addToast('Cần chọn barem cho bài tập.', 'warning');
      return null;
    }
    const body = {
      sourcePromptId: prompt.id,
      rubricId: selectedRubricId || undefined,
      assignmentRubric: assignmentRubricPayload(),
      classroomId: classroomId || undefined,
      title,
      extraInstructions,
      dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      assignToWholeClass,
      recipientStudentIds: assignToWholeClass ? [] : recipientIds,
    };
    const current = assignmentRef.current;
    if (current?.status === 'PUBLISHED') return current;
    const currentId = current?.id;
    try {
      const saved = currentId
        ? await catalogApi.updateAssignment(currentId, body)
        : await catalogApi.createAssignment(body);
      assignmentRef.current = saved;
      setAssignment(saved);
      persistLocalDraft({ assignmentId: saved.id, promptId: prompt.id });
      return saved;
    } catch (err) {
      if (currentId && err instanceof AuthApiError && err.code === 'ASSIGNMENT_STATUS') {
        const latest = await catalogApi.getTeacherAssignment(currentId);
        assignmentRef.current = latest;
        setAssignment(latest);
        persistLocalDraft({ assignmentId: latest.id, promptId: prompt.id });
        return latest;
      }
      throw err;
    }
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      const saved = await persistDraft();
      if (!saved) return;
      persistLocalDraft({ assignmentId: saved.id, promptId: prompt?.id });
      beginNewAssignmentDraft({ classroomId }, { userId: currentUser?.id });
      addToast(`Đã lưu bản nháp "${saved.title}". Học sinh chưa thấy bài này.`, 'success');
      router.push('/assignments');
    } catch (err) {
      addToast(err instanceof AuthApiError ? err.message : 'Không lưu được bản nháp.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!isValidTotal) {
      addToast(
        `Tổng điểm hiện tại là ${totalWeight.toFixed(2)}đ. Tổng điểm phải bằng ${maxScore}đ theo thang của barem.`,
        'error'
      );
      return;
    }
    if (!prompt?.ready) {
      addToast('Đề nguồn chưa đủ ngữ liệu và yêu cầu viết.', 'error');
      return;
    }
    if (assignToWholeClass && !classroomId) {
      addToast('Cần chọn lớp khi giao toàn lớp.', 'error');
      return;
    }
    if (!assignToWholeClass && !recipientIds.length) {
      addToast('Cần chọn học sinh nhận bài, hoặc chọn giao toàn lớp.', 'error');
      return;
    }
    setSaving(true);
    try {
      const saved = await persistDraft();
      if (!saved) return;
      assignmentRef.current = saved;
      setAssignment(saved);
      persistLocalDraft({ assignmentId: saved.id, promptId: prompt?.id });
      const published = await catalogApi.publishAssignment(saved.id);
      clearAssignmentDraft({ userId: currentUser?.id, assignmentId: 'new' });
      clearAssignmentDraft({ userId: currentUser?.id, assignmentId: saved.id });
      addToast(`Đã giao bài "${published.title}" (${published.code}).`, 'success');
      router.push('/assignments');
    } catch (err) {
      addToast(err instanceof AuthApiError ? err.message : 'Không giao được bài.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAsRubric = async () => {
    try {
      let targetId = assignmentRef.current?.id;
      if (!targetId) {
        const saved = await persistDraft();
        if (!saved) return;
        targetId = saved.id;
      }
      const created = await catalogApi.saveAsRubric(targetId, {
        title: `${currentRubric?.title || 'Barem'} — bản bài tập`,
        assignmentRubric: assignmentRubricPayload(),
      });
      addToast(`Đã lưu thành barem mới trong kho: ${created.title}.`, 'success');
      const list = await catalogApi.listRubrics();
      setRubrics(await Promise.all(list.items.map((item) => catalogApi.getRubric(item.id))));
    } catch (err) {
      addToast(err instanceof AuthApiError ? err.message : 'Không lưu được barem mới.', 'error');
    }
  };

  const handleDownloadOriginal = async () => {
    if (!sourceDocumentId) return;
    setDownloading(true);
    try {
      await downloadOriginalDocument(sourceDocumentId);
    } catch (err) {
      addToast(err instanceof AuthApiError ? err.message : 'Không tải được file gốc.', 'error');
    } finally {
      setDownloading(false);
    }
  };

  const retryLoad = () => {
    setIssue(null);
    setLoadNonce((value) => value + 1);
  };

  const pickHref = pickPromptHref({
    ...storedDraft,
    classroomId: classroomId || classroomFromQuery,
    assignmentId: existingAssignmentId || undefined,
    promptId: prompt?.id,
  });

  if (issue?.kind === 'missing-prompt' || issue?.kind === 'prompt-not-found' || issue?.kind === 'prompt-load' || issue?.kind === 'assignment-load') {
    const isMissing = issue.kind === 'missing-prompt';
    return (
      <TeacherShell
        breadcrumb={
          <div className="flex items-center gap-2 text-sm text-on-surface-variant">
            <Link href="/assignments" className="hover:text-primary">
              Quản lý bài tập
            </Link>
            <span>/</span>
            <span className="text-on-surface font-semibold">Tạo bài tập mới</span>
          </div>
        }
      >
        <div className="max-w-2xl mx-auto space-y-4 p-6 bg-surface-container-lowest rounded-xl border">
          <h1 className="font-headline-lg text-2xl font-bold font-merriweather">
            {isMissing ? 'Cần chọn đề nguồn trước' : 'Không tải được đề nguồn'}
          </h1>
          {isMissing ? (
            <div className="p-4 bg-secondary-fixed/40 border border-secondary/40 rounded-xl whitespace-pre-line text-sm">
              {PICK_PROMPT_NOTICE}
            </div>
          ) : (
            <div className="p-4 bg-error-container/50 text-error text-sm rounded-xl">{issue.message}</div>
          )}
          <p className="text-sm text-on-surface-variant">
            {isMissing
              ? 'Không dùng đề mẫu mặc định. Thầy/cô hãy chọn đề từ kho rồi tiếp tục.'
              : 'Có thể thử tải lại, hoặc chọn đề khác trong kho.'}
          </p>
          <div className="flex flex-wrap gap-2">
            {!isMissing && (
              <button
                type="button"
                onClick={retryLoad}
                className="inline-flex px-4 py-2 border border-outline-variant/60 rounded-lg text-sm font-semibold"
              >
                Thử lại
              </button>
            )}
            <Link
              href={pickHref}
              className="inline-flex px-4 py-2 bg-primary-container text-on-primary-container rounded-lg text-sm font-semibold"
            >
              Chọn đề trong kho
            </Link>
          </div>
        </div>
      </TeacherShell>
    );
  }

  return (
    <TeacherShell
      breadcrumb={
        <div className="flex items-center gap-space-xs font-label-md text-sm text-on-surface-variant">
          <Link href="/assignments" className="hover:text-primary">
            Quản lý bài tập
          </Link>
          <span className="text-outline-variant">/</span>
          <span className="text-on-surface font-semibold">
            {isPublished ? assignment?.title || 'Chi tiết bài tập' : isNew ? 'Tạo bài tập mới cho lớp' : 'Soạn đề & Cấu hình Rubric'}
          </span>
        </div>
      }
    >
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-outline-variant/20">
          <div>
            <div className="flex items-center gap-2 mb-1">
              {currentRubric && (
                <>
                  <span className="text-xs bg-primary-fixed text-primary font-bold px-2 py-0.5 rounded-full font-mono">
                    v{currentRubric.version}
                  </span>
                  <span className="text-xs text-on-surface-variant font-medium">
                    {currentRubric.shortTitle || currentRubric.title}
                  </span>
                </>
              )}
              {assignment?.code && (
                <span className="text-xs font-mono text-secondary">Mã: {assignment.code}</span>
              )}
            </div>
            <h1 className="font-headline-lg text-2xl font-bold text-on-surface font-merriweather">
              {isPublished
                ? assignment?.title || 'Chi tiết bài tập'
                : isNew
                  ? 'Tạo đề bài mới & Thiết lập Rubric GDPT 2018'
                  : 'Cấu hình Đề bài & Thang tiêu chí Rubric'}
            </h1>
            <p className="text-xs text-on-surface-variant mt-1">
              {isPublished
                ? 'Đề, ngữ liệu và barem đã chốt khi giao. Sửa kho sau đó không đổi bài này.'
                : 'Barem đang soạn là bản của bài này, không sửa ngầm barem gốc.'}
            </p>
          </div>
          {isPublished ? (
            <Link
              href="/assignments"
              className="px-4 py-2 rounded-lg border border-outline-variant/60 bg-surface-container-lowest text-xs font-medium"
            >
              Về danh sách bài tập
            </Link>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={() => void handleSaveDraft()}
                disabled={saving || loading || !prompt?.id}
                className="px-4 py-2 rounded-lg border border-outline-variant/60 bg-surface-container-lowest text-xs font-medium text-on-surface hover:bg-surface-container transition-all shadow-sm disabled:opacity-40"
              >
                Lưu bản nháp
              </button>
              <button
                onClick={() => void handlePublish()}
                disabled={saving || loading || !prompt?.id}
                className="px-4 py-2 rounded-lg bg-primary-container text-on-primary-container text-xs font-bold hover:brightness-95 transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-40"
              >
                <span className="material-symbols-outlined text-[16px]">verified</span>
                Xác nhận Rubric &amp; Giao bài
              </button>
            </div>
          )}
        </div>

        {isPublished ? (
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['details', 'Đề bài & Barem', 'menu_book'],
                ['submissions', 'Bài nộp & Chấm điểm', 'assignment_turned_in'],
                ['statistics', 'Thống kê bài này', 'bar_chart'],
              ] as const
            ).map(([id, label, icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 ${
                  activeTab === id
                    ? 'bg-primary-container text-on-primary-container'
                    : 'bg-surface-container-lowest border border-outline-variant/40'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">{icon}</span>
                {label}
              </button>
            ))}
          </div>
        ) : null}

        <div className="p-3.5 bg-surface-container-low/70 border border-outline-variant/30 rounded-xl flex items-center gap-3 text-xs text-on-surface-variant">
          <span className="material-symbols-outlined text-secondary text-lg">history_edu</span>
          <span>
            <strong>Bảo toàn phiên bản:</strong> Khi phát hành, hệ thống lưu bản sao đề, ngữ liệu và barem. Sửa kho sau đó
            không đổi bài đã giao.
          </span>
        </div>

        {rubricIssue && (
          <InlineRetry message={rubricIssue} onRetry={() => setLoadNonce((value) => value + 1)} />
        )}
        {classroomIssue && (
          <InlineRetry message={classroomIssue} onRetry={() => setLoadNonce((value) => value + 1)} />
        )}

        {loading ? (
          <div className="p-12 text-center text-sm text-on-surface-variant">Đang tải dữ liệu bài tập...</div>
        ) : isPublished && activeTab === 'submissions' ? (
          <AssignmentSubmissionsPanel assignmentId={existingAssignmentId || assignmentId} />
        ) : isPublished && activeTab === 'statistics' ? (
          <AssignmentStatisticsPanel assignmentId={existingAssignmentId || assignmentId} />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 space-y-6">
              <section className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/30 shadow-sm space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
                  <span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm">menu_book</span>
                    Đề nguồn đã chọn
                  </span>
                  {isPublished ? (
                    <span className="text-[11px] text-tertiary font-semibold">Bản đã giao</span>
                  ) : (
                    <Link
                      href={pickHref}
                      onClick={() => persistLocalDraft({ promptId: prompt?.id })}
                      className="text-xs font-semibold text-secondary"
                    >
                      Đổi đề
                    </Link>
                  )}
                </div>
                <h2 className="font-merriweather font-bold text-lg">{prompt?.title || 'Chưa có đề nguồn'}</h2>
                {displayWritingSummary && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-outline">Tóm tắt yêu cầu</span>
                    <p className="text-sm whitespace-pre-line">{displayWritingSummary}</p>
                  </div>
                )}
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-outline">Yêu cầu viết đầy đủ</span>
                  <p className="text-sm whitespace-pre-line">{displayWritingTask || 'Chưa có yêu cầu viết.'}</p>
                </div>
                {prompt?.extraGuidance && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-outline">Gợi ý</span>
                    <p className="text-sm whitespace-pre-line">{prompt.extraGuidance}</p>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setFullPreview((value) => !value)}
                    className="text-xs text-secondary font-semibold"
                  >
                    {fullPreview ? 'Thu gọn ngữ liệu' : 'Xem toàn văn ngữ liệu'}
                  </button>
                  {sourceDocumentId && (
                    <button
                      type="button"
                      disabled={downloading}
                      onClick={() => void handleDownloadOriginal()}
                      className="text-xs text-secondary font-semibold disabled:opacity-40"
                    >
                      {downloading ? 'Đang tải...' : 'Tải file gốc'}
                    </button>
                  )}
                </div>
                {fullPreview &&
                  (displayMaterials || []).map((material) => (
                    <div key={material.id} className="p-3 bg-surface-container-low/50 rounded-lg text-xs space-y-1">
                      <p className="font-semibold">{material.title}</p>
                      <p className="text-on-surface-variant">
                        {material.author ? `${material.author} • ` : ''}
                        {material.sourceInfo || 'Chưa có thông tin nguồn'}
                      </p>
                      <pre className="whitespace-pre-wrap font-merriweather">{material.content || material.excerpt}</pre>
                    </div>
                  ))}
                {prompt && !prompt.ready && (
                  <div className="p-3 bg-[#FEF9C3] rounded-lg text-xs text-[#CA8A04]">
                    Đề chưa đủ dữ liệu để giao bài. Hãy bổ sung ngữ liệu hoặc yêu cầu viết trong kho.
                  </div>
                )}
              </section>

              <section className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/30 shadow-sm space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
                  <span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm">edit_document</span>
                    Thông tin bài tập
                  </span>
                  {prompt && (
                    <span className="text-xs text-on-surface-variant font-medium">
                      {prompt.genre} • Khối {prompt.gradeLevel}
                    </span>
                  )}
                </div>
                <label className="block text-xs font-semibold text-on-surface">Tiêu đề bài viết</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={isPublished}
                  className="w-full px-3 py-2 text-sm font-semibold rounded-lg border border-outline-variant/60 bg-surface focus:outline-none focus:border-secondary font-merriweather disabled:opacity-70"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block font-semibold text-on-surface mb-1">Lớp nhận bài</label>
                    <select
                      value={classroomId}
                      onChange={(e) => {
                        setClassroomId(e.target.value);
                        persistLocalDraft({ classroomId: e.target.value });
                      }}
                      disabled={isPublished}
                      className="w-full px-3 py-2 rounded-lg border border-outline-variant/60 bg-surface focus:outline-none focus:border-secondary disabled:opacity-70"
                    >
                      <option value="">Chọn lớp</option>
                      {classrooms.map((classroom) => (
                        <option key={classroom.id} value={classroom.id}>
                          {classroom.name} ({classroom.studentCount} HS)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-on-surface mb-1">Hạn nộp</label>
                    <input
                      type="datetime-local"
                      value={dueAt}
                      onChange={(e) => setDueAt(e.target.value)}
                      disabled={isPublished}
                      className="w-full px-3 py-2 rounded-lg border border-outline-variant/60 bg-surface focus:outline-none focus:border-secondary disabled:opacity-70"
                    />
                  </div>
                </div>
                <label className="block text-xs font-semibold text-on-surface">Hướng dẫn bổ sung</label>
                <textarea
                  rows={4}
                  value={isPublished ? displayExtra || extraInstructions : extraInstructions}
                  onChange={(e) => setExtraInstructions(e.target.value)}
                  disabled={isPublished}
                  className="w-full p-3 text-xs rounded-lg border border-outline-variant/60 bg-surface focus:outline-none focus:border-secondary font-merriweather leading-relaxed disabled:opacity-70"
                />
                <div>
                  <span className="text-xs font-semibold">Người nhận bài</span>
                  <div className="mt-2 flex flex-col gap-1 text-xs">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="recipient-mode"
                        checked={assignToWholeClass}
                        disabled={isPublished}
                        onChange={() => {
                          setAssignToWholeClass(true);
                          setRecipientIds(members.map((member) => member.userId));
                        }}
                      />
                      Giao toàn lớp
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="recipient-mode"
                        checked={!assignToWholeClass}
                        disabled={isPublished}
                        onChange={() => setAssignToWholeClass(false)}
                      />
                      Giao các học sinh được chọn
                    </label>
                  </div>
                  {memberIssue && (
                    <InlineRetry message={memberIssue} onRetry={() => setMemberNonce((value) => value + 1)} />
                  )}
                  <div className="mt-2 max-h-40 overflow-y-auto space-y-1 text-xs border rounded-lg p-2">
                    {members.map((member) => (
                      <label key={member.userId} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={recipientIds.includes(member.userId)}
                          disabled={isPublished}
                          onChange={(e) => {
                            setAssignToWholeClass(false);
                            setRecipientIds((prev) =>
                              e.target.checked
                                ? [...prev, member.userId]
                                : prev.filter((id) => id !== member.userId)
                            );
                          }}
                        />
                        <span>
                          {member.displayName} ({member.loginId})
                        </span>
                      </label>
                    ))}
                    {members.length === 0 && !memberIssue && (
                      <p className="text-on-surface-variant">
                        {classroomId ? 'Lớp chưa có học sinh.' : 'Chưa có học sinh trong các lớp của giáo viên.'}
                      </p>
                    )}
                  </div>
                </div>
              </section>

              <section className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/30 shadow-sm space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-outline-variant/20">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-sm">format_list_numbered</span>
                      Barem đánh giá cho bài này
                    </span>
                    <span className="text-[11px] text-on-surface-variant">
                      {maxScore > 0 ? `Thang ${maxScore}đ theo barem đang chọn` : 'Chọn barem từ kho để lấy thang điểm thật'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-on-surface-variant font-medium">Tổng điểm:</span>
                    <span
                      className={`text-sm font-bold px-2.5 py-0.5 rounded-full font-mono ${
                        isValidTotal ? 'bg-tertiary-container/30 text-tertiary' : 'bg-error-container text-error'
                      }`}
                    >
                      {totalWeight.toFixed(2)} / {maxScore || 0}đ
                    </span>
                  </div>
                </div>

                <div className="p-4 bg-surface-container-low/60 rounded-xl border border-outline-variant/40 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-secondary text-base">rule_folder</span>
                    <label className="text-xs font-bold text-on-surface">Chọn barem áp dụng cho đề này</label>
                  </div>
                  {rubrics.length === 0 && !rubricIssue && (
                    <p className="text-xs text-on-surface-variant">Chưa có barem trong kho. Hãy nhập barem trước khi giao bài.</p>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {rubrics.map((rubric) => {
                      const isSelected = rubric.id === selectedRubricId;
                      const count = rubric.criteria?.length || rubric.criteriaCount || 0;
                      return (
                        <button
                          key={rubric.id}
                          type="button"
                          onClick={() => {
                            if (!isPublished) applyRubric(rubric);
                          }}
                          disabled={isPublished}
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
                                    isSelected ? 'border-secondary bg-secondary' : 'border-outline-variant bg-transparent'
                                  }`}
                                >
                                  {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white"></span>}
                                </span>
                                <span>{rubric.shortTitle || rubric.title}</span>
                              </span>
                              <span className="text-[10px] font-mono font-bold bg-primary-fixed text-primary px-1.5 py-0.2 rounded-full shrink-0">
                                v{rubric.version}
                              </span>
                            </div>
                            <p className="text-[11px] text-on-surface-variant leading-relaxed pl-6">
                              {rubric.description || `Thang ${rubric.maxScore}đ gồm ${count} tiêu chí.`}
                            </p>
                          </div>
                          <div className="mt-3 pt-2.5 border-t border-outline-variant/20 pl-6 flex items-center justify-between text-[11px]">
                            <span className="font-semibold text-secondary flex items-center gap-1">
                              <span className="material-symbols-outlined text-sm">checklist</span>
                              <span>
                                {count} tiêu chí • Tổng {rubric.maxScore}đ
                              </span>
                            </span>
                            {isSelected ? (
                              <span className="text-tertiary font-bold flex items-center gap-0.5">
                                <span className="material-symbols-outlined text-sm">check_circle</span>
                                Đang áp dụng
                              </span>
                            ) : (
                              <span className="text-primary font-medium">Chọn barem này</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {!isValidTotal && criteria.length > 0 && (
                  <div className="p-3 bg-error-container/50 border border-error/30 rounded-lg text-xs text-error flex items-center gap-2">
                    <span className="material-symbols-outlined text-base">error</span>
                    <span>
                      Tổng điểm các tiêu chí phải bằng {maxScore}đ (hiện tại: {totalWeight.toFixed(2)}đ).
                    </span>
                  </div>
                )}

                {criteria.map((criterion) => (
                  <div key={criterion.id} className="p-4 bg-surface-container-low/40 rounded-xl border border-outline-variant/30 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2 border-b border-outline-variant/20">
                      <span className="text-xs sm:text-sm font-bold text-on-surface">{criterion.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-on-surface-variant">Điểm tối đa:</span>
                        <input
                          type="number"
                          step={scoreStep}
                          min={0}
                          value={criterion.weight}
                          disabled={isPublished}
                          onChange={(e) =>
                            setCriteria((prev) =>
                              prev.map((item) =>
                                item.id === criterion.id ? { ...item, weight: parseFloat(e.target.value) || 0 } : item
                              )
                            )
                          }
                          className="w-16 px-2 py-1 text-xs font-bold text-center rounded border border-outline-variant/60 bg-surface-container-lowest text-primary font-mono focus:outline-none focus:border-secondary"
                        />
                        <span className="text-xs text-on-surface-variant">điểm</span>
                      </div>
                    </div>
                    {criterion.guideNote && <p className="text-[11px] text-on-surface-variant">{criterion.guideNote}</p>}
                    {(criterion.levels || []).length > 0 && (
                      <div className="space-y-1.5 text-xs">
                        <span className="text-[10px] font-semibold text-outline uppercase tracking-wider block">
                          Các mức đánh giá
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          {(criterion.levels || []).map((level, index) => (
                            <div key={`${criterion.id}-${level.score}-${index}`} className="p-2.5 bg-surface-container-lowest rounded-lg border border-outline-variant/30">
                              <span className="font-bold text-primary font-mono text-xs">{level.score}đ</span>
                              <p className="text-[11px] text-on-surface-variant mt-1">{level.descriptor}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {isPublished ? null : (
                <button
                  type="button"
                  onClick={() => void handleSaveAsRubric()}
                  className="px-3.5 py-2 rounded-lg border border-dashed border-outline-variant/80 text-xs text-secondary hover:bg-surface-container-low transition-all w-full flex items-center justify-center gap-1.5 font-medium"
                >
                  Lưu thành barem mới trong kho
                </button>
                )}
              </section>
            </div>

            <div className="lg:col-span-4 space-y-5">
              <div className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant/30 shadow-sm space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
                  <span className="text-xs font-bold uppercase tracking-wider text-on-surface flex items-center gap-1">
                    <span className="material-symbols-outlined text-base text-secondary">menu_book</span>
                    Ngữ liệu liên kết ({(displayMaterials || prompt?.materials || []).length})
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.2 rounded ${
                      prompt?.ready ? 'text-tertiary bg-tertiary-container/30' : 'text-[#CA8A04] bg-[#FEF9C3]'
                    }`}
                  >
                    {prompt?.ready ? 'Sẵn sàng' : 'Chưa đủ'}
                  </span>
                </div>
                <div className="space-y-2 text-xs">
                  {(displayMaterials || prompt?.materials || []).map((material) => (
                    <div key={material.id} className="p-2.5 bg-surface-container-low/50 rounded-lg border border-outline-variant/20 flex items-start gap-2">
                      <span className="material-symbols-outlined text-secondary text-base mt-0.5">description</span>
                      <div className="flex-1">
                        <p className="font-semibold text-on-surface">{material.title}</p>
                        <p className="text-[11px] text-on-surface-variant">
                          {material.author ? `Tác giả: ${material.author}` : 'Chưa có tác giả'}
                          {material.sourceInfo ? ` • ${material.sourceInfo}` : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                  {(displayMaterials || prompt?.materials || []).length === 0 && (
                    <p className="text-on-surface-variant">Đề chưa gắn ngữ liệu.</p>
                  )}
                </div>
                <Link
                  href={pickHref}
                  onClick={() => persistLocalDraft({ promptId: prompt?.id })}
                  className="w-full py-1.5 rounded border border-outline-variant/50 text-[11px] text-secondary font-semibold hover:bg-surface-container transition-all flex items-center justify-center gap-1"
                >
                  <span className="material-symbols-outlined text-sm">menu_book</span>
                  <span>Xem toàn văn ngữ liệu trong kho</span>
                </Link>
              </div>

              {currentRubric && (
                <div className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant/30 shadow-sm space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
                    <span className="text-xs font-bold uppercase tracking-wider text-on-surface">Tiêu chí đang áp dụng</span>
                    <span className="text-[10px] text-primary font-bold font-mono">{criteria.length} tiêu chí</span>
                  </div>
                  <div className="space-y-2 text-xs">
                    {criteria.map((criterion, index) => (
                      <div key={criterion.id} className="p-2.5 bg-surface-container-low/50 rounded-lg border-l-2 border-primary space-y-0.5">
                        <p className="font-medium text-on-surface">
                          {index + 1}. {criterion.name}
                        </p>
                        <div className="flex items-center justify-between text-[10px] text-outline">
                          <span>Điểm tối đa</span>
                          <span className="font-bold text-secondary">{Number(criterion.weight).toFixed(2)}đ</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant/30 shadow-sm space-y-3">
                <span className="text-xs font-bold uppercase tracking-wider text-on-surface block pb-2 border-b border-outline-variant/20">
                  Điều kiện giao bài
                </span>
                <div className="space-y-2 text-xs">
                  <CheckRow ok={Boolean(prompt?.id)} label="Đã chọn đề nguồn" />
                  <CheckRow ok={Boolean(prompt?.ready)} label="Đề có yêu cầu viết và ngữ liệu đầy đủ" />
                  <CheckRow ok={isValidTotal} label={`Tổng điểm barem đúng ${maxScore || 0} điểm`} />
                  <CheckRow
                    ok={assignToWholeClass ? Boolean(classroomId) : recipientIds.length > 0}
                    label={assignToWholeClass ? 'Đã chọn lớp nhận bài' : 'Đã chọn học sinh nhận bài'}
                  />
                </div>
                {isPublished ? (
                  <p className="text-[11px] text-on-surface-variant">
                    Bài đã giao. Snapshot đề và barem không đổi khi sửa kho.
                  </p>
                ) : (
                <button
                  type="button"
                  onClick={() => void handlePublish()}
                  disabled={saving || loading || !prompt?.id}
                  className="w-full py-2.5 bg-primary-container text-on-primary-container font-bold text-xs rounded-lg hover:brightness-95 transition-all shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-40"
                >
                  <span className="material-symbols-outlined text-base">send</span>
                  Xác nhận &amp; Giao bài
                </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </TeacherShell>
  );
}

function CheckRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`material-symbols-outlined text-sm ${ok ? 'text-tertiary' : 'text-outline'}`}>
        {ok ? 'check_circle' : 'radio_button_unchecked'}
      </span>
      <span className={ok ? 'text-tertiary font-medium' : 'text-on-surface-variant'}>{label}</span>
    </div>
  );
}

function InlineRetry({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="p-3 bg-error-container/50 text-error text-xs rounded-xl flex items-center justify-between gap-3">
      <span>{message}</span>
      <button type="button" onClick={onRetry} className="px-3 py-1 rounded-lg border border-error/30 font-semibold">
        Thử lại
      </button>
    </div>
  );
}

export default function AssignmentEditorRoute() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <span className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <AssignmentEditorPage />
    </Suspense>
  );
}

function toDateTimeLocal(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
