import test from 'node:test';
import assert from 'node:assert/strict';
import { deadlineState } from '../../assignments/deadline';
import { revisionBlockedLabel } from '../labels';
import {
  compareRounds,
  comparisonForRound,
  defaultRound,
  printRoundCopy,
  revisionAction,
  revisionDeadlineFields,
  revisionScoreTrail,
  roundLabel,
  roundVisibilityLabel,
  scoreChange,
  scoreDelta,
  sortRounds,
} from '../revision';

test('Nhãn lý do viết lại theo mã backend, mã lạ để trống', () => {
  assert.equal(revisionBlockedLabel('REVISION_CLOSED'), 'Đã hết hạn viết lại. Em hãy liên hệ giáo viên nếu cần thêm thời gian.');
  assert.equal(revisionBlockedLabel('REVISION_LIMIT_IN_USE'), 'Không thể giảm số lượt dưới số bản viết lại học sinh đã bắt đầu.');
  assert.equal(revisionBlockedLabel('CLASSROOM_READ_ONLY'), 'Lớp thuộc kỳ học đã kết thúc nên chỉ xem được bài.');
  assert.equal(revisionBlockedLabel('KHAC'), '');
  assert.equal(revisionBlockedLabel(null), '');
});

test('Nhãn bản, thứ tự và bản mặc định là bản đang công bố', () => {
  assert.equal(roundLabel(2), 'Bản 2');
  assert.equal(roundLabel(0), 'Bản 1');
  assert.equal(roundVisibilityLabel(false), 'Bản bị ẩn với học sinh');
  const rounds = [{ round: 2, publishedAt: 'b' }, { round: 1, publishedAt: 'a' }];
  assert.deepEqual(sortRounds(rounds).map((item) => item.round), [1, 2]);
  assert.deepEqual(rounds.map((item) => item.round), [2, 1]);
  assert.equal(defaultRound(rounds, 2), 2);
  assert.equal(defaultRound(rounds, null), 2);
  assert.equal(defaultRound([{ round: 3 }, { round: 1, isPublished: true }], 9), 1);
  assert.equal(defaultRound([], 1), null);
});

test('Chênh điểm có dấu, chữ tăng giảm không đổi, và thiếu điểm không thành 0', () => {
  assert.deepEqual(scoreChange(1.5), { kind: 'up', text: '+1.50', word: 'tăng' });
  assert.deepEqual(scoreChange(-0.25), { kind: 'down', text: '−0.25', word: 'giảm' });
  assert.deepEqual(scoreChange(0), { kind: 'flat', text: '0.00', word: 'không đổi' });
  assert.equal(scoreChange(null).kind, 'none');
  assert.equal(scoreDelta(null, 0), null);
  assert.equal(scoreDelta(1, 1.0000001), 0);
});

test('So sánh ghép tiêu chí, tiêu chí lệch bên không lấy điểm 0', () => {
  const comparison = compareRounds(
    { round: 1, totalScore: 6, scoreScale10: 6, evaluations: [
      { criterionId: 'A', criterionName: 'Nội dung', awardedScore: 4, maxScore: 6 },
      { criterionId: 'B', criterionName: 'Bỏ', awardedScore: 2, maxScore: 4 },
    ] },
    { round: 2, totalScore: 8, scoreScale10: 8, evaluations: [
      { criterionId: 'A', criterionName: 'Nội dung', awardedScore: 6, maxScore: 6 },
      { criterionId: 'C', criterionName: 'Thêm', awardedScore: 2, maxScore: 4 },
    ] },
  );
  assert.equal(comparison.totalScoreDelta, 2);
  assert.equal(comparison.criteria[0].delta, 2);
  assert.equal(comparison.criteria[1].status, 'removed');
  assert.equal(comparison.criteria[1].delta, null);
  assert.equal(comparison.criteria[2].status, 'added');
  assert.equal(comparison.criteria[2].previousScore, null);
  const rounds = [
    { round: 1, publishedAt: 'a', totalScore: 1, scoreScale10: 1, evaluations: [] },
    { round: 2, publishedAt: null, totalScore: 2, scoreScale10: 2, evaluations: [] },
    { round: 3, publishedAt: 'c', totalScore: 3, scoreScale10: 3, evaluations: [] },
  ];
  assert.equal(comparisonForRound(rounds, 3), null);
  assert.equal(comparisonForRound(rounds, 1), null);
  assert.equal(comparisonForRound([{ round: 1, publishedAt: 'a', totalScore: 1, scoreScale10: 1 }, { round: 2, publishedAt: 'b', totalScore: 2, scoreScale10: 2 }], 2)?.totalScoreDelta, 1);
});

test('Hành động viết lại: bắt đầu, tiếp tục bản dở, bị chặn, tắt thì ẩn', () => {
  assert.equal(revisionAction({ canStartRevision: true, revisionRound: 1, maxRevisions: 2 }).label, 'Viết lại bản 2');
  const open = revisionAction({
    canStartRevision: false, revisionRound: 2, currentPublishedRound: 1, maxRevisions: 1,
    startRevisionBlockedReason: 'REVISION_LIMIT_REACHED',
  });
  assert.equal(open.kind, 'continue');
  assert.equal(open.label, 'Tiếp tục bản 2');
  assert.equal(open.reason, '');
  const closed = revisionAction({
    canStartRevision: false, revisionRound: 2, currentPublishedRound: 1,
    startRevisionBlockedReason: 'REVISION_CLOSED',
  });
  assert.equal(closed.kind, 'continue');
  assert.match(closed.reason, /hết hạn viết lại/);
  assert.equal(revisionAction({
    canStartRevision: false, revisionRound: 1, maxRevisions: 1, currentPublishedRound: 1,
    startRevisionBlockedReason: 'REVISION_NOT_PUBLISHED',
  }).kind, 'blocked');
  assert.equal(revisionAction({ maxRevisions: 0, revisionRound: 1, startRevisionBlockedReason: 'REVISION_DISABLED' }).kind, 'hidden');
  assert.equal(revisionAction({
    canStartRevision: false, revisionRound: 2, currentPublishedRound: 2, maxRevisions: 1,
    startRevisionBlockedReason: 'REVISION_LIMIT_REACHED',
  }).kind, 'blocked');
  assert.equal(revisionAction({
    canStartRevision: false, revisionRound: 2, maxRevisions: 1, roundsKnown: false,
    startRevisionBlockedReason: 'REVISION_LIMIT_REACHED',
  }).kind, 'blocked');
});

test('Bản viết lại lấy hạn viết lại, bản 1 giữ hạn nộp và gia hạn', () => {
  const first = revisionDeadlineFields({
    revisionRound: 1, dueAt: '2026-10-27T00:00:00Z', effectiveDueAt: '2026-10-29T00:00:00Z',
    latePolicy: 'ALLOW_LATE', hasExtension: true, isLate: true, revisionDueAt: '2026-10-30T00:00:00Z',
  });
  assert.equal(first.effectiveDueAt, '2026-10-29T00:00:00Z');
  assert.equal(first.hasExtension, true);
  assert.equal(first.isLate, true);
  const now = Date.parse('2026-10-28T00:00:00Z');
  const rewrite = revisionDeadlineFields({
    revisionRound: 2, dueAt: '2026-10-27T00:00:00Z', effectiveDueAt: '2026-10-27T00:00:00Z',
    latePolicy: 'ALLOW_LATE', hasExtension: true, isLate: true, isClosed: false,
    revisionDueAt: '2026-10-28T09:30:00+07:00',
  });
  assert.equal(rewrite.effectiveDueAt, '2026-10-28T09:30:00+07:00');
  assert.equal(rewrite.hasExtension, false);
  assert.equal(rewrite.isLate, false);
  assert.equal(deadlineState(rewrite, now).label, 'Còn 3 giờ');
  assert.equal(deadlineState(revisionDeadlineFields({ revisionRound: 2, isClosed: true, revisionDueAt: '2026-10-27T00:00:00Z' }), now).label, 'Đã khoá');
  assert.equal(deadlineState(revisionDeadlineFields({ revisionRound: 2, revisionDueAt: null }), now).label, '');
});

test('Cột báo cáo và phiếu in nêu bản và điểm bản 1 khi có bản trước', () => {
  assert.equal(revisionScoreTrail({ revisionRound: 1, publishedRound: 1, firstPublishedScore: 6, score: 6 }), '');
  assert.equal(revisionScoreTrail({ revisionRound: 2, publishedRound: 2, firstPublishedScore: 6, publishedScore: 8, score: 9 }), 'Bản 1: 6.00 → hiện tại: 8.00');
  assert.equal(revisionScoreTrail({ revisionRound: 2, firstPublishedScore: null, score: 8 }), '');
  assert.equal(printRoundCopy(1, 6).previousLine, null);
  assert.equal(printRoundCopy(2, 6.5).roundLine, 'Bản 2');
  assert.equal(printRoundCopy(2, 6.5).previousLine, '6.50 điểm');
  assert.equal(printRoundCopy(3, 0).previousLine, '0.00 điểm');
  assert.equal(printRoundCopy(2, null).previousLine, null);
});
