import { DomainError } from "../../../core/errors.js";

export type OutlineSection = {
  id: string;
  title: string;
  points: string[];
};

export type StudentOutline = {
  sections: OutlineSection[];
};

const MAX_SECTIONS = 8;
const MAX_POINTS = 8;
const MAX_ID_CHARS = 40;
const MAX_TITLE_CHARS = 80;
const MAX_POINT_CHARS = 400;
const MAX_JSON_CHARS = 8000;

export function emptyOutline(): StudentOutline {
  return { sections: [] };
}

export function isBlankOutline(outline: StudentOutline): boolean {
  return outline.sections.every((section) => section.points.length === 0);
}

export function validateStudentOutline(input: unknown): StudentOutline {
  const encoded = JSON.stringify(input ?? {});
  if (encoded.length > MAX_JSON_CHARS) {
    throw new DomainError("OUTLINE_INVALID", `outline exceeds ${MAX_JSON_CHARS} characters`);
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new DomainError("OUTLINE_INVALID", "outline must be an object with sections");
  }
  const sections = (input as { sections?: unknown }).sections;
  if (!Array.isArray(sections)) {
    throw new DomainError("OUTLINE_INVALID", "outline.sections must be an array");
  }
  if (sections.length > MAX_SECTIONS) {
    throw new DomainError("OUTLINE_INVALID", `outline may have at most ${MAX_SECTIONS} sections`);
  }
  const seen = new Set<string>();
  const normalized: OutlineSection[] = [];
  for (const item of sections) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new DomainError("OUTLINE_INVALID", "each outline section must be an object");
    }
    const row = item as Record<string, unknown>;
    const id = asBoundedString(row.id, "section.id", MAX_ID_CHARS);
    if (seen.has(id)) {
      throw new DomainError("OUTLINE_INVALID", `duplicate outline section id ${id}`);
    }
    seen.add(id);
    const title = asBoundedString(row.title, "section.title", MAX_TITLE_CHARS);
    if (!Array.isArray(row.points)) {
      throw new DomainError("OUTLINE_INVALID", "section.points must be an array of short notes");
    }
    if (row.points.length > MAX_POINTS) {
      throw new DomainError("OUTLINE_INVALID", `each section may have at most ${MAX_POINTS} points`);
    }
    const points = row.points.map((point, index) =>
      asBoundedString(point, `section.points[${index}]`, MAX_POINT_CHARS),
    );
    normalized.push({ id, title, points });
  }
  return { sections: normalized };
}

function asBoundedString(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") {
    throw new DomainError("OUTLINE_INVALID", `${field} must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new DomainError("OUTLINE_INVALID", `${field} must not be empty`);
  }
  if (trimmed.length > max) {
    throw new DomainError("OUTLINE_INVALID", `${field} exceeds ${max} characters`);
  }
  return trimmed;
}
