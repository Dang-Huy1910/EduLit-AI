export function socraticSessionKey(userId?: string | null, assignmentCode?: string | null): string | null {
  if (!userId || !assignmentCode) return null;
  return `${userId}:${assignmentCode}`;
}

export function shouldResetSocraticSession(previousKey: string | null, nextKey: string | null): boolean {
  return Boolean(previousKey && previousKey !== nextKey);
}
