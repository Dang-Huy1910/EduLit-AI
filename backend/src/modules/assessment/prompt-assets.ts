import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DomainError } from "../../core/errors.js";
import { ASSESSMENT_PROMPT_VERSION, ASSESSMENT_SCHEMA_VERSION } from "./domain/output.js";

export type AssessmentPromptBundle = {
  promptVersion: string;
  schemaVersion: string;
  systemInstruction: string;
  outputSchema: Record<string, unknown>;
  providerSchema: Record<string, unknown>;
};

let cached: AssessmentPromptBundle | undefined;

export function loadAssessmentPromptBundle(): AssessmentPromptBundle {
  if (cached) {
    return cached;
  }
  const assetsDir = resolveAssessmentAssetsDir();
  const systemPath = path.join(assetsDir, "system.v1.md");
  const schemaPath = path.join(assetsDir, "output.v1.schema.json");
  const systemInstruction = readRequired(systemPath);
  const rawSchema = readRequired(schemaPath);
  let outputSchema: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(rawSchema);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("schema root must be an object");
    }
    outputSchema = parsed as Record<string, unknown>;
  } catch (error) {
    throw new DomainError(
      "AI_NOT_CONFIGURED",
      `assessment output schema is invalid at ${schemaPath}: ${error instanceof Error ? error.message : "parse error"}`,
    );
  }
  cached = {
    promptVersion: ASSESSMENT_PROMPT_VERSION,
    schemaVersion: ASSESSMENT_SCHEMA_VERSION,
    systemInstruction,
    outputSchema,
    providerSchema: toProviderSchema(outputSchema),
  };
  return cached;
}

export function resolveAssessmentAssetsDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(here, "assets"),
    path.resolve(here, "../../../prompts/assessment"),
    path.resolve(here, "../../../../prompts/assessment"),
    path.resolve(here, "../../../../../prompts/assessment"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "system.v1.md")) && fs.existsSync(path.join(dir, "output.v1.schema.json"))) {
      return dir;
    }
  }
  throw new DomainError(
    "AI_NOT_CONFIGURED",
    "assessment prompt assets are missing; build must copy system.v1.md and output.v1.schema.json",
  );
}

function readRequired(filePath: string): string {
  try {
    const text = fs.readFileSync(filePath, "utf8").trim();
    if (!text) {
      throw new Error("empty");
    }
    return text;
  } catch {
    throw new DomainError("AI_NOT_CONFIGURED", `assessment prompt asset missing or empty: ${filePath}`);
  }
}

function toProviderSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const clone = structuredClone(schema) as Record<string, unknown>;
  delete clone.$schema;
  delete clone.$id;
  return clone;
}
