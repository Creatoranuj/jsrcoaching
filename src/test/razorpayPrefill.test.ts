import { describe, it, expect } from "vitest";
import {
  sanitizeRazorpayContact,
  buildRazorpayPrefill,
  UPI_FIRST_CHECKOUT_CONFIG,
} from "../utils/razorpay";

describe("sanitizeRazorpayContact", () => {
  it("strips spaces and the +91 country prefix", () => {
    expect(sanitizeRazorpayContact("+91 73884 59249")).toBe("7388459249");
    expect(sanitizeRazorpayContact("917388459249")).toBe("7388459249");
    expect(sanitizeRazorpayContact("+91-7388-459-249")).toBe("7388459249");
    expect(sanitizeRazorpayContact("07388459249")).toBe("7388459249");
    expect(sanitizeRazorpayContact("7388459249")).toBe("7388459249");
  });

  it("omits anything that is not a valid 10-digit Indian mobile", () => {
    expect(sanitizeRazorpayContact(null)).toBeUndefined();
    expect(sanitizeRazorpayContact("")).toBeUndefined();
    expect(sanitizeRazorpayContact("12345")).toBeUndefined();
    expect(sanitizeRazorpayContact("1234567890")).toBeUndefined(); // bad first digit
    expect(sanitizeRazorpayContact("not-a-number")).toBeUndefined();
  });
});

describe("buildRazorpayPrefill", () => {
  it("includes contact + upi method when the number is valid", () => {
    expect(
      buildRazorpayPrefill({ name: "Anuj", email: "a@b.com", contact: "+917388459249" })
    ).toEqual({ name: "Anuj", email: "a@b.com", contact: "7388459249", method: "upi" });
  });

  it("omits contact and method entirely when the number is missing/invalid", () => {
    expect(buildRazorpayPrefill({ name: "Anuj", email: "a@b.com", contact: null })).toEqual({
      name: "Anuj",
      email: "a@b.com",
    });
    expect(buildRazorpayPrefill({})).toEqual({ name: "", email: "" });
  });
});

describe("UPI_FIRST_CHECKOUT_CONFIG", () => {
  it("exposes both intent and collect UPI flows so app tiles render", () => {
    const instruments =
      UPI_FIRST_CHECKOUT_CONFIG.config.display.blocks.upi.instruments;
    const flows = instruments.flatMap((i) => [...i.flows]);
    expect(flows).toContain("intent");
    expect(flows).toContain("collect");
  });

  it("pins the UPI block to the top and keeps default blocks visible", () => {
    expect(UPI_FIRST_CHECKOUT_CONFIG.config.display.sequence).toEqual(["block.upi"]);
    expect(
      UPI_FIRST_CHECKOUT_CONFIG.config.display.preferences.show_default_blocks
    ).toBe(true);
    expect(UPI_FIRST_CHECKOUT_CONFIG.method.upi).toBe(true);
    expect(UPI_FIRST_CHECKOUT_CONFIG.remember_customer).toBe(true);
  });
});
