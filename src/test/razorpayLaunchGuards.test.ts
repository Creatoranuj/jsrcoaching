import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Keep the plugin loader out of the way — these tests cover the guards that
// run *before* and *around* the native call, not the plugin itself.
const openMock = vi.fn();
const cancelMock = vi.fn();
const loadRazorpayNativeMock = vi.fn(async () => ({ plugin: { open: openMock, cancel: cancelMock } }));
vi.mock("@/lib/native/razorpay", () => ({
  loadRazorpayNative: () => loadRazorpayNativeMock(),
}));
vi.mock("@/lib/sentry", () => ({ addBreadcrumb: vi.fn() }));

const isPluginAvailable = vi.fn();
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isPluginAvailable: (name: string) => isPluginAvailable(name),
  },
}));

import {
  openNativeRazorpayCheckout,
  awaitNativeCheckoutResult,
  RazorpayBridgeMissingError,
  RazorpayLaunchTimeoutError,
  RazorpayInvalidResponseError,
  RazorpaySheetUnresponsiveError,
  RazorpayCheckoutBusyError,
  onNativeCheckoutLateSuccess,
  __resetNativeCheckoutStateForTests,
  RazorpayCancelledError,
  RazorpayNativeError,
  NATIVE_LAUNCH_TIMEOUT_MS,
  NATIVE_RESUME_TIMEOUT_MS,
  MAX_LIVE_SHEET_WAITS,
  BRIDGE_LOAD_TIMEOUT_MS,
  onWebViewBackgrounded,
  type NativeRazorpayOptions,
} from "@/utils/razorpayNative";
import { loadRazorpayScript, RAZORPAY_SCRIPT_TIMEOUT_MS } from "@/utils/razorpay";

const opts: NativeRazorpayOptions = {
  key: "rzp_live_abc123",
  amount: 19900,
  currency: "INR",
  name: "JSR COACHING",
  description: "Course",
  order_id: "order_Tb7VBFK0WeMNyQ",
};

/**
 * Silently pretend the WebView is (or isn't) the visible surface. No
 * visibilitychange event is dispatched, so the watchdog stays armed — these
 * tests exercise the foreground check inside the watchdog, not the listener.
 */
const setVisibilityStateSilently = (value: "visible" | "hidden") => {
  Object.defineProperty(document, "visibilityState", { value, configurable: true });
};

beforeEach(() => {
  setVisibilityStateSilently("visible");
  openMock.mockReset();
  loadRazorpayNativeMock.mockReset().mockImplementation(async () => ({ plugin: { open: openMock, cancel: cancelMock } }));
  // Default: the bridge confirms the native sheet is really gone.
  cancelMock.mockReset().mockResolvedValue({ dismissed: true });
  isPluginAvailable.mockReset().mockReturnValue(true);
  // No sheet is carried over between tests.
  __resetNativeCheckoutStateForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("native checkout launch guards", () => {
  it("still attempts the native sheet when the availability map says false", async () => {
    // A false availability reading is unreliable on some Android builds; the
    // app must try the in-app sheet instead of demoting the student to a browser.
    isPluginAvailable.mockReturnValue(false);
    openMock.mockResolvedValue({
      response: {
        razorpay_payment_id: "pay_1",
        razorpay_order_id: opts.order_id,
        razorpay_signature: "sig",
      },
    });
    await expect(openNativeRazorpayCheckout(opts)).resolves.toMatchObject({
      razorpay_payment_id: "pay_1",
    });
    expect(openMock).toHaveBeenCalledOnce();
  });

  it("reports a missing bridge only when the native call is unimplemented", async () => {
    openMock.mockRejectedValue(new Error('RazorpayNative does not have an implementation of "open".'));
    await expect(openNativeRazorpayCheckout(opts)).rejects.toBeInstanceOf(
      RazorpayBridgeMissingError,
    );
  });

  it("throws a launch timeout instead of hanging forever", async () => {
    vi.useFakeTimers();
    openMock.mockImplementation(() => new Promise(() => {}));
    const promise = openNativeRazorpayCheckout(opts);
    const assertion = expect(promise).rejects.toBeInstanceOf(RazorpayLaunchTimeoutError);
    await vi.advanceTimersByTimeAsync(NATIVE_LAUNCH_TIMEOUT_MS + 10);
    await assertion;
    expect(cancelMock).toHaveBeenCalledOnce();
  });

  it("disarms the watchdog once the sheet takes the foreground", async () => {
    vi.useFakeTimers();
    openMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          // Sheet opens -> WebView is backgrounded by the checkout Activity.
          setTimeout(() => {
            Object.defineProperty(document, "visibilityState", {
              value: "hidden",
              configurable: true,
            });
            document.dispatchEvent(new Event("visibilitychange"));
          }, 50);
          // User pays slowly, long after the launch timeout would have fired.
          setTimeout(
            () =>
              resolve({
                response: {
                  razorpay_payment_id: "pay_1",
                  razorpay_order_id: opts.order_id,
                  razorpay_signature: "sig",
                },
              }),
            NATIVE_LAUNCH_TIMEOUT_MS * 4,
          );
        }),
    );

    const promise = openNativeRazorpayCheckout(opts);
    await vi.advanceTimersByTimeAsync(NATIVE_LAUNCH_TIMEOUT_MS * 5);
    await expect(promise).resolves.toMatchObject({ razorpay_payment_id: "pay_1" });
  });

  it("stops waiting when the app is foregrounded again with no callback", async () => {
    vi.useFakeTimers();
    openMock.mockImplementation(() => new Promise(() => {}));
    const setVisibility = (value: string) => {
      Object.defineProperty(document, "visibilityState", { value, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    };
    const promise = openNativeRazorpayCheckout(opts);
    const assertion = expect(promise).rejects.toBeInstanceOf(RazorpayLaunchTimeoutError);
    await vi.advanceTimersByTimeAsync(10);
    setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(NATIVE_LAUNCH_TIMEOUT_MS * 3);
    setVisibility("visible");
    await vi.advanceTimersByTimeAsync(NATIVE_RESUME_TIMEOUT_MS + 10);
    await assertion;
  });

  it("keeps waiting while the bridge reports the native sheet is still open", async () => {
    vi.useFakeTimers();
    let settle: (v: unknown) => void = () => {};
    openMock.mockImplementation(() => new Promise((resolve) => { settle = resolve; }));
    // The Razorpay Activity is alive on top of us: cancel() must not tear it down.
    setVisibilityStateSilently("hidden");
    cancelMock.mockResolvedValue({ dismissed: false });

    const promise = openNativeRazorpayCheckout(opts);
    // Several watchdog windows pass with no native callback at all.
    await vi.advanceTimersByTimeAsync(NATIVE_LAUNCH_TIMEOUT_MS + NATIVE_RESUME_TIMEOUT_MS * 3 + 50);
    // The user finally completes payment on the still-open sheet.
    settle({
      response: {
        razorpay_payment_id: "pay_live",
        razorpay_order_id: opts.order_id,
        razorpay_signature: "sig_live",
      },
    });
    await expect(promise).resolves.toMatchObject({ razorpay_payment_id: "pay_live" });
  });

  it("gives up only once the bridge confirms the sheet was dismissed", async () => {
    vi.useFakeTimers();
    openMock.mockImplementation(() => new Promise(() => {}));
    setVisibilityStateSilently("hidden");
    cancelMock
      .mockResolvedValueOnce({ dismissed: false })
      .mockResolvedValue({ dismissed: true });

    const promise = openNativeRazorpayCheckout(opts);
    const assertion = expect(promise).rejects.toBeInstanceOf(RazorpayLaunchTimeoutError);
    await vi.advanceTimersByTimeAsync(NATIVE_LAUNCH_TIMEOUT_MS + NATIVE_RESUME_TIMEOUT_MS + 50);
    await assertion;
    expect(cancelMock).toHaveBeenCalledTimes(2);
  });

  it("never opens a web fallback under a sheet that stays alive past the ceiling", async () => {
    vi.useFakeTimers();
    // The bridge insists the Razorpay Activity is still on top, every time.
    setVisibilityStateSilently("hidden");
    cancelMock.mockResolvedValue({ dismissed: false });
    const openPromise = new Promise(() => {});
    const promise = awaitNativeCheckoutResult({ cancel: cancelMock }, openPromise);
    // Must NOT be the launch timeout (that triggers the caller's web fallback).
    const assertion = expect(promise).rejects.toBeInstanceOf(RazorpaySheetUnresponsiveError);
    await vi.advanceTimersByTimeAsync(
      NATIVE_LAUNCH_TIMEOUT_MS + NATIVE_RESUME_TIMEOUT_MS * (MAX_LIVE_SHEET_WAITS + 1) + 500,
    );
    await assertion;
    expect(cancelMock).toHaveBeenCalledTimes(MAX_LIVE_SHEET_WAITS + 1);
  });

  it("re-throws the unresponsive-sheet error untouched to the caller", async () => {
    vi.useFakeTimers();
    setVisibilityStateSilently("hidden");
    cancelMock.mockResolvedValue({ dismissed: false });
    openMock.mockImplementation(() => new Promise(() => {}));
    const promise = openNativeRazorpayCheckout(opts);
    const assertion = expect(promise).rejects.toBeInstanceOf(RazorpaySheetUnresponsiveError);
    await vi.advanceTimersByTimeAsync(
      NATIVE_LAUNCH_TIMEOUT_MS + NATIVE_RESUME_TIMEOUT_MS * (MAX_LIVE_SHEET_WAITS + 1) + 500,
    );
    await assertion;
  });

  it("keeps waiting on a live sheet even while our WebView still reports visible", async () => {
    vi.useFakeTimers();
    // Razorpay's CheckoutActivity is a TRANSLUCENT overlay, so Android keeps
    // reporting our WebView as "visible" while the sheet is fully open. An
    // earlier build treated that combination as a dead launch, abandoned a
    // live sheet, dropped the success callback, and left the student on an
    // active Pay button with money captured (recording 2026-09-21 12:56).
    // The bridge's dismissed:false is the only authority.
    setVisibilityStateSilently("visible");
    cancelMock.mockResolvedValue({ dismissed: false });
    openMock.mockImplementation(() => new Promise(() => {}));
    const promise = openNativeRazorpayCheckout(opts);
    const assertion = expect(promise).rejects.toBeInstanceOf(RazorpaySheetUnresponsiveError);
    await vi.advanceTimersByTimeAsync(NATIVE_LAUNCH_TIMEOUT_MS + 50);
    // Still waiting — NOT a launch timeout, so no web fallback is offered.
    await vi.advanceTimersByTimeAsync(
      NATIVE_RESUME_TIMEOUT_MS * (MAX_LIVE_SHEET_WAITS + 1) + 500,
    );
    await assertion;
  });

  it("waits long enough for a cold Razorpay Activity start", () => {
    // 5s tripped on mid-range phones during a cold start; the watchdog then
    // abandoned a sheet that was about to appear.
    expect(NATIVE_LAUNCH_TIMEOUT_MS).toBeGreaterThanOrEqual(8000);
  });

  it("delivers a signed success that arrives after the watchdog gave up", async () => {
    vi.useFakeTimers();
    __resetNativeCheckoutStateForTests();
    let settle: ((v: unknown) => void) | undefined;
    openMock.mockImplementation(() => new Promise((res) => { settle = res; }));
    const late: unknown[] = [];
    const stop = onNativeCheckoutLateSuccess((r) => late.push(r));

    const promise = openNativeRazorpayCheckout(opts);
    const assertion = expect(promise).rejects.toBeInstanceOf(RazorpayLaunchTimeoutError);
    await vi.advanceTimersByTimeAsync(NATIVE_LAUNCH_TIMEOUT_MS + 50);
    await assertion;

    // The Activity finally reports a captured, signed payment.
    settle?.({
      response: {
        razorpay_payment_id: "pay_late",
        razorpay_order_id: opts.order_id,
        razorpay_signature: "sig_late",
      },
    });
    await vi.advanceTimersByTimeAsync(10);
    expect(late).toEqual([
      { razorpay_payment_id: "pay_late", razorpay_order_id: opts.order_id, razorpay_signature: "sig_late" },
    ]);
    stop();
  });

  it("never forwards a partial late payload to verification", async () => {
    vi.useFakeTimers();
    __resetNativeCheckoutStateForTests();
    let settle: ((v: unknown) => void) | undefined;
    openMock.mockImplementation(() => new Promise((res) => { settle = res; }));
    const late: unknown[] = [];
    const stop = onNativeCheckoutLateSuccess((r) => late.push(r));

    const promise = openNativeRazorpayCheckout(opts);
    const assertion = expect(promise).rejects.toBeInstanceOf(RazorpayLaunchTimeoutError);
    await vi.advanceTimersByTimeAsync(NATIVE_LAUNCH_TIMEOUT_MS + 50);
    await assertion;

    // No signature → cannot be verified; webhook recovery owns this case.
    settle?.({ response: { razorpay_payment_id: "pay_partial" } });
    await vi.advanceTimersByTimeAsync(10);
    expect(late).toEqual([]);
    stop();
  });

  it("re-attaches to the live sheet instead of surfacing ALREADY_IN_PROGRESS", async () => {
    vi.useFakeTimers();
    __resetNativeCheckoutStateForTests();
    let settleFirst: ((v: unknown) => void) | undefined;
    openMock.mockImplementationOnce(() => new Promise((res) => { settleFirst = res; }));

    // First attempt: watchdog gives up, but the sheet is still alive.
    const first = openNativeRazorpayCheckout(opts);
    const firstAssertion = expect(first).rejects.toBeInstanceOf(RazorpayLaunchTimeoutError);
    await vi.advanceTimersByTimeAsync(NATIVE_LAUNCH_TIMEOUT_MS + 50);
    await firstAssertion;

    // Student taps Pay again for the SAME order: the bridge refuses because a
    // checkout is in flight. We must re-attach to that sheet, not show a red
    // "A checkout is already open" error.
    openMock.mockImplementationOnce(() => Promise.reject(new Error("ALREADY_IN_PROGRESS")));
    cancelMock.mockResolvedValue({ dismissed: false });
    const second = openNativeRazorpayCheckout(opts);
    await vi.advanceTimersByTimeAsync(50);
    settleFirst?.({
      response: {
        razorpay_payment_id: "pay_reattached",
        razorpay_order_id: opts.order_id,
        razorpay_signature: "sig_reattached",
      },
    });
    await vi.advanceTimersByTimeAsync(50);
    await expect(second).resolves.toMatchObject({ razorpay_payment_id: "pay_reattached" });
  });

  it("reports a busy checkout instead of a generic failure when re-attach is impossible", async () => {
    // WebView reloaded while the Activity stayed alive: no JS handle exists.
    __resetNativeCheckoutStateForTests();
    openMock.mockRejectedValue(new Error("ALREADY_IN_PROGRESS"));
    await expect(openNativeRazorpayCheckout(opts)).rejects.toBeInstanceOf(RazorpayCheckoutBusyError);
  });


  it("treats a bridge that never loads as a missing bridge instead of hanging", async () => {
    vi.useFakeTimers();
    loadRazorpayNativeMock.mockImplementation(() => new Promise(() => {}));
    const promise = openNativeRazorpayCheckout(opts);
    const assertion = expect(promise).rejects.toBeInstanceOf(RazorpayBridgeMissingError);
    await vi.advanceTimersByTimeAsync(BRIDGE_LOAD_TIMEOUT_MS + 50);
    await assertion;
    expect(openMock).not.toHaveBeenCalled();
  });

  it("maps the Activity-listener cancel payload (code 2, reason) to a cancellation", async () => {
    // Shape produced by RazorpayNativePlugin.deliverError() when Razorpay's
    // fragment hands MainActivity.onPaymentError(PAYMENT_CANCELED, ...).
    openMock.mockRejectedValue({
      code: "2",
      message: JSON.stringify({
        code: 2,
        description: '{"error":{"code":"BAD_REQUEST_ERROR","description":"Payment processing cancelled by user"}}',
        reason: "payment_cancelled",
        order_id: opts.order_id,
      }),
    });
    await expect(openNativeRazorpayCheckout(opts)).rejects.toBeInstanceOf(RazorpayCancelledError);
  });

  it("keeps structured fields from an Activity-listener failure payload", async () => {
    openMock.mockRejectedValue({
      code: "1",
      message: JSON.stringify({
        code: 1,
        description: '{"error":{"code":"BAD_REQUEST_ERROR","description":"Payment failed","step":"payment_authorization","reason":"payment_failed"}}',
        order_id: opts.order_id,
      }),
    });
    const err = await openNativeRazorpayCheckout(opts).catch((e) => e);
    expect(err).toBeInstanceOf(RazorpayNativeError);
    expect((err as RazorpayNativeError).step).toBe("payment_authorization");
    expect((err as RazorpayNativeError).reason).toBe("payment_failed");
  });

  it("rejects a partial success callback instead of sending unsigned data to verification", async () => {
    openMock.mockResolvedValue({
      response: {
        razorpay_payment_id: "pay_1",
        razorpay_order_id: opts.order_id,
      },
    });

    await expect(openNativeRazorpayCheckout(opts)).rejects.toBeInstanceOf(
      RazorpayInvalidResponseError,
    );
  });

  it("accepts only a complete signed native response", async () => {
    openMock.mockResolvedValue({
      response: {
        razorpay_payment_id: "pay_1",
        razorpay_order_id: opts.order_id,
        razorpay_signature: "sig_1",
      },
    });

    await expect(openNativeRazorpayCheckout(opts)).resolves.toEqual({
      razorpay_payment_id: "pay_1",
      razorpay_order_id: opts.order_id,
      razorpay_signature: "sig_1",
    });
  });
});

describe("onWebViewBackgrounded", () => {
  it("cleans up its listeners", () => {
    const cb = vi.fn();
    const stop = onWebViewBackgrounded(cb);
    stop();
    window.dispatchEvent(new Event("blur"));
    expect(cb).not.toHaveBeenCalled();
  });
});

describe("web checkout launch guards", () => {
  it("stops waiting when checkout.js never loads", async () => {
    vi.useFakeTimers();
    const promise = loadRazorpayScript();
    await vi.advanceTimersByTimeAsync(RAZORPAY_SCRIPT_TIMEOUT_MS + 10);
    await expect(promise).resolves.toBe(false);
  });
});
