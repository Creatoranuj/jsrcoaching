/**
 * Warm-boot Preferences cache.
 *
 * Capacitor Preferences is async (bridge call → SharedPreferences/Keychain).
 * For tiny pieces of UI state read on every cold start (theme, last route,
 * current batch, onboarding flag) the round-trip can delay first paint by
 * 60–120ms on mid-range Android. This module keeps a synchronous
 * in-memory mirror seeded from a single bulk read at boot and rewrites
 * back to Preferences in the background.
 *
 * Design rules:
 *  - Web: pure localStorage. No dynamic import, no bridge.
 *  - Native: localStorage is the synchronous mirror; Preferences is the
 *    durable backing store (so a process kill before the bg write completes
 *    still recovers from localStorage on next boot — both layers are
 *    written, both layers are read).
 *  - Never use this for secrets or auth tokens — those go through
 *    `supabaseAuthStorage` (Keystore-backed).
 *  - Keys must be enumerated in `WARM_KEYS` so we know exactly what crosses
 *    the bridge at boot. Add new entries deliberately.
 */

import { safeGet, safeSet, safeRemove } from "@/lib/storage";
import { loadPreferences } from "@/lib/native/preferences";


const WARM_KEYS = [
  "nb:theme",
  "nb:last-route",
  "nb:current-batch",
  "nb:onboarded",
] as const;

export type PrefKey = (typeof WARM_KEYS)[number];

const isNative = (): boolean => {
  try {
    return (
      (globalThis as typeof globalThis & {
        Capacitor?: { isNativePlatform?: () => boolean };
      }).Capacitor?.isNativePlatform?.() === true
    );
  } catch {
    return false;
  }
};

const mem = new Map<string, string>();
let hydrated = false;
let hydratePromise: Promise<void> | null = null;

const readLocal = (k: string): string | null => safeGet(k);

const writeLocal = (k: string, v: string | null): void => {
  if (v == null) safeRemove(k);
  else safeSet(k, v);
};

/** Synchronous read — returns the mirrored value or null. Safe to call
 *  during render. Returns null if hydration hasn't run yet on native. */
export function getPref(key: PrefKey): string | null {
  if (mem.has(key)) return mem.get(key) ?? null;
  // Fallback to localStorage even before hydrate — on web it's authoritative,
  // on native it's a best-effort echo from a previous session.
  const v = readLocal(key);
  if (v != null) mem.set(key, v);
  return v;
}

/** Synchronous write — updates the mirror immediately, persists in the
 *  background. Callers don't need to await. */
export function setPref(key: PrefKey, value: string | null): void {
  if (value == null) mem.delete(key);
  else mem.set(key, value);
  writeLocal(key, value);
  if (isNative()) void persistNative(key, value);
}

async function persistNative(key: string, value: string | null): Promise<void> {
  try {
    const { plugin: Preferences } = await loadPreferences();
    if (value == null) await Preferences.remove({ key });
    else await Preferences.set({ key, value });
  } catch {
    /* best-effort */
  }
}

/**
 * Bulk-hydrate the mirror from Preferences. Call once early in app boot
 * (e.g. inside main.tsx before rendering). Idempotent. On web it's a no-op
 * because localStorage already IS the synchronous source of truth.
 */
export function hydratePrefsCache(): Promise<void> {
  if (hydrated) return Promise.resolve();
  if (hydratePromise) return hydratePromise;
  if (!isNative()) {
    // Seed mem from localStorage so getPref is O(1) after first call.
    for (const k of WARM_KEYS) {
      const v = readLocal(k);
      if (v != null) mem.set(k, v);
    }
    hydrated = true;
    return Promise.resolve();
  }
  hydratePromise = (async () => {
    try {
      const { plugin: Preferences } = await loadPreferences();
      // Single sequential read keeps the bridge cost predictable. Could be
      // parallelised, but @capacitor/preferences serialises through one
      // worker thread on Android anyway.
      for (const k of WARM_KEYS) {
        const { value } = await Preferences.get({ key: k });
        if (value != null) {
          mem.set(k, value);
          writeLocal(k, value); // mirror to localStorage for next cold start
        }
      }
    } catch {
      /* silent — getPref will fall through to localStorage */
    } finally {
      hydrated = true;
      hydratePromise = null;
    }
  })();
  return hydratePromise;
}
