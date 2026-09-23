import { describe, it, expect, afterEach, vi } from "vitest";
import {
  toInternalPath,
  APP_SCHEME,
  APP_LINK_HOSTS,
} from "@/config/deepLinks";

const RealURL = globalThis.URL;

/**
 * Emulates Chromium ≤ 129 (Android System WebView 109 on the CI emulator):
 * a non-special scheme such as `com.jsrcoaching.app://classes/30/lessons` is
 * parsed as an opaque path — `host`/`hostname` are "" and `pathname` keeps the
 * authority slashes ("//classes/30/lessons"). Two-argument construction with
 * an https base behaves like every modern engine.
 */
class LegacyChromiumURL extends RealURL {
  constructor(input: string | URL, base?: string | URL) {
    super(input, base);
    const raw = String(input);
    if (base === undefined && raw.toLowerCase().startsWith(`${APP_SCHEME}:`)) {
      const after = raw.slice(APP_SCHEME.length + 1);
      const hashAt = after.indexOf("#");
      const beforeHash = hashAt >= 0 ? after.slice(0, hashAt) : after;
      const queryAt = beforeHash.indexOf("?");
      const pathname = queryAt >= 0 ? beforeHash.slice(0, queryAt) : beforeHash;
      Object.defineProperty(this, "host", { value: "" });
      Object.defineProperty(this, "hostname", { value: "" });
      Object.defineProperty(this, "pathname", { value: pathname });
    }
  }
}

describe("deep links", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts the production app-link host", () => {
    expect(APP_LINK_HOSTS).toContain("jsrcoaching.vercel.app");
    expect(toInternalPath("https://jsrcoaching.vercel.app/course/12")).toBe("/course/12");
  });

  it("rejects the retired/foreign host", () => {
    // Pre-rebrand project name; it no longer resolves and must not be trusted.
    expect(toInternalPath("https://sadguruclasses.vercel.app/course/12")).toBeNull();
    expect(toInternalPath("https://safarenglishka.vercel.app/course/12")).toBeNull();
    expect(toInternalPath("https://evil.example.com/dashboard")).toBeNull();
  });

  it("rejects unclaimed paths on a trusted host", () => {
    expect(toInternalPath("https://jsrcoaching.vercel.app/admin")).toBeNull();
  });

  it("preserves payment-callback query params over the custom scheme", () => {
    const url = `${APP_SCHEME}://payment-callback?razorpay_payment_id=pay_1&razorpay_order_id=order_1&razorpay_signature=sig&course_id=7`;
    const path = toInternalPath(url);
    expect(path).toBe(
      "/payment-callback?razorpay_payment_id=pay_1&razorpay_order_id=order_1&razorpay_signature=sig&course_id=7",
    );
  });

  it("preserves hash anchors", () => {
    expect(toInternalPath("https://jsrcoaching.vercel.app/lesson/9#t=120")).toBe("/lesson/9#t=120");
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

  it("routes a lesson deep link over the custom scheme (query + hash intact)", () => {
    const url = `${APP_SCHEME}://classes/30/lessons?lessonId=8ee50b50&tab=comments&from=maestro#t=42`;
    expect(toInternalPath(url)).toBe(
      "/classes/30/lessons?lessonId=8ee50b50&tab=comments&from=maestro#t=42",
    );
    // Bare scheme root and a scheme-only launch stay on "/".
    expect(toInternalPath(`${APP_SCHEME}://`)).toBe("/");
    expect(toInternalPath(`${APP_SCHEME}:`)).toBe("/");
  });

  it("still rejects unclaimed or traversing paths over the custom scheme", () => {
    expect(toInternalPath(`${APP_SCHEME}://admin`)).toBeNull();
    // Dot segments are normalised before the allow-list check, so a claimed
    // prefix cannot be used as a springboard into an unclaimed surface.
    expect(toInternalPath(`${APP_SCHEME}://classes/../admin`)).toBeNull();
    expect(toInternalPath(`${APP_SCHEME}://classes/30/../../admin/users`)).toBeNull();
    // Backslashes are not a bypass either (special-scheme parsing folds them).
    expect(toInternalPath(`${APP_SCHEME}:\\\\admin`)).toBeNull();
  });

  describe("on legacy Chromium (WebView < 130) that parses non-special schemes host-less", () => {
    it("the stub reproduces the engine quirk the app used to trip over", () => {
      vi.stubGlobal("URL", LegacyChromiumURL);
      const u = new URL(`${APP_SCHEME}://classes/30/lessons?lessonId=1`);
      expect(u.host).toBe("");
      expect(u.pathname).toBe("//classes/30/lessons");
    });

    it("still routes lesson deep links and the Razorpay payment return", () => {
      vi.stubGlobal("URL", LegacyChromiumURL);
      expect(
        toInternalPath(`${APP_SCHEME}://classes/30/lessons?lessonId=8ee50b50&tab=comments`),
      ).toBe("/classes/30/lessons?lessonId=8ee50b50&tab=comments");
      expect(
        toInternalPath(`${APP_SCHEME}://payment-callback?razorpay_payment_id=pay_1&course_id=7`),
      ).toBe("/payment-callback?razorpay_payment_id=pay_1&course_id=7");
      expect(toInternalPath(`${APP_SCHEME}://reset-password#access_token=abc`)).toBe(
        "/reset-password#access_token=abc",
      );
    });

    it("keeps rejecting unclaimed paths", () => {
      vi.stubGlobal("URL", LegacyChromiumURL);
      expect(toInternalPath(`${APP_SCHEME}://admin`)).toBeNull();
      expect(toInternalPath(`${APP_SCHEME}://classes/../admin`)).toBeNull();
    });
  });
});
