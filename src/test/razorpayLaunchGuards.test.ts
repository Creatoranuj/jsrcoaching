import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Keep the plugin loader out of the way — these tests cover the guards that
// run *before* and *around* the native call, not the plugin itself.
const openMock = vi.fn();
const cancelMock = vi.fn();
vi.mock("@/lib/native/razorpay", () => ({
  loadRazorpayNative: async () => ({ open: openMock, cancel: cancelMock }),
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
  RazorpayCancelledError,
  RazorpayNativeError,
  NATIVE_LAUNCH_TIMEOUT_MS,
  NATIVE_RESUME_TIMEOUT_MS,
  MAX_LIVE_SHEET_WAITS,
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

beforeEach(() => {
  openMock.mockReset();
  // Default: the bridge confirms the native sheet is really gone.
  cancelMock.mockReset().mockResolvedValue({ dismissed: true });
  isPluginAvailable.mockReset().mockReturnValue(true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("native checkout launch guards", () => {
  it("fails fast when the APK has no RazorpayNative bridge", async () => {
    isPluginAvailable.mockReturnValue(false);
    await expect(openNativeRazorpayCheckout(opts)).rejects.toBeInstanceOf(
      RazorpayBridgeMissingError,
    );
    expect(openMock).not.toHaveBeenCalled();
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
    // The Razorpay Activity is alive: cancel() must not tear it down.
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
    cancelMock.mockResolvedValue({ dismissed: false });
    openMock.mockImplementation(() => new Promise(() => {}));
    const promise = openNativeRazorpayCheckout(opts);
    const assertion = expect(promise).rejects.toBeInstanceOf(RazorpaySheetUnresponsiveError);
    await vi.advanceTimersByTimeAsync(
      NATIVE_LAUNCH_TIMEOUT_MS + NATIVE_RESUME_TIMEOUT_MS * (MAX_LIVE_SHEET_WAITS + 1) + 500,
    );
    await assertion;
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
