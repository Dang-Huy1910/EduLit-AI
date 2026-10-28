'use client';

import DueAtEditor, { toDateTimeLocal } from './DueAtEditor';

const SELECT_CLASS = 'w-full rounded-lg border border-outline-variant/60 bg-surface-container-lowest p-2 text-sm focus-visible:ring-2 focus-visible:ring-secondary/40 disabled:opacity-50';

export default function RevisionSettings({
  maxRevisions,
  revisionDueAt,
  disabled = false,
  error = '',
  onMaxRevisions,
  onRevisionDueAt,
}: {
  maxRevisions: number;
  revisionDueAt: string;
  disabled?: boolean;
  error?: string;
  onMaxRevisions: (value: number) => void;
  onRevisionDueAt: (value: string) => void;
}) {
  const parsedDue = revisionDueAt ? new Date(revisionDueAt) : null;
  const dueIso = parsedDue && !Number.isNaN(parsedDue.getTime()) ? parsedDue.toISOString() : null;
  return <fieldset className="space-y-2 rounded-xl border border-outline-variant/40 p-3">
    <legend className="px-1 text-xs font-semibold text-on-surface">Cho phép viết lại sau khi có điểm</legend>
    <label className="block text-xs font-semibold text-on-surface space-y-1">
      <span>Số lần viết lại</span>
      <select aria-label="Cho phép viết lại sau khi có điểm" value={String(maxRevisions)} disabled={disabled}
        onChange={(event) => onMaxRevisions(Number(event.target.value))} className={SELECT_CLASS}>
        <option value="0">Không</option>
        <option value="1">1 lần</option>
        <option value="2">2 lần</option>
      </select>
    </label>
    <p className="text-xs text-on-surface-variant leading-relaxed">Học sinh tự bắt đầu bản mới sau khi bản trước đã có điểm. Cấp quyền mở lại vẫn chỉ sửa trong bản hiện tại.</p>
    <DueAtEditor dueAt={dueIso} label="Hạn viết lại"
      dialogLabel="Hạn viết lại" dialogTitle="Hạn viết lại" fieldLabel="Hạn viết lại" clearLabel="Bỏ hạn viết lại"
      dialogHint="Không bắt buộc. Để trống nếu bản viết lại không có hạn. Bấm Lưu thay đổi hoặc giao bài để học sinh thấy hạn này."
      busy={false} disabled={disabled} triggerClassName="inline-flex items-center gap-1 rounded-lg border border-outline-variant/60 px-3 py-2 text-sm font-semibold text-on-surface"
      onSave={async (next) => { onRevisionDueAt(next ? toDateTimeLocal(next) : ''); return true; }}>
      {revisionDueAt ? `Hạn viết lại: ${new Date(revisionDueAt).toLocaleString('vi-VN')}` : 'Không đặt hạn viết lại'}
    </DueAtEditor>
    {error && <p role="alert" className="text-sm text-error">{error}</p>}
  </fieldset>;
}
