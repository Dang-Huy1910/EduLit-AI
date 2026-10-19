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

export function modeLabel(mode: StatsMode | string | undefined): string {
  return mode === 'provisional' ? 'Tạm tính — Chưa phải kết quả chính thức' : 'Chính thức đã công bố';
}

export function modeShort(mode: StatsMode | string | undefined): string {
  return mode === 'provisional' ? 'Tạm tính' : 'Chính thức';
}
