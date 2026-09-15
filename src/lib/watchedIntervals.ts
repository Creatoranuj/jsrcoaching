/**
 * Pure helpers for managing accurate "actually watched" intervals.
 *
 * Each interval is `[start, end]` in seconds (start <= end).
 * Intervals are kept sorted by start and merged when they overlap or
 * touch within `MERGE_GAP` seconds (1s tolerance for tick jitter).
 *
 * Used by `useLessonProgress` so that jumping the seek bar to the end
 * does NOT mark a lesson complete — only seconds actually played do.
 */

export type Interval = [number, number];

const MERGE_GAP = 1; // seconds — merge if adjacent within this
const MAX_INTERVALS = 200; // safety cap on payload size

/** Merge a new [start, end] segment into a sorted list. Returns a new list. */
export function mergeInterval(list: Interval[], seg: Interval): Interval[] {
  const [s0, e0] = seg;
  if (!(e0 > s0)) return list; // ignore zero / negative width
  const out: Interval[] = [];
  let s = s0;
  let e = e0;
  let placed = false;
  for (const [as, ae] of list) {
    if (ae + MERGE_GAP < s) {
      out.push([as, ae]);
    } else if (e + MERGE_GAP < as) {
      if (!placed) { out.push([s, e]); placed = true; }
      out.push([as, ae]);
    } else {
      s = Math.min(s, as);
      e = Math.max(e, ae);
    }
  }
  if (!placed) out.push([s, e]);
  // Safety: cap list size by merging the two closest segments.
  if (out.length > MAX_INTERVALS) {
    let minGap = Infinity;
    let idx = 0;
    for (let i = 1; i < out.length; i++) {
      const gap = out[i][0] - out[i - 1][1];
      if (gap < minGap) { minGap = gap; idx = i; }
    }
    out.splice(idx - 1, 2, [out[idx - 1][0], out[idx][1]]);
  }
  return out;
}

/** Total unique seconds covered by the interval list. */
export function coveredSeconds(list: Interval[]): number {
  let total = 0;
  for (const [s, e] of list) total += Math.max(0, e - s);
  return total;
}

/** Validate + normalise an unknown JSON payload (defensive against bad rows). */
export function normaliseIntervals(input: unknown): Interval[] {
  if (!Array.isArray(input)) return [];
  const out: Interval[] = [];
  for (const item of input) {
    if (Array.isArray(item) && item.length === 2) {
      const s = Number(item[0]);
      const e = Number(item[1]);
      if (Number.isFinite(s) && Number.isFinite(e) && e > s) out.push([s, e]);
    }
  }
  out.sort((a, b) => a[0] - b[0]);
  // re-merge in case stored data had overlaps
  return out.reduce<Interval[]>((acc, seg) => mergeInterval(acc, seg), []);
}
