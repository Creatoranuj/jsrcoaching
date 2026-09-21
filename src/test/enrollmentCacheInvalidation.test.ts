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
    // ALREADY_ENROLLED/ALREADY_PAID — verify success + recovery-after-verify
    // now live in the settlement engine (src/lib/paymentEngine.ts).
    const calls = buyCourse.match(/markEnrollmentChanged\(/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(4);
    const engine = read("src/lib/paymentEngine.ts");
    expect(engine).toContain("markEnrollmentChanged(");
    expect(engine).toContain("clearPendingPayment()");
  });

  it("redirect after a successful payment is immediate (no artificial wait)", () => {
    const delayed = buyCourse.match(/payment=success[\s\S]{0,200}?\}, (\d+)\);/g) ?? [];
    for (const m of delayed) {
      const n = Number(/\}, (\d+)\);$/.exec(m)?.[1] ?? 0);
      expect(n).toBeLessThanOrEqual(800);
    }
    expect(buyCourse).not.toContain("redirectTimerRef");
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
