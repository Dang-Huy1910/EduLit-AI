import { createRequire } from "node:module";
import type { AssignmentSnapshot } from "../../../assignments/domain/rubric.js";
import { loadSocraticPromptBundle } from "../../prompt-assets.js";
import type { SocraticModelOutput, SocraticSourceRef } from "../../domain/output.js";
import { joinReplyText, lastSentenceIsQuestion, splitSentences } from "./sentences.js";
import { isNegatedSampleMention, looksLikeWriteForStudentRequest } from "./write-for-student.js";

const require = createRequire(import.meta.url);
const AjvModule = require("ajv") as { default?: new (options?: object) => { compile: (schema: object) => (data: unknown) => boolean } } & (new (options?: object) => {
  compile: (schema: object) => (data: unknown) => boolean;
});
const Ajv = AjvModule.default ?? AjvModule;

export type GuardrailFailure = {
  code: string;
  reason: string;
};

export type GuardrailResult =
  | { ok: true; output: SocraticModelOutput }
  | { ok: false; failure: GuardrailFailure };

const LABELED_SAMPLE = [
  /mở bài\s*[:：]/iu,
  /thân bài\s*[:：]/iu,
  /kết bài\s*[:：]/iu,
  /dưới đây là (một )?đoạn văn/iu,
  /đoạn văn hoàn chỉnh/iu,
];

const OFFER_AS_SAMPLE = [
  /em có thể chép/iu,
  /để em chép/iu,
  /chép vào bài/iu,
  /dùng .{0,80}làm (phần )?(mở|thân|kết) bài/iu,
  /làm phần (mở|thân|kết) bài/iu,
];

const LITERARY_OPENERS = [
  /^trong cuộc sống\b/iu,
  /^trong xã hội(\s+hiện đại)?\b/iu,
  /^ngày nay,?\s+/iu,
  /^người trẻ (ngày nay|hiện nay)\b/iu,
];

const ajv = new Ajv({ allErrors: true, strict: false });
const validator = ajv.compile(loadSocraticPromptBundle().outputSchema);

export type SocraticGuardrailContext = {
  studentMessage?: string;
};

export function validateSocraticOutput(
  raw: unknown,
  snapshot: AssignmentSnapshot,
  context: SocraticGuardrailContext = {},
): { output: SocraticModelOutput } {
  const result = inspectSocraticOutput(raw, snapshot, context);
  if (!result.ok) {
    throw Object.assign(new Error(result.failure.reason), { guardrail: result.failure });
  }
  return { output: result.output };
}

export function inspectSocraticOutput(
  raw: unknown,
  snapshot: AssignmentSnapshot,
  context: SocraticGuardrailContext = {},
): GuardrailResult {
  if (!validator(raw)) {
    return fail("SCHEMA", "output failed local JSON schema validation");
  }
  const value = raw as SocraticModelOutput;
  const replySentences = value.replySentences.map((item) => item.trim()).filter(Boolean);
  if (replySentences.length === 0) {
    return fail("SENTENCE_COUNT", "replySentences is empty after trim");
  }
  const combined = joinReplyText(replySentences);
  const sentences = splitSentences(combined);
  if (sentences.length === 0 || sentences.length > 4) {
    return fail("SENTENCE_COUNT", `expected 1-4 sentences, found ${sentences.length}`);
  }
  if (!lastSentenceIsQuestion(sentences)) {
    return fail("FINAL_QUESTION", "last sentence must be a question");
  }
  const criterionIds = snapshot.rubric.criteria.map((item) => item.criterionId);
  const focus = value.focusCriterionIds ?? [];
  for (const id of focus) {
    if (!criterionIds.includes(id)) {
      return fail("CRITERION_ID", `focusCriterionIds contains unknown id ${id}`);
    }
  }
  const sourceRefs = value.sourceRefs ?? [];
  for (const ref of sourceRefs) {
    const sourceError = inspectSourceRef(ref, criterionIds);
    if (sourceError) {
      return fail("SOURCE_REF", sourceError);
    }
  }
  if (looksLikeSampleEssay(combined, context.studentMessage)) {
    return fail("WRITE_FOR_STUDENT", "output looks like a sample paragraph or complete essay");
  }
  return {
    ok: true,
    output: {
      replySentences,
      focusCriterionIds: focus,
      sourceRefs: sourceRefs.length > 0 ? sourceRefs : undefined,
    },
  };
}

function inspectSourceRef(ref: SocraticSourceRef, criterionIds: string[]): string | null {
  if (ref.kind === "learningMaterial" || ref.kind === "instructions") {
    if (ref.criterionId) {
      return "learningMaterial/instructions refs must not invent criterionId";
    }
    return null;
  }
  if (ref.kind === "rubricCriterion") {
    if (!ref.criterionId || !criterionIds.includes(ref.criterionId)) {
      return "rubricCriterion sourceRef must use a criterionId from the session snapshot";
    }
    return null;
  }
  return "sourceRef.kind is not in the loaded session snapshot";
}

function looksLikeSampleEssay(text: string, studentMessage?: string): boolean {
  if (LABELED_SAMPLE.some((pattern) => pattern.test(text))) {
    return true;
  }
  if (OFFER_AS_SAMPLE.some((pattern) => pattern.test(text))) {
    return true;
  }
  if (/bài mẫu/iu.test(text) && !isNegatedSampleMention(text)) {
    return true;
  }
  const sentences = splitSentences(text);
  const declaratives = sentences.filter((item) => item.length > 70 && !/[?？]\s*$/u.test(item));
  const hasLiteraryOpener = declaratives.some((item) => LITERARY_OPENERS.some((pattern) => pattern.test(item)));
  if (hasLiteraryOpener && declaratives.length >= 2) {
    return true;
  }
  if (studentMessage && looksLikeWriteForStudentRequest(studentMessage) && declaratives.length >= 2) {
    return true;
  }
  const longDeclarative = sentences.filter((item) => item.length > 220 && !/[?？]\s*$/u.test(item));
  return longDeclarative.length >= 3;
}

function fail(code: string, reason: string): GuardrailResult {
  return { ok: false, failure: { code, reason } };
}
