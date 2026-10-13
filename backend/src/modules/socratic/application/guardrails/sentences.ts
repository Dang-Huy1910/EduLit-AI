const SENTENCE_SPLIT = /(?<=[.!?…])\s+/u;

export function splitSentences(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }
  return normalized
    .split(SENTENCE_SPLIT)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function joinReplyText(replySentences: string[]): string {
  return replySentences.map((item) => item.trim()).filter(Boolean).join(" ");
}

export function lastSentenceIsQuestion(sentences: string[]): boolean {
  const last = sentences[sentences.length - 1];
  if (!last) {
    return false;
  }
  return /[?？]\s*$/u.test(last);
}
