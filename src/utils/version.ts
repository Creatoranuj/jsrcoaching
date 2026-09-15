/**
 * Numeric-segment version comparison.
 * Splits on ".", parses each segment as a number (NaN -> 0),
 * pads the shorter array with 0s, compares left-to-right.
 * Returns true ONLY when `current` is strictly less than `min`.
 *
 * Correctly handles cases like "1.10.0" vs "1.9.0" where naive
 * string comparison would be wrong.
 */
export function isUpdateRequired(current: string, min: string): boolean {
  // Extract numeric dotted segment from arbitrary version strings, e.g.
  // "v1.2.3", "main", "v1.0-20260615-1234" → "1.2.3" / "" / "1.0".
  // FAIL-OPEN: if `current` has no numeric segment at all, we cannot
  // reliably compare, so do NOT block the user.
  const extract = (v: string): string => {
    const m = (v || "").match(/\d+(\.\d+)*/);
    return m ? m[0] : "";
  };
  const curStr = extract(current);
  const minStr = extract(min);
  if (!curStr) return false; // unknown current version → don't block
  if (!minStr) return false; // no min set → don't block

  const toNums = (v: string): number[] =>
    v.split(".").map((s) => {
      const n = parseInt(s, 10);
      return Number.isFinite(n) ? n : 0;
    });

  const cur = toNums(curStr);
  const m = toNums(minStr);
  const len = Math.max(cur.length, m.length, 1);

  for (let i = 0; i < len; i++) {
    const a = cur[i] ?? 0;
    const b = m[i] ?? 0;
    if (a < b) return true;
    if (a > b) return false;
  }
  return false;
}