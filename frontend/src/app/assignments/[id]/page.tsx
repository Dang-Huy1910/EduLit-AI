'use client';

import React, { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import TeacherShell from '@/components/TeacherShell';
import { useAppStore } from '@/lib/store';
import { AuthApiError } from '@/lib/auth-types';
import { catalogApi } from '@/features/catalog/api';
import { clearAssignmentDraft, loadAssignmentDraft, pickPromptHref, saveAssignmentDraft } from '@/features/catalog/draft';
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

function AssignmentEditorPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { addToast, currentUser } = useAppStore();

  const assignmentId = (params?.id as string) || 'new';
  const isNew = assignmentId === 'new';
  const promptId = searchParams.get('promptId') || '';
  const queryAssignmentId = searchParams.get('assignmentId') || '';
  const effectiveAssignmentId = !isNew ? assignmentId : queryAssignmentId;
  const draftScope = { userId: currentUser?.id, assignmentId: effectiveAssignmentId || 'new' };
  const storedDraft = loadAssignmentDraft(draftScope);
  const classroomFromQuery =
    searchParams.get('classroomId') || storedDraft.classroomId || '';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prompt, setPrompt] = useState<CatalogPrompt | null>(null);
  const [rubrics, setRubrics] = useState<CatalogRubric[]>([]);
  const [classrooms, setClassrooms] = useState<ClassroomSummary[]>([]);
  const [members, setMembers] = useState<ClassroomMember[]>([]);
  const [assignment, setAssignment] = useState<TeacherAssignment | null>(null);
  const assignmentRef = useRef<TeacherAssignment | null>(null);

  const [title, setTitle] = useState(storedDraft.title || '');
  const [extraInstructions, setExtraInstructions] = useState(storedDraft.extraInstructions || '');
  const [classroomId, setClassroomId] = useState(classroomFromQuery);
  const [dueAt, setDueAt] = useState(storedDraft.dueAt || '');
  const [selectedRubricId, setSelectedRubricId] = useState(storedDraft.rubricId || '');
  const [criteria, setCriteria] = useState<CatalogRubricCriterion[]>(storedDraft.criteria || []);
  const [maxScore, setMaxScore] = useState(storedDraft.maxScore || 4);
  const [scoreStep, setScoreStep] = useState(storedDraft.scoreStep || 0.25);
  const [recipientIds, setRecipientIds] = useState<string[]>(storedDraft.recipientStudentIds || []);
  const [assignToWholeClass, setAssignToWholeClass] = useState(storedDraft.assignToWholeClass ?? true);
  const assignToWholeClassRef = useRef(assignToWholeClass);
  const [fullPreview, setFullPreview] = useState(false);
  const [missingPrompt, setMissingPrompt] = useState(false);

  assignToWholeClassRef.current = assignToWholeClass;

  const totalWeight = criteria.reduce((sum, item) => sum + (Number(item.weight) || 0), 0);
  const isValidTotal = Math.abs(totalWeight - maxScore) < 0.001;
  const currentRubric = rubrics.find((item) => item.id === selectedRubricId);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const [rubricRes, classRes] = await Promise.all([
          catalogApi.listRubrics(),
          catalogApi.listClassrooms(),
        ]);
        const rubricItems = await Promise.all(
          rubricRes.items.map((item) => catalogApi.getRubric(item.id).catch(() => item))
        );
        setRubrics(rubricItems);
        setClassrooms(classRes.items);
        if (!classroomFromQuery && !storedDraft.classroomId && classRes.items[0]) {
          setClassroomId(classRes.items[0].id);
        }

        const draft = loadAssignmentDraft(draftScope);
        if (effectiveAssignmentId) {
          const existing = await catalogApi.getTeacherAssignment(effectiveAssignmentId);
          assignmentRef.current = existing;
          setAssignment(existing);
          applyLoadedAssignment(existing, draft, promptId);
        } else if (promptId) {
          const loaded = await catalogApi.getPrompt(promptId);
          setPrompt(loaded);
          applyDraftFields(draft, loaded);
          if (!draft.rubricId && !draft.criteria?.length && rubricItems[0]) {
            applyRubric(rubricItems[0], false);
          }
        } else {
          setMissingPrompt(true);
        }
      } catch (err) {
        addToast(err instanceof AuthApiError ? err.message : 'Không tải được màn tạo bài.', 'error');
        if (isNew && !promptId) setMissingPrompt(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [assignmentId, isNew, promptId, effectiveAssignmentId, currentUser?.id]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
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
    })();
    return () => {
      cancelled = true;
    };
  }, [classroomId, classrooms]);

  function applyDraftFields(draft: AssignmentDraftState, loadedPrompt?: CatalogPrompt) {
    if (draft.title) setTitle(draft.title);
    else if (loadedPrompt) setTitle((current) => current || loadedPrompt.title);
    if (draft.extraInstructions != null) setExtraInstructions(draft.extraInstructions);
    if (draft.classroomId) setClassroomId(draft.classroomId);
    if (draft.dueAt) setDueAt(draft.dueAt);
    if (draft.rubricId) setSelectedRubricId(draft.rubricId);
    if (draft.criteria?.length) {
      setCriteria(draft.criteria);
      if (draft.maxScore) setMaxScore(draft.maxScore);
      if (draft.scoreStep) setScoreStep(draft.scoreStep);
    }
    if (draft.recipientStudentIds) setRecipientIds(draft.recipientStudentIds);
    if (typeof draft.assignToWholeClass === 'boolean') setAssignToWholeClass(draft.assignToWholeClass);
  }

  function applyLoadedAssignment(
    existing: TeacherAssignment,
    draft: AssignmentDraftState,
    nextPromptId: string
  ) {
    setTitle(draft.title || existing.title);
    setExtraInstructions(draft.extraInstructions ?? existing.extraInstructions ?? '');
    setClassroomId(draft.classroomId || existing.classroomId || classroomFromQuery);
    setDueAt(draft.dueAt || toDateTimeLocal(existing.dueAt));
    setSelectedRubricId(draft.rubricId || existing.rubricId || '');
    const assignmentRubric = existing.assignmentRubric;
    if (draft.criteria?.length) {
      setCriteria(draft.criteria);
      setMaxScore(draft.maxScore || existing.maxScore);
      setScoreStep(draft.scoreStep || existing.scoreStep);
    } else if (assignmentRubric?.criteria) {
      setCriteria(assignmentRubric.criteria);
      setMaxScore(assignmentRubric.maxScore);
      setScoreStep(assignmentRubric.scoreStep);
    }
    const wholeClass = draft.assignToWholeClass ?? Boolean(existing.assignToWholeClass);
    setAssignToWholeClass(wholeClass);
    setRecipientIds(draft.recipientStudentIds || existing.recipientStudentIds || []);
    const promptToLoad = nextPromptId || existing.sourcePromptId;
    if (existing.sourcePrompt && existing.sourcePrompt.id === promptToLoad) setPrompt(existing.sourcePrompt);
    else if (promptToLoad) void catalogApi.getPrompt(promptToLoad).then(setPrompt);
  }

  const localDraftPayload = (): AssignmentDraftState => ({
    assignmentId: assignmentRef.current?.id || effectiveAssignmentId || undefined,
    classroomId,
    promptId: prompt?.id || promptId,
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
    saveAssignmentDraft(payload, { userId: currentUser?.id, assignmentId: payload.assignmentId || 'new' });
    return payload;
  };

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

  if (missingPrompt) {
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
          <h1 className="font-headline-lg text-2xl font-bold font-merriweather">Cần chọn đề nguồn trước</h1>
          <div className="p-4 bg-secondary-fixed/40 border border-secondary/40 rounded-xl whitespace-pre-line text-sm">
            {PICK_PROMPT_NOTICE}
          </div>
          <p className="text-sm text-on-surface-variant">
            Không dùng đề mẫu mặc định. Thầy/cô hãy chọn đề từ kho rồi tiếp tục.
          </p>
          <Link
            href={pickPromptHref({ ...storedDraft, classroomId: classroomFromQuery, assignmentId: effectiveAssignmentId || storedDraft.assignmentId })}
            className="inline-flex px-4 py-2 bg-primary-container text-on-primary-container rounded-lg text-sm font-semibold"
          >
            Chọn đề trong kho
          </Link>
        </div>
      </TeacherShell>
    );
  }

  return (
    <TeacherShell
      breadcrumb={
        <div className="flex items-center gap-2 text-sm text-on-surface-variant">
          <Link href="/assignments" className="hover:text-primary">
            Quản lý bài tập
          </Link>
          <span>/</span>
          <span className="text-on-surface font-semibold">{isNew ? 'Tạo bài tập mới cho lớp' : 'Soạn đề & Cấu hình Rubric'}</span>
        </div>
      }
    >
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-outline-variant/20">
          <div>
            <h1 className="font-headline-lg text-2xl font-bold font-merriweather">
              {isNew ? 'Tạo đề bài mới & Thiết lập Rubric GDPT 2018' : 'Cấu hình Đề bài & Thang tiêu chí Rubric'}
            </h1>
            <p className="text-xs text-on-surface-variant mt-1">
              Barem đang soạn là bản của bài này, không sửa ngầm barem gốc.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => void handleSaveDraft()}
              disabled={saving || loading}
              className="px-4 py-2 rounded-lg border border-outline-variant/60 bg-surface-container-lowest text-xs font-medium"
            >
              Lưu bản nháp
            </button>
            <button
              onClick={() => void handlePublish()}
              disabled={saving || loading}
              className="px-4 py-2 rounded-lg bg-primary-container text-on-primary-container text-xs font-bold flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">verified</span>
              Xác nhận Rubric &amp; Giao bài
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm text-on-surface-variant">Đang tải dữ liệu bài tập...</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 space-y-6">
              <section className="bg-surface-container-lowest p-6 rounded-xl border space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-primary">Đề nguồn / ngữ liệu đã chọn</span>
                  <Link
                    href={pickPromptHref(localDraftPayload())}
                    onClick={() => persistLocalDraft({ promptId: prompt?.id })}
                    className="text-xs font-semibold text-secondary"
                  >
                    Đổi đề
                  </Link>
                </div>
                <h2 className="font-merriweather font-bold">{prompt?.title}</h2>
                <p className="text-sm whitespace-pre-line">{prompt?.writingTask}</p>
                <button type="button" onClick={() => setFullPreview((v) => !v)} className="text-xs text-secondary font-semibold">
                  {fullPreview ? 'Thu gọn ngữ liệu' : 'Xem toàn văn ngữ liệu'}
                </button>
                {fullPreview &&
                  prompt?.materials.map((material) => (
                    <div key={material.id} className="p-3 bg-surface-container-low/50 rounded-lg text-xs space-y-1">
                      <p className="font-semibold">{material.title}</p>
                      <p className="text-on-surface-variant">{material.sourceInfo}</p>
                      <pre className="whitespace-pre-wrap font-merriweather">{material.content}</pre>
                    </div>
                  ))}
              </section>

              <section className="bg-surface-container-lowest p-6 rounded-xl border space-y-4">
                <span className="text-xs font-bold uppercase tracking-wider text-primary">Thông tin bài tập</span>
                <label className="block text-xs font-semibold">Tiêu đề bài viết</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-semibold rounded-lg border font-merriweather"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block font-semibold mb-1">Lớp nhận bài</label>
                    <select
                      value={classroomId}
                      onChange={(e) => {
                        setClassroomId(e.target.value);
                        persistLocalDraft({ classroomId: e.target.value });
                      }}
                      className="w-full px-3 py-2 rounded-lg border"
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
                    <label className="block font-semibold mb-1">Hạn nộp</label>
                    <input
                      type="datetime-local"
                      value={dueAt}
                      onChange={(e) => setDueAt(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border"
                    />
                  </div>
                </div>
                <label className="block text-xs font-semibold">Hướng dẫn bổ sung</label>
                <textarea
                  rows={4}
                  value={extraInstructions}
                  onChange={(e) => setExtraInstructions(e.target.value)}
                  className="w-full p-3 text-xs rounded-lg border font-merriweather"
                />
                <div>
                  <span className="text-xs font-semibold">Người nhận bài</span>
                  <div className="mt-2 flex flex-col gap-1 text-xs">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="recipient-mode"
                        checked={assignToWholeClass}
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
                        onChange={() => setAssignToWholeClass(false)}
                      />
                      Giao các học sinh được chọn
                    </label>
                  </div>
                  <div className="mt-2 max-h-40 overflow-y-auto space-y-1 text-xs border rounded-lg p-2">
                    {members.map((member) => (
                      <label key={member.userId} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={recipientIds.includes(member.userId)}
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
                    {members.length === 0 && (
                      <p className="text-on-surface-variant">
                        {classroomId ? 'Lớp chưa có học sinh.' : 'Chưa có học sinh trong các lớp của giáo viên.'}
                      </p>
                    )}
                  </div>
                </div>
              </section>

              <section className="bg-surface-container-lowest p-6 rounded-xl border space-y-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-primary">
                    Barem Rubric cho bài này (tổng {maxScore}đ)
                  </span>
                  <span className={`text-sm font-bold font-mono ${isValidTotal ? 'text-tertiary' : 'text-error'}`}>
                    {totalWeight.toFixed(2)} / {maxScore}đ
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {rubrics.map((rubric) => {
                    const isSelected = rubric.id === selectedRubricId;
                    return (
                      <button
                        key={rubric.id}
                        type="button"
                        onClick={() => applyRubric(rubric)}
                        className={`p-3.5 rounded-xl border text-left ${
                          isSelected ? 'border-secondary ring-2 ring-secondary/25' : 'border-outline-variant/50'
                        }`}
                      >
                        <p className="text-xs font-bold">{rubric.shortTitle || rubric.title}</p>
                        <p className="text-[11px] text-on-surface-variant mt-1">
                          {rubric.criteriaCount} tiêu chí • Tổng {rubric.maxScore}đ
                        </p>
                      </button>
                    );
                  })}
                </div>
                {!isValidTotal && (
                  <div className="p-3 bg-error-container/50 text-error text-xs rounded-lg">
                    Tổng điểm các tiêu chí phải bằng {maxScore}đ theo thang của barem đang chọn.
                  </div>
                )}
                {criteria.map((criterion) => (
                  <div key={criterion.id} className="p-4 bg-surface-container-low/40 rounded-xl border space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold">{criterion.name}</span>
                      <input
                        type="number"
                        step={scoreStep}
                        min={0}
                        value={criterion.weight}
                        onChange={(e) =>
                          setCriteria((prev) =>
                            prev.map((item) =>
                              item.id === criterion.id ? { ...item, weight: parseFloat(e.target.value) || 0 } : item
                            )
                          )
                        }
                        className="w-16 px-2 py-1 text-xs font-bold text-center rounded border font-mono"
                      />
                    </div>
                    {criterion.guideNote && <p className="text-[11px] text-on-surface-variant">{criterion.guideNote}</p>}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => void handleSaveAsRubric()}
                  className="px-3.5 py-2 rounded-lg border border-dashed text-xs text-secondary w-full"
                >
                  Lưu thành barem mới trong kho
                </button>
              </section>
            </div>

            <div className="lg:col-span-4 space-y-5">
              <div className="bg-surface-container-lowest p-5 rounded-xl border space-y-3">
                <span className="text-xs font-bold uppercase">Ngữ liệu của đề</span>
                {(prompt?.materials || []).map((material) => (
                  <div key={material.id} className="p-2.5 bg-surface-container-low/50 rounded-lg text-xs">
                    <p className="font-semibold">{material.title}</p>
                    <p className="text-on-surface-variant">{material.author}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </TeacherShell>
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
