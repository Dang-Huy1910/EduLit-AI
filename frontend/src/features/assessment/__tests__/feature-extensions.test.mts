import test from 'node:test';
import assert from 'node:assert/strict';
import { deadlineState } from '../../assignments/deadline';
import { reportExportPath } from '../report-query';
import { mapConcurrent, studentFeedbackSheet, teacherFeedbackSheet } from '../print-model';
import type { AssessmentPayload, StudentAssessmentResponse, TeacherAssessmentDetail } from '../types';

const now = Date.parse('2026-10-28T00:00:00Z');
test('Không hạn, ngày lỗi và đúng mốc hạn không bị coi là quá hạn', () => {
  assert.equal(deadlineState({}, now).remaining, null);
  assert.equal(deadlineState({ dueAt: 'invalid' }, now).label, '');
  assert.equal(deadlineState({ dueAt: new Date(now).toISOString() }, now).closed, false);
});
test('Hạn hiệu lực và múi giờ quyết định nhắc dưới 24 giờ', () => {
  const fields = { dueAt: '2026-10-27T00:00:00Z', effectiveDueAt: '2026-10-28T09:30:00+07:00', hasExtension: true };
  assert.equal(deadlineState(fields, now).label, 'Còn 3 giờ');
  assert.equal(deadlineState({ dueAt: '2026-10-29T00:00:00Z' }, now).label, '');
  assert.equal(deadlineState({ dueAt: '2026-10-28T00:01:00Z' }, now).label, 'Còn 1 giờ');
});
test('Quá hạn cho nộp muộn, khoá hạn và quyền backend cho nhãn đúng', () => {
  const dueAt = '2026-10-27T00:00:00Z';
  assert.equal(deadlineState({ dueAt, latePolicy: 'ALLOW_LATE' }, now).label, 'Quá hạn');
  assert.equal(deadlineState({ dueAt, latePolicy: 'CLOSE_AT_DUE' }, now).label, 'Đã khoá');
  assert.equal(deadlineState({ dueAt, latePolicy: 'CLOSE_AT_DUE', isClosed: false }, now).closed, false);
  assert.equal(deadlineState({ isClosed: true }, now).label, 'Đã khoá');
});
test('Excel giữ toàn bộ bộ lọc, mã hoá tìm kiếm và bỏ phân trang', () => {
  const filters = { mode: 'official', search: 'An & Bình', status: 'late', sort: 'score_asc', from: '2026-01-01', to: '2026-12-31', studentId: 'student', page: 4, pageSize: 10 };
  const url = new URL(reportExportPath('id/with space', filters), 'https://example.test');
  assert.match(url.pathname, /id%2Fwith%20space/);
  for (const key of ['mode', 'search', 'status', 'sort', 'from', 'to', 'studentId']) assert.equal(url.searchParams.get(key), filters[key as keyof typeof filters]);
  assert.equal(url.searchParams.has('page'), false);
  assert.equal(url.searchParams.has('pageSize'), false);
  assert.equal(reportExportPath('id', {}), '/api/teacher/reports/id/export.xlsx');
});
const published: AssessmentPayload = { evaluations: [], overallComment: 'Đã công bố', improvementGuidance: [], totalScore: 0, maxScore: 10, scoreStep: .25, scoreScale10: 0 };
const detail = {
  assignment: { title: 'Bài viết', classroomName: '11A1' },
  student: { displayName: 'An', loginId: 'an' },
  assessment: { isPublished: true, publishedResult: { isPublished: true, publishedAt: '2026-10-28' }, published,
    working: { ...published, totalScore: 9, overallComment: 'Đang rà soát' }, ai: { ...published, totalScore: 10 } },
  transcriptionPages: [{ text: 'Bản chép riêng tư' }],
} as unknown as TeacherAssessmentDetail;
test('Phiếu giáo viên chỉ lấy snapshot đã công bố, gồm điểm 0', () => {
  const sheet = teacherFeedbackSheet(detail);
  assert.equal(sheet?.result, published);
  assert.equal(sheet?.result.totalScore, 0);
  assert.equal(sheet?.classroomName, '11A1');
  assert.equal(JSON.stringify(sheet).includes('Đang rà soát'), false);
  assert.equal(JSON.stringify(sheet).includes('Bản chép riêng tư'), false);
});
test('Phiếu không nhận kết quả bị ẩn hoặc chưa công bố', () => {
  assert.equal(teacherFeedbackSheet({ ...detail, assessment: { ...detail.assessment, isPublished: false } }), null);
  assert.equal(teacherFeedbackSheet({ ...detail, assessment: { ...detail.assessment, published: null } }), null);
  assert.equal(teacherFeedbackSheet({ ...detail, assessment: { ...detail.assessment, publishedResult: null } }), null);
});
test('Phiếu học sinh tôn trọng canViewResult', () => {
  const data = { assignment: { title: 'Bài' }, student: { displayName: 'An', loginId: 'an' }, assessment: { canViewResult: true, result: { ...published, publishedAt: null } } } as StudentAssessmentResponse;
  assert.equal(studentFeedbackSheet(data, '11A1')?.classroomName, '11A1');
  assert.equal(studentFeedbackSheet({ ...data, assessment: { ...data.assessment, canViewResult: false } }), null);
});
test('Tải phiếu giữ thứ tự và tối đa bốn request đồng thời', async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const rows = Array.from({ length: 13 }, (_, index) => index);
  const results = await mapConcurrent(rows, async (row) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, (13 - row) % 4));
    inFlight--;
    return row * 2;
  });
  assert.equal(maxInFlight, 4);
  assert.deepEqual(results, rows.map((row) => row * 2));
  assert.deepEqual(await mapConcurrent([], async (value) => value), []);
});
