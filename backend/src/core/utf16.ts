import { DomainError } from "./errors.js";

/**
 * Evidence offsets follow JavaScript/TypeScript String.slice UTF-16 code units,
 * half-open interval [start, end). Vietnamese combining marks and emoji are
 * counted the same way as String.length / String.slice. Normalize text before
 * persist if needed; every offset refers to the immutable stored string.
 */
export function sliceUtf16(text: string, start: number, end: number): string {
  return text.slice(start, end);
}

export function assertEvidenceQuote(
  text: string,
  start: number,
  end: number,
  quote: string,
): void {
  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    throw new DomainError("EVIDENCE_OFFSET", "Evidence offsets must be integers");
  }
  if (start < 0 || end < 0 || start >= end || end > text.length) {
    throw new DomainError(
      "EVIDENCE_OFFSET",
      "Evidence offsets must satisfy 0 <= start < end <= text.length (UTF-16)",
    );
  }
  const actual = sliceUtf16(text, start, end);
  if (actual !== quote) {
    throw new DomainError(
      "EVIDENCE_QUOTE_MISMATCH",
      "Evidence quote does not match submission text at the given UTF-16 offsets",
    );
  }
}

export function offsetsForQuote(text: string, quote: string): { start: number; end: number } {
  const start = text.indexOf(quote);
  if (start < 0) {
    throw new DomainError("EVIDENCE_QUOTE_MISMATCH", "Quote not found in text");
  }
  return { start, end: start + quote.length };
}
