import test, { describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { parseRubricJson, RUBRIC_JSON_HELP } from '../rubric';
import {
  createAssignmentHref,
  draftStorageKey,
  pickPromptHref,
  promptMissingLabels,
  saveAssignmentDraft,
  loadAssignmentDraft,
  clearAssignmentDraft,
} from '../draft';
import { boundPreview, canActOnPreview } from '../preview';
import { shouldResetSocraticSession, socraticSessionKey } from '../../socratic/lifecycle';
import { MISSING_LABELS, PICK_PROMPT_NOTICE, RUBRIC_IMPORT_SUCCESS } from '../types';

describe('Luồng giáo viên chọn đề và import barem', () => {
  before(() => {
    const memory = new Map<string, string>();
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
      removeItem: (key: string) => {
        memory.delete(key);
      },
    };
    (globalThis as { window?: unknown; sessionStorage?: unknown }).sessionStorage = storage;
    (globalThis as { window?: unknown }).window = globalThis;
  });

  test('Cả hai lối vào đều yêu cầu promptId, không dùng đề mẫu mặc định', () => {
    const fromAssignments = pickPromptHref({ classroomId: 'class-11a14' });
    assert.equal(fromAssignments, '/materials?mode=pick-prompt&classroomId=class-11a14');
    const continueHref = createAssignmentHref('prompt-khoi-nha-may', { classroomId: 'class-11a14' });
    assert.equal(
      continueHref,
      '/assignments/new?promptId=prompt-khoi-nha-may&classroomId=class-11a14'
    );
    assert.equal(continueHref.includes('mau-tu-do-dat'), false);
  });

  test('Lối vào từ quản lý bài có thông báo cố định và giữ lớp đang chọn', () => {
    assert.match(PICK_PROMPT_NOTICE, /Chọn đề trước khi tạo bài tập/);
    assert.match(PICK_PROMPT_NOTICE, /barem, lớp nhận bài và hạn nộp/);
    const draft = saveAssignmentDraft({
      classroomId: 'class-11a14',
      title: 'Nháp đang soạn',
      extraInstructions: 'Thêm dẫn chứng thực tế',
    });
    assert.equal(draft.classroomId, 'class-11a14');
    const again = loadAssignmentDraft();
    assert.equal(again.classroomId, 'class-11a14');
    assert.equal(again.title, 'Nháp đang soạn');
    assert.equal(pickPromptHref(again).includes('classroomId=class-11a14'), true);
    clearAssignmentDraft();
  });

  test('Import JSON hợp lệ; JSON thiếu tổng điểm bị từ chối', () => {
    const valid = parseRubricJson(
      JSON.stringify({
        title: 'Barem 10 điểm',
        maxScore: 10,
        scoreStep: 0.5,
        criteria: [
          { id: 'C1', name: 'Nội dung', weight: 6 },
          { id: 'C2', name: 'Hình thức', weight: 4 },
        ],
      })
    );
    assert.equal(valid.ok, true);
    if (valid.ok) {
      assert.equal(valid.rubric.maxScore, 10);
      assert.equal(valid.rubric.criteria.length, 2);
    }
    const invalid = parseRubricJson(
      JSON.stringify({
        title: 'Sai tổng',
        maxScore: 4,
        criteria: [{ id: 'C1', name: 'A', weight: 1 }],
      })
    );
    assert.equal(invalid.ok, false);
    if (!invalid.ok) {
      assert.match(invalid.error, /Tổng điểm/);
    }
    assert.match(RUBRIC_JSON_HELP, /maxScore/);
    assert.match(RUBRIC_IMPORT_SUCCESS, /màn tạo đề/);
  });

  test('Kho không có thao tác áp dụng barem cho bài tập', () => {
    assert.equal(RUBRIC_IMPORT_SUCCESS.includes('Áp dụng Barem này cho đề bài'), false);
    assert.match(RUBRIC_IMPORT_SUCCESS, /chọn barem này tại màn tạo đề/);
  });

  test('Đề chưa đủ dữ liệu liệt kê phần cần bổ sung', () => {
    const label = promptMissingLabels(['writingTask', 'materials'], MISSING_LABELS);
    assert.equal(label, 'yêu cầu viết, ngữ liệu liên kết');
  });

  test('Draft tách theo người dùng và bài, giữ đủ trường khi đổi đề', () => {
    clearAssignmentDraft({ userId: 'gv-1', assignmentId: 'new' });
    const saved = saveAssignmentDraft(
      {
        title: 'Nháp đang soạn',
        extraInstructions: 'Thêm dẫn chứng',
        dueAt: '2026-11-01T16:00',
        classroomId: 'class-11a14',
        recipientStudentIds: ['hs-1'],
        assignToWholeClass: false,
        rubricId: 'rubric-1',
        criteria: [{ id: 'C1', name: 'Nội dung', weight: 4 }],
        maxScore: 4,
        scoreStep: 0.25,
        promptId: 'prompt-a',
      },
      { userId: 'gv-1', assignmentId: 'new' }
    );
    saveAssignmentDraft({ title: 'Nháp người khác' }, { userId: 'gv-2', assignmentId: 'new' });
    const mine = loadAssignmentDraft({ userId: 'gv-1', assignmentId: 'new' });
    const other = loadAssignmentDraft({ userId: 'gv-2', assignmentId: 'new' });
    assert.equal(mine.title, 'Nháp đang soạn');
    assert.equal(mine.extraInstructions, 'Thêm dẫn chứng');
    assert.equal(mine.dueAt, '2026-11-01T16:00');
    assert.equal(mine.classroomId, 'class-11a14');
    assert.deepEqual(mine.recipientStudentIds, ['hs-1']);
    assert.equal(mine.assignToWholeClass, false);
    assert.equal(mine.rubricId, 'rubric-1');
    assert.equal(mine.criteria?.[0].id, 'C1');
    assert.equal(other.title, 'Nháp người khác');
    const continued = saveAssignmentDraft(
      { ...mine, promptId: 'prompt-b', assignmentId: 'draft-99' },
      { userId: 'gv-1', assignmentId: 'draft-99' }
    );
    assert.equal(continued.assignmentId, 'draft-99');
    assert.equal(continued.promptId, 'prompt-b');
    assert.equal(continued.title, 'Nháp đang soạn');
    assert.equal(loadAssignmentDraft({ userId: 'gv-1', assignmentId: 'draft-99' }).title, 'Nháp đang soạn');
    assert.equal(draftStorageKey('gv-1', 'draft-99'), 'edulit.assignmentDraft:gv-1:draft-99');
    assert.equal(saved.classroomId, 'class-11a14');
  });

  test('Preview chỉ thao tác khi khớp kind/id đang chọn', () => {
    const previewA = { id: 'prompt-a', title: 'Đề A' };
    assert.equal(boundPreview('prompt', 'prompt-b', 'prompt', previewA), null);
    assert.equal(boundPreview('prompt', 'prompt-a', 'prompt', previewA)?.id, 'prompt-a');
    assert.equal(canActOnPreview('prompt-b', 'prompt-a', false), false);
    assert.equal(canActOnPreview('prompt-b', 'prompt-b', true), false);
    assert.equal(canActOnPreview('prompt-b', 'prompt-b', false), true);
  });

  test('Socratic chỉ reset khi đổi session hoặc tài khoản', () => {
    const key = socraticSessionKey('hs-1', 'EDU-1');
    assert.equal(shouldResetSocraticSession(null, key), false);
    assert.equal(shouldResetSocraticSession(key, key), false);
    assert.equal(shouldResetSocraticSession(key, socraticSessionKey('hs-1', 'EDU-2')), true);
    assert.equal(shouldResetSocraticSession(key, socraticSessionKey('hs-2', 'EDU-1')), true);
  });

  test('Import barem cho phép mức 0 điểm, từ chối âm hoặc vượt tối đa', () => {
    const valid = parseRubricJson(
      JSON.stringify({
        title: 'Barem có mức 0',
        maxScore: 4,
        scoreStep: 0.25,
        criteria: [
          {
            id: 'C1',
            name: 'Nội dung',
            weight: 4,
            levels: [
              { score: 0, descriptor: 'Chưa đạt: 0 điểm' },
              { score: 4, descriptor: 'Xuất sắc' },
            ],
          },
        ],
      })
    );
    assert.equal(valid.ok, true);
    if (valid.ok) {
      assert.equal(valid.rubric.criteria[0].levels?.[0].score, 0);
    }
    const negative = parseRubricJson(
      JSON.stringify({
        title: 'Âm',
        maxScore: 4,
        criteria: [{ id: 'C1', name: 'A', weight: 4, levels: [{ score: -1, descriptor: 'Sai' }] }],
      })
    );
    assert.equal(negative.ok, false);
    const over = parseRubricJson(
      JSON.stringify({
        title: 'Vượt',
        maxScore: 4,
        criteria: [{ id: 'C1', name: 'A', weight: 2, levels: [{ score: 3, descriptor: 'Sai' }] }, { id: 'C2', name: 'B', weight: 2 }],
      })
    );
    assert.equal(over.ok, false);
  });
});
