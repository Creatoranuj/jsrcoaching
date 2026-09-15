/**
 * Idle-time route/chunk prefetcher.
 *
 * Uses `requestIdleCallback` where available (Chromium / Android WebView) and
 * falls back to a low-priority `setTimeout` on iOS WebView. Every prefetch is
 * fire-and-forget and swallows errors — a failed dynamic import must never
 * surface to the user (lazyWithRetry handles the real load).
 *
 * Contract: each factory must be an `() => import("...")` returning a Promise.
 * Do NOT invoke top-level side effects — dynamic import will execute the
 * module body, so keep prefetched modules pure.
 */

type ImportFactory = () => Promise<unknown>;

const scheduled = new WeakSet<ImportFactory>();

function schedule(cb: () => void, timeoutMs = 2000) {
  if (typeof window === "undefined") return;
  const w = window as unknown as {
    requestIdleCallback?: (fn: () => void, opts?: { timeout: number }) => number;
  };
  if (typeof w.requestIdleCallback === "function") {
    w.requestIdleCallback(cb, { timeout: timeoutMs });
  } else {
    window.setTimeout(cb, 400);
  }
}

/**
 * Prefetch one or more lazy chunks during the next idle window.
 * Safe to call from `useEffect(..., [])` — deduped per factory reference.
 */
export function prefetchIdle(...factories: ImportFactory[]) {
  for (const f of factories) {
    if (scheduled.has(f)) continue;
    scheduled.add(f);
    schedule(() => {
      try {
        void f().catch(() => {
          /* offline / chunk 404 — lazyWithRetry will handle at nav time */
        });
      } catch {
        /* noop */
      }
    });
  }
}
