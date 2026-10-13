const WRITE_FOR_STUDENT_REQUEST = [
  /viết (hộ|giúp|dùm)( em)?/iu,
  /viết (cho em )?(một )?(mở bài|thân bài|kết bài|đoạn văn|bài văn)/iu,
  /(cho|gửi) em (một )?(mở bài|đoạn (văn )?mẫu|bài mẫu)/iu,
  /làm hộ em/iu,
  /để em chép/iu,
  /em chép vào bài/iu,
  /chép vào bài văn/iu,
];

export function looksLikeWriteForStudentRequest(message: string): boolean {
  const text = message.trim();
  if (!text) {
    return false;
  }
  return WRITE_FOR_STUDENT_REQUEST.some((pattern) => pattern.test(text));
}

export function isNegatedSampleMention(text: string): boolean {
  return /(không|chưa)\s+([^.]{0,80})?bài mẫu/iu.test(text);
}
