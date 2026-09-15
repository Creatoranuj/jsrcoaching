/**
 * Bounded, local-only diagnostics ring buffer.
 *
 * Captures *why* the reader froze or why fullscreen refused, so a student can
 * copy one block of text instead of describing the bug. Never stores tokens,
 * emails or any row data — only device/runtime shape.
 */

export type DiagnosticEntry = {
  at: string;
  kind: "freeze" | "fullscreen" | "error";
  message: string;
  route: string;
  lastAction: string;
  platform: string;
  viewport: string;
  fullscreen: boolean;
  stack?: string;
};

const KEY = "nb:diagnostics:v1";
const MAX_ENTRIES = 20;

let lastAction = "—";

/** Record the last meaningful user gesture so a later freeze has context. */
export function noteUserAction(action: string): void {
  lastAction = action.slice(0, 120);
}

function safeRead(): DiagnosticEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as DiagnosticEntry[]) : [];
  } catch {
    return [];
  }
}

export function recordDiagnostic(
  kind: DiagnosticEntry["kind"],
  message: string,
  error?: unknown,
): void {
  if (typeof window === "undefined") return;
  try {
    const entry: DiagnosticEntry = {
      at: new Date().toISOString(),
      kind,
      message: String(message).slice(0, 240),
      route: window.location?.pathname ?? "—",
      lastAction,
      platform: navigator?.userAgent?.slice(0, 160) ?? "—",
      viewport: `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio ?? 1}`,
      fullscreen: Boolean(document.fullscreenElement),
      stack: error instanceof Error ? error.stack?.slice(0, 800) : undefined,
    };
    const next = [entry, ...safeRead()].slice(0, MAX_ENTRIES);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Diagnostics must never break the surface they're diagnosing.
  }
}

export function readDiagnostics(): DiagnosticEntry[] {
  if (typeof window === "undefined") return [];
  return safeRead();
}

export function clearDiagnostics(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export function formatDiagnostics(entries: DiagnosticEntry[]): string {
  return entries
    .map(
      (e) =>
        `[${e.at}] ${e.kind.toUpperCase()} — ${e.message}\n` +
        `  route=${e.route} action=${e.lastAction} viewport=${e.viewport} fullscreen=${e.fullscreen}\n` +
        `  ua=${e.platform}` +
        (e.stack ? `\n  stack=${e.stack}` : ""),
    )
    .join("\n\n");
}
