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
  RazorpayBridgeMissingError,
  RazorpayLaunchTimeoutError,
  NATIVE_LAUNCH_TIMEOUT_MS,
  NATIVE_RESUME_TIMEOUT_MS,
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
  cancelMock.mockReset().mockResolvedValue(undefined);
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
