import { describe, it, expect, vi, beforeEach } from "vitest";

const recoverEnrollmentDetailed = vi.fn();
vi.mock("@/utils/paymentApi", () => ({
  recoverEnrollmentDetailed: (...a: unknown[]) => recoverEnrollmentDetailed(...a),
}));
const invalidateEnrollmentsCache = vi.fn();
vi.mock("@/hooks/useEnrollments", () => ({
  invalidateEnrollmentsCache: () => invalidateEnrollmentsCache(),
}));

const maybeSingle = vi.fn();
vi.mock("@/integrations/supabase/client", () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    limit: () => chain,
    maybeSingle: () => maybeSingle(),
  };
  return {
    supabase: {
      from: () => chain,
      auth: { getSession: async () => ({ data: { session: { user: { id: "u1" } } } }) },
    },
  };
});

import {
  RECONCILE_SCHEDULE_MS,
  DIRECT_CHECK_INTERVAL_MS,
  ENROLLMENT_LANDED_EVENT,
  hasActiveEnrollment,
  waitForEnrollment,
  announceEnrollmentLanded,
  onEnrollmentLanded,
} from "@/utils/reconcileEnrollment";

beforeEach(() => {
  recoverEnrollmentDetailed.mockReset().mockResolvedValue({ outcome: "not-yet" });
  invalidateEnrollmentsCache.mockReset();
  maybeSingle.mockReset().mockResolvedValue({ data: null, error: null });
});

describe("enrollment reconciliation", () => {
  it("never exceeds the server's 5-calls-per-60s recovery budget", () => {
    // check_rate_limit('recover-enrollment') allows 5 calls / 60s per user.
    // Any schedule that breaks this turns real 429s into invisible "not-yet"s.
    const times: number[] = [];
    let t = 0;
    for (const gap of RECONCILE_SCHEDULE_MS) {
      t += gap;
      times.push(t);
    }
    for (const start of times) {
      const inWindow = times.filter((x) => x >= start && x < start + 60_000).length;
      expect(inWindow).toBeLessThanOrEqual(4);
    }
    // And it still covers a slow UPI settlement.
    expect(times[times.length - 1]).toBeGreaterThanOrEqual(240_000);
  });

  it("checks the student's own enrollment row often while waiting", () => {
    expect(DIRECT_CHECK_INTERVAL_MS).toBeLessThanOrEqual(5000);
  });

  it("returns immediately when the webhook already enrolled the student", async () => {
    maybeSingle.mockResolvedValue({ data: { id: 7 }, error: null });
    await expect(waitForEnrollment(35, { userId: "u1" })).resolves.toBe("recovered");
    // No recovery budget spent at all.
    expect(recoverEnrollmentDetailed).not.toHaveBeenCalled();
    expect(invalidateEnrollmentsCache).toHaveBeenCalled();
  });

  it("treats a read failure as 'not enrolled yet' instead of throwing", async () => {
    maybeSingle.mockRejectedValue(new Error("network"));
    await expect(hasActiveEnrollment(35, "u1")).resolves.toBe(false);
    maybeSingle.mockResolvedValue({ data: null, error: { message: "rls" } });
    await expect(hasActiveEnrollment(35, "u1")).resolves.toBe(false);
  });

  it("stops as soon as the caller cancels", async () => {
    await expect(waitForEnrollment(35, { userId: "u1", isCancelled: () => true }))
      .resolves.toBe("cancelled");
  });

  it("broadcasts a landing only to listeners of that course", async () => {
    const hits: string[] = [];
    const stopA = onEnrollmentLanded(35, (d) => hits.push(`35:${d.source}`));
    const stopB = onEnrollmentLanded(34, (d) => hits.push(`34:${d.source}`));
    announceEnrollmentLanded(35, "recovery");
    expect(hits).toEqual(["35:recovery"]);
    stopA();
    stopB();
    announceEnrollmentLanded(35, "direct");
    expect(hits).toEqual(["35:recovery"]);
    expect(ENROLLMENT_LANDED_EVENT).toBe("nb:enrollment-landed");
  });
});
