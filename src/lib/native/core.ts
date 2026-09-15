/**
 * Single memoized loader for `@capacitor/core` (`Capacitor` + `CapacitorHttp`).
 *
 * Mirrors the `app.ts` / `preferences.ts` pattern. `Capacitor.isNativePlatform()`
 * is called on nearly every cold boot; keeping one shared Promise avoids
 * duplicate Vite chunk hydration cost.
 *
 * The `Capacitor` namespace object is safe to resolve directly (it exposes
 * static methods, not a plugin proxy), but we still wrap it for symmetry and
 * to keep a single `.then`-probe-free container shape across the bridge.
 */
import type { Capacitor as CapacitorNS, CapacitorHttp as CapacitorHttpNS } from "@capacitor/core";

export type { CapacitorNS, CapacitorHttpNS };

type Container = {
  Capacitor: typeof CapacitorNS;
  CapacitorHttp: typeof CapacitorHttpNS;
};

let cached: Container | null = null;
let inflight: Promise<Container> | null = null;

export const loadCore = async (): Promise<Container> => {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    const mod = await import("@capacitor/core");
    cached = {
      Capacitor: mod.Capacitor,
      CapacitorHttp: mod.CapacitorHttp,
    };
    inflight = null;
    return cached;
  })();
  return inflight;
};

/** Test-only reset — never call from production code. */
export const __resetCoreCache = () => {
  cached = null;
  inflight = null;
};


/**
 * Async `Capacitor.isNativePlatform()` for callers outside `src/lib/native/`.
 * Keeps `@capacitor/core` out of feature-code import graphs (see the
 * `no-restricted-imports` rule in eslint.config.js). Returns `false` if the
 * bridge cannot be loaded (plain web build).
 */
export const isNativePlatform = async (): Promise<boolean> => {
  try {
    const { Capacitor } = await loadCore();
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};
