import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { DomainError } from "../../core/errors.js";
import type { PrivateStoragePort, StoredPrivateFile } from "./private-storage.port.js";

const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);

/** Private opaque-object storage. File IDs are not filesystem paths. */
export class LocalPrivateStorage implements PrivateStoragePort {
  constructor(private readonly root: string) {}
  async put(input: { data: Buffer; mimeType: string; extension: string }): Promise<StoredPrivateFile> {
    const extension = input.extension.toLowerCase().replace(/^\./, "");
    if (!ALLOWED_EXTENSIONS.has(extension)) throw new DomainError("UPLOAD_MEDIA", "unsupported image extension");
    const id = randomUUID(); const directory = path.resolve(this.root); const target = path.join(directory, `${id}.${extension}`);
    if (!target.startsWith(`${directory}${path.sep}`)) throw new DomainError("UPLOAD_MEDIA", "invalid storage target");
    await mkdir(directory, { recursive: true });
    const temp = `${target}.${randomUUID()}.tmp`;
    await writeFile(temp, input.data, { flag: "wx" });
    await rename(temp, target);
    return { id, mimeType: input.mimeType, size: input.data.length, path: target };
  }
  async read(fileId: string): Promise<StoredPrivateFile & { data: Buffer }> {
    if (!/^[0-9a-f-]{36}$/i.test(fileId)) throw new DomainError("FILE_NOT_FOUND", "file not found");
    const directory = path.resolve(this.root);
    const candidates = ["jpg", "jpeg", "png", "webp"].map((extension) => path.join(directory, `${fileId}.${extension}`));
    for (const candidate of candidates) {
      try { const data = await readFile(candidate); return { id: fileId, mimeType: mimeFor(candidate), size: data.length, path: candidate, data }; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
    throw new DomainError("FILE_NOT_FOUND", "file not found");
  }
  async remove(fileId: string): Promise<void> {
    if (!/^[0-9a-f-]{36}$/i.test(fileId)) return;
    const directory = path.resolve(this.root);
    await Promise.all(["jpg", "jpeg", "png", "webp"].map((extension) => rm(path.join(directory, `${fileId}.${extension}`), { force: true })));
  }
}
function mimeFor(value: string): string { const ext = path.extname(value).slice(1); return ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg"; }
