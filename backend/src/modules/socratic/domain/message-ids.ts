import { createHash } from "node:crypto";

const EDU_LIT_NAMESPACE = "6b1c8a10-9dad-41d1-80b4-edulitsocratic";

export function socraticMessageId(
  sessionId: string,
  requestId: string,
  role: "USER" | "ASSISTANT",
): string {
  return uuidV5(`${sessionId}|${requestId}|${role}`, EDU_LIT_NAMESPACE);
}

function uuidV5(name: string, namespace: string): string {
  const ns = Buffer.from(namespace.replace(/-/g, "").padEnd(32, "0").slice(0, 32), "hex");
  const hash = createHash("sha1").update(ns).update(name, "utf8").digest();
  hash[6] = ((hash[6] ?? 0) & 0x0f) | 0x50;
  hash[8] = ((hash[8] ?? 0) & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
