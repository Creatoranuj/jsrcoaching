/**
 * Single memoized loader for `@capacitor/preferences`.
 *
 * Why: 4+ sites (`perf/queryPersister`, `perf/prefsCache`, `perf/lessonViewCache`,
 * `perf/chapterBundleCache`) each do their own `await import("@capacitor/preferences")`.
 * Vite chunks it into `vendor-capacitor` (fetched once), but each caller pays for
 * a fresh Promise chain + duplicate cache bookkeeping. Shared memoized loader
 * collapses that to one Promise.
 *
 * Wraps the resolved plugin in a container object so the Promise never probes
 * `.then` on the Capacitor proxy (see `app.ts` for the thenable-assimilation
 * gotcha discovery).
 */
import type { Preferences as PreferencesPlugin } from "@capacitor/preferences";

export type { PreferencesPlugin };

let cached: { plugin: typeof PreferencesPlugin } | null = null;
let inflight: Promise<{ plugin: typeof PreferencesPlugin }> | null = null;

export const loadPreferences = async (): Promise<{ plugin: typeof PreferencesPlugin }> => {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    const mod = await import("@capacitor/preferences");
    cached = { plugin: mod.Preferences as typeof PreferencesPlugin };
    inflight = null;
    return cached;
  })();
  return inflight;
};

/** Test-only reset — never call from production code. */
export const __resetPreferencesCache = () => {
  cached = null;
  inflight = null;
};
