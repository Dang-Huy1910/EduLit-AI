export type LatePolicy = 'ALLOW_LATE' | 'CLOSE_AT_DUE';

export interface DeadlineFields {
  dueAt?: string | null;
  effectiveDueAt?: string | null;
  latePolicy?: LatePolicy;
  hasExtension?: boolean;
  isClosed?: boolean;
  isLate?: boolean;
}

export function deadlineState(fields: DeadlineFields, now = Date.now()) {
  const due = fields.effectiveDueAt === undefined ? fields.dueAt : fields.effectiveDueAt;
  const timestamp = due ? Date.parse(due) : NaN;
  const remaining = Number.isFinite(timestamp) ? timestamp - now : null;
  const overdue = remaining !== null && remaining < 0;
  const closed = fields.isClosed ?? (overdue && fields.latePolicy === 'CLOSE_AT_DUE');
  return {
    due,
    remaining,
    closed,
    label: closed ? 'Đã khoá' : overdue ? 'Quá hạn' : remaining !== null && remaining < 86_400_000
      ? `Còn ${Math.max(1, Math.ceil(remaining / 3_600_000))} giờ` : '',
  };
}
