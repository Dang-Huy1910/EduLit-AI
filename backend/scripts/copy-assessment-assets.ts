import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcAssets = path.join(backendRoot, "src/modules/assessment/assets");
const distAssets = path.join(backendRoot, "dist/modules/assessment/assets");
const promptDir = path.resolve(backendRoot, "../prompts/assessment");
const files = ["system.v1.md", "output.v1.schema.json"];

function mustRead(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    throw new Error(`missing assessment asset: ${filePath}`);
  }
  const text = fs.readFileSync(filePath, "utf8").trim();
  if (!text) {
    throw new Error(`empty assessment asset: ${filePath}`);
  }
  return text;
}

for (const name of files) {
  const src = mustRead(path.join(srcAssets, name));
  const canonical = mustRead(path.join(promptDir, name));
  if (src !== canonical) {
    throw new Error(`${name} in backend assets does not match prompts/assessment`);
  }
}

fs.mkdirSync(distAssets, { recursive: true });
for (const name of files) {
  fs.copyFileSync(path.join(srcAssets, name), path.join(distAssets, name));
}

console.log(`copied assessment prompt assets to ${distAssets}`);
