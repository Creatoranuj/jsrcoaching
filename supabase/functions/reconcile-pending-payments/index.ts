// Admin-only reconciliation for payments that were captured at Razorpay but
// never enrolled (webhook not configured, or a dropped callback).
//
// For every `razorpay_payments` row still `pending`, we ask Razorpay for the
// payments on that order. If one is `captured` and the amount matches what we
// recorded, we grant enrollment through the same idempotent RPC the webhook
// uses (`complete_paid_enrollment`), so running this twice is safe. Nothing is
// ever enrolled from client input.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

type OrderPayment = { id: string; status: string; amount: number };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: corsHeaders,
    });
  }

  const KEY_ID = Deno.env.get("RAZORPAY_KEY_ID");
  const KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  if (!KEY_ID || !KEY_SECRET) {
    return new Response(JSON.stringify({ error: "Razorpay keys not configured" }), {
      status: 500, headers: corsHeaders,
    });
  }

  // ── caller must be a signed-in admin ──
  const authHeader = req.headers.get("Authorization") ?? "";
  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await asUser.auth.getUser();
  const uid = userData?.user?.id;
  if (!uid) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: corsHeaders,
    });
  }
  const { data: isAdmin } = await asUser.rpc("has_role", { _user_id: uid, _role: "admin" });
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: corsHeaders,
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const basic = btoa(`${KEY_ID}:${KEY_SECRET}`);

  const { data: pending, error: pendingErr } = await admin
    .from("razorpay_payments")
    .select("id, razorpay_order_id, user_id, course_id, amount, status")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(200);

  if (pendingErr) {
    console.error("reconcile: cannot read pending payments", pendingErr);
    return new Response(JSON.stringify({ error: "DB read failed" }), {
      status: 500, headers: corsHeaders,
    });
  }

  const result = {
    checked: 0, enrolled: 0, still_pending: 0,
    failed_at_razorpay: 0, errors: [] as string[],
  };

  for (const row of pending ?? []) {
    result.checked += 1;
    const orderId = row.razorpay_order_id as string | null;
    if (!orderId) continue;

    try {
      const resp = await fetch(`https://api.razorpay.com/v1/orders/${orderId}/payments`, {
        headers: { Authorization: `Basic ${basic}` },
      });
      if (!resp.ok) {
        const body = await resp.text();
        console.error(`reconcile: razorpay ${resp.status} for ${orderId}: ${body}`);
        result.errors.push(`${orderId}: razorpay ${resp.status}`);
        continue;
      }
      const { items } = (await resp.json()) as { items: OrderPayment[] };
      const captured = items?.find((p) => p.status === "captured");

      if (!captured) {
        if (items?.some((p) => p.status === "failed")) result.failed_at_razorpay += 1;
        else result.still_pending += 1;
        continue;
      }

      // amount must match the order we recorded (paise vs rupees)
      const expectedPaise = Math.round(Number(row.amount) * 100);
      if (captured.amount !== expectedPaise) {
        console.error(`reconcile: amount mismatch on ${orderId}: expected ${expectedPaise}, got ${captured.amount}`);
        result.errors.push(`${orderId}: amount mismatch`);
        continue;
      }

      if (!row.user_id || !row.course_id) {
        result.errors.push(`${orderId}: missing user/course on record`);
        continue;
      }

      const { error: rpcError } = await admin.rpc("complete_paid_enrollment", {
        _user_id: row.user_id,
        _course_id: Number(row.course_id),
        _razorpay_order_id: orderId,
        _razorpay_payment_id: captured.id,
      });
      if (rpcError) {
        console.error(`reconcile: enrollment failed for ${orderId}`, rpcError);
        result.errors.push(`${orderId}: enrollment failed`);
        continue;
      }
      result.enrolled += 1;
      console.log(`reconcile: enrolled user ${row.user_id} in course ${row.course_id} (order ${orderId})`);
    } catch (e) {
      console.error(`reconcile: unexpected error on ${orderId}`, e);
      result.errors.push(`${orderId}: ${String(e)}`);
    }
  }

  return new Response(JSON.stringify(result), { status: 200, headers: corsHeaders });
});
