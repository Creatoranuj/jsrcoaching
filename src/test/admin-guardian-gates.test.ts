import { describe, expect, it } from "vitest";
import { buildGates, type GuardianSnapshot } from "@/pages/AdminGuardian";

const clean: GuardianSnapshot = {
  checked_at: new Date().toISOString(),
  rls: { total: 91, off: [] },
  profiles_role_column: false,
  enrollment_insert_policies: [
    {
      name: "admins manage enrollments",
      with_check: "has_role(auth.uid(), 'admin')",
      admin_only: true,
      checks_price: false,
      checks_payment: false,
    },
  ],
  user_roles_open_write_policies: 0,
  buckets: { total: 12, public: [] },
  definer_without_search_path: [],
  open_write_policies: [],
  policy_regressions: 0,
  cron_jobs: [{ name: "purge-otps", schedule: "*/30 * * * *", active: true }],
  top_tables: [{ table: "lessons", rows: 900, bytes: 2048 }],
  payments: { completed: 20, missing_enrollment: 0 },
};

const state = (s: GuardianSnapshot, id: string) =>
  buildGates(s).find((g) => g.id === id)?.state;

describe("Backend Guardian gates", () => {
  it("marks a fully hardened backend green", () => {
    // leaked-password is a dashboard-only setting: it stays neutral by design.
    const auto = buildGates(clean).filter((g) => g.id !== "leaked-password");
    expect(auto.every((g) => g.state === "ok")).toBe(true);
  });

  it("flags a table left without protection rules", () => {
    expect(state({ ...clean, rls: { total: 91, off: ["leads"] } }, "rls")).toBe("bad");
  });

  it("flags an enrollment rule that checks neither admin nor payment", () => {
    const risky: GuardianSnapshot = {
      ...clean,
      enrollment_insert_policies: [
        {
          name: "anyone can enroll",
          with_check: "true",
          admin_only: false,
          checks_price: false,
          checks_payment: false,
        },
      ],
    };
    expect(state(risky, "enroll")).toBe("bad");
  });

  it("flags roles that non-admins could change", () => {
    expect(state({ ...clean, user_roles_open_write_policies: 1 }, "roles")).toBe("bad");
    expect(state({ ...clean, profiles_role_column: true }, "roles")).toBe("bad");
  });

  it("flags a wide-open write rule and an unsafe server helper", () => {
    expect(
      state(
        { ...clean, open_write_policies: [{ table: "notes", policy: "all", cmd: "ALL" }] },
        "open-write",
      ),
    ).toBe("bad");
    expect(
      state({ ...clean, definer_without_search_path: ["risky_fn"] }, "definer"),
    ).toBe("bad");
  });

  it("flags completed payments without course access", () => {
    expect(
      state({ ...clean, payments: { completed: 20, missing_enrollment: 2 } }, "payments"),
    ).toBe("bad");
  });

  it("stays neutral when scheduled jobs cannot be read", () => {
    expect(state({ ...clean, cron_jobs: null }, "cron")).toBe("unknown");
  });
});

describe("Leaked-password gate", () => {
  it("stays neutral and explains the dashboard click", () => {
    const gate = buildGates(clean).find((g) => g.id === "leaked-password");
    expect(gate?.state).toBe("unknown");
    expect(gate?.detail).toMatch(/dashboard/i);
  });
});
