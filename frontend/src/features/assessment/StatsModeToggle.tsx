'use client';

import React from 'react';
import type { StatsMode } from './types';
import { modeShort } from './labels';

interface StatsModeToggleProps {
  mode: StatsMode | string;
  onChange: (mode: StatsMode) => void;
  hasProvisionalData?: boolean;
  hasOfficialData?: boolean;
}

export default function StatsModeToggle({
  mode,
  onChange,
  hasProvisionalData,
  hasOfficialData,
}: StatsModeToggleProps) {
  return (
    <div className="space-y-2">
      <div className="inline-flex rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-1 text-xs">
        <button
          type="button"
          onClick={() => onChange('provisional')}
          className={`px-3 py-1.5 rounded-lg font-semibold ${
            mode === 'provisional'
              ? 'bg-primary-container text-on-primary-container'
              : 'text-on-surface-variant hover:bg-surface-container'
          }`}
        >
          {modeShort('provisional')}
        </button>
        <button
          type="button"
          onClick={() => onChange('official')}
          className={`px-3 py-1.5 rounded-lg font-semibold ${
            mode === 'official'
              ? 'bg-primary-container text-on-primary-container'
              : 'text-on-surface-variant hover:bg-surface-container'
          }`}
        >
          {modeShort('official')}
        </button>
      </div>
      <p className="text-[11px] text-on-surface-variant">
        {mode === 'provisional'
          ? 'Tạm tính — Chưa phải kết quả chính thức. Dùng bản nộp chính thức hiện hành, ưu tiên điểm giáo viên đã lưu, gồm cả bài chưa công bố.'
          : 'Chỉ dùng snapshot đã công bố hiện hành. Bản nộp mới chưa công bố không thay điểm cũ còn hiệu lực.'}
      </p>
      {mode === 'official' && !hasOfficialData && hasProvisionalData ? (
        <p className="text-[11px] text-[#854D0E] bg-[#FEF9C3] px-2.5 py-1.5 rounded-lg">
          Chưa có bài công bố. Có thể xem chế độ tạm tính để rà soát.
        </p>
      ) : null}
    </div>
  );
}
