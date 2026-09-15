/**
 * Pure formatting/redaction helpers for the lesson surface.
 *
 * Extracted from `src/pages/LessonView.tsx` (they were re-created on every
 * render there) so they are testable in isolation and allocation-free.
 */

/** Sarthi chat quick-prompts shown under the assistant input. */
export const SARTHI_SUGGESTIONS: string[] = [
  "Is lecture ka short summary do",
  "Main concept explain karo",
  "1 short example do",
  "MCQ practice karao",
];

/** `HH:MM` label for a chat message timestamp; empty string if unformattable. */
export function formatChatTs(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

/**
 * Strip query params from a PDF URL before it reaches a log line — signed
 * Storage/Drive URLs carry credentials in the query string.
 */
export function redactPdfDebugUrl(raw: string, origin?: string): string {
  try {
    const base = origin ?? (typeof window !== "undefined" ? window.location.origin : undefined);
    const u = new URL(raw, base);
    return `${u.origin}${u.pathname}${u.search ? "?…" : ""}`;
  } catch {
    return raw.split("?")[0];
  }
}

/** "Just now" / "5m ago" / "3h ago" / "2d ago" / locale date. */
export function formatRelativeTime(dateString: string | null, now: Date = new Date()): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
