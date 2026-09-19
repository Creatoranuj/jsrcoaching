import { describe, it, expect } from "vitest";
import { buildNativeCheckoutPayload, type NativeRazorpayOptions } from "@/utils/razorpayNative";

const base: NativeRazorpayOptions = {
  key: "rzp_test_abc123",
  amount: 49900,
  currency: "INR",
  name: "JSR COACHING",
  description: "Knowledge Hub",
  order_id: "order_ABC123XYZ",
};

describe("buildNativeCheckoutPayload", () => {
  it("sends the amount as a string of paise", () => {
    const payload = buildNativeCheckoutPayload(base);
    expect(payload.amount).toBe("49900");
    expect(typeof payload.amount).toBe("string");
  });

  it("keeps the server-created order id and key", () => {
    const payload = buildNativeCheckoutPayload(base);
    expect(payload.order_id).toBe("order_ABC123XYZ");
    expect(payload.key).toBe("rzp_test_abc123");
  });

  it("defaults currency to INR", () => {
    const payload = buildNativeCheckoutPayload({ ...base, currency: "" });
    expect(payload.currency).toBe("INR");
  });

  it("forwards the display config so the UPI block is pinned to the top", () => {
    const display = { blocks: { upi: { instruments: [{ method: "upi", flows: ["intent"] }] } }, sequence: ["block.upi"] };
    const payload = buildNativeCheckoutPayload({ ...base, config: { display } });
    expect(payload.config).toEqual({ display });
  });

  it("ignores a config without a display block", () => {
    const payload = buildNativeCheckoutPayload({ ...base, config: { junk: 1 } });
    expect(payload.config).toBeUndefined();
  });

  it("forwards the method map so UPI is explicitly requested", () => {
    const payload = buildNativeCheckoutPayload({
      ...base,
      method: { card: true, upi: true },
    });
    expect(payload.method).toEqual({ card: true, upi: true });
  });

  it("forwards remember_customer only when enabled", () => {
    expect(buildNativeCheckoutPayload({ ...base, remember_customer: true }).remember_customer).toBe(true);
    expect(buildNativeCheckoutPayload(base).remember_customer).toBeUndefined();
  });

  it("strips prefill.method so the UPI app tiles are not skipped", () => {
    const payload = buildNativeCheckoutPayload({
      ...base,
      prefill: { name: "A", email: "a@b.com", contact: "9999999999", method: "upi" },
    });
    expect(payload.prefill).toEqual({
      name: "A",
      email: "a@b.com",
      contact: "9999999999",
    });
  });

  it("omits prefill entirely when no usable field is present", () => {
    const payload = buildNativeCheckoutPayload({ ...base, prefill: { method: "upi" } });
    expect(payload.prefill).toBeUndefined();
  });

  it("forwards theme when provided", () => {
    const payload = buildNativeCheckoutPayload({ ...base, theme: { color: "#123456" } });
    expect(payload.theme).toEqual({ color: "#123456" });
  });

  it("never forwards unknown web-only keys", () => {
    const payload = buildNativeCheckoutPayload({
      ...base,
      // @ts-expect-error deliberately passing a web-only field
      modal: { confirm_close: true },
    });
    expect(Object.keys(payload).sort()).toEqual(
      ["amount", "currency", "description", "key", "name", "order_id"].sort()
    );
  });
});
