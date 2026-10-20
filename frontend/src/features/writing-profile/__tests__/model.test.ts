import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_FILTERS,
  LEVEL_STEPS,
  createRequestGuard,
  filterObservations,
  formatDate,
  initialsOf,
  profileStats,
  profileView,
  resultHref,
} from '../model';
import type {
  WritingProfileObservation,
  WritingProfilePayload,
  WritingProfileResponse,
} from '../types';

function observation(overrides: Partial<WritingProfileObservation>): WritingProfileObservation {
  return {
    id: 'obs-1',
    label: 'AI nhận xét',
    traitId: 'WORD_CHOICE',
    traitName: 'Lựa chọn từ ngữ & Vốn từ',
    kind: 'STRENGTH',
    kindLabel: 'Điểm mạnh',
    description: 'Dùng từ gợi hình.',
    practiceTip: 'Thử thay một tính từ bằng động từ mạnh.',
    evidenceQuote: 'mạch nguồn không bao giờ cạn',
    evidenceStart: 0,
    evidenceEnd: 28,
    pageIndex: 1,
    sourceId: 'S1',
    assignmentId: 'assign-1',
    assignmentTitle: 'Cội nguồn quê hương',
    genre: 'NLXH',
    genreLabel: 'Nghị luận xã hội',
    publishedAt: '2026-10-02T03:00:00+00:00',
    publishedOn: '2026-10-02',
    resultId: 'result-1',
    linkHref: '/assignments/assign-1/result',
    ...overrides,
  };
}

const OBSERVATIONS = [
  observation({ id: 'a' }),
  observation({
    id: 'b',
    kind: 'WEAKNESS',
    traitId: 'EVIDENCE_LINKING',
    traitName: 'Nối & Phân tích dẫn chứng',
    description: 'Dẫn chứng chưa được phân tích.',
    genre: 'NLVH',
    assignmentTitle: 'Phân tích Bếp lửa',
    assignmentId: 'assign-2',
  }),
  observation({ id: 'c', kind: 'STYLE', evidenceQuote: 'Tóm lại, cội nguồn là điểm tựa' }),
];

function response(
  status: WritingProfileResponse['status'],
  profile: WritingProfilePayload | null
): WritingProfileResponse {
  return {
    status,
    notice: null,
    student: {
      id: 'student-1',
      displayName: 'Nguyễn Văn An',
      loginId: 'an.nguyen',
      className: 'Lớp 12A14',
      classCode: '12A14',
      academicYear: '2026-2027',
    },
    sourceSummary: { eligibleCount: 2, analyzedCount: 2, promptVersion: 'v1', multipleSources: true },
    updatedAt: null,
    refreshed: false,
    profile,
  };
}

function payload(observations: WritingProfileObservation[]): WritingProfilePayload {
  return {
    label: 'AI nhận xét',
    summary: observations.length ? 'Tóm tắt.' : '',
    insufficient: observations.length === 0,
    traits: [],
    observations,
    sources: [
      {
        sourceId: 'S1',
        assignmentId: 'assign-1',
        assignmentTitle: 'Cội nguồn quê hương',
        genre: 'NLXH',
        genreLabel: 'Nghị luận xã hội',
        publishedAt: null,
        publishedOn: null,
        publishedComment: '',
        publishedLabel: 'Nhận xét đã công bố',
        evidenceCount: observations.length,
        resultId: 'result-1',
      },
    ],
    stats: {
      analyzedCount: 1,
      evidenceCount: observations.length,
      strengthCount: 0,
      weaknessCount: 0,
      styleCount: 0,
      traitsWithEvidence: 0,
      droppedCount: 0,
      multipleSources: false,
    },
    notice: null,
  };
}

describe('Hồ sơ văn phong học sinh', () => {
  test('Bộ lọc thể loại, loại nhận xét, nhóm diễn đạt và ô tìm kiếm', () => {
    assert.equal(filterObservations(OBSERVATIONS, DEFAULT_FILTERS).length, 3);
    assert.deepEqual(
      filterObservations(OBSERVATIONS, { ...DEFAULT_FILTERS, genre: 'NLVH' }).map((o) => o.id),
      ['b']
    );
    assert.deepEqual(
      filterObservations(OBSERVATIONS, { ...DEFAULT_FILTERS, kind: 'STYLE' }).map((o) => o.id),
      ['c']
    );
    assert.deepEqual(
      filterObservations(OBSERVATIONS, { ...DEFAULT_FILTERS, traitId: 'EVIDENCE_LINKING' }).map((o) => o.id),
      ['b']
    );
    assert.deepEqual(
      filterObservations(OBSERVATIONS, { ...DEFAULT_FILTERS, query: '  BẾP LỬA ' }).map((o) => o.id),
      ['b']
    );
    assert.deepEqual(
      filterObservations(OBSERVATIONS, { ...DEFAULT_FILTERS, query: 'điểm tựa' }).map((o) => o.id),
      ['c']
    );
    assert.equal(
      filterObservations(OBSERVATIONS, { ...DEFAULT_FILTERS, genre: 'NLVH', kind: 'STRENGTH' }).length,
      0
    );
  });

  test('Thống kê tính từ dữ liệu trả về, không tự điền giá trị', () => {
    assert.deepEqual(profileStats(null), {
      analyzedCount: 0,
      strengthCount: 0,
      weaknessCount: 0,
      styleCount: 0,
      evidenceCount: 0,
    });
    assert.deepEqual(profileStats(response('ready', payload(OBSERVATIONS))), {
      analyzedCount: 1,
      strengthCount: 1,
      weaknessCount: 1,
      styleCount: 1,
      evidenceCount: 3,
    });
  });

  test('Trạng thái đang tải, lỗi, chưa có bài, chưa phân tích, cần cập nhật, chưa đủ căn cứ', () => {
    assert.equal(profileView({ loading: true, error: '', data: null }), 'loading');
    assert.equal(profileView({ loading: false, error: 'Mất kết nối', data: null }), 'error');
    assert.equal(profileView({ loading: false, error: '', data: null }), 'error');
    assert.equal(profileView({ loading: false, error: '', data: response('empty', null) }), 'empty');
    assert.equal(
      profileView({ loading: false, error: '', data: response('not_analyzed', null) }),
      'not_analyzed'
    );
    assert.equal(profileView({ loading: false, error: '', data: response('stale', null) }), 'stale');
    assert.equal(
      profileView({ loading: false, error: '', data: response('ready', payload([])) }),
      'insufficient'
    );
    assert.equal(
      profileView({ loading: false, error: '', data: response('ready', payload(OBSERVATIONS)) }),
      'ready'
    );
  });

  test('Liên kết “Xem bài viết” trỏ tới trang kết quả thật của bài', () => {
    assert.equal(resultHref('assign-1'), '/assignments/assign-1/result');
    assert.equal(resultHref('a/b'), '/assignments/a%2Fb/result');
  });

  test('Response đến muộn của tài khoản cũ bị bỏ qua', () => {
    const guard = createRequestGuard();
    const first = guard.bump();
    const pending = guard.current();
    assert.equal(guard.isCurrent(pending), true);
    guard.bump(); // đổi tài khoản
    assert.equal(guard.isCurrent(first), false);
    assert.equal(guard.isCurrent(pending), false);
    assert.equal(guard.isCurrent(guard.current()), true);
  });

  test('Mức ghi nhận không phải phần trăm; chữ cái đầu và ngày lấy từ dữ liệu', () => {
    assert.equal(LEVEL_STEPS.INSUFFICIENT, 0);
    assert.equal(LEVEL_STEPS.STRONG, 3);
    assert.equal(initialsOf('Nguyễn Văn An'), 'VA');
    assert.equal(initialsOf('An'), 'A');
    assert.equal(initialsOf('   '), '?');
    assert.equal(formatDate(null), '');
    assert.equal(formatDate('không phải ngày'), '');
    assert.match(formatDate('2026-10-02T03:00:00+00:00'), /^0[12]\/10\/2026$/);
  });
});
