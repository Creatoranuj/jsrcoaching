import { describe, it, expect } from "vitest";
import {
  toInternalPath,
  APP_SCHEME,
  APP_LINK_HOSTS,
} from "@/config/deepLinks";

describe("deep links", () => {
  it("accepts the production app-link host", () => {
    expect(APP_LINK_HOSTS).toContain("sadguruclasses.vercel.app");
    expect(toInternalPath("https://sadguruclasses.vercel.app/course/12")).toBe("/course/12");
  });

  it("rejects the retired/foreign host", () => {
    expect(toInternalPath("https://safarenglishka.vercel.app/course/12")).toBeNull();
    expect(toInternalPath("https://evil.example.com/dashboard")).toBeNull();
  });

  it("rejects unclaimed paths on a trusted host", () => {
    expect(toInternalPath("https://sadguruclasses.vercel.app/admin")).toBeNull();
  });

  it("preserves payment-callback query params over the custom scheme", () => {
    const url = `${APP_SCHEME}://payment-callback?razorpay_payment_id=pay_1&razorpay_order_id=order_1&razorpay_signature=sig&course_id=7`;
    const path = toInternalPath(url);
    expect(path).toBe(
      "/payment-callback?razorpay_payment_id=pay_1&razorpay_order_id=order_1&razorpay_signature=sig&course_id=7",
    );
  });

  it("preserves hash anchors", () => {
    expect(toInternalPath("https://sadguruclasses.vercel.app/lesson/9#t=120")).toBe("/lesson/9#t=120");
  });

  it("rejects unknown schemes and garbage", () => {
    expect(toInternalPath("myapp://course/1")).toBeNull();
    expect(toInternalPath("not a url")).toBeNull();
  });

  it("only allows preview hosts when dev flag is set", () => {
    const preview = "https://id-preview--4073789d-46b9-4e05-8999-7aaeebbeb47b.lovable.app/dashboard";
    expect(toInternalPath(preview)).toBeNull();
    expect(toInternalPath(preview, { dev: true })).toBe("/dashboard");
  });
});
