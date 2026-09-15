/**
 * Pure helpers for the Library / Downloads format-filter chips.
 *
 * Given a list of items each with a `fileType` string (PDF, DOC, MD, IMAGE,
 * VIDEO, LINK, …), produce an ordered list of `{ type, count }` chips sorted
 * by count descending — so the format the user has most of is shown first
 * (mirrors the "Enabled 5 · All 74 · Marketing 8" pattern from the reference
 * screenshot). Ties break alphabetically so the order is stable.
 *
 * Covered by `src/test/format-chips.test.ts`.
 */
export interface FormatChip {
  /** Normalised, uppercase file-type key (e.g. "PDF", "DOC", "MD"). */
  type: string;
  /** Number of items of this type in the source list. */
  count: number;
}

export const ALL_CHIP = "ALL";

/** Canonicalise raw file-type / extension strings into a small chip vocabulary. */
export function normalizeFormat(raw: string | null | undefined): string {
  const t = String(raw || "").trim().toUpperCase();
  if (!t) return "OTHER";
  if (t === "MARKDOWN") return "MD";
  if (t === "JPEG") return "JPG";
  if (t === "DOCX") return "DOC";
  if (t === "PPTX") return "PPT";
  if (t === "XLSX") return "XLS";
  if (t === "NOTES" || t === "DPP") return "PDF";
  return t;
}

/**
 * Compute the chip list from any record-shaped item collection.
 *
 *   chips = groupByFormat(items, (it) => it.fileType)
 *   chips => [{ type: "PDF", count: 12 }, { type: "DOC", count: 3 }, …]
 */
export function groupByFormat<T>(
  items: readonly T[],
  pick: (item: T) => string | null | undefined
): FormatChip[] {
  const counts = new Map<string, number>();
  for (const it of items) {
    const key = normalizeFormat(pick(it));
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => (b.count - a.count) || a.type.localeCompare(b.type));
}

/** Apply a chip selection (or `ALL_CHIP`) to a list. Pure / cheap. */
export function applyFormatFilter<T>(
  items: readonly T[],
  selected: string,
  pick: (item: T) => string | null | undefined
): T[] {
  if (!selected || selected === ALL_CHIP) return items.slice();
  return items.filter((it) => normalizeFormat(pick(it)) === selected);
}
