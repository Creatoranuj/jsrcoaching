import { describe, it, expect } from "vitest";
import { loadAdminSnapshot } from "@/features/admin/lib/adminSnapshot";

/**
 * Minimal PostgREST-builder fake: every chained call returns the same
 * thenable, and the thenable resolves when the test releases it. Tracks the
 * order in which queries were *started* vs *resolved* so we can prove the
 * loader no longer waits for one round-trip before starting the next.
 */
function fakeSupabase(responses: Record<string, unknown>, log: string[]) {
  const releases: Array<() => void> = [];
  const from = (table: string) => {
    let key = table;
    const builder: any = {};
    const chain = (name: string) => (...args: unknown[]) => {
      if (name === "select" && typeof args[1] === "object" && (args[1] as any)?.head) key = `${table}:count`;
      if (name === "eq") key = `${key}:${args[0]}=${args[1]}`;
      return builder;
    };
    for (const m of ["select", "eq", "order", "ilike"]) builder[m] = chain(m);
    log.push(`start ${table}`);
    const promise = new Promise((resolve, reject) => {
      releases.push(() => {
        log.push(`resolve ${table}`);
        const r = responses[key] ?? responses[table];
        if (r instanceof Error) reject(r);
        else resolve(r ?? { data: [], error: null, count: 0 });
      });
    });
    builder.then = promise.then.bind(promise);
    builder.catch = promise.catch.bind(promise);
    builder.finally = promise.finally.bind(promise);
    return builder;
  };
  return { client: { from } as any, releaseAll: () => releases.splice(0).forEach((r) => r()) };
}

const profiles = [
  { id: "u1", full_name: "Asha", email: "a@x.in", mobile: null, created_at: "2026-01-01" },
  { id: "u2", full_name: "Bala", email: "b@x.in", mobile: null, created_at: "2026-01-02" },
];

describe("loadAdminSnapshot", () => {
  it("starts every query before any of them resolves (no waterfall)", async () => {
    const log: string[] = [];
    const { client, releaseAll } = fakeSupabase({}, log);
    const pending = loadAdminSnapshot(client);
    // All 8 requests are in flight before a single response arrived.
    expect(log.filter((l) => l.startsWith("start"))).toHaveLength(8);
    expect(log.some((l) => l.startsWith("resolve"))).toBe(false);
    releaseAll();
    const snap = await pending;
    expect(snap.failures).toEqual([]);
  });

  it("derives counters from fetched rows and joins profiles client-side", async () => {
    const log: string[] = [];
    const { client, releaseAll } = fakeSupabase(
      {
        courses: { data: [{ id: 30 }, { id: 34 }], error: null },
        "enrollments:status=active": { data: [{ course_id: 30 }, { course_id: 30 }, { course_id: 34 }], error: null },
        "enrollments:count": { count: 5, error: null },
        profiles: { data: profiles, error: null },
        payment_requests: {
          data: [
            { id: "p1", user_id: "u1", status: "Approved", amount: 500 },
            { id: "p2", user_id: "u2", status: "pending", amount: 300 },
            { id: "p3", user_id: "zz", status: "rejected", amount: 999 },
          ],
          error: null,
        },
        razorpay_payments: { data: [{ id: "r1", user_id: "u1", status: "COMPLETED", amount: 1200 }], error: null },
        user_roles: { data: [{ user_id: "u1", role: "student" }, { user_id: "u2", role: "admin" }], error: null },
        "user_sessions:count:is_active=true": { count: 7, error: null },
      },
      log,
    );
    const pending = loadAdminSnapshot(client);
    releaseAll();
    const snap = await pending;

    expect(snap.stats).toEqual({
      totalStudents: 1,
      totalCourses: 2,
      pendingPayments: 1,
      activeEnrollments: 5,
      totalRevenue: 1700,
      activeSessions: 7,
    });
    expect(snap.enrollmentCounts).toEqual({ 30: 2, 34: 1 });
    expect(snap.users.map((u) => [u.id, u.role])).toEqual([["u1", "student"], ["u2", "admin"]]);
    expect(snap.payments[0].profiles?.full_name).toBe("Asha");
    expect(snap.payments[2].profiles).toBeNull();
    expect(snap.razorpayPayments[0].profiles?.full_name).toBe("Asha");
  });

  it("keeps the rows that arrived when one query fails", async () => {
    const log: string[] = [];
    const { client, releaseAll } = fakeSupabase(
      {
        courses: { data: [{ id: 1 }], error: null },
        profiles: { data: profiles, error: null },
        razorpay_payments: { data: null, error: { message: "permission denied" } },
        user_roles: new Error("network down"),
      },
      log,
    );
    const pending = loadAdminSnapshot(client);
    releaseAll();
    const snap = await pending;
    expect(snap.courses).toHaveLength(1);
    expect(snap.users).toHaveLength(2);
    expect(snap.users.every((u) => u.role === null)).toBe(true);
    expect(snap.failures.sort()).toEqual(["razorpay", "roles"]);
  });
});
