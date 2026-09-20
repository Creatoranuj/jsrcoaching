import { describe, it, expect } from "vitest";
import {
  buildPaymentReturnUrl,
  buildPaymentReturnIntentUrl,
  buildPaymentReturnWebUrl,
  RETURN_HANDOFF_STEP_MS,
} from "../config/paymentReturn";
import { APP_SCHEME, APP_LINK_HOSTS, toInternalPath } from "../config/deepLinks";

const opts = { courseId: 34, orderId: "order_TEST123" };

describe("payment return hand-off chain", () => {
  it("hop 1 is the custom scheme deep link", () => {
    const url = buildPaymentReturnUrl("success", opts);
    expect(url.startsWith(`${APP_SCHEME}://payment-callback?`)).toBe(true);
    expect(url).toContain("course=34");
    expect(url).toContain("order=order_TEST123");
  });

  it("hop 2 is an Android intent URL carrying the same params and a package", () => {
    const url = buildPaymentReturnIntentUrl("success", opts);
    expect(url.startsWith("intent://payment-callback?")).toBe(true);
    expect(url).toContain(`package=${APP_SCHEME}`);
    expect(url).toContain(`scheme=${APP_SCHEME}`);
    expect(url).toContain("course=34");
    expect(url.endsWith(";end")).toBe(true);
  });

  it("hop 2 falls back to the website when the app is not installed", () => {
    const url = buildPaymentReturnIntentUrl("cancelled", opts);
    const fallback = decodeURIComponent(
      url.split("S.browser_fallback_url=")[1].split(";")[0],
    );
    expect(fallback).toBe(buildPaymentReturnWebUrl("cancelled", opts));
  });

  it("hop 3 is the verified https App Link on the live host", () => {
    const url = buildPaymentReturnWebUrl("success", opts);
    expect(url.startsWith(`https://${APP_LINK_HOSTS[0]}/payment-callback?`)).toBe(true);
  });

  it("the https hop is routed back into the app by the deep-link whitelist", () => {
    const path = toInternalPath(buildPaymentReturnWebUrl("success", opts));
    expect(path).not.toBeNull();
    expect(path).toContain("/payment-callback");
    expect(path).toContain("course=34");
  });

  it("every hop reports the same status", () => {
    for (const status of ["success", "cancelled"] as const) {
      expect(buildPaymentReturnUrl(status, opts)).toContain(`payment=${status}`);
      expect(buildPaymentReturnIntentUrl(status, opts)).toContain(`payment=${status}`);
      expect(buildPaymentReturnWebUrl(status, opts)).toContain(`payment=${status}`);
    }
  });

  it("leaves enough time between hops for the app to take over", () => {
    expect(RETURN_HANDOFF_STEP_MS).toBeGreaterThanOrEqual(800);
    expect(RETURN_HANDOFF_STEP_MS).toBeLessThanOrEqual(3000);
  });
});
