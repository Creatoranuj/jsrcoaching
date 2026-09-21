/**
 * Regression guard — "paid but My Courses still empty".
 *
 * The browser-UPI path refreshed the enrollment caches the moment the server
 * confirmed the enrollment; the in-app checkout did not, so a freshly paid
 * course could stay hidden behind a stale cache for up to a minute.
 *
 * These assertions are source-level on purpose: they pin the *call sites*, so
 * a future refactor that drops one of them fails here instead of in a
 * student's hands.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("enrollment cache invalidation", () => {
  const buyCourse = read("src/pages/BuyCourse.tsx");

  it("BuyCourse imports the shared freshness helper", () => {
    expect(buyCourse).toContain("markEnrollmentChanged");
  });

  it("every enrollment success path in BuyCourse refreshes the caches", () => {
    // free enrollment, already-enrolled, recovered-on-open,
    // ALREADY_ENROLLED/ALREADY_PAID, verify success, recovery after verify
    const calls = buyCourse.match(/markEnrollmentChanged\(/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(6);
  });

  it("redirect after a successful payment is not artificially slow", () => {
    const m = buyCourse.match(/payment=success[\s\S]{0,200}?\}, (\d+)\);/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeLessThanOrEqual(800);
  });

  const paymentSync = read("src/hooks/usePaymentSync.ts");

  it("usePaymentSync uses the shared rate-limit-safe poller", () => {
    expect(paymentSync).toContain("waitForEnrollment");
    expect(paymentSync).not.toMatch(/POLL_INTERVAL_MS\s*=\s*3000/);
  });

  it("usePaymentSync refreshes caches once the server confirms", () => {
    expect(paymentSync).toContain("markEnrollmentChanged");
  });

  const helper = read("src/lib/enrollmentFreshness.ts");

  it("the helper drops all three stale caches", () => {
    expect(helper).toContain("invalidateEnrollmentsCache");
    expect(helper).toContain("MYCOURSES_CACHE_PREFIX");
    expect(helper).toContain("clearBundle");
  });

  it("My Courses reads its snapshot from the shared key", () => {
    expect(read("src/pages/MyCourses.tsx")).toContain(
      "const CACHE_PREFIX = MYCOURSES_CACHE_PREFIX;",
    );
  });
});
