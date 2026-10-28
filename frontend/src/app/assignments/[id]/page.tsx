'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import TeacherShell from '@/components/TeacherShell';
import { useAppStore } from '@/lib/store';
import { AuthApiError } from '@/lib/auth-types';
import { catalogApi } from '@/features/catalog/api';
import { classroomsApi } from '@/features/classrooms/api';
import { classroomLabel, pickDefaultTerm, termLabel } from '@/features/classrooms/model';
import { useTeacherClassContext } from '@/features/classrooms/useClassContext';
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
import { MaterialPassage, PreviewNote, WritingTaskCallout } from '@/features/catalog/PreviewBlocks';
import type {
  AssignmentDraftState,
  CatalogPrompt,
  CatalogRubric,
  CatalogRubricCriterion,
  ClassroomMember,
  ClassroomSummary,
  TeacherAssignment,
  Term,
} from '@/features/catalog/types';
import LatePolicySelect from '@/features/assignments/LatePolicySelect';
import RevisionSettings from '@/features/assignments/RevisionSettings';
import type { LatePolicy } from '@/features/assignments/deadline';
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
  const {
    classroom: contextClassroom,
    classrooms: contextClassrooms,
    terms,
    loading: contextLoading,
    error: classContextError,
    reload: reloadClassContext,
    setClassroom: setContextClassroom,
    select,
  } = useTeacherClassContext();

  const assignmentId = (params?.id as string) || 'new';
  const isNew = assignmentId === 'new';
  const tabParam = searchParams.get('tab') || 'details';
  const promptId = searchParams.get('promptId') || '';
  const queryAssignmentId = isCatalogUuid(searchParams.get('assignmentId')) ? searchParams.get('assignmentId') || '' : '';
  const existingAssignmentId = !isNew && isCatalogUuid(assignmentId) ? assignmentId : queryAssignmentId;
  const draftScope = { userId: currentUser?.id, assignmentId: existingAssignmentId || 'new' };
  const storedDraft = loadAssignmentDraft(draftScope);
  const classroomFromQuery = searchParams.get('classroomId') || storedDraft.classroomId || '';
  const hasExplicitClassroom = useRef(Boolean(classroomFromQuery));
  const defaultClassroomResolved = useRef(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copyTargetId, setCopyTargetId] = useState('');
  const [copying, setCopying] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyTargets, setCopyTargets] = useState<ClassroomSummary[]>([]);
  const [copyTerm, setCopyTerm] = useState<Term | undefined>();
  const [copyTargetsLoading, setCopyTargetsLoading] = useState(false);
  const [copyTargetsError, setCopyTargetsError] = useState('');
  const [issue, setIssue] = useState<PageIssue | null>(null);
  const [rubricIssue, setRubricIssue] = useState('');
  const [memberIssue, setMemberIssue] = useState('');
  const [prompt, setPrompt] = useState<CatalogPrompt | null>(null);
  const [rubrics, setRubrics] = useState<CatalogRubric[]>([]);
  const [extraClassroom, setExtraClassroom] = useState<ClassroomSummary | null>(null);
  const [members, setMembers] = useState<ClassroomMember[]>([]);
  const [assignment, setAssignment] = useState<TeacherAssignment | null>(null);
  const assignmentRef = useRef<TeacherAssignment | null>(null);
  const loadGen = useRef(0);
  const previousPromptTitle = useRef('');

  const [title, setTitle] = useState(storedDraft.title || '');
  const [extraInstructions, setExtraInstructions] = useState(storedDraft.extraInstructions || '');
  const [classroomId, setClassroomId] = useState(classroomFromQuery);
  const [dueAt, setDueAt] = useState(storedDraft.dueAt || '');
  const [latePolicy, setLatePolicy] = useState<LatePolicy>(storedDraft.latePolicy || 'ALLOW_LATE');
  const [maxRevisions, setMaxRevisions] = useState(storedDraft.maxRevisions ?? 0);
  const [revisionDueAt, setRevisionDueAt] = useState(storedDraft.revisionDueAt || '');
  const [revisionError, setRevisionError] = useState('');
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

  const classrooms = useMemo(() => {
    const writable = contextClassrooms.filter((item) => !item.readOnly);
    if (!extraClassroom || writable.some((item) => item.id === extraClassroom.id)) return writable;
    return [...writable, extraClassroom];
  }, [contextClassrooms, extraClassroom]);

  assignToWholeClassRef.current = assignToWholeClass;

  const totalWeight = criteria.reduce((sum, item) => sum + (Number(item.weight) || 0), 0);
  const isValidTotal = maxScore > 0 && Math.abs(totalWeight - maxScore) < 0.001;
  const currentRubric = rubrics.find((item) => item.id === selectedRubricId);
  const sourceDocumentId = prompt?.sourceDocumentId || prompt?.materials.find((item) => item.sourceDocumentId)?.sourceDocumentId;
  const isPublished = assignment?.status === 'PUBLISHED';
  const classroomIsReadOnly = Boolean(assignment?.classroomReadOnly);
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
  // Published: title, due date, late policy, rewrite settings, extra instructions and adding students stay editable.
  const publishedLocked = isPublished && classroomIsReadOnly;
  const publishedWholeClass = isPublished && Boolean(assignment?.assignToWholeClass);
  const lockedRecipientIds = new Set(isPublished && !publishedWholeClass ? assignment?.recipientStudentIds || [] : []);
  const publishedChanges = (): Record<string, unknown> => {
    if (!isPublished || !assignment) return {};
    const changes: Record<string, unknown> = {};
    if (title.trim() !== assignment.title) changes.title = title;
    if (extraInstructions !== (assignment.extraInstructions ?? '')) changes.extraInstructions = extraInstructions;
    if (latePolicy !== (assignment.latePolicy || 'ALLOW_LATE')) changes.latePolicy = latePolicy;
    if (dueAt !== toDateTimeLocal(assignment.dueAt)) changes.dueAt = dueAt ? new Date(dueAt).toISOString() : null;
    if (maxRevisions !== (assignment.maxRevisions ?? 0)) changes.maxRevisions = maxRevisions;
    if (revisionDueAt !== toDateTimeLocal(assignment.revisionDueAt)) changes.revisionDueAt = revisionDueAt ? new Date(revisionDueAt).toISOString() : null;
    if (!publishedWholeClass) {
      if (assignToWholeClass) changes.assignToWholeClass = true;
      else if (recipientIds.some((id) => !lockedRecipientIds.has(id))) changes.recipientStudentIds = recipientIds;
    }
    return changes;
  };
  const hasPublishedChanges = Object.keys(publishedChanges()).length > 0;

  const hydratePromptRef = useRef(hydratePrompt);
  hydratePromptRef.current = hydratePrompt;

  useEffect(() => {
    const gen = ++loadGen.current;
    let cancelled = false;
    const stillActive = () => !cancelled && gen === loadGen.current;

    setLoading(true);
    setIssue(null);
    setRubricIssue('');

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

      if (!stillActive()) return;
      const draft = loadAssignmentDraft({
        userId: currentUser?.id,
        assignmentId: existingAssignmentId || 'new',
      });

      if (existingAssignmentId) {
        try {
          const existing = await catalogApi.getTeacherAssignment(existingAssignmentId);
          if (!stillActive()) return;
          assignmentRef.current = existing;
          setAssignment(existing);
          applyLoadedAssignment(existing, draft);
          const promptToLoad = isCatalogUuid(promptId) ? promptId : existing.sourcePromptId;
          await hydratePromptRef.current(promptToLoad, draft, stillActive, rubricItems, existing);
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
        await hydratePromptRef.current(promptId, draft, stillActive, rubricItems);
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
    if (!assignment?.classroomId) {
      setExtraClassroom(null);
      return;
    }
    if (contextLoading) return;
    if (contextClassrooms.some((item) => item.id === assignment.classroomId && !item.readOnly)) {
      setExtraClassroom(null);
      return;
    }
    let cancelled = false;
    void classroomsApi
      .getClassroom(assignment.classroomId)
      .then((item) => {
        if (!cancelled) setExtraClassroom(item);
      })
      .catch(() => {
        if (!cancelled) setExtraClassroom(null);
      });
    return () => {
      cancelled = true;
    };
  }, [assignment?.classroomId, contextClassrooms, contextLoading]);

  useEffect(() => {
    if (defaultClassroomResolved.current || hasExplicitClassroom.current) return;
    if (existingAssignmentId && !assignment) return;
    if (assignment?.classroomId) {
      setClassroomId(assignment.classroomId);
      defaultClassroomResolved.current = true;
      return;
    }
    const defaultClassroomId = contextClassroom?.id || contextClassrooms.find((item) => !item.readOnly)?.id;
    if (!defaultClassroomId) return;
    setClassroomId(defaultClassroomId);
    defaultClassroomResolved.current = true;
  }, [assignment?.classroomId, contextClassroom?.id, contextClassrooms, existingAssignmentId, assignment]);

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
      const loaded = existing?.status === 'PUBLISHED' && existing.sourcePrompt?.id === id
        ? existing.sourcePrompt
        : await catalogApi.getPrompt(id);
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
    setLatePolicy(draft.latePolicy || existing?.latePolicy || 'ALLOW_LATE');
    setMaxRevisions(typeof draft.maxRevisions === 'number' ? draft.maxRevisions : existing?.maxRevisions ?? 0);
    if (typeof draft.revisionDueAt === 'string') setRevisionDueAt(draft.revisionDueAt);
    else if (existing) setRevisionDueAt(toDateTimeLocal(existing.revisionDueAt));
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

  const localDraftPayload = useCallback((): AssignmentDraftState => ({
    assignmentId: assignmentRef.current?.id || existingAssignmentId || undefined,
    classroomId,
    promptId: prompt?.id || (isCatalogUuid(promptId) ? promptId : undefined),
    title,
    extraInstructions,
    dueAt,
    latePolicy,
    maxRevisions,
    revisionDueAt,
    rubricId: selectedRubricId,
    recipientStudentIds: recipientIds,
    assignToWholeClass,
    maxScore,
    scoreStep,
    criteria,
  }), [
    existingAssignmentId,
    classroomId,
    prompt?.id,
    promptId,
    title,
    extraInstructions,
    dueAt,
    latePolicy,
    maxRevisions,
    revisionDueAt,
    selectedRubricId,
    recipientIds,
    assignToWholeClass,
    maxScore,
    scoreStep,
    criteria,
  ]);

  const persistLocalDraft = useCallback((extra: AssignmentDraftState = {}) => {
    const payload = { ...localDraftPayload(), ...extra };
    if (assignment?.status === 'PUBLISHED') return payload;
    const scopeId = isCatalogUuid(payload.assignmentId) ? payload.assignmentId : 'new';
    saveAssignmentDraft(payload, { userId: currentUser?.id, assignmentId: scopeId });
    return payload;
  }, [localDraftPayload, assignment?.status, currentUser?.id]);

  useEffect(() => {
    if (loading || issue || assignment?.status === 'PUBLISHED') return;
    persistLocalDraft();
  }, [loading, issue, assignment?.status, persistLocalDraft]);

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

  const buildAssignmentBody = (overrides: Record<string, unknown> = {}) => ({
    sourcePromptId: prompt?.id,
    rubricId: selectedRubricId || undefined,
    assignmentRubric: assignmentRubricPayload(),
    classroomId: classroomId || undefined,
    title,
    extraInstructions,
    latePolicy,
    maxRevisions,
    revisionDueAt: revisionDueAt ? new Date(revisionDueAt).toISOString() : null,
    dueAt: dueAt ? new Date(dueAt).toISOString() : null,
    assignToWholeClass,
    recipientStudentIds: assignToWholeClass ? [] : recipientIds,
    ...overrides,
  });

  const persistDraft = async () => {
    if (classroomIsReadOnly) {
      addToast('Lớp thuộc kỳ học đã kết thúc — chỉ xem.', 'warning');
      return null;
    }
    if (!prompt?.id) {
      addToast('Cần chọn đề nguồn trước khi lưu.', 'warning');
      return null;
    }
    if (!selectedRubricId && criteria.length === 0) {
      addToast('Cần chọn barem cho bài tập.', 'warning');
      return null;
    }
    const body = buildAssignmentBody({ sourcePromptId: prompt.id });
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

  const handleSavePublished = async () => {
    if (!assignment || !hasPublishedChanges) return;
    setSaving(true);
    try {
      const updated = await catalogApi.updatePublishedAssignment(assignment.id, publishedChanges());
      assignmentRef.current = updated;
      setAssignment(updated);
      setTitle(updated.title);
      setExtraInstructions(updated.extraInstructions ?? '');
      setDueAt(toDateTimeLocal(updated.dueAt));
      setLatePolicy(updated.latePolicy || 'ALLOW_LATE');
      setMaxRevisions(updated.maxRevisions ?? 0);
      setRevisionDueAt(toDateTimeLocal(updated.revisionDueAt));
      setRevisionError('');
      setAssignToWholeClass(Boolean(updated.assignToWholeClass));
      setRecipientIds(updated.recipientStudentIds || []);
      addToast('Đã lưu thay đổi. Học sinh thấy thông tin mới ngay.', 'success');
    } catch (err) {
      const message = err instanceof AuthApiError ? err.message : 'Không lưu được thay đổi.';
      setRevisionError(err instanceof AuthApiError && err.code === 'REVISION_LIMIT_IN_USE' ? message : '');
      addToast(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyToClassroom = async () => {
    const target = copyTargets.find((item) => item.id === copyTargetId);
    if (!target) {
      addToast('Hãy chọn lớp đích có thể chỉnh sửa.', 'warning');
      return;
    }
    if (!prompt?.id) {
      addToast('Cần chọn đề nguồn trước khi sao chép.', 'warning');
      return;
    }
    setCopying(true);
    try {
      const created = await catalogApi.createAssignment(
        buildAssignmentBody({
          sourcePromptId: prompt.id,
          classroomId: target.id,
          assignToWholeClass: true,
          recipientStudentIds: [],
          title: `${title} (bản sao)`,
        })
      );
      addToast(`Đã tạo bản nháp cho lớp ${target.name}.`, 'success');
      if (copyTerm) select(copyTerm.id, target.id);
      router.push(`/assignments/${created.id}`);
    } catch (err) {
      addToast(err instanceof AuthApiError ? err.message : 'Không sao chép được bài tập.', 'error');
    } finally {
      setCopying(false);
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

  useEffect(() => {
    if (!copyOpen) return;
    const currentTerm = terms.find((item) => item.isCurrent) || pickDefaultTerm(terms);
    setCopyTerm(currentTerm);
    setCopyTargetId('');
    setCopyTargetsError('');

    if (!currentTerm) {
      setCopyTargets([]);
      setCopyTargetsLoading(false);
      return;
    }

    let cancelled = false;
    setCopyTargetsLoading(true);
    void classroomsApi
      .listTeacherClassrooms({ termId: currentTerm.id })
      .then(({ items }) => {
        if (cancelled) return;
        setCopyTargets(items.filter((item) => !item.readOnly && item.id !== classroomId));
      })
      .catch((err) => {
        if (cancelled) return;
        setCopyTargets([]);
        setCopyTargetsError(errorText(err, 'Không tải được danh sách lớp đích.'));
      })
      .finally(() => {
        if (!cancelled) setCopyTargetsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [copyOpen, terms, classroomId]);

  const copyAction = (
    <>
      <button
        type="button"
        onClick={() => setCopyOpen((value) => !value)}
        disabled={!prompt?.id}
        className="px-4 py-2 rounded-lg border border-outline-variant/60 bg-surface-container-lowest text-xs font-medium text-on-surface hover:bg-surface-container transition-all shadow-sm disabled:opacity-40"
      >
        Sao chép sang lớp khác
      </button>
      {copyOpen && (
        <div className="w-full flex flex-col sm:flex-row sm:items-center justify-end gap-2 pt-1">
          {copyTargetsLoading ? (
            <p className="text-xs text-on-surface-variant">Đang tải lớp đích...</p>
          ) : copyTargetsError ? (
            <p className="text-xs text-error">{copyTargetsError}</p>
          ) : !copyTargets.length ? (
            <p className="text-xs text-on-surface-variant">
              Chưa có lớp nào ở {copyTerm ? termLabel(copyTerm) : 'kỳ hiện tại'} —{' '}
              <Link href="/classrooms" className="font-semibold text-primary hover:underline">
                tạo lớp ở trang Lớp học.
              </Link>
            </p>
          ) : (
            <>
              <select
                value={copyTargetId}
                onChange={(event) => setCopyTargetId(event.target.value)}
                className="h-8 min-w-52 rounded-lg border border-outline-variant/60 bg-surface-container-lowest px-2 text-xs text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <option value="">Chọn lớp đích</option>
                {copyTargets.map((item) => (
                  <option key={item.id} value={item.id}>{classroomLabel(item)} ({item.studentCount} HS)</option>
                ))}
              </select>
              <button type="button" onClick={() => void handleCopyToClassroom()} disabled={copying || !copyTargetId} className="h-8 px-3 rounded-lg bg-primary text-white text-xs font-semibold disabled:opacity-40">
                {copying ? 'Đang sao chép...' : 'Tạo bản sao'}
              </button>
            </>
          )}
        </div>
      )}
    </>
  );

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
          <div className="min-w-0">
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
                ? 'Đề, ngữ liệu và barem đã chốt khi giao. Vẫn sửa được tiêu đề, hạn nộp, số lần viết lại, hướng dẫn bổ sung và thêm học sinh.'
                : 'Barem đang soạn là bản của bài này, không sửa ngầm barem gốc.'}
            </p>
          </div>
          {isPublished ? (
            <div className="flex flex-wrap lg:flex-nowrap items-center justify-end gap-2 shrink-0 [&>*]:whitespace-nowrap">
              <Link
                href="/assignments"
                className="px-4 py-2 rounded-lg border border-outline-variant/60 bg-surface-container-lowest text-xs font-medium"
              >
                Về danh sách bài tập
              </Link>
              {copyAction}
              {!publishedLocked && (
                <button
                  type="button"
                  onClick={() => void handleSavePublished()}
                  disabled={saving || loading || !hasPublishedChanges}
                  title={hasPublishedChanges ? undefined : 'Chưa có thay đổi'}
                  className="px-4 py-2 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-40"
                >
                  <span className="material-symbols-outlined text-[16px]" aria-hidden="true">save</span>
                  {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                onClick={() => void handleSaveDraft()}
                disabled={saving || loading || !prompt?.id || classroomIsReadOnly}
                title={classroomIsReadOnly ? 'Lớp thuộc kỳ học đã kết thúc — chỉ xem.' : undefined}
                className="px-4 py-2 rounded-lg border border-outline-variant/60 bg-surface-container-lowest text-xs font-medium text-on-surface hover:bg-surface-container transition-all shadow-sm disabled:opacity-40"
              >
                Lưu bản nháp
              </button>
              {copyAction}
              <button
                onClick={() => void handlePublish()}
                disabled={saving || loading || !prompt?.id || classroomIsReadOnly}
                title={classroomIsReadOnly ? 'Lớp thuộc kỳ học đã kết thúc — chỉ xem.' : undefined}
                className="px-4 py-2 rounded-lg bg-primary-container text-on-primary-container text-xs font-bold hover:brightness-95 transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-40"
              >
                <span className="material-symbols-outlined text-[16px]">verified</span>
                Xác nhận Rubric &amp; Giao bài
              </button>
            </div>
          )}
        </div>

        {classroomIsReadOnly && (
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">lock</span>
            Lớp thuộc kỳ học đã kết thúc — chỉ xem.
          </div>
        )}

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
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 ${
                  activeTab === id
                    ? 'bg-gradient-to-r from-secondary to-primary text-white shadow-sm font-bold'
                    : 'glass-card text-on-surface hover:bg-surface-container/60'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">{icon}</span>
                {label}
              </button>
            ))}
          </div>
        ) : null}

        <div className="p-3.5 glass-panel rounded-2xl flex items-center gap-3 text-xs text-on-surface-variant shadow-xs">
          <span className="material-symbols-outlined text-secondary text-lg">history_edu</span>
          <span>
            <strong>Bảo toàn phiên bản:</strong> Khi phát hành, hệ thống lưu bản sao đề, ngữ liệu và barem. Sửa kho sau đó
            không đổi bài đã giao.
          </span>
        </div>

        {rubricIssue && (
          <InlineRetry message={rubricIssue} onRetry={() => setLoadNonce((value) => value + 1)} />
        )}
        {classContextError && (
          <InlineRetry message={classContextError} onRetry={() => void reloadClassContext()} />
        )}

        {loading ? (
          <div className="p-12 text-center text-sm text-on-surface-variant">Đang tải dữ liệu bài tập...</div>
        ) : isPublished && activeTab === 'submissions' ? (
          <AssignmentSubmissionsPanel assignmentId={existingAssignmentId || assignmentId} readOnly={classroomIsReadOnly} />
        ) : isPublished && activeTab === 'statistics' ? (
          <AssignmentStatisticsPanel assignmentId={existingAssignmentId || assignmentId} />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 space-y-6">
              <section className="glass-panel p-6 sm:p-7 rounded-2xl border border-white/60 shadow-sm space-y-5">
                <SectionHeader
                  icon="menu_book"
                  title="Đề nguồn đã chọn"
                  subtitle={isPublished ? 'Snapshot đề tại thời điểm giao bài' : 'Lấy từ kho đề nguồn của giáo viên'}
                  action={
                    isPublished ? (
                      <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-tertiary-container/25 text-tertiary flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]" aria-hidden="true">lock</span>
                        Bản đã giao
                      </span>
                    ) : (
                      <Link
                        href={pickHref}
                        onClick={() => persistLocalDraft({ promptId: prompt?.id })}
                        className="px-3 py-1.5 rounded-xl border border-secondary/30 text-xs font-semibold text-secondary hover:bg-secondary/5 transition-all flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-[16px]" aria-hidden="true">swap_horiz</span>
                        Đổi đề
                      </Link>
                    )
                  }
                />
                <div className="space-y-2.5">
                  <h2 className="font-merriweather font-bold text-xl leading-snug text-on-surface">
                    {prompt?.title || 'Chưa có đề nguồn'}
                  </h2>
                  {prompt && (
                    <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold">
                      <span className="px-2 py-0.5 rounded-full bg-primary-fixed/50 text-on-primary-fixed-variant">{prompt.genre}</span>
                      <span className="px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant">Khối {prompt.gradeLevel}</span>
                      <span className="px-2 py-0.5 rounded-full bg-secondary-fixed/50 text-on-secondary-fixed-variant">
                        {(displayMaterials || []).length} ngữ liệu
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full ${
                          prompt.ready ? 'bg-tertiary-container/25 text-tertiary' : 'bg-[#FEF9C3] text-[#A16207]'
                        }`}
                      >
                        {prompt.ready ? 'Sẵn sàng giao' : 'Chưa đủ dữ liệu'}
                      </span>
                    </div>
                  )}
                </div>
                {displayWritingSummary && (
                  <PreviewNote icon="summarize" label="Tóm tắt yêu cầu" text={displayWritingSummary} />
                )}
                <WritingTaskCallout label="Yêu cầu viết đầy đủ" text={displayWritingTask || 'Chưa có yêu cầu viết.'} />
                {prompt?.extraGuidance && <PreviewNote icon="lightbulb" label="Gợi ý" text={prompt.extraGuidance} />}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setFullPreview((value) => !value)}
                    aria-expanded={fullPreview}
                    className="px-3 py-1.5 rounded-xl bg-secondary/5 border border-secondary/20 text-xs text-secondary font-semibold hover:bg-secondary/10 transition-all flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                      {fullPreview ? 'expand_less' : 'auto_stories'}
                    </span>
                    {fullPreview ? 'Thu gọn ngữ liệu' : 'Xem toàn văn ngữ liệu'}
                  </button>
                  {sourceDocumentId && (
                    <button
                      type="button"
                      disabled={downloading}
                      onClick={() => void handleDownloadOriginal()}
                      className="px-3 py-1.5 rounded-xl border border-outline-variant/50 text-xs text-on-surface font-semibold hover:bg-surface-container-low transition-all flex items-center gap-1 disabled:opacity-40"
                    >
                      <span className="material-symbols-outlined text-[16px]" aria-hidden="true">download</span>
                      {downloading ? 'Đang tải...' : 'Tải file gốc'}
                    </button>
                  )}
                </div>
                {fullPreview && (
                  <div className="space-y-3">
                    {(displayMaterials || []).map((material, index) => (
                      <MaterialPassage key={material.id} material={material} index={index} expanded />
                    ))}
                  </div>
                )}
                {prompt && !prompt.ready && (
                  <div className="p-3 bg-[#FEF9C3] rounded-xl text-xs text-[#A16207] flex items-start gap-2">
                    <span className="material-symbols-outlined text-[16px]" aria-hidden="true">warning</span>
                    Đề chưa đủ dữ liệu để giao bài. Hãy bổ sung ngữ liệu hoặc yêu cầu viết trong kho.
                  </div>
                )}
              </section>

              <section className="glass-panel p-6 sm:p-7 rounded-2xl border border-white/60 shadow-sm space-y-5">
                <SectionHeader
                  icon="edit_document"
                  title="Thông tin bài tập"
                  subtitle="Tiêu đề, lớp, hạn nộp và người nhận"
                  action={
                    prompt && (
                      <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-surface-container text-on-surface-variant">
                        {prompt.genre} • Khối {prompt.gradeLevel}
                      </span>
                    )
                  }
                />
                <FormField icon="title" label="Tiêu đề bài viết" htmlFor="assignment-title">
                  <input
                    id="assignment-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    disabled={publishedLocked}
                    placeholder="Ví dụ: Phân tích hình ảnh làng quê trong bài thơ..."
                    className={`${INPUT_CLASS} text-[15px] font-semibold font-merriweather`}
                  />
                </FormField>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField icon="school" label="Lớp nhận bài" htmlFor="assignment-classroom">
                    <select
                      id="assignment-classroom"
                      value={classroomId}
                      onChange={(e) => {
                        setClassroomId(e.target.value);
                        setContextClassroom(e.target.value);
                        persistLocalDraft({ classroomId: e.target.value });
                      }}
                      disabled={isPublished}
                      className={`${INPUT_CLASS} text-sm`}
                    >
                      <option value="">Chọn lớp</option>
                      {classrooms.map((classroom) => (
                        <option key={classroom.id} value={classroom.id} disabled={classroom.readOnly}>
                          {classroomLabel(classroom)} ({classroom.studentCount} HS){classroom.readOnly ? ' — chỉ xem' : ''}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField icon="event" label="Hạn nộp" htmlFor="assignment-due">
                    <input
                      id="assignment-due"
                      type="datetime-local"
                      value={dueAt}
                      onChange={(e) => setDueAt(e.target.value)}
                      disabled={publishedLocked}
                      className={`${INPUT_CLASS} text-sm`}
                    />
                  </FormField>
                </div>
                <LatePolicySelect value={latePolicy} onChange={setLatePolicy} disabled={publishedLocked} />
                <RevisionSettings maxRevisions={maxRevisions} revisionDueAt={revisionDueAt} disabled={publishedLocked} error={revisionError}
                  onMaxRevisions={(value) => { setRevisionError(''); setMaxRevisions(value); }}
                  onRevisionDueAt={setRevisionDueAt} />
                <FormField
                  icon="notes"
                  label="Hướng dẫn bổ sung"
                  htmlFor="assignment-extra"
                  hint="Không bắt buộc. Học sinh sẽ thấy phần này bên dưới yêu cầu viết."
                >
                  <textarea
                    id="assignment-extra"
                    rows={4}
                    value={extraInstructions}
                    onChange={(e) => setExtraInstructions(e.target.value)}
                    disabled={publishedLocked}
                    placeholder="Ví dụ: Chú ý phân tích ít nhất hai hình ảnh, trích dẫn chính xác câu thơ..."
                    className={`${INPUT_CLASS} text-sm font-merriweather leading-relaxed resize-y`}
                  />
                </FormField>
                <fieldset className="space-y-2">
                  <legend className="text-xs font-semibold text-on-surface flex items-center gap-1.5 mb-2">
                    <span className="material-symbols-outlined text-[16px] text-outline" aria-hidden="true">group</span>
                    Người nhận bài
                  </legend>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <RecipientOption
                      id="recipient-all"
                      icon="groups"
                      label="Giao toàn lớp"
                      description={
                        members.length ? `Tất cả ${members.length} học sinh trong lớp đã chọn` : 'Tất cả học sinh trong lớp đã chọn'
                      }
                      checked={assignToWholeClass}
                      disabled={publishedLocked || publishedWholeClass}
                      onChange={() => {
                        setAssignToWholeClass(true);
                        setRecipientIds(members.map((member) => member.userId));
                      }}
                    />
                    <RecipientOption
                      id="recipient-some"
                      icon="person_check"
                      label="Giao các học sinh được chọn"
                      description={
                        assignToWholeClass ? 'Chọn từng học sinh trong danh sách' : `Đã chọn ${recipientIds.length}/${members.length} học sinh`
                      }
                      checked={!assignToWholeClass}
                      disabled={publishedLocked || publishedWholeClass}
                      onChange={() => setAssignToWholeClass(false)}
                    />
                  </div>
                  {isPublished && !publishedLocked && (
                    <p className="text-[11px] text-on-surface-variant">
                      {publishedWholeClass
                        ? 'Bài giao toàn lớp: học sinh vào lớp sau cũng tự nhận bài.'
                        : 'Bài đã giao chỉ thêm được học sinh, không bỏ được học sinh đã nhận bài.'}
                    </p>
                  )}
                  {memberIssue && (
                    <InlineRetry message={memberIssue} onRetry={() => setMemberNonce((value) => value + 1)} />
                  )}
                  {!assignToWholeClass && (
                    <div className="mt-1 max-h-56 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs rounded-xl border border-outline-variant/40 bg-surface-container-low/40 p-2">
                      {members.map((member) => {
                        const checked = recipientIds.includes(member.userId);
                        return (
                          <label
                            key={member.userId}
                            title={lockedRecipientIds.has(member.userId) ? 'Đã nhận bài — không bỏ được' : undefined}
                            className={`flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${
                              checked ? 'bg-secondary/10 text-on-surface' : 'hover:bg-surface-container-lowest'
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="accent-secondary"
                              checked={checked}
                              disabled={publishedLocked || lockedRecipientIds.has(member.userId)}
                              onChange={(e) => {
                                setAssignToWholeClass(false);
                                setRecipientIds((prev) =>
                                  e.target.checked
                                    ? [...prev, member.userId]
                                    : prev.filter((id) => id !== member.userId)
                                );
                              }}
                            />
                            <span className="truncate">
                              <span className="font-semibold">{member.displayName}</span>{' '}
                              <span className="text-on-surface-variant">({member.loginId})</span>
                            </span>
                          </label>
                        );
                      })}
                      {members.length === 0 && !memberIssue && (
                        <p className="text-on-surface-variant p-2">
                          {classroomId ? 'Lớp chưa có học sinh.' : 'Chưa có học sinh trong các lớp của giáo viên.'}
                        </p>
                      )}
                    </div>
                  )}
                </fieldset>
              </section>

              <section className="glass-panel p-6 sm:p-7 rounded-2xl border border-white/60 shadow-sm space-y-5">
                <SectionHeader
                  icon="format_list_numbered"
                  title="Barem đánh giá cho bài này"
                  subtitle={maxScore > 0 ? `Thang ${maxScore}đ theo barem đang chọn` : 'Chọn barem từ kho để lấy thang điểm thật'}
                  action={
                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded-full font-mono ${
                        isValidTotal ? 'bg-tertiary-container/30 text-tertiary' : 'bg-error-container text-error'
                      }`}
                      title="Tổng điểm"
                    >
                      {totalWeight.toFixed(2)} / {maxScore || 0}đ
                    </span>
                  }
                />

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
                  disabled={saving || loading || !prompt?.id || classroomIsReadOnly}
                  title={classroomIsReadOnly ? 'Lớp thuộc kỳ học đã kết thúc — chỉ xem.' : undefined}
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

const INPUT_CLASS =
  'w-full px-3.5 py-2.5 rounded-xl border border-outline-variant/60 bg-surface-container-lowest text-on-surface placeholder:text-outline/70 shadow-[inset_0_1px_2px_rgba(18,28,42,0.04)] transition-all focus:outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10 disabled:opacity-70 disabled:bg-surface-container-low';

function SectionHeader({
  icon,
  title,
  subtitle,
  action,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 pb-4 border-b border-outline-variant/20">
      <div className="flex items-center gap-3 min-w-0">
        <span className="w-10 h-10 rounded-xl bg-primary-fixed/50 text-primary flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-[22px]" aria-hidden="true">{icon}</span>
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-on-surface">{title}</h3>
          {subtitle && <p className="text-[11px] text-on-surface-variant truncate">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

function FormField({
  icon,
  label,
  htmlFor,
  hint,
  children,
}: {
  icon: string;
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-xs font-semibold text-on-surface flex items-center gap-1.5">
        <span className="material-symbols-outlined text-[16px] text-outline" aria-hidden="true">{icon}</span>
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-on-surface-variant">{hint}</p>}
    </div>
  );
}

function RecipientOption({
  id,
  icon,
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  icon: string;
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
}) {
  return (
    <label
      className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
        checked
          ? 'border-secondary bg-secondary/5 ring-2 ring-secondary/15'
          : 'border-outline-variant/50 bg-surface-container-lowest hover:border-outline'
      } ${disabled ? 'cursor-default opacity-80' : ''}`}
    >
      <input
        type="radio"
        name="recipient-mode"
        className="mt-1 accent-secondary"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        aria-describedby={`${id}-desc`}
      />
      <span className="flex-1 min-w-0">
        <span className="text-xs font-bold text-on-surface flex items-center gap-1.5">
          <span
            className={`material-symbols-outlined text-[16px] ${checked ? 'text-secondary' : 'text-outline'}`}
            aria-hidden="true"
          >
            {icon}
          </span>
          {label}
        </span>
        <span id={`${id}-desc`} aria-hidden="true" className="block text-[11px] text-on-surface-variant mt-0.5">
          {description}
        </span>
      </span>
    </label>
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
