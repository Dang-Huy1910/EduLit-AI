import { catalogApi } from './api';

export async function downloadOriginalDocument(documentId: string): Promise<void> {
  const { blob, filename } = await catalogApi.downloadDocumentOriginal(documentId);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || 'tai-lieu';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
