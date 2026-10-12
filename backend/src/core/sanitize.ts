const URI_PATTERN = /(?:postgres(?:ql)?|mongodb|redis|amqp|http|https):\/\/[^\s]+/gi;

export function sanitizeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(URI_PATTERN, "[redacted-uri]");
}

export function databaseNameFromUrl(url: string): string {
  const withoutQuery = url.split("?")[0] ?? url;
  const parts = withoutQuery.split("/");
  return parts[parts.length - 1] ?? "";
}
