import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OCR_FIXTURE_SPECS, renderOcrFixturePng, sourceHashForFixture } from "../src/infrastructure/vision/ocr-fixtures.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = path.join(repoRoot, "frontend/tests/e2e/fixtures/ocr");

await mkdir(outDir, { recursive: true });
const manifest: Array<{ id: string; file: string; sourceHash: string; text: string; printedSynthetic: boolean }> = [];
for (const spec of OCR_FIXTURE_SPECS) {
  const png = await renderOcrFixturePng(spec.id);
  const file = `${spec.id}.png`;
  await writeFile(path.join(outDir, file), png);
  manifest.push({
    id: spec.id,
    file,
    sourceHash: await sourceHashForFixture(spec.id),
    text: spec.text,
    printedSynthetic: spec.printedSynthetic,
  });
}
await writeFile(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`wrote ${manifest.length} OCR fixtures to ${outDir}`);
