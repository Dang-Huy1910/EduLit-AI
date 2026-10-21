/**
 * The "AI is drafting your outline" moment on the first visit to an assignment.
 *
 * The outline is prepared when the teacher publishes, so students do not wait.
 * On the first open we still play a short drafting sequence before showing it.
 * Pure helpers live here so they can be tested without React.
 */

import type { StyleTip, UIOutline } from './types';

export const REVEAL_STEP_MS = 1100;
export const REVEAL_POINT_MS = 220;
const SEEN_STORAGE_KEY = 'edulit.outline-revealed.v1';
const SEEN_LIMIT = 200;

export function revealSteps(personalized: boolean): string[] {
  return [
    'Đang đọc đề bài và yêu cầu viết',
    'Đang đọc ngữ liệu thầy cô giao',
    personalized ? 'Đang xem lại văn phong của em' : 'Đang đối chiếu với barem chấm',
    'Đang lập luận đề',
    'Đang sắp xếp luận điểm và dẫn chứng',
  ];
}

export function revealKey(userId: string | null | undefined, assignmentCode: string | null | undefined): string | null {
  if (!userId || !assignmentCode) return null;
  return `${userId}:${assignmentCode}`;
}

/** Remember up to SEEN_LIMIT keys, newest last. */
export function addSeenKey(keys: string[], key: string): string[] {
  return [...keys.filter((item) => item !== key), key].slice(-SEEN_LIMIT);
}

function readSeenKeys(): string[] {
  try {
    const raw = window.localStorage.getItem(SEEN_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function hasSeenReveal(key: string): boolean {
  return readSeenKeys().includes(key);
}

export function markRevealSeen(key: string): void {
  try {
    window.localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(addSeenKey(readSeenKeys(), key)));
  } catch {
    // Without storage the sequence simply plays again next time.
  }
}

export function countOutlinePoints(outline: UIOutline): number {
  return outline.sections.reduce((sum, section) => sum + section.points.length, 0);
}

/**
 * Tips for one section, split into those attached to a visible point and the
 * rest. A tip whose point was deleted or moved falls back to its section.
 */
export function tipsForSection(
  tips: StyleTip[] | undefined,
  sectionId: string,
  pointIds: string[]
): { byPoint: Record<string, StyleTip[]>; sectionLevel: StyleTip[] } {
  const byPoint: Record<string, StyleTip[]> = {};
  const sectionLevel: StyleTip[] = [];
  const present = new Set(pointIds);
  for (const tip of tips || []) {
    if (tip.pointId && present.has(tip.pointId)) {
      (byPoint[tip.pointId] ||= []).push(tip);
    } else if (tip.sectionId === sectionId) {
      sectionLevel.push(tip);
    }
  }
  return { byPoint, sectionLevel };
}
