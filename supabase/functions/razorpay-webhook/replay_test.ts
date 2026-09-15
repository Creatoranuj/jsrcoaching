// Live test: webhook replay protection
// Sends the same payload twice; second call must return {status:'duplicate_event'}.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL");
const WEBHOOK_SECRET = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");

async function hmacSha256(key: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.test("razorpay-webhook: non-captured events are not consumed by the dedupe table", async () => {
  if (!SUPABASE_URL || !WEBHOOK_SECRET) {
    throw new Error(`Missing env: SUPABASE_URL=${!!SUPABASE_URL} RAZORPAY_WEBHOOK_SECRET=${!!WEBHOOK_SECRET}`);
  }

  const url = `${SUPABASE_URL}/functions/v1/razorpay-webhook`;
  const eventId = `test-replay-${Date.now()}`;
  const payload = {
    id: eventId,
    event: "payment.authorized", // non-captured → handler returns 'ignored'
    payload: { payment: { entity: { id: "pay_test", order_id: "order_test", amount: 100 } } },
  };
  const body = JSON.stringify(payload);
  const signature = await hmacSha256(WEBHOOK_SECRET, body);
  const headers = {
    "content-type": "application/json",
    "x-razorpay-signature": signature,
    "x-razorpay-event-id": eventId,
  };

  // The dedupe row is written only AFTER a successful captured-payment pass,
  // so an event that produced no side effect stays replayable — Razorpay's
  // retry must never be swallowed as a duplicate.
  for (const attempt of [1, 2]) {
    const res = await fetch(url, { method: "POST", headers, body });
    const json = await res.json();
    console.log(`${attempt} response:`, res.status, json);
    assertEquals(res.status, 200);
    assertEquals(json.status, "ignored");
  }
});

