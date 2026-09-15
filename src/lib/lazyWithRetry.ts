import { lazy, type ComponentType } from "react";
// Static import — sonner is already in the main graph (Sidebar, paywall, admin,
// etc.), so a dynamic import here can't move it into its own chunk and only
// triggers Rollup's INEFFECTIVE_DYNAMIC_IMPORT warning. Importing it statically
// keeps the build log clean and avoids the "not mounted yet" race on reload.
import { toast as sonnerToast } from "sonner";

/**
 * React.lazy wrapper that survives stale-chunk errors after a deploy.
 *
 * Problem: when a new build ships, the user's already-loaded index.html
 * holds references to old chunk hashes (e.g. ChatWidget-IRPjPX_M.js). The
 * moment React tries to lazy-import that chunk, the network 404s and
 * `import()` rejects with "error loading dynamically imported module".
 *
 * Fix:
 *  1. Retry the import once after a short delay — handles transient network
 *     blips on flaky mobile data.
 *  2. If retry also fails AND we haven't reloaded yet in this session, hard
 *     reload the page so the browser picks up the new index.html / chunk
 *     manifest. The sessionStorage guard prevents an infinite reload loop
 *     if the chunk is genuinely broken.
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
): ReturnType<typeof lazy<T>> {
  return lazy(async () => {
    const RELOAD_KEY = "lovable:chunk-reload";
    try {
      const mod = await factory();
      // Successful import — clear stale reload flag for future failures.
      try { sessionStorage?.removeItem(RELOAD_KEY); } catch { /* ignore */ }
      return mod;
    } catch (err) {
      // One quick retry for transient network failures.
      try {
        await new Promise((r) => setTimeout(r, 400));
        const mod = await factory();
        try { sessionStorage?.removeItem(RELOAD_KEY); } catch { /* ignore */ }
        return mod;
      } catch (retryErr) {
        import("./sentry")
          .then((m) => m.captureException?.(retryErr, { source: "lazyWithRetry" }))
          .catch(() => {});
        // Don't reload when the device is offline — a reload while offline
        // is guaranteed to fail and produces the visible "refresh… refresh…"
        // loop the user sees while the APK is launched on a flaky network.
        // Re-throw instead so the route's ErrorBoundary renders an inline
        // retry button and the user controls when to reload.
        const isOnline =
          typeof navigator === "undefined" || navigator.onLine !== false;
        const alreadyReloaded =
          typeof sessionStorage !== "undefined" &&
          sessionStorage.getItem(RELOAD_KEY) === "1";
        if (isOnline && !alreadyReloaded && typeof window !== "undefined") {
          try {
            sessionStorage.setItem(RELOAD_KEY, "1");
          } catch {
            /* storage may be blocked in private mode — fall through */
          }
          // Best-effort friendly toast (sonner may not be mounted yet).
          try { sonnerToast?.info?.("App updated — reloading…"); } catch { /* ignore */ }
          window.location.reload();
          // Return a never-resolving promise so React doesn't render fallback flicker.
          return await new Promise<{ default: T }>(() => undefined);
        }
        throw retryErr;
      }
    }
  });
}
