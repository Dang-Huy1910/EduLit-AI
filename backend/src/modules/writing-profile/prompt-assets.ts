import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DomainError } from "../../core/errors.js";
import { WRITING_PROFILE_PROMPT_VERSION, WRITING_PROFILE_SCHEMA_VERSION } from "./domain/output.js";

export type WritingProfilePromptBundle = {
  promptVersion: string;
  schemaVersion: string;
  systemInstruction: string;
  outputSchema: Record<string, unknown>;
  providerSchema: Record<string, unknown>;
};

let cached: WritingProfilePromptBundle | undefined;

export function loadWritingProfilePromptBundle(): WritingProfilePromptBundle {
  if (cached) {
    return cached;
  }
  const assetsDir = resolveWritingProfileAssetsDir();
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
      `writing-profile output schema is invalid at ${schemaPath}: ${error instanceof Error ? error.message : "parse error"}`,
    );
  }
  cached = {
    promptVersion: WRITING_PROFILE_PROMPT_VERSION,
    schemaVersion: WRITING_PROFILE_SCHEMA_VERSION,
    systemInstruction,
    outputSchema,
    providerSchema: toProviderSchema(outputSchema),
  };
  return cached;
}

export function resolveWritingProfileAssetsDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(here, "assets"),
    path.resolve(here, "../../../prompts/writing-profile"),
    path.resolve(here, "../../../../prompts/writing-profile"),
    path.resolve(here, "../../../../../prompts/writing-profile"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "system.v1.md")) && fs.existsSync(path.join(dir, "output.v1.schema.json"))) {
      return dir;
    }
  }
  throw new DomainError(
    "AI_NOT_CONFIGURED",
    "writing-profile prompt assets are missing; build must copy system.v1.md and output.v1.schema.json",
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
    throw new DomainError("AI_NOT_CONFIGURED", `writing-profile prompt asset missing or empty: ${filePath}`);
  }
}

function toProviderSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const clone = structuredClone(schema) as Record<string, unknown>;
  delete clone.$schema;
  delete clone.$id;
  return clone;
}
