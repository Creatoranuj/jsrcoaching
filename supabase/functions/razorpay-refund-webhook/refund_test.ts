// Live tests for the refund path.
//
// Covers: signature verification, replay/idempotency, unknown-event handling
// and `initiate-refund` authorization. These run against the deployed
// functions — no real Razorpay refund is created (payloads reference
// non-existent orders, so handlers stop at the lookup step).
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL");
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY");
const WEBHOOK_SECRET = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");

async function hmacSha256(key: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const refundUrl = () => `${SUPABASE_URL}/functions/v1/razorpay-refund-webhook`;

function requireEnv() {
  if (!SUPABASE_URL || !WEBHOOK_SECRET) {
    throw new Error(
      `Missing env: SUPABASE_URL=${!!SUPABASE_URL} RAZORPAY_WEBHOOK_SECRET=${!!WEBHOOK_SECRET}`,
    );
  }
}

function refundPayload(eventId: string, event = "payment.refunded") {
  return {
    id: eventId,
    event,
    payload: {
      payment: {
        entity: {
          id: `pay_test_${eventId}`,
          order_id: `order_test_${eventId}`,
          amount: 100,
          status: "refunded",
        },
      },
    },
  };
}

async function postRefund(body: string, signature: string, eventId: string) {
  return await fetch(refundUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-razorpay-signature": signature,
      "x-razorpay-event-id": eventId,
    },
    body,
  });
}

Deno.test("refund webhook rejects an invalid signature", async () => {
  requireEnv();
  const eventId = `test-refund-badsig-${Date.now()}`;
  const body = JSON.stringify(refundPayload(eventId));
  const res = await postRefund(body, "deadbeef".repeat(8), eventId);
  const json = await res.json();
  console.log("bad signature response:", res.status, json);
  assertEquals(res.status, 400);
  assertEquals(json.error, "Invalid signature");
});

Deno.test("refund webhook rejects a missing signature header", async () => {
  requireEnv();
  const body = JSON.stringify(refundPayload(`test-refund-nosig-${Date.now()}`));
  const res = await fetch(refundUrl(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  const json = await res.json();
  console.log("missing signature response:", res.status, json);
  assertEquals(res.status, 400);
  assertEquals(json.error, "Missing signature");
});

Deno.test("refund webhook ignores unknown event types", async () => {
  requireEnv();
  const eventId = `test-refund-other-${Date.now()}`;
  const body = JSON.stringify(refundPayload(eventId, "refund.speed_changed"));
  const signature = await hmacSha256(WEBHOOK_SECRET!, body);
  const res = await postRefund(body, signature, eventId);
  const json = await res.json();
  console.log("unknown event response:", res.status, json);
  assertEquals(res.status, 200);
  assertEquals(json.status, "ignored");
});

Deno.test("refund webhook is idempotent on repeated event ids", async () => {
  requireEnv();
  const eventId = `test-refund-replay-${Date.now()}`;
  const body = JSON.stringify(refundPayload(eventId));
  const signature = await hmacSha256(WEBHOOK_SECRET!, body);

  // First delivery: signature valid, but the order doesn't exist → 404.
  const r1 = await postRefund(body, signature, eventId);
  const j1 = await r1.json();
  console.log("1st refund delivery:", r1.status, j1);
  assertEquals(r1.status, 404);

  // Second delivery of the same event id must short-circuit as duplicate,
  // proving no side effect can be applied twice.
  const r2 = await postRefund(body, signature, eventId);
  const j2 = await r2.json();
  console.log("2nd refund delivery:", r2.status, j2);
  assertEquals(r2.status, 200);
  assertEquals(j2.status, "duplicate_event");
});

Deno.test("initiate-refund requires authentication", async () => {
  if (!SUPABASE_URL || !ANON_KEY) {
    throw new Error(`Missing env: SUPABASE_URL=${!!SUPABASE_URL} ANON_KEY=${!!ANON_KEY}`);
  }
  const res = await fetch(`${SUPABASE_URL}/functions/v1/initiate-refund`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: ANON_KEY },
    body: JSON.stringify({ razorpay_payment_id: "pay_x", razorpay_order_id: "order_x" }),
  });
  const json = await res.json();
  console.log("initiate-refund unauthenticated:", res.status, json);
  assertEquals(res.status, 401);
  assertEquals(json.success, false);
});

Deno.test("initiate-refund rejects a non-admin caller", async () => {
  if (!SUPABASE_URL || !ANON_KEY) {
    throw new Error(`Missing env: SUPABASE_URL=${!!SUPABASE_URL} ANON_KEY=${!!ANON_KEY}`);
  }
  // Anon JWT is a valid token but carries no admin role.
  const res = await fetch(`${SUPABASE_URL}/functions/v1/initiate-refund`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({ razorpay_payment_id: "pay_x", razorpay_order_id: "order_x" }),
  });
  const json = await res.json();
  console.log("initiate-refund non-admin:", res.status, json);
  assert(res.status === 401 || res.status === 403, `expected 401/403, got ${res.status}`);
  assertEquals(json.success, false);
});
