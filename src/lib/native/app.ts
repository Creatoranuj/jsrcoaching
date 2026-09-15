/**
 * Single memoized loader for `@capacitor/app`.
 *
 * Why: 4 sites (`useAndroidBackButton`, `useDeepLinks`, `useResumeRecovery`,
 * `ForceUpdateGate`) each do their own `await import("@capacitor/app")`. Vite
 * code-splits this into `vendor-capacitor` so the chunk is only fetched once,
 * BUT each caller still pays for a fresh Promise chain + duplicate cache
 * bookkeeping. A shared memoized loader collapses that to one Promise.
 *
 * IMPORTANT — never resolve a Promise with the Capacitor `App` plugin proxy
 * directly. The Promise spec runs "thenable assimilation": it reads `.then`
 * on the resolved value. Capacitor's plugin proxy returns a function for ANY
 * property access (treats it as a native method) so probing `App.then`
 * invokes a bridge call → "not implemented on android" unhandled rejection
 * (the noisy entries Eruda surfaces). Wrap in a container object so the
 * Promise resolves with a plain object and `.then` is never probed on the
 * proxy itself. See `useAndroidBackButton.ts` for the original discovery.
 */
import type { App as AppPlugin } from "@capacitor/app";

// Re-export so hooks/components import the type from the bridge instead of
// direct `@capacitor/app` (keeps `no-restricted-imports` clean).
export type { AppPlugin };

let cached: { plugin: typeof AppPlugin } | null = null;
let inflight: Promise<{ plugin: typeof AppPlugin }> | null = null;

export const loadCapacitorApp = async (): Promise<{ plugin: typeof AppPlugin }> => {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    const mod = await import("@capacitor/app");
    cached = { plugin: mod.App as typeof AppPlugin };
    inflight = null;
    return cached;
  })();
  return inflight;
};

/** Test-only reset — never call from production code. */
export const __resetCapacitorAppCache = () => {
  cached = null;
  inflight = null;
};
