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
  /** Web-checkout method toggles — forwarded to the native SDK as-is. */
  method?: Record<string, boolean>;
  /** Web-only `config.display` blocks — stripped before the native call. */
  config?: unknown;
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

/** How long we wait for the native sheet before declaring it stuck. */
export const NATIVE_LAUNCH_TIMEOUT_MS = 5000;

/**
 * Grace period after the user comes back to the app. If the plugin still has
 * not settled by then the checkout Activity is gone without a callback, so we
 * stop waiting instead of leaving the CTA stuck on "Opening payment…".
 */
export const NATIVE_RESUME_TIMEOUT_MS = 6000;

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
    for (const nestedKey of ["error", "response", "data", "details", "payload", "cause", "body", "result", "message", "errorMessage"]) {
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

  return payload;
};

/**
 * Upper bound on "the sheet is still alive, keep waiting" rounds. Each round is
 * {@link NATIVE_RESUME_TIMEOUT_MS}, so this caps the wait at a few minutes —
 * enough for a slow UPI app round trip, while never waiting forever.
 */
export const MAX_LIVE_SHEET_WAITS = 30;

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
    try {
      const res = (await plugin.cancel()) as { dismissed?: boolean } | undefined;
      if (res && res.dismissed === false) dismissed = false;
    } catch {
      // Older APKs have no cancel(): treat as dead and fall back to web.
    }
    if (dismissed || attempt >= MAX_LIVE_SHEET_WAITS) {
      throw new RazorpayLaunchTimeoutError();
    }
  }
};



export const openNativeRazorpayCheckout = async (
  options: NativeRazorpayOptions
): Promise<RazorpaySuccessResponse> => {
  const payload = buildNativeCheckoutPayload(options);

  let result: any;
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
    const { Capacitor } = await import("@capacitor/core");
    if (typeof Capacitor.isPluginAvailable === "function"
      && !Capacitor.isPluginAvailable("RazorpayNative")) {
      throw new RazorpayBridgeMissingError();
    }

    const RazorpayNative = await loadRazorpayNative();
    const openPromise = RazorpayNative.open(payload);
    // The watchdog can abandon this promise; keep a no-op handler so an
    // eventual native rejection never surfaces as an unhandled rejection.
    void Promise.resolve(openPromise).catch(() => {});
    result = await awaitNativeCheckoutResult(RazorpayNative, openPromise);
  } catch (e: any) {
    // Structural failures are re-thrown untouched so the caller can react
    // (fall back to web / show the "didn't open" message).
    if (e instanceof RazorpayLaunchTimeoutError) throw e;
    if (e instanceof RazorpayBridgeMissingError) throw e;
    const msg = e?.message || e?.errorMessage || String(e ?? "");
    if (looksLikeCancel(msg)) throw new RazorpayCancelledError();
    // Preserve Razorpay's structured error (step / reason / code) so the
    // caller can render an actionable message instead of "undefined".
    const fields = extractRazorpayError(e);
    throw new RazorpayNativeError(fields, msg || "Payment failed");
  }

  // The plugin returns `{ response: string | object }` — newer versions
  // already parse the JSON, older versions return a stringified payload.
  let parsed: any = result?.response ?? result;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
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
