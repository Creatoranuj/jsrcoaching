import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Two payment/enrollment invariants that are easy to delete by accident:
 *
 * 1. The free-enrollment path must honour the same "Batch Full" gate as the
 *    paid path (`complete_paid_enrollment`), otherwise a closed batch can be
 *    joined for free.
 * 2. The automatic reconcile sweep must only run for an admin JWT or a
 *    correct, constant-time-compared cron secret — never anonymously.
 */
const FREE = resolve(__dirname, "../../supabase/functions/self-enroll-free/index.ts");
const RECONCILE = resolve(
  __dirname,
  "../../supabase/functions/reconcile-pending-payments/index.ts",
);
const WORKFLOW = resolve(__dirname, "../../.github/workflows/reconcile-payments.yml");

describe("free enrollment honours the batch gate", () => {
  const src = readFileSync(FREE, "utf8");

  it("calls course_availability before creating an enrollment", () => {
    expect(src).toMatch(/rpc\("course_availability"/);
    const gateAt = src.indexOf("course_availability");
    const insertAt = src.indexOf('.from("enrollments")\n      .insert(');
    expect(gateAt).toBeGreaterThan(0);
    expect(insertAt).toBeGreaterThan(gateAt);
  });

  it("refuses with BATCH_CLOSED when the batch is full", () => {
    expect(src).toMatch(/is_full[\s\S]{0,80}BATCH_CLOSED/);
  });

  it("fails closed when the gate cannot be read", () => {
    expect(src).toMatch(/AVAILABILITY_UNAVAILABLE/);
  });
});

describe("reconcile sweep auth", () => {
  const src = readFileSync(RECONCILE, "utf8");

  it("compares the cron secret in constant time", () => {
    expect(src).toMatch(/function timingSafeEqual/);
    expect(src).toMatch(/timingSafeEqual\(presentedSecret, CRON_SECRET\)/);
  });

  it("rejects a wrong or unconfigured cron secret", () => {
    expect(src).toMatch(/cron_secret_not_configured/);
    expect(src).toMatch(/isCron = timingSafeEqual/);
  });

  it("still requires an admin when no cron secret is presented", () => {
    expect(src).toMatch(/if \(!isCron\) \{[\s\S]*has_role[\s\S]*Forbidden/);
  });
});

describe("scheduled sweep workflow", () => {
  const yml = readFileSync(WORKFLOW, "utf8");

  it("runs every 15 minutes", () => {
    expect(yml).toMatch(/cron: '\*\/15 \* \* \* \*'/);
  });

  it("sends the cron secret header and never hardcodes it", () => {
    expect(yml).toMatch(/x-cron-secret: \$CRON_SECRET/);
    expect(yml).toMatch(/secrets\.RECONCILE_CRON_SECRET/);
  });
});
