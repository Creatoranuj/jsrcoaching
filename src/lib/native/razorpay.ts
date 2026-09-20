/**
 * Lazy accessor for our own `RazorpayNative` Capacitor plugin.
 *
 * Mirrors the `core.ts` / `app.ts` bridge pattern: `@capacitor/core` is only
 * imported inside `src/lib/native/`, and the plugin proxy is memoized so the
 * chunk is hydrated at most once.
 */
export interface RazorpayNativeSuccess {
  response?: unknown;
}

/**
 * `dismissed: false` means the native checkout Activity is still alive, so the
 * caller must keep waiting instead of opening a second (web) checkout on top of
 * a real payment sheet. Older APKs resolve with nothing.
 */
export interface RazorpayNativeCancelResult {
  dismissed?: boolean;
}

/** One installed UPI app as reported by Android's PackageManager. */
export interface RazorpayNativeUpiApps {
  apps?: Array<{ packageName?: string; label?: string }>;
  error?: string;
}

export interface RazorpayNativePlugin {
  open(options: Record<string, unknown>): Promise<RazorpayNativeSuccess>;
  cancel(): Promise<RazorpayNativeCancelResult | void>;
  /** Optional: absent on APKs built before UPI app discovery shipped. */
  getUpiApps?(): Promise<RazorpayNativeUpiApps>;
}

/**
 * Container that keeps the Capacitor proxy out of Promise resolution.
 *
 * ── Why the proxy is wrapped in `{ plugin }` ──────────────────────────────
 * `registerPlugin()` returns a Proxy whose `get` trap treats EVERY property
 * read as a native method call. When an `async` function resolves with that
 * proxy directly, the Promise machinery performs "thenable assimilation": it
 * reads `proxy.then`. The proxy answers with a function that invokes the
 * native method `then`, which does not exist, so Android rejects with
 * `"RazorpayNative.then()" is not implemented on android`.
 *
 * That is exactly what Sentry SAFAR-ENGLISH-APP-13/14 recorded (120 events):
 * the bridge existed, but the *loader* rejected before `open()` ever ran, so
 * BuyCourse fell back to the browser on every phone — "app se browser me
 * chala gaya". Every other loader in this folder (`app.ts`, `preferences.ts`,
 * `filesystem.ts`, `core.ts`) already wraps the proxy in a container; this one
 * did not. Callers MUST destructure: `const { plugin } = await loadRazorpayNative()`.
 */
export interface RazorpayNativeContainer {
  plugin: RazorpayNativePlugin;
}

let cached: RazorpayNativeContainer | null = null;
let inflight: Promise<RazorpayNativeContainer> | null = null;

export const loadRazorpayNative = async (): Promise<RazorpayNativeContainer> => {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    const { registerPlugin } = await import("@capacitor/core");
    // Never `return` the bare proxy from an async function — see above.
    cached = { plugin: registerPlugin<RazorpayNativePlugin>("RazorpayNative") };
    inflight = null;
    return cached;
  })();
  return inflight;
};

/** Test-only reset — never call from production code. */
export const __resetRazorpayNativeCache = () => {
  cached = null;
  inflight = null;
};
