import { DomainError } from "../../../core/errors.js";

export type PrivacyMask = { x: number; y: number; width: number; height: number };
export function validatePrivacyMasks(value: unknown): PrivacyMask[] {
  if (!Array.isArray(value) || value.length > 20) throw new DomainError("MASK_INVALID", "masks must contain at most 20 rectangles");
  return value.map((item) => {
    if (!item || typeof item !== "object") throw new DomainError("MASK_INVALID", "each mask must be a rectangle");
    const row = item as Record<string, unknown>; const fields = ["x", "y", "width", "height"] as const;
    for (const field of fields) if (typeof row[field] !== "number" || !Number.isFinite(row[field])) throw new DomainError("MASK_INVALID", `${field} must be a number`);
    const mask = { x: row.x as number, y: row.y as number, width: row.width as number, height: row.height as number };
    if (mask.x < 0 || mask.y < 0 || mask.width <= 0 || mask.height <= 0 || mask.x + mask.width > 1 || mask.y + mask.height > 1) throw new DomainError("MASK_INVALID", "mask must stay within normalized image bounds");
    return mask;
  });
}
