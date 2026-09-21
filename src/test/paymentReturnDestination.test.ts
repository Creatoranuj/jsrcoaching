/**
 * Regressions for the 2026-09-21 UPI recordings.
 *
 * 1. The return link written by /pay must be readable by /payment-callback —
 *    they disagreed on parameter names and every browser-UPI return showed
 *    "Link poora nahi mila" while the course was already unlocked.
 * 2. Legacy links (older APKs, support links) must keep working.
 * 3. Every confirmed enrollment lands on the My Courses LIST, never a detail
 *    page — the owner's rule so no student panics about a missing course.
 * 4. The published App Link fingerprint must match the released APK, or
 *    Android silently refuses to open the app.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  parsePaymentReturnParams,
  buildPostEnrollmentPath,
  postEnrollmentState,
  buildPaymentReturnWebUrl,
  MY_COURSES_PATH,
} from "@/config/paymentReturn";

const parse = (qs: string) => parsePaymentReturnParams(new URLSearchParams(qs));

/** SHA-256 of the key that signs every released JSR Coaching APK. */
const RELEASE_SHA256 =
  "B2:8B:E6:52:FF:2A:CF:0E:BF:8E:90:63:C9:96:E3:A9:EF:B4:E2:60:E2:0C:E9:A9:55:D0:2A:C4:5B:AE:18:F5";

describe("payment return parser", () => {
  it("reads the shared names written by /pay", () => {
    expect(parse("payment=success&course=42&order=order_XYZ")).toEqual({
      courseId: 42,
      status: "success",
      orderId: "order_XYZ",
    });
  });

  it("still reads legacy links", () => {
    expect(parse("status=SUCCESS&course_id=7&razorpay_order_id=o_1")).toEqual({
      courseId: 7,
      status: "success",
      orderId: "o_1",
    });
    expect(parse("courseId=9&order_id=o_2").courseId).toBe(9);
  });

  it("rejects junk course ids instead of guessing", () => {
    for (const qs of ["course=abc", "course=-3", "course=1.5", "payment=success"]) {
      expect(parse(qs).courseId).toBeNull();
    }
  });

  it("round-trips the URL /pay actually builds", () => {
    const url = new URL(buildPaymentReturnWebUrl("success", { courseId: 42, orderId: "o_9" }));
    const out = parsePaymentReturnParams(url.searchParams);
    expect(out.courseId).toBe(42);
    expect(out.status).toBe("success");
  });
});

describe("post-enrollment destination", () => {
  it("always lands on the My Courses list, never a detail page", () => {
    const path = buildPostEnrollmentPath(42);
    expect(path.startsWith(`${MY_COURSES_PATH}?`)).toBe(true);
    expect(path).not.toMatch(/my-courses\/\d/);
  });

  it("carries the course hint both in the query and in router state", () => {
    expect(new URLSearchParams(buildPostEnrollmentPath(42).split("?")[1]).get("course")).toBe("42");
    expect(postEnrollmentState(42)).toEqual({ justPurchased: 42 });
    expect(postEnrollmentState(null)).toEqual({ justPurchased: undefined });
  });

  it("works without a course id", () => {
    expect(buildPostEnrollmentPath(null)).toBe(`${MY_COURSES_PATH}?payment=success`);
  });
});

describe("android app links", () => {
  const assetlinks = JSON.parse(readFileSync("public/.well-known/assetlinks.json", "utf8"));

  it("publishes the fingerprint of the key that signs released APKs", () => {
    const prints: string[] = assetlinks[0].target.sha256_cert_fingerprints;
    expect(prints.map((p) => p.toUpperCase())).toContain(RELEASE_SHA256);
  });

  it("targets the shipped package id", () => {
    expect(assetlinks[0].target.package_name).toBe("com.jsrcoaching.app");
  });
});
