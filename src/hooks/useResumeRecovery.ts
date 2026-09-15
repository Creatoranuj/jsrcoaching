import { useEffect } from "react";
import { loadCapacitorApp } from "@/lib/native/app";


/**
 * Recovery for the "app frozen after resume from Recent Tasks" bug.
 *
 * Root causes on Android:
 * 1. The WebView is evicted while backgrounded — on resume, stale module
 *    references make every subsequent lazy `import()` 404. An error boundary
 *    catches it and the user is stuck on a non-interactive screen.
 * 2. The WebView is paused (not evicted) but rAF/timers don't resume cleanly
 *    on some OEM skins (Xiaomi MIUI / Realme / OPPO) → UI looks alive,
 *    taps work, but state never updates. Classic "everything frozen".
 * 3. React Query data goes stale while backgrounded; on resume, components
 *    show old data until something triggers a refetch.
 *
 * Recovery strategy:
 * - **Watchdog (RAF)**: after the app reports `isActive` again, schedule a
 *   `requestAnimationFrame`. If it doesn't fire within `RAF_WATCHDOG_MS`,
 *   the WebView is frozen → hard reload.
 * - **Stale-bg reload**: hidden > `STALE_BG_MS` → reload on resume.
 * - **Chunk-error reload**: detect dynamic-import failure → reload.
 * - **Cache invalidation event**: dispatch `app:resumed` so the React Query
 *   layer in App.tsx can `invalidateQueries()` and refetch fresh data.
 *
 * One-shot guarded by `sessionStorage` to prevent reload loops.
 */

let chunkErrorPending = false;
let lastHiddenAt = 0;
const STALE_BG_MS = 10 * 60 * 1000;     // 10 min (was 30) — more aggressive
const RAF_WATCHDOG_MS = 1500;            // frozen if no RAF in 1.5 s after resume
const RELOAD_KEY = "lovable:resume-reload";

function looksLikeChunkError(reason: unknown): boolean {
  const msg =
    (reason as { message?: string } | null)?.message ??
    String(reason ?? "");
  return (
    /dynamically imported module/i.test(msg) ||
    /ChunkLoadError/i.test(msg) ||
    /Loading chunk \d+ failed/i.test(msg) ||
    /Importing a module script failed/i.test(msg)
  );
}

/** Returns true if the reload actually fired, false if the one-shot guard
 *  suppressed it (we've already attempted a reload this session). */
function safeReload(tag: string): boolean {
  try {
    if (sessionStorage.getItem(RELOAD_KEY) === "1") return false;
    sessionStorage.setItem(RELOAD_KEY, "1");
  } catch { /* ignore */ }
  console.warn("[resume-recovery] hard reload:", tag);
  // Track hard-reload frequency in prod via Sentry breadcrumb (lazy import
  // to keep the resume-recovery cold path light).
  void import("../lib/sentry")
    .then((m) => m.addBreadcrumb?.("resume-recovery", `hard reload: ${tag}`, { tag }))
    .catch(() => { /* noop */ });
  try { window.location.reload(); } catch { /* ignore */ }
  return true;
}

function clearReloadGuard() {
  try { sessionStorage.removeItem(RELOAD_KEY); } catch { /* ignore */ }
}

/** Notify the app that we just resumed — App.tsx invalidates queries. */
function emitResumed() {
  try { window.dispatchEvent(new Event("app:resumed")); } catch { /* ignore */ }
}

/** Watchdog: if RAF doesn't fire shortly after resume, the WebView is frozen.
 *  Returns a disposer so callers can cancel on unmount and avoid setState-after-unmount. */
function startRafWatchdog(): () => void {
  let fired = false;
  let cancelled = false;
  requestAnimationFrame(() => { fired = true; });
  const id = setTimeout(() => {
    if (cancelled) return;
    if (!fired) safeReload("rAF watchdog timeout");
  }, RAF_WATCHDOG_MS);
  return () => { cancelled = true; clearTimeout(id); };
}

export function useResumeRecovery(): void {
  useEffect(() => {
    const onError = (ev: ErrorEvent) => {
      if (looksLikeChunkError(ev.error ?? ev.message)) chunkErrorPending = true;
    };
    const onRejection = (ev: PromiseRejectionEvent) => {
      if (looksLikeChunkError(ev.reason)) chunkErrorPending = true;
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    const onResume = () => {
      const wasStale = lastHiddenAt > 0 && Date.now() - lastHiddenAt > STALE_BG_MS;
      lastHiddenAt = 0;
      if (chunkErrorPending || wasStale) {
        // Capture the tag BEFORE zeroing chunkErrorPending (was: ternary read the
        // already-false value, always logging "stale-background" even for chunk errors).
        const reason = chunkErrorPending ? "chunk-error" : "stale-background";
        chunkErrorPending = false;
        // If the guard suppressed the reload, the previous reload attempt failed —
        // clear the guard so the NEXT resume can retry instead of being permanently
        // locked out of recovery.
        if (!safeReload(reason)) {
          clearReloadGuard();
        }
        return;
      }
      // Successful resume — clear the one-shot guard and check liveness.
      clearReloadGuard();
      // Track disposer so unmount cancels the pending watchdog timer.
      disposeWatchdog?.();
      disposeWatchdog = startRafWatchdog();
      emitResumed();
    };
    let disposeWatchdog: (() => void) | null = null;

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        lastHiddenAt = Date.now();
      } else {
        onResume();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    // page-show after bfcache restore on Android Chrome WebView ≥ 105.
    const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) onResume(); };
    window.addEventListener("pageshow", onPageShow);

    // Capacitor App listener — guarded against unmount-during-await race:
    // if the component unmounts before App.addListener() resolves, the
    // cleanup runs first with removeCapListener still null, leaking the
    // listener forever. The `cancelled` flag removes the handle if we
    // already unmounted by the time the promise resolves. (Audit fix)
    let cancelled = false;
    let removeCapListener: (() => void) | null = null;
    (async () => {
      try {
        // Static import — capacitorApp is already in the main chunk via
        // useAndroidBackButton/useDeepLinks; dynamic import here was a no-op
        // that produced Rolldown's INEFFECTIVE_DYNAMIC_IMPORT warning.
        const { plugin: App } = await loadCapacitorApp();

        const handle = await App.addListener("appStateChange", (state) => {
          if (state.isActive) onResume();
          else if (document.visibilityState !== "hidden") {
            lastHiddenAt = Date.now();
          }
        });
        if (cancelled) { try { handle.remove(); } catch { /* ignore */ } return; }
        removeCapListener = () => { try { handle.remove(); } catch { /* ignore */ } };
      } catch { /* not native — ignore */ }
    })();

    return () => {
      cancelled = true;
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
      removeCapListener?.();
      disposeWatchdog?.();
    };
  }, []);
}
