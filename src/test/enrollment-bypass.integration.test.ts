/**
 * Red-team regression: prove that a signed-in user CANNOT bypass paid enrollment.
 *
 * These tests only run when TEST_USER_EMAIL / TEST_USER_PASSWORD are set in the env
 * (typically CI). Locally they self-skip so `bunx vitest run` stays green.
 *
 * NOTE on assertions: PostgREST returns an error when a trigger raises, but a write
 * blocked purely by RLS comes back as `error: null` with ZERO rows changed. So the
 * probe asserts on the OUTCOME (nothing was written / nothing changed), not on the
 * presence of an error object.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const URL = (import.meta.env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL) as string;
const ANON = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY) as string;
const EMAIL = process.env.TEST_USER_EMAIL;
const PASS = process.env.TEST_USER_PASSWORD;
const PAID_COURSE_ID = Number(process.env.TEST_PAID_COURSE_ID ?? 0);

const runIf = URL && ANON && EMAIL && PASS && PAID_COURSE_ID > 0 ? describe : describe.skip;

runIf("enrollment bypass — red team", () => {
  // describe.skip still evaluates this body, so guard the client construction.
  const supabase =
    URL && ANON ? createClient(URL, ANON) : (null as unknown as ReturnType<typeof createClient>);

  let userId = "";

  beforeAll(async () => {
    const { error } = await supabase.auth.signInWithPassword({ email: EMAIL!, password: PASS! });
    expect(error).toBeNull();
    const { data } = await supabase.auth.getUser();
    userId = data.user!.id;
  });

  it("blocks direct INSERT into a paid course", async () => {
    const { data, error } = await supabase
      .from("enrollments")
      .insert({ user_id: userId, course_id: PAID_COURSE_ID, status: "active" })
      .select("id");

    // Either the payment trigger / RLS raises, or nothing is inserted. Never a new row.
    if (error) {
      expect(error.message.toLowerCase()).toMatch(
        /row-level security|policy|payment required|duplicate key|violates/,
      );
    } else {
      expect(data ?? []).toHaveLength(0);
    }
  });

  it("blocks status flip on own enrollment", async () => {
    const { data: row } = await supabase
      .from("enrollments")
      .select("id, status")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (!row) return;

    const flipped = row.status === "active" ? "cancelled" : "active";
    const { data, error } = await supabase
      .from("enrollments")
      .update({ status: flipped })
      .eq("id", row.id)
      .select("id, status");

    // Any returned representation must still show the original value.
    for (const r of data ?? []) expect(r.status).toBe(row.status);
    if (error) expect(error.message.toLowerCase()).toMatch(/row-level security|policy|not allowed|permission/);

    // Re-read: the stored status must be untouched.
    const { data: after } = await supabase
      .from("enrollments")
      .select("status")
      .eq("id", row.id)
      .maybeSingle();
    expect(after?.status).toBe(row.status);
  });

  it("blocks course_id pivot on own enrollment", async () => {
    const { data: row } = await supabase
      .from("enrollments")
      .select("id, course_id")
      .eq("user_id", userId)
      .neq("course_id", PAID_COURSE_ID)
      .limit(1)
      .maybeSingle();
    if (!row) return;

    const { data, error } = await supabase
      .from("enrollments")
      .update({ course_id: PAID_COURSE_ID })
      .eq("id", row.id)
      .select("id, course_id");

    for (const r of data ?? []) expect(r.course_id).toBe(row.course_id);
    if (error) expect(error.message.toLowerCase()).toMatch(/row-level security|policy|not allowed|permission/);

    const { data: after } = await supabase
      .from("enrollments")
      .select("course_id")
      .eq("id", row.id)
      .maybeSingle();
    expect(after?.course_id).toBe(row.course_id);
  });

  it("blocks forged razorpay_payments insert", async () => {
    const { error } = await supabase.from("razorpay_payments").insert({
      user_id: userId,
      course_id: PAID_COURSE_ID,
      razorpay_order_id: "order_fake_" + Date.now(),
      amount: 1,
      status: "completed",
    } as any);
    expect(error).not.toBeNull();
  });
});
