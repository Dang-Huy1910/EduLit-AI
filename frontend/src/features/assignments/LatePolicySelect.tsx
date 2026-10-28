import type { LatePolicy } from './deadline';

export default function LatePolicySelect({ value, onChange, disabled }: { value: LatePolicy; onChange: (value: LatePolicy) => void; disabled?: boolean }) {
  return <label className="block text-xs font-semibold text-on-surface space-y-1">
    <span>Khi hết hạn nộp</span>
    <select aria-label="Khi hết hạn nộp" value={value} onChange={(event) => onChange(event.target.value as LatePolicy)} disabled={disabled}
      className="w-full rounded-lg border border-outline-variant/60 bg-surface-container-lowest p-2 text-sm focus-visible:ring-2 focus-visible:ring-secondary/40 disabled:opacity-50">
      <option value="ALLOW_LATE">Cho nộp muộn (gắn nhãn)</option>
      <option value="CLOSE_AT_DUE">Khoá khi hết hạn</option>
    </select>
  </label>;
}
