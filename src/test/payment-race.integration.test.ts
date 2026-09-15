/**
 * Red-team regression: verify/webhook concurrency race on paid enrollment.
 *
 * `verify-razorpay-payment` and `razorpay-webhook` can both land for the same
 * order at the same moment. Both call `public.complete_paid_enrollment`, which
 * must be atomic + idempotent: exactly ONE active enrollment, payment marked
 * completed once, no duplicate rows.
 *
 * The race test needs a service-role key and a throwaway user/course, so it
 * self-skips unless TEST_SERVICE_ROLE_KEY / TEST_RACE_USER_ID /
 * TEST_PAID_COURSE_ID are provided (CI). The anon-hardening test always runs.
 */
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const URL = (import.meta.env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL) as string;
const ANON = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY) as string;

const SERVICE = process.env.TEST_SERVICE_ROLE_KEY;
const RACE_USER = process.env.TEST_RACE_USER_ID;
const COURSE_ID = Number(process.env.TEST_PAID_COURSE_ID ?? 0);

// Without a Supabase URL/key (local dev, forks without secrets) createClient
// throws at collection time and paints CI red for a missing env var, not a bug.
const exposureIf = URL && ANON ? describe : describe.skip;

exposureIf("complete_paid_enrollment — exposure", () => {
  it("is NOT callable with the anon/publishable key", async () => {
    const anon = createClient(URL, ANON);
    const { error } = await anon.rpc("complete_paid_enrollment" as never, {
      _user_id: "00000000-0000-0000-0000-000000000000",
      _course_id: 1,
      _razorpay_order_id: "order_probe",
      _razorpay_payment_id: "pay_probe",
    } as never);
    expect(error).not.toBeNull();
    expect(`${error!.message} ${error!.code ?? ""}`.toLowerCase()).toMatch(
      /permission|not find|does not exist|42501|pgrst202/,
    );
  });
});

const raceIf = SERVICE && RACE_USER && COURSE_ID > 0 ? describe : describe.skip;

raceIf("verify ↔ webhook concurrency race", () => {
  const makeAdmin = () =>
    createClient(URL, SERVICE!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  const orderId = `order_race_${Date.now()}`;
  const paymentId = `pay_race_${Date.now()}`;

  it("stays atomic + idempotent under 8 concurrent calls", async () => {
    const admin = makeAdmin();
    // Arrange: a pending payment row, like create-razorpay-order writes.
    const { data: course } = await admin
      .from("courses").select("price").eq("id", COURSE_ID).single();

    await admin.from("enrollments")
      .delete().eq("user_id", RACE_USER!).eq("course_id", COURSE_ID);
    await admin.from("razorpay_payments").delete().eq("razorpay_order_id", orderId);

    const { error: insErr } = await admin.from("razorpay_payments").insert({
      user_id: RACE_USER!,
      course_id: COURSE_ID,
      razorpay_order_id: orderId,
      amount: course?.price ?? 1,
      currency: "INR",
      status: "created",
    });
    expect(insErr).toBeNull();

    // Act: 8 simultaneous calls (verify + webhook + Razorpay retries).
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        admin.rpc("complete_paid_enrollment" as never, {
          _user_id: RACE_USER!,
          _course_id: COURSE_ID,
          _razorpay_order_id: orderId,
          _razorpay_payment_id: paymentId,
        } as never),
      ),
    );

    // Assert: every call succeeds and returns the SAME enrollment id.
    const ids = new Set<unknown>();
    for (const r of results) {
      expect(r.error).toBeNull();
      ids.add(r.data);
    }
    expect(ids.size).toBe(1);

    // Assert: exactly one enrollment row, active.
    const { data: enrollments } = await admin
      .from("enrollments").select("id, status")
      .eq("user_id", RACE_USER!).eq("course_id", COURSE_ID);
    expect(enrollments?.length).toBe(1);
    expect(enrollments?.[0].status).toBe("active");

    // Assert: payment completed exactly once.
    const { data: payments } = await admin
      .from("razorpay_payments").select("id, status, razorpay_payment_id")
      .eq("razorpay_order_id", orderId);
    expect(payments?.length).toBe(1);
    expect(payments?.[0].status).toBe("completed");
    expect(payments?.[0].razorpay_payment_id).toBe(paymentId);
  }, 60_000);

  it("rejects an order that has no matching payment row", async () => {
    const admin = makeAdmin();
    const { error } = await admin.rpc("complete_paid_enrollment" as never, {
      _user_id: RACE_USER!,
      _course_id: COURSE_ID,
      _razorpay_order_id: "order_does_not_exist",
      _razorpay_payment_id: "pay_nope",
    } as never);
    expect(error).not.toBeNull();
  });
});
