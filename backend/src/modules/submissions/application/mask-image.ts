import sharp from "sharp";
import type { PrivacyMask } from "../domain/privacy.js";

/** Auto-rotates and strips EXIF. Solid rectangles are physically burned into output pixels. */
export async function makeMaskedDerivative(original: Buffer, masks: PrivacyMask[]): Promise<Buffer> {
  const normalized = sharp(original).rotate();
  const metadata = await normalized.metadata();
  if (!metadata.width || !metadata.height) throw new Error("image dimensions unavailable");
  const svg = `<svg width="${metadata.width}" height="${metadata.height}" xmlns="http://www.w3.org/2000/svg">${masks.map((mask) => `<rect x="${Math.floor(mask.x * metadata.width!)}" y="${Math.floor(mask.y * metadata.height!)}" width="${Math.ceil(mask.width * metadata.width!)}" height="${Math.ceil(mask.height * metadata.height!)}" fill="#000"/>`).join("")}</svg>`;
  return normalized.composite(masks.length ? [{ input: Buffer.from(svg), top: 0, left: 0 }] : []).jpeg({ quality: 90 }).withMetadata({ exif: {} }).toBuffer();
}
