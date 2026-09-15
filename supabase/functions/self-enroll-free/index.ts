// Server-authoritative free-course enrollment.
//
// Replaces a client-side `enrollments.upsert()` that trusted RLS + a
// client-side price check to gate free enrollments. Attackers who bypassed
// the client check could still be stopped by RLS, but the price ceiling
// belongs on the server. This function:
//   1. Authenticates the caller.
//   2. Rate-limits per user (10 / 5 min).
//   3. Reads the course price with the service role.
//   4. Rejects if price > 0 or the course is missing / inactive.
//   5. Idempotently upserts an active enrollment with the service role.
//
// Returns { enrolled: true, already?: boolean } on success.

import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    if (req.method !== "POST") return json(405, { error: "Method not allowed" });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Unauthorized" });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json(401, { error: "Unauthorized" });

    let body: { course_id?: unknown } = {};
    try { body = await req.json(); } catch { /* empty */ }
    const courseId = Number(body?.course_id);
    if (!Number.isInteger(courseId) || courseId <= 0) {
      return json(400, { error: "INVALID_INPUT" });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Rate limit: 10 free-enroll attempts per 5 min per user.
    const { data: rlAllowed, error: rlErr } = await admin.rpc("check_rate_limit", {
      _bucket: "self-enroll-free",
      _user_id: user.id,
      _max: 10,
      _window_seconds: 300,
    });
    if (rlErr) console.error("[self-enroll-free] rate-limit check failed", rlErr.message);
    if (rlAllowed === false) {
      return json(429, { error: "Too many requests. Please wait a few minutes." });
    }

    // Server-side price ceiling — paid courses go through Razorpay.
    const { data: course, error: courseErr } = await admin
      .from("courses")
      .select("id, price, is_active")
      .eq("id", courseId)
      .maybeSingle();

    if (courseErr) {
      console.error("[self-enroll-free] course lookup failed", courseErr.message);
      return json(500, { error: "COURSE_LOOKUP_FAILED" });
    }
    if (!course) return json(404, { error: "COURSE_NOT_FOUND" });
    if (course.is_active === false) return json(403, { error: "COURSE_INACTIVE" });
    if ((course.price ?? 0) > 0) return json(402, { error: "PAID_COURSE" });

    // Idempotent enrollment. If a cancelled row exists, reactivate it.
    const { data: existing } = await admin
      .from("enrollments")
      .select("id, status")
      .eq("user_id", user.id)
      .eq("course_id", courseId)
      .maybeSingle();

    if (existing?.status === "active") {
      return json(200, { enrolled: true, already: true });
    }

    if (existing?.id) {
      const { error: upErr } = await admin
        .from("enrollments")
        .update({ status: "active" })
        .eq("id", existing.id);
      if (upErr) {
        console.error("[self-enroll-free] reactivate failed", upErr.message);
        return json(500, { error: "ENROLLMENT_FAILED" });
      }
      return json(200, { enrolled: true, already: false });
    }

    const { error: insErr } = await admin
      .from("enrollments")
      .insert({ user_id: user.id, course_id: courseId, status: "active" });
    if (insErr) {
      // Unique-conflict (concurrent enroll) is still success.
      if (!/duplicate|unique/i.test(insErr.message)) {
        console.error("[self-enroll-free] insert failed", insErr.message);
        return json(500, { error: "ENROLLMENT_FAILED" });
      }
    }

    return json(200, { enrolled: true, already: false });
  } catch (err) {
    console.error("[self-enroll-free] unexpected error", err);
    return json(500, { error: "INTERNAL_ERROR" });
  }
});
