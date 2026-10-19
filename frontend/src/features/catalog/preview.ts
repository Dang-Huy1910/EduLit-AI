export function boundPreview<T extends { id: string }>(
  selectedKind: string | undefined,
  selectedId: string | undefined,
  previewKind: string,
  preview: T | null
): T | null {
  if (!selectedKind || !selectedId || selectedKind !== previewKind) return null;
  if (!preview || preview.id !== selectedId) return null;
  return preview;
}

export function canActOnPreview(selectedId: string | undefined, previewId: string | undefined, loading: boolean): boolean {
  return Boolean(!loading && selectedId && previewId && selectedId === previewId);
}
