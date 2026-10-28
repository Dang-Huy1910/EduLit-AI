import type { StatsMode } from './types';

export function formatScore(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toFixed(digits);
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${Math.round(value * 100)}%`;
}

export function rowStatusLabel(status: string): string {
  const map: Record<string, string> = {
    not_submitted: 'Chưa nộp',
    late: 'Nộp muộn',
    processing: 'Đang xử lý',
    ocr_review: 'Đang rà OCR',
    ocr_failed: 'Lỗi OCR',
    grading: 'Đang chấm',
    awaiting_review: 'Chờ rà soát',
    published: 'Đã công bố',
    grading_failed: 'Lỗi chấm',
    revising: 'Đang sửa bản chép',
    new_version_grading: 'Bản mới đang chấm',
    new_version_review: 'Bản mới chờ công bố',
    new_version_failed: 'Bản mới lỗi chấm',
  };
  return map[status] || status;
}

export function insightStatusLabel(status: string, stale: boolean, scoredCount: number): string {
  if (scoredCount <= 0) return 'Chưa đủ dữ liệu';
  if (status === 'QUEUED' || status === 'PROCESSING') return 'Đang phân tích';
  if (status === 'FAILED') return 'Xử lý lỗi';
  if (status === 'READY' && stale) return 'Cần cập nhật';
  if (status === 'READY') return 'Đã có phân tích';
  return 'Chưa có phân tích';
}

export function modeShort(mode: StatsMode | string | undefined): string {
  return mode === 'provisional' ? 'Tạm tính' : 'Chính thức';
}

/** Keep in step with backend REVISION_MESSAGES. */
export function revisionBlockedLabel(code: string | null | undefined): string {
  if (!code) return '';
  const map: Record<string, string> = {
    REVISION_DISABLED: 'Giáo viên chưa bật viết lại cho bài tập này.',
    REVISION_NOT_PUBLISHED: 'Em cần chờ bản hiện tại được công bố điểm trước khi viết lại.',
    REVISION_LIMIT_REACHED: 'Em đã dùng hết lượt viết lại của bài tập này.',
    REVISION_CLOSED: 'Đã hết hạn viết lại. Em hãy liên hệ giáo viên nếu cần thêm thời gian.',
    REVISION_LIMIT_IN_USE: 'Không thể giảm số lượt dưới số bản viết lại học sinh đã bắt đầu.',
    CLASSROOM_READ_ONLY: 'Lớp thuộc kỳ học đã kết thúc nên chỉ xem được bài.',
  };
  return map[code] || '';
}
