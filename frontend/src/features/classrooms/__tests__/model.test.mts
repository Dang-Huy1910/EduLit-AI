import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { filterAssignmentsByContext, normalizeJoinCode, pickDefaultClassroom, pickDefaultTerm, shouldResetClassContext } from '../model';
import type { ClassroomSummary, StudentAssignment, Term } from '@/features/catalog/types';

const terms: Term[] = [
  { id: 'old', code: 'HK1', name: 'Học kỳ I', academicYear: '2025-2026', startsOn: '2025-08-01', endsOn: '2026-01-10', status: 'ENDED', isCurrent: false },
  { id: 'new', code: 'HK2', name: 'Học kỳ II', academicYear: '2025-2026', startsOn: '2026-01-11', endsOn: '2026-05-31', status: 'ACTIVE', isCurrent: true },
];

const classroom = (id: string, readOnly = false): ClassroomSummary => ({
  id, code: id, name: id, subject: 'Ngữ văn', gradeLevel: 12, academicYear: '2025-2026', termId: 'new', termName: 'Học kỳ II', termStatus: 'ACTIVE', readOnly, archived: false, joinCode: 'ABC123', joinEnabled: true, studentCount: 0,
});

const assignment = (id: string, termId: string | null, classroomId: string | null): StudentAssignment => ({
  id,
  code: id,
  title: id,
  status: 'published',
  dueAt: null,
  termId,
  classroomId,
});

describe('ngữ cảnh kỳ học và lớp', () => {
  test('ưu tiên kỳ hiện tại, hoặc kỳ bắt đầu mới nhất', () => {
    assert.equal(pickDefaultTerm(terms)?.id, 'new');
    assert.equal(pickDefaultTerm(terms.map((term) => ({ ...term, isCurrent: false })))?.id, 'new');
  });

  test('chọn lớp ưu tiên còn hợp lệ, rồi lớp có thể ghi', () => {
    const classrooms = [classroom('readonly', true), classroom('write')];
    assert.equal(pickDefaultClassroom(classrooms, 'write')?.id, 'write');
    assert.equal(pickDefaultClassroom(classrooms, 'missing')?.id, 'write');
    assert.equal(pickDefaultClassroom([classroom('first', true), classroom('second', true)])?.id, 'first');
  });

  test('chuẩn hoá mã tham gia', () => {
    assert.equal(normalizeJoinCode(' ab-c 12 '), 'ABC12');
  });

  test('đổi tài khoản thì reset ngữ cảnh lớp', () => {
    assert.equal(shouldResetClassContext('teacher-a', 'teacher-b'), true);
    assert.equal(shouldResetClassContext('teacher-a', 'teacher-a'), false);
    assert.equal(shouldResetClassContext('teacher-a', undefined), false);
  });

  test('lọc bài theo lớp đã chọn', () => {
    const assignments = [
      assignment('class-a', 'new', 'a'),
      assignment('class-b', 'new', 'b'),
      assignment('without-class', null, null),
    ];
    assert.deepEqual(
      filterAssignmentsByContext(assignments, { termId: 'new', classroomId: 'a' }).map((item) => item.id),
      ['class-a']
    );
  });

  test('tất cả lớp lọc theo kỳ và giữ bài chưa gắn kỳ', () => {
    const assignments = [
      assignment('current', 'new', 'a'),
      assignment('old', 'old', 'a'),
      assignment('without-term', null, null),
    ];
    assert.deepEqual(
      filterAssignmentsByContext(assignments, { termId: 'new', classroomId: '' }).map((item) => item.id),
      ['current', 'without-term']
    );
  });
});
