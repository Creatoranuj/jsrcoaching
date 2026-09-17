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

export interface RazorpayNativePlugin {
  open(options: Record<string, unknown>): Promise<RazorpayNativeSuccess>;
  cancel(): Promise<RazorpayNativeCancelResult | void>;
}

let cached: RazorpayNativePlugin | null = null;
let inflight: Promise<RazorpayNativePlugin> | null = null;

export const loadRazorpayNative = async (): Promise<RazorpayNativePlugin> => {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    const { registerPlugin } = await import("@capacitor/core");
    cached = registerPlugin<RazorpayNativePlugin>("RazorpayNative");
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
