import type { ScoreBin } from './types';

export interface ParsedBin {
  lo: number;
  hi: number;
  /** Human label, e.g. "6–8". */
  label: string;
  count: number;
  rate: number | null;
}

const RANGE_RE = /(-?\d+(?:[.,]\d+)?)\s*[,–-]\s*(-?\d+(?:[.,]\d+)?)/;

function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
}

/** "[6, 8)" → 6–8. Unparseable ranges keep their raw text and no bounds. */
export function parseBins(bins: ScoreBin[]): (ParsedBin | null)[] {
  return bins.map((bin) => {
    const match = RANGE_RE.exec(bin.range || '');
    if (!match) return null;
    const lo = Number(match[1].replace(',', '.'));
    const hi = Number(match[2].replace(',', '.'));
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return null;
    return { lo, hi, label: `${trimNumber(lo)}–${trimNumber(hi)}`, count: bin.count, rate: bin.rate ?? null };
  });
}

/**
 * Where the mean falls along the column row, as a 0–1 fraction. Only defined
 * when every bin parsed, bins are contiguous and equally wide, so each column
 * slot spans the same score width.
 */
export function meanPosition(parsed: (ParsedBin | null)[], mean: number | null | undefined): number | null {
  if (mean === null || mean === undefined || parsed.length === 0) return null;
  if (parsed.some((bin) => bin === null)) return null;
  const bins = parsed as ParsedBin[];
  const width = bins[0].hi - bins[0].lo;
  for (let i = 0; i < bins.length; i += 1) {
    if (Math.abs(bins[i].hi - bins[i].lo - width) > 1e-6) return null;
    if (i > 0 && Math.abs(bins[i].lo - bins[i - 1].hi) > 1e-6) return null;
  }
  const lo = bins[0].lo;
  const hi = bins[bins.length - 1].hi;
  return Math.max(0, Math.min(1, (mean - lo) / (hi - lo)));
}
