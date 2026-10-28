'use client';

import { useEffect, useState } from 'react';
import { deadlineState, type DeadlineFields } from './deadline';

export default function DeadlineNotice({
  fields,
  compact = false,
  title = 'Hạn nộp',
  closedMessage = 'Bài tập đã hết hạn nộp. Liên hệ giáo viên nếu cần gia hạn. Em vẫn có thể xem bài và tiếp tục rà soát OCR của ảnh đã nộp.',
}: {
  fields: DeadlineFields;
  compact?: boolean;
  title?: string;
  closedMessage?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const state = deadlineState(fields, now);
  return (
    <div className={`${compact ? 'text-xs' : 'rounded-xl border border-outline-variant/40 bg-surface-container-low p-3 text-sm'} space-y-1`}>
      {!compact && <p>{title}: {state.due ? new Date(state.due).toLocaleString('vi-VN') : 'Không có hạn'}{fields.hasExtension ? ' (đã được gia hạn)' : ''}</p>}
      {state.label && <p className="font-semibold text-error inline-flex items-center gap-1"><span className="material-symbols-outlined text-base" aria-hidden="true">schedule</span><span>{state.label}</span></p>}
      {!compact && state.closed && <p>{closedMessage}</p>}
      {!compact && fields.isLate && <p className="font-semibold">Nộp muộn</p>}
    </div>
  );
}
