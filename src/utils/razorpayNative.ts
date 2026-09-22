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
  /**
   * Razorpay key mode. On a **test** key the custom `method` / `config.display`
   * layout asks the Android sheet for instruments the test account does not
   * have; the checkout Activity then aborts before it renders and no result
   * ever comes back (the "Payment screen khul nahi payi" bug). Test mode is
   * therefore launched with Razorpay's own default layout.
   */
  mode?: "test" | "live" | null;
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

/**
 * The native bridge already has a checkout in flight (`ALREADY_IN_PROGRESS`)
 * and this JS side has no handle to it — e.g. the WebView was reloaded while
 * the Razorpay Activity stayed alive. Nothing is broken and no money is lost:
 * the caller must NOT open a second checkout, just tell the student to finish
 * the one that is open and let enrollment recovery pick up the result.
 */
export class RazorpayCheckoutBusyError extends Error {
  constructor() {
    super("Payment screen pehle se khuli hai — wahin payment poora karein.");
    this.name = "RazorpayCheckoutBusyError";
  }
}

/**
 * How long we wait for the native sheet before asking the bridge whether it
 * is really alive. 5 s tripped on mid-range phones during a cold Razorpay
 * Activity start (recording 2026-09-21 12:56: "Opening payment…" → sheet at
 * ~6 s); the watchdog then abandoned a live sheet and the eventual success
 * was dropped on the floor. 8 s covers the observed cold start with margin,
 * and a genuinely dead launch is still detected by the bridge's `cancel()`.
 */
export const NATIVE_LAUNCH_TIMEOUT_MS = 8000;

/**
 * Late-success channel.
 *
 * When the watchdog gives up on a sheet (launch timeout / unresponsive) the
 * caller has already been told "no result". If the native SDK later resolves
 * that same call with a signed success payload, it is delivered here instead
 * of being lost, so the purchase can still be verified and the student sent
 * to the course. Only complete `{payment_id, order_id, signature}` payloads
 * are delivered; partial ones are left to webhook recovery.
 */
type LateSuccessListener = (response: RazorpaySuccessResponse) => void;
const lateSuccessListeners = new Set<LateSuccessListener>();

export const onNativeCheckoutLateSuccess = (cb: LateSuccessListener): (() => void) => {
  lateSuccessListeners.add(cb);
  return () => { lateSuccessListeners.delete(cb); };
};

interface LiveNativeOpen {
  orderId: string;
  promise: Promise<unknown>;
  /** True once a caller has consumed the promise's result (or its failure). */
  consumed: boolean;
}

/**
 * The most recent un-settled native `open()` call on this JS side. Lets a
 * second `open()` for the SAME order re-attach to the live sheet instead of
 * being rejected with `ALREADY_IN_PROGRESS` — the "A checkout is already
 * open" toast in the 2026-09-21 recording.
 */
let liveNativeOpen: LiveNativeOpen | null = null;

/** Test hook — never used by app code. */
export const __resetNativeCheckoutStateForTests = (): void => {
  liveNativeOpen = null;
  lateSuccessListeners.clear();
};

/** Parses whatever the bridge resolved into the three signed fields, or null. */
const parseNativeSuccess = (result: unknown): RazorpaySuccessResponse | null => {
  const container = result as { response?: unknown } | null | undefined;
  let parsed: unknown = container && typeof container === "object" && "response" in container
    ? container.response
    : result;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      // Legacy bridges can return only the payment id.
      parsed = { razorpay_payment_id: parsed };
    }
  }
  const p = parsed as {
    razorpay_payment_id?: unknown; razorpay_order_id?: unknown; razorpay_signature?: unknown;
  } | null | undefined;
  if (
    !p || typeof p !== "object"
    || typeof p.razorpay_payment_id !== "string" || !p.razorpay_payment_id
    || typeof p.razorpay_order_id !== "string" || !p.razorpay_order_id
    || typeof p.razorpay_signature !== "string" || !p.razorpay_signature
  ) {
    return null;
  }
  return {
    razorpay_payment_id: p.razorpay_payment_id,
    razorpay_order_id: p.razorpay_order_id,
    razorpay_signature: p.razorpay_signature,
  };
};

/**
 * Arms the late-success delivery for a sheet the watchdog just gave up on.
 * Registered only AFTER the primary waiter has stopped listening, so a normal
 * in-time result is never delivered twice.
 */
const armLateSuccess = (live: LiveNativeOpen): void => {
  void Promise.resolve(live.promise).then(
    (res) => {
      if (live.consumed) return;
      live.consumed = true;
      const parsed = parseNativeSuccess(res);
      if (!parsed) return;
      addBreadcrumb("payment", "razorpay:native-late-success", {
        order_prefix: live.orderId.slice(0, 14),
        listeners: lateSuccessListeners.size,
      });
      lateSuccessListeners.forEach((cb) => {
        try { cb(parsed); } catch { /* listener errors must not break others */ }
      });
    },
    () => { live.consumed = true; },
  );
};

const isAlreadyInProgress = (msg: string): boolean => /ALREADY_IN_PROGRESS/i.test(msg);

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
    // Razorpay's Android standard checkout expects `amount` as a NUMBER of
    // paise, exactly like the documented `options.put("amount", 50000)`.
    // Sending it as a string made the checkout Activity abort during option
    // validation — it never rendered and never returned a result.
    amount: Number(options.amount),
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
  // Android takes the theme colour as the FLAT key `theme.color`. Razorpay's
  // own troubleshooting page lists the nested `{ theme: { color } }` object as
  // a crash cause on the Android SDK ("theme color parameter is passed in
  // curly braces"), so the nested form is never sent.
  if (options.theme?.color) payload["theme.color"] = options.theme.color;

  // On a test key, ship the plain documented payload only: no method map, no
  // display blocks, no remember_customer. Those extras are what the test-mode
  // sheet chokes on.
  if (options.mode === "test") return payload;

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
    //
    // The bridge is the ONLY authority here. An earlier version also required
    // `document.visibilityState === "hidden"` before believing `dismissed:false`,
    // on the theory that "if our WebView is visible nothing can be on top of
    // it". That theory is wrong on Android: Razorpay's CheckoutActivity is a
    // translucent overlay, so the WebView frequently keeps reporting `visible`
    // while the sheet is fully open. The override made the watchdog abandon a
    // live sheet at the 5 s mark, the eventual success callback was dropped,
    // and the student landed back on an active "Pay" button with money already
    // captured (recording 2026-09-21 12:56). Trust the bridge.
    let dismissed = true;
    try {
      const res = (await plugin.cancel()) as { dismissed?: boolean } | undefined;
      if (res && res.dismissed === false) dismissed = false;
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

    // The loader resolves a `{ plugin }` container, never the bare Capacitor
    // proxy (a bare proxy is "thenable" and rejects with
    // `"RazorpayNative.then()" is not implemented on android` before open()).
    const { plugin: RazorpayNative } = await withTimeout(
      loadRazorpayNative(),
      BRIDGE_LOAD_TIMEOUT_MS,
      () => new RazorpayBridgeMissingError(),
    );
    onStep?.("sheet");
    // Handle to a sheet a PREVIOUS call may have left alive (watchdog gave up
    // but the Activity is still open). Captured before this call registers
    // itself, so `ALREADY_IN_PROGRESS` below can re-attach to it.
    const previous = liveNativeOpen;
    const openPromise = RazorpayNative.open(payload);
    // The watchdog can abandon this promise; keep a no-op handler so an
    // eventual native rejection never surfaces as an unhandled rejection.
    void Promise.resolve(openPromise).catch(() => {});
    const live: LiveNativeOpen = { orderId: options.order_id, promise: openPromise, consumed: false };
    liveNativeOpen = live;
    void Promise.resolve(openPromise).finally(() => {
      if (liveNativeOpen === live) liveNativeOpen = null;
    }).catch(() => {});
    try {
      result = await awaitNativeCheckoutResult(RazorpayNative, openPromise);
      live.consumed = true;
    } catch (inner: unknown) {
      const innerMsg = (inner as { message?: string } | null)?.message || String(inner ?? "");
      if (inner instanceof RazorpayLaunchTimeoutError || inner instanceof RazorpaySheetUnresponsiveError) {
        // We stopped waiting, but the Activity may still deliver. Route a
        // late signed success to onNativeCheckoutLateSuccess instead of
        // dropping it — the 2026-09-21 "Pay button still active after paying".
        armLateSuccess(live);
        throw inner;
      }
      if (isAlreadyInProgress(innerMsg)) {
        // The bridge refused because a sheet for a previous open() is still
        // alive. Re-attach to THAT call when we still hold it (same order),
        // otherwise surface a calm "finish the open payment" error. Never
        // fall through to the generic mapper: that produced the red
        // "A checkout is already open" toast on top of a live payment.
        live.consumed = true;
        if (previous && previous.orderId === options.order_id && !previous.consumed) {
          addBreadcrumb("payment", "razorpay:native-reattach", {
            order_prefix: options.order_id.slice(0, 14),
          });
          previous.consumed = true; // late-success channel must not double-deliver
          liveNativeOpen = previous; // keep tracking the sheet that is really open
          result = await awaitNativeCheckoutResult(RazorpayNative, previous.promise);
        } else {
          throw new RazorpayCheckoutBusyError();
        }
      } else {
        live.consumed = true;
        throw inner;
      }
    }
  } catch (e: unknown) {
    // Structural failures are re-thrown untouched so the caller can react
    // (fall back to web / show the "didn't open" message).
    if (e instanceof RazorpayLaunchTimeoutError) throw e;
    if (e instanceof RazorpayBridgeMissingError) throw e;
    if (e instanceof RazorpaySheetUnresponsiveError) throw e;
    if (e instanceof RazorpayCheckoutBusyError) throw e;
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
  type SignedFields = { razorpay_payment_id?: string; razorpay_order_id?: string; razorpay_signature?: string };
  const raw: unknown = result?.response ?? result;
  let parsed: SignedFields | undefined;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw) as SignedFields;
    } catch {
      // Legacy bridges can return only the payment id. Preserve the shape here
      // so the completeness check below raises a dedicated recovery error.
      parsed = { razorpay_payment_id: raw };
    }
  } else {
    parsed = (raw ?? undefined) as SignedFields | undefined;
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


/**
 * Human-readable one-block summary of a failed native checkout, for the
 * on-screen diagnostics panel and for support copy-paste. Deliberately free of
 * personal data: only order id, key mode, error name/code/step/description.
 */
export const describePayFailure = (
  error: unknown,
  ctx?: { order_id?: string; mode?: "test" | "live" | null },
): string => {
  const lines: string[] = [];
  if (ctx?.order_id) lines.push(`order: ${ctx.order_id}`);
  if (ctx?.mode) lines.push(`key mode: ${ctx.mode}`);
  const name = error instanceof Error ? error.name : typeof error;
  lines.push(`error: ${name}`);
  if (error instanceof RazorpayNativeError) {
    if (error.code) lines.push(`code: ${error.code}`);
    if (error.step) lines.push(`step: ${error.step}`);
    if (error.reason) lines.push(`reason: ${error.reason}`);
    if (error.source) lines.push(`source: ${error.source}`);
  } else {
    const fields = normalizeNativeError(error);
    if (fields.code) lines.push(`code: ${fields.code}`);
    if (fields.step) lines.push(`step: ${fields.step}`);
    if (fields.reason) lines.push(`reason: ${fields.reason}`);
  }
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message) lines.push(`message: ${message}`);
  lines.push(`at: ${new Date().toISOString()}`);
  return lines.join("\n");
};
