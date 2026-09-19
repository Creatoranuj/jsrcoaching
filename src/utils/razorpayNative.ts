// Native Razorpay checkout wrapper (Capacitor Android).
//
// Backed by our own `RazorpayNative` Capacitor plugin, which calls the
// officially documented Android flow: Checkout.preload() at app start and
// checkout.open(activity, options) on purchase. The previously used
// third-party `capacitor-razorpay` package launched Razorpay's CheckoutActivity
// through a raw Intent, bypassing that flow — which is why the APK never showed
// the UPI app tiles (GPay / PhonePe / Paytm) while the website did.
import { loadRazorpayNative } from "../lib/native/razorpay";
import { addBreadcrumb } from "../lib/sentry";

export interface NativeRazorpayOptions {
  key: string;
  amount: number; // in paise
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill?: { name?: string; email?: string; contact?: string; method?: string };
  theme?: { color?: string };
  /** Method toggles (upi / card / netbanking / wallet). Forwarded. */
  method?: Record<string, boolean>;
  /**
   * `config.display` blocks — forwarded to the native SDK. Razorpay's Android
   * standard checkout reads the same options JSON as the web checkout, so this
   * is what pins the UPI block to the top of the sheet. Dropping it (the old
   * behaviour) left UPI buried under the default block order.
   */
  config?: unknown;
  /** Shows a returning buyer their saved UPI ID under "Recommended". */
  remember_customer?: boolean;
}


export interface RazorpaySuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

/**
 * The Android payment bridge is not present in the running build (typically an
 * old APK installed on the device). Callers should silently fall back to the
 * web checkout instead of leaving the user on a frozen screen.
 */
export class RazorpayBridgeMissingError extends Error {
  constructor() {
    super("Native Razorpay bridge unavailable");
    this.name = "RazorpayBridgeMissingError";
  }
}

/**
 * The plugin call never settled — the payment sheet did not appear. Without
 * this guard the promise hangs forever and the UI looks frozen.
 */
export class RazorpayLaunchTimeoutError extends Error {
  constructor() {
    super("Payment screen didn't open. Please update the app and try again.");
    this.name = "RazorpayLaunchTimeoutError";
  }
}

/** The native SDK returned without the signed fields required by the server. */
export class RazorpayInvalidResponseError extends Error {
  constructor() {
    super("Payment response was incomplete");
    this.name = "RazorpayInvalidResponseError";
  }
}

/**
 * The bridge kept reporting the native sheet as alive but it never produced a
 * result within {@link MAX_LIVE_SHEET_WAITS} rounds. This is NOT a launch
 * failure: a second (web) checkout must not be opened underneath a sheet that
 * may still be processing a payment. Callers reset the CTA and point the user
 * at webhook-based enrollment recovery.
 */
export class RazorpaySheetUnresponsiveError extends Error {
  constructor() {
    super(
      "Payment sheet ne jawab nahi diya. Agar paisa kat gaya hai to enrollment webhook se apne aap ho jayega — My Courses thodi der mein check karein.",
    );
    this.name = "RazorpaySheetUnresponsiveError";
  }
}

/** How long we wait for the native sheet before declaring it stuck. */
export const NATIVE_LAUNCH_TIMEOUT_MS = 5000;

/**
 * Grace period after the user comes back to the app. If the plugin still has
 * not settled by then the checkout Activity is gone without a callback, so we
 * stop waiting instead of leaving the CTA stuck on "Opening payment…".
 */
export const NATIVE_RESUME_TIMEOUT_MS = 6000;

/**
 * Hard cap on the "load the bridge" steps (`@capacitor/core` chunk hydration
 * and `loadRazorpayNative()`). These awaits had NO watchdog: if the lazy chunk
 * never resolved inside the APK WebView the CTA stayed on "Opening payment…"
 * forever with no error and no fallback — exactly the reported symptom.
 */
// Cold start on a low-end phone can take several seconds just to hydrate the
// Capacitor chunk; 4s was tripping on real devices and silently demoting the
// purchase to the web checkout, which never shows UPI app tiles.
export const BRIDGE_LOAD_TIMEOUT_MS = 12000;

/** Coarse progress marker surfaced in the UI so a stuck step is visible. */
export type NativeCheckoutStep = "bridge" | "sheet";

/** Rejects with `onTimeout()` when `promise` does not settle in `ms`. */
export const withTimeout = async <T,>(
  promise: Promise<T>,
  ms: number,
  onTimeout: () => Error,
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(onTimeout()), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

/**
 * Tracks whether the WebView is the foreground surface.
 *
 * `hidden === true` means something (the Razorpay checkout Activity, a UPI app)
 * is on top of us. `window.blur` is deliberately NOT used: on Android WebView
 * it fires for keyboard focus changes and would disarm the watchdog while the
 * sheet never actually opened.
 */
export const onWebViewVisibility = (
  cb: (hidden: boolean) => void
): (() => void) => {
  if (typeof document === "undefined") return () => {};
  const fire = () => cb(document.visibilityState === "hidden");
  const hide = () => cb(true);
  document.addEventListener("visibilitychange", fire);
  window.addEventListener("pagehide", hide);
  return () => {
    document.removeEventListener("visibilitychange", fire);
    window.removeEventListener("pagehide", hide);
  };
};

/** @deprecated use {@link onWebViewVisibility}. */
export const onWebViewBackgrounded = (cb: () => void): (() => void) =>
  onWebViewVisibility((hidden) => { if (hidden) cb(); });

export class RazorpayCancelledError extends Error {
  constructor() {
    super("Payment cancelled");
    this.name = "RazorpayCancelledError";
  }
}

/**
 * Structured Razorpay failure raised from the native plugin. Carries the
 * same fields the web `payment.failed` event exposes, so callers can pass
 * this straight to `formatRazorpayError()` instead of regexing on `.message`.
 */
export class RazorpayNativeError extends Error {
  code?: string;
  description?: string;
  source?: string;
  step?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  constructor(fields: {
    code?: string; description?: string; source?: string;
    step?: string; reason?: string; metadata?: Record<string, unknown>;
  }, fallbackMessage: string) {
    super(fields.description && fields.description !== "undefined"
      ? fields.description
      : fallbackMessage);
    this.name = "RazorpayNativeError";
    this.code = fields.code;
    this.description = fields.description;
    this.source = fields.source;
    this.step = fields.step;
    this.reason = fields.reason;
    this.metadata = fields.metadata;
  }
}

const CANCEL_HINTS = [
  "cancel",
  "dismiss",
  "back_pressed",
  "user closed",
  "payment did not complete",
];

const looksLikeCancel = (msg: string): boolean => {
  const lower = msg.toLowerCase();
  return CANCEL_HINTS.some((h) => lower.includes(h));
};

export interface NormalizedRazorpayError {
  code?: string; description?: string; source?: string;
  step?: string; reason?: string; metadata?: Record<string, unknown>;
}

const FIELD_ALIASES: Record<keyof NormalizedRazorpayError, string[]> = {
  code: ["code", "errorCode", "error_code"],
  description: ["description", "message", "errorMessage", "error_description", "desc"],
  source: ["source"],
  step: ["step"],
  reason: ["reason"],
  metadata: ["metadata"],
};

const asObject = (value: unknown): Record<string, unknown> | null => {
  if (!value) return null;
  if (typeof value === "object") return value as Record<string, unknown>;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        return parsed && typeof parsed === "object" ? parsed : null;
      } catch { /* not JSON */ }
    }
  }
  return null;
};

/**
 * Version-proof extraction of Razorpay's structured error.
 *
 * Instead of hardcoding the 3 shapes we've seen from `capacitor-razorpay`, we
 * walk the thrown value (depth <= 3, cycle-safe) and pick up the first match
 * for each known field — including common aliases and JSON-string payloads.
 * A brand-new plugin shape therefore still yields usable fields instead of
 * falling through to a generic message.
 */
export const normalizeNativeError = (input: unknown): NormalizedRazorpayError => {
  const out: NormalizedRazorpayError = {};
  const seen = new Set<unknown>();

  const visit = (value: unknown, depth: number) => {
    if (depth > 3) return;
    const obj = asObject(value);
    if (!obj || seen.has(obj)) return;
    seen.add(obj);

    for (const key of Object.keys(FIELD_ALIASES) as (keyof NormalizedRazorpayError)[]) {
      if (out[key] !== undefined) continue;
      for (const alias of FIELD_ALIASES[key]) {
        const raw = (obj as Record<string, unknown>)[alias];
        if (key === "metadata") {
          const meta = asObject(raw);
          if (meta) { out.metadata = meta as Record<string, unknown>; break; }
          continue;
        }
        if (typeof raw === "string" && raw.trim() && raw !== "undefined" && raw !== "null") {
          // A JSON blob hiding in a string field → recurse instead of using it.
          if (asObject(raw)) break;
          (out as Record<string, unknown>)[key] = raw.trim();
          break;
        }
        if (typeof raw === "number") { (out as Record<string, unknown>)[key] = String(raw); break; }
      }
    }

    // Recurse into nested containers where plugins wrap the real error.
    // `description` is included because the Android SDK hands the merchant
    // its raw `{"error":{...}}` JSON *as the description string* — the real
    // step / reason live one level inside it.
    for (const nestedKey of ["error", "response", "data", "details", "payload", "cause", "body", "result", "message", "errorMessage", "description"]) {
      const nested = (obj as Record<string, unknown>)[nestedKey];
      if (nested && (typeof nested === "object" || typeof nested === "string")) {
        visit(nested, depth + 1);
      }
    }
  };

  visit(input, 0);

  // Plain-string throw with no structure at all.
  if (!out.description) {
    const raw = typeof input === "string"
      ? input
      : ((input as { message?: string; errorMessage?: string })?.message
        || (input as { errorMessage?: string })?.errorMessage
        || "");
    if (raw && !asObject(raw)) out.description = raw;
  }

  if (!out.code && !out.step && !out.reason && !out.description) {
    out.reason = "unknown";
    try {
      // Truncated raw payload for debugging future plugin shapes. No keys or
      // PII are present in Razorpay failure payloads.
      console.warn("[razorpay-native] unrecognised error shape:", JSON.stringify(input)?.slice(0, 500));
    } catch {
      console.warn("[razorpay-native] unrecognised non-serialisable error shape");
    }
  }

  return out;
};

/** @deprecated kept for backwards compatibility — use {@link normalizeNativeError}. */
const extractRazorpayError = normalizeNativeError;

/**
 * Opens the native Razorpay checkout sheet and resolves with the success
 * payload. Throws {@link RazorpayCancelledError} when the user dismisses the
 * sheet, and a regular Error for real failures (declined card, signature
 * mismatch, etc.) so callers can show the right UX.
 */
/**
 * Builds the options object handed to the native Razorpay SDK.
 *
 * Only fields the Android SDK actually understands are forwarded. In
 * particular we drop:
 *  - `config.display.blocks` — browser-only checkout layout
 *  - `method` — passing a method map can restrict the sheet; omitting it lets
 *    Razorpay show every method enabled on the account, which is what makes the
 *    UPI section (with installed-app tiles) appear
 *  - `prefill.method` — pre-selecting "upi" on native skips the app tiles
 *  - `remember_customer` — web-only
 */
export const buildNativeCheckoutPayload = (
  options: NativeRazorpayOptions
): Record<string, unknown> => {
  const payload: Record<string, unknown> = {
    key: options.key,
    // The native SDK expects amount as a string of paise.
    amount: String(options.amount),
    currency: options.currency || "INR",
    name: options.name,
    description: options.description,
    order_id: options.order_id,
  };

  if (options.prefill) {
    const prefill: Record<string, string> = {};
    if (options.prefill.name) prefill.name = options.prefill.name;
    if (options.prefill.email) prefill.email = options.prefill.email;
    if (options.prefill.contact) prefill.contact = options.prefill.contact;
    if (Object.keys(prefill).length > 0) payload.prefill = prefill;
  }
  if (options.theme) payload.theme = options.theme;

  // UPI must be asked for explicitly. The Android standard-checkout Activity
  // accepts the same `method` / `config.display` options as the web checkout;
  // when they are omitted the sheet falls back to Razorpay's default ordering
  // and the UPI section sits below cards/netbanking (or is skipped entirely on
  // accounts where UPI is not the primary method).
  const methods = options.method
    ? Object.fromEntries(
        Object.entries(options.method).filter(([, v]) => typeof v === "boolean"),
      )
    : undefined;
  if (methods && Object.keys(methods).length > 0) payload.method = methods;

  const display = (options.config as { display?: unknown } | null | undefined)?.display;
  if (display && typeof display === "object") payload.config = { display };

  if (options.remember_customer) payload.remember_customer = true;

  return payload;
};

/**
 * Upper bound on "the sheet is still alive, keep waiting" rounds. Each round is
 * {@link NATIVE_RESUME_TIMEOUT_MS} (6 s), so 100 rounds ≈ 10 minutes — longer
 * than Razorpay's own UPI collect/intent expiry, so a genuine payment is never
 * cut short, while still guaranteeing the promise settles eventually.
 *
 * Reaching the ceiling raises {@link RazorpaySheetUnresponsiveError}, NOT the
 * launch timeout: the bridge says the Razorpay Activity is still on top, so a
 * web fallback would open a second checkout underneath a live payment.
 */
export const MAX_LIVE_SHEET_WAITS = 100;

/** Internal marker for "our watchdog fired", kept off the public error path. */
const WATCHDOG = Symbol("razorpay-watchdog");

/**
 * Waits for the native checkout result without ever abandoning a live sheet.
 *
 * The previous implementation rejected on the first watchdog tick and asked the
 * bridge to cancel. On slow devices (and on OEM WebViews whose JS timers thaw
 * only on resume) the Razorpay Activity was frequently still open and still
 * processing: cancelling dropped its callback, the caller opened a second,
 * web checkout underneath it, and the user was left staring at a payment screen
 * wired to nothing — the "Opening payment" stuck state.
 *
 * Now the bridge is asked whether the sheet is genuinely gone. `dismissed:false`
 * means the native Activity is alive, so we re-arm and keep waiting instead of
 * tearing down a real payment. Only a confirmed-dead sheet raises
 * {@link RazorpayLaunchTimeoutError} for the caller's web fallback.
 */
export const awaitNativeCheckoutResult = async (
  plugin: { cancel: () => Promise<unknown> },
  openPromise: Promise<unknown>,
): Promise<unknown> => {
  for (let attempt = 0; ; attempt += 1) {
    let launchTimer: ReturnType<typeof setTimeout> | undefined;
    let stopWatching: () => void = () => {};
    let outcome: unknown;
    try {
      outcome = await Promise.race([
        openPromise,
        new Promise<typeof WATCHDOG>((resolve) => {
          const arm = (ms: number) => {
            if (launchTimer) clearTimeout(launchTimer);
            launchTimer = setTimeout(() => resolve(WATCHDOG), ms);
          };
          const disarm = () => {
            if (launchTimer) { clearTimeout(launchTimer); launchTimer = undefined; }
          };
          // First round: the sheet must appear within the launch window.
          // Later rounds: short grace period after we regain the foreground.
          arm(attempt === 0 ? NATIVE_LAUNCH_TIMEOUT_MS : NATIVE_RESUME_TIMEOUT_MS);
          // While the checkout Activity (or a UPI app) is on top of us the user
          // may legitimately take minutes, so the watchdog is disarmed.
          stopWatching = onWebViewVisibility((hidden) => {
            if (hidden) disarm();
            else arm(NATIVE_RESUME_TIMEOUT_MS);
          });
        }),
      ]);
    } finally {
      if (launchTimer) clearTimeout(launchTimer);
      stopWatching();
    }

    if (outcome !== WATCHDOG) return outcome;

    // Watchdog fired — ask the bridge whether the native sheet actually died.
    let dismissed = true;
    // If OUR WebView is the visible surface right now, no Razorpay Activity can
    // be on top of it. A bridge claiming `dismissed:false` in that state is
    // stale bookkeeping — believing it is what kept the CTA spinning for
    // minutes. Treat it as a failed launch and let the caller use web checkout.
    const weAreForeground =
      typeof document !== "undefined" && document.visibilityState === "visible";
    try {
      const res = (await plugin.cancel()) as { dismissed?: boolean } | undefined;
      if (res && res.dismissed === false && !weAreForeground) dismissed = false;
    } catch {
      // Older APKs have no cancel(): treat as dead and fall back to web.
    }
    if (dismissed) {
      throw new RazorpayLaunchTimeoutError();
    }
    if (attempt >= MAX_LIVE_SHEET_WAITS) {
      // Still alive after the ceiling: give up on this promise but never open
      // a second checkout under it. Webhook/reconciliation own the outcome.
      addBreadcrumb("payment", "razorpay:native-sheet-unresponsive", {
        rounds: attempt + 1,
      });
      throw new RazorpaySheetUnresponsiveError();
    }
  }
};



export const openNativeRazorpayCheckout = async (
  options: NativeRazorpayOptions,
  onStep?: (step: NativeCheckoutStep) => void,
): Promise<RazorpaySuccessResponse> => {
  const payload = buildNativeCheckoutPayload(options);

  let result: { response?: unknown } | undefined;
  try {
    const keyMode = options.key.startsWith("rzp_live_") ? "live"
      : options.key.startsWith("rzp_test_") ? "test"
      : "unknown";
    addBreadcrumb('payment', 'razorpay:open', {
      order_id: options.order_id,
      order_prefix: options.order_id.slice(0, 14),
      mode: 'native',
      key_mode: keyMode,
      amount: options.amount,
      currency: options.currency,
      // Razorpay's recommended/preferred-methods block needs the customer
      // contact — track it so a missing number is visible in Sentry.
      has_contact: Boolean(options.prefill?.contact),
    });
    // Fail fast when the APK predates the native bridge: registerPlugin()
    // returns a proxy either way, so without this check the call can hang
    // silently and the user just sees a frozen checkout screen.
    onStep?.("bridge");
    const { Capacitor } = await withTimeout(
      import("@capacitor/core"),
      BRIDGE_LOAD_TIMEOUT_MS,
      () => new RazorpayBridgeMissingError(),
    );
    // NOTE: a `false` from isPluginAvailable() is NOT treated as fatal any
    // more. On some Android builds the availability map is populated after the
    // first bridge round-trip, so an early `false` used to demote a perfectly
    // working APK to the browser checkout — the "app se browser me chala gaya"
    // bug students reported. We only record it and still attempt open(); a real
    // missing bridge rejects with UNIMPLEMENTED and is handled below.
    if (typeof Capacitor.isPluginAvailable === "function"
      && !Capacitor.isPluginAvailable("RazorpayNative")) {
      addBreadcrumb("payment", "razorpay:plugin-availability-false", {
        note: "attempting open() anyway",
      });
    }

    const RazorpayNative = await withTimeout(
      loadRazorpayNative(),
      BRIDGE_LOAD_TIMEOUT_MS,
      () => new RazorpayBridgeMissingError(),
    );
    onStep?.("sheet");
    const openPromise = RazorpayNative.open(payload);
    // The watchdog can abandon this promise; keep a no-op handler so an
    // eventual native rejection never surfaces as an unhandled rejection.
    void Promise.resolve(openPromise).catch(() => {});
    result = await awaitNativeCheckoutResult(RazorpayNative, openPromise);
  } catch (e: unknown) {
    // Structural failures are re-thrown untouched so the caller can react
    // (fall back to web / show the "didn't open" message).
    if (e instanceof RazorpayLaunchTimeoutError) throw e;
    if (e instanceof RazorpayBridgeMissingError) throw e;
    if (e instanceof RazorpaySheetUnresponsiveError) throw e;
    const errObj = e as { message?: string; errorMessage?: string } | null | undefined;
    const msg = errObj?.message || errObj?.errorMessage || String(e ?? "");
    if (looksLikeCancel(msg)) throw new RazorpayCancelledError();
    // A genuinely absent native bridge rejects with Capacitor's
    // "not implemented" / UNIMPLEMENTED error. Only THAT means the APK has no
    // RazorpayNative plugin.
    if (/not implemented|unimplemented|implementation of|not available|plugin is not implemented/i.test(msg)) throw new RazorpayBridgeMissingError();
    // Preserve Razorpay's structured error (step / reason / code) so the
    // caller can render an actionable message instead of "undefined".
    const fields = extractRazorpayError(e);
    throw new RazorpayNativeError(fields, msg || "Payment failed");
  }

  // The plugin returns `{ response: string | object }` — newer versions
  // already parse the JSON, older versions return a stringified payload.
  let parsed: { razorpay_payment_id?: string; razorpay_order_id?: string; razorpay_signature?: string } | string | undefined =
    result?.response as typeof parsed ?? (result as typeof parsed);
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed) as { razorpay_payment_id?: string; razorpay_order_id?: string; razorpay_signature?: string };
    } catch {
      // Legacy bridges can return only the payment id. Preserve the shape here
      // so the completeness check below raises a dedicated recovery error.
      parsed = { razorpay_payment_id: parsed };
    }
  }

  // A successful order payment must return all three signed fields. Treating a
  // partial callback as cancellation hides real SDK/bridge failures; forwarding
  // it to verification only creates a confusing second error. The webhook still
  // remains the source-of-truth fallback when money was captured.
  if (
    !parsed?.razorpay_payment_id ||
    !parsed?.razorpay_order_id ||
    !parsed?.razorpay_signature
  ) {
    throw new RazorpayInvalidResponseError();
  }

  return {
    razorpay_payment_id: parsed.razorpay_payment_id,
    razorpay_order_id: parsed.razorpay_order_id,
    razorpay_signature: parsed.razorpay_signature,
  };
};
