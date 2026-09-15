/**
 * Human-friendly time formatters for the bookmark system.
 *
 * - `formatLongTime(5396)`  → "1 hour 29 minutes" (dialog headers)
 * - `formatShortTime(5396)` → "1h 29m"            (seekbar tooltip, list rows)
 *
 * Both are pure helpers — covered indirectly by the bookmark UI tests.
 */

const safe = (s: number) => (Number.isFinite(s) && s > 0 ? Math.floor(s) : 0);

export function formatLongTime(totalSeconds: number): string {
  const t = safe(totalSeconds);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;

  const parts: string[] = [];
  if (h > 0) parts.push(`${h} hour${h > 1 ? "s" : ""}`);
  if (m > 0) parts.push(`${m} minute${m > 1 ? "s" : ""}`);
  if (parts.length === 0) parts.push(`${s} second${s === 1 ? "" : "s"}`);
  return parts.join(" ");
}

export function formatShortTime(totalSeconds: number): string {
  const t = safe(totalSeconds);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, "0")}s`;
  return `${s}s`;
}