/**
 * Stale-chunk detection shared by the lazy loader and the render-time shields.
 *
 * Why this exists: `lazyWithRetry` only sees import failures it awaits itself,
 * and `crashShield.ts` only sees errors that reach `window.onerror`. An import
 * that fails *while React is rendering* (a lazy child mounted inside
 * `<Suspense>` on the Lesson page) is swallowed by the nearest error boundary,
 * so neither recovery path ever ran — the student got a dead
 * "Viewer atak gaya" card, and its soft retry re-rendered the very same
 * missing chunk, so the card came back forever.
 */

const RELOAD_KEY = "lovable:chunk-reload";

const CHUNK_RE =
  /Loading chunk|ChunkLoadError|dynamically imported module|Importing a module script failed|error loading dynamically|Failed to fetch dynamically/i;

/** True when the error is a missing/failed JS chunk rather than app logic. */
export function isStaleChunkError(err: unknown): boolean {
  if (!err) return false;
  const msg =
    typeof err === "string"
      ? err
      : `${(err as { name?: string }).name ?? ""} ${(err as { message?: string }).message ?? ""}`;
  return CHUNK_RE.test(msg);
}

/**
 * Hard-reload once per session to pick up the new build.
 * Returns true when a reload was started, so the caller can keep the old UI on
 * screen instead of flashing an error card the user will never read.
 * Never reloads while offline — that guarantees a dead page.
 */
export function reloadForStaleChunk(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  try {
    if (sessionStorage.getItem(RELOAD_KEY) === "1") return false;
    sessionStorage.setItem(RELOAD_KEY, "1");
  } catch {
    /* private mode — still worth one reload attempt */
  }
  window.location.reload();
  return true;
}

/** Called after a successful load so a later deploy can reload again. */
export function clearStaleChunkGuard(): void {
  try {
    sessionStorage.removeItem(RELOAD_KEY);
  } catch {
    /* ignore */
  }
}
