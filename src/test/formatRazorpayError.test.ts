import { describe, it, expect } from "vitest";
import { formatRazorpayError } from "@/utils/razorpay";

/**
 * Sprint 1 regression guard — Razorpay BAD_REQUEST_ERROR + opaque failures.
 *
 * Real user reports: Razorpay fires `payment.failed` with
 *   { code: "BAD_REQUEST_ERROR", description: "undefined", source: "customer" }
 * and the CTA used to render the literal string "undefined". This suite locks
 * the mapping so any regression (someone deletes a branch, or Razorpay adds a
 * new opaque shape we don't handle) is caught in CI, not by a paying student.
 */
describe("formatRazorpayError", () => {
  const forbidden = /^undefined$|\bundefined\b\.?$/i;

  it("never returns the literal string 'undefined' for null/empty errors", () => {
    expect(formatRazorpayError(undefined)).not.toMatch(forbidden);
    expect(formatRazorpayError(null as any)).not.toMatch(forbidden);
    expect(formatRazorpayError({} as any)).not.toMatch(forbidden);
  });

  it("maps BAD_REQUEST_ERROR with description='undefined' to a friendly retry message", () => {
    const msg = formatRazorpayError({
      code: "BAD_REQUEST_ERROR",
      description: "undefined",
      source: "customer",
      step: "payment_authentication",
      reason: "",
    });
    // payment_authentication branch wins — must mention OTP / retry.
    expect(msg).toMatch(/OTP|3-D|retry|UPI|card/i);
    expect(msg).not.toMatch(forbidden);
  });

  it("maps a bare BAD_REQUEST_ERROR (no step) to a retry message", () => {
    const msg = formatRazorpayError({
      code: "BAD_REQUEST_ERROR",
      description: "undefined",
      source: "customer",
    });
    expect(msg).toMatch(/retry|UPI|card/i);
    expect(msg).not.toMatch(forbidden);
  });

  it("maps payment_authentication step to OTP / 3DS copy", () => {
    const msg = formatRazorpayError({ step: "payment_authentication", reason: "" });
    expect(msg).toMatch(/OTP|3-D|bank/i);
  });

  it("maps payment_cancelled to a no-charge message", () => {
    expect(formatRazorpayError({ reason: "payment_cancelled" })).toMatch(/cancelled/i);
  });

  it("maps network_error to a connection retry", () => {
    expect(formatRazorpayError({ reason: "network_error" })).toMatch(/network|connection/i);
  });

  it("maps gateway_error to bank-down copy", () => {
    expect(formatRazorpayError({ reason: "gateway_error" })).toMatch(/gateway|bank/i);
  });

  it("maps international_transaction_not_allowed to Indian-card guidance", () => {
    expect(
      formatRazorpayError({ reason: "international_transaction_not_allowed" })
    ).toMatch(/international|indian|upi/i);
  });

  it("maps invalid_otp to a wrong-OTP message", () => {
    expect(formatRazorpayError({ reason: "invalid_otp" })).toMatch(/otp/i);
  });

  it("maps payment_timeout to a timeout retry", () => {
    expect(formatRazorpayError({ reason: "payment_timeout" })).toMatch(/timed out|retry/i);
  });

  it("falls through to reason/code fallback but still hides 'undefined'", () => {
    const msg = formatRazorpayError({ reason: "some_new_reason", description: "undefined" });
    expect(msg).toMatch(/some_new_reason|failed|retry/i);
    expect(msg).not.toMatch(forbidden);
  });

  it("preserves a real Razorpay description when present", () => {
    const msg = formatRazorpayError({
      code: "BAD_REQUEST_ERROR",
      description: "Your card was declined by the issuing bank.",
      source: "customer",
    });
    expect(msg).toContain("Your card was declined by the issuing bank.");
  });
});
