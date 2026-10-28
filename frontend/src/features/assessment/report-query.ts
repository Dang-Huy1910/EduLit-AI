export interface ReportFilters {
  mode?: string;
  search?: string;
  status?: string;
  sort?: string;
  from?: string;
  to?: string;
  studentId?: string;
}

/** Export all matching rows, independent of the table's current page. */
export function reportExportPath(assignmentId: string, filters: ReportFilters = {}): string {
  const query = new URLSearchParams();
  for (const key of ['mode', 'search', 'status', 'sort', 'from', 'to', 'studentId'] as const) {
    if (filters[key]) query.set(key, filters[key]);
  }
  const encoded = query.toString();
  return `/api/teacher/reports/${encodeURIComponent(assignmentId)}/export.xlsx${encoded ? `?${encoded}` : ''}`;
}
