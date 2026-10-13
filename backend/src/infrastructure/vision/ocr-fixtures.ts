import sharp from "sharp";
import { sha256Buffer } from "../../core/hash.js";
import type { VisionSegment } from "./vision-transcription.port.js";

export type OcrFixtureSpec = {
  id: string;
  label: string;
  text: string;
  needsReview: boolean;
  reason?: string;
  width: number;
  height: number;
  /** Printed-text synthetic page; not a handwriting OCR quality sample. */
  printedSynthetic: boolean;
};

/** Deterministic mock OCR pages. Unknown live photos must not reuse these texts. */
export const OCR_FIXTURE_SPECS: OcrFixtureSpec[] = [
  {
    id: "nlxh-p1",
    label: "NLXH trang 1 — header PII giả",
    text: "Ý chí giúp người trẻ không bỏ cuộc khi gặp khó khăn. Tuy nhiên, kiên định không đồng nghĩa với bảo thủ.",
    needsReview: false,
    width: 800,
    height: 1100,
    printedSynthetic: true,
  },
  {
    id: "nlxh-p2",
    label: "NLXH trang 2 — tiếp nối",
    text: "Em lấy gương một bạn lớp mình kiên trì ôn tập giữa áp lực thi cử, chứ không sao chép văn mẫu. 🙂",
    needsReview: false,
    width: 800,
    height: 1100,
    printedSynthetic: true,
  },
  {
    id: "illegible",
    label: "Đoạn không đọc rõ",
    text: "Một đoạn chữ bị nhoè nên không đọc được hết.",
    needsReview: true,
    reason: "nét chữ mờ, không đủ tin cậy",
    width: 640,
    height: 900,
    printedSynthetic: true,
  },
  {
    id: "unicode",
    label: "Unicode tiếng Việt và ký tự ngoài BMP",
    text: "Sông Hương vừa trữ tình vừa dữ dội 👍 — chuỗi gần giống: kiên định / kiên định.",
    needsReview: false,
    width: 720,
    height: 960,
    printedSynthetic: true,
  },
];

const pngCache = new Map<string, Buffer>();

function bodyColor(id: string): { r: number; g: number; b: number } {
  const specs = OCR_FIXTURE_SPECS.findIndex((item) => item.id === id) + 1;
  return { r: 40 + specs * 35, g: 90 + specs * 20, b: 160 - specs * 25 };
}

export async function renderOcrFixturePng(id: string): Promise<Buffer> {
  const cached = pngCache.get(id);
  if (cached) return cached;
  const spec = OCR_FIXTURE_SPECS.find((item) => item.id === id);
  if (!spec) throw new Error(`unknown OCR fixture ${id}`);
  const headerHeight = Math.round(spec.height * 0.18);
  const channels = 3;
  const data = Buffer.alloc(spec.width * spec.height * channels);
  const fill = bodyColor(id);
  for (let y = 0; y < spec.height; y += 1) {
    for (let x = 0; x < spec.width; x += 1) {
      const offset = (y * spec.width + x) * channels;
      if (y < headerHeight) {
        data[offset] = 20;
        data[offset + 1] = 24;
        data[offset + 2] = 32;
      } else {
        data[offset] = fill.r;
        data[offset + 1] = fill.g;
        data[offset + 2] = fill.b;
      }
    }
  }
  const png = await sharp(data, { raw: { width: spec.width, height: spec.height, channels } }).png().toBuffer();
  pngCache.set(id, png);
  return png;
}

export async function sourceHashForFixture(id: string): Promise<string> {
  return sha256Buffer(await renderOcrFixturePng(id));
}

export function segmentsForFixture(id: string): VisionSegment[] {
  const spec = OCR_FIXTURE_SPECS.find((item) => item.id === id);
  if (!spec) throw new Error(`unknown OCR fixture ${id}`);
  return [{ id: `${id}-s1`, text: spec.text, needsReview: spec.needsReview, reason: spec.reason }];
}

export async function buildSourceHashCatalog(): Promise<Map<string, string>> {
  const catalog = new Map<string, string>();
  for (const spec of OCR_FIXTURE_SPECS) {
    catalog.set(await sourceHashForFixture(spec.id), spec.id);
  }
  return catalog;
}
