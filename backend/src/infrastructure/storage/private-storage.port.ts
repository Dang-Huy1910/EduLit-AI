export type StoredPrivateFile = { id: string; mimeType: string; size: number; path: string };

export interface PrivateStoragePort {
  put(input: { data: Buffer; mimeType: string; extension: string }): Promise<StoredPrivateFile>;
  read(fileId: string): Promise<StoredPrivateFile & { data: Buffer }>;
  remove(fileId: string): Promise<void>;
}
