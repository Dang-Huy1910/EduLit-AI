import assert from "node:assert/strict";
import { test } from "node:test";
import { DomainError } from "../../src/core/errors.js";
import { assertEvidenceQuote, offsetsForQuote, sliceUtf16, uniqueOffsetsForQuote } from "../../src/core/utf16.js";

test("UTF-16 offsets match String.slice for Vietnamese text", () => {
  const text = "Kiên định không phải là bảo thủ.";
  const quote = "không phải là bảo thủ";
  const { start, end } = offsetsForQuote(text, quote);
  assert.equal(sliceUtf16(text, start, end), quote);
  assertEvidenceQuote(text, start, end, quote);
});

test("UTF-16 offsets treat emoji as surrogate pairs like JS String", () => {
  const text = "Cảm nhận 👍 rất rõ.";
  const thumbs = "👍";
  const start = text.indexOf(thumbs);
  assert.equal(thumbs.length, 2);
  assert.equal(text.slice(start, start + thumbs.length), thumbs);
  assertEvidenceQuote(text, start, start + thumbs.length, thumbs);
});

test("rejects quote that does not match the stored slice", () => {
  const text = "Đoạn văn gốc.";
  assert.throws(() => assertEvidenceQuote(text, 0, 4, "khác"), DomainError);
  assert.throws(() => assertEvidenceQuote(text, -1, 2, "Đo"), DomainError);
});

test("uniqueOffsetsForQuote rejects repeated quotes instead of picking the first", () => {
  const text = "a a";
  assert.throws(
    () => uniqueOffsetsForQuote(text, "a"),
    (error: unknown) => error instanceof DomainError && error.code === "EVIDENCE_QUOTE_AMBIGUOUS",
  );
  const once = uniqueOffsetsForQuote("một lần", "một");
  assert.equal(sliceUtf16("một lần", once.start, once.end), "một");
});
