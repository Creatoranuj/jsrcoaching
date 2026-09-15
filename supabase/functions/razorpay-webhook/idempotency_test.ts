// End-to-end idempotency tests for the Razorpay payment + refund webhooks.
//
// Razorpay retries a webhook until it receives a 2xx, and can deliver the same
// event several times (network drop, timeout, manual replay from the
// dashboard). These tests prove that repeated deliveries never produce a
// second side effect and never return a 5xx that would trigger an infinite
// retry storm.
//
// They run against the deployed functions. All payloads reference synthetic
// order ids that do not exist in `razorpay_payments`, so the handlers stop at
// the lookup step — no real enrollment, payment or refund is ever mutated.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL");
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY");
const WEBHOOK_SECRET = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");

function requireEnv() {
  if (!SUPABASE_URL || !WEBHOOK_SECRET) {
    throw new Error(
      `Missing env: SUPABASE_URL=${!!SUPABASE_URL} RAZORPAY_WEBHOOK_SECRET=${!!WEBHOOK_SECRET}`,
    );
  }
}

async function hmacSha256(key: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Fn = "razorpay-webhook" | "razorpay-refund-webhook";

function url(fn: Fn) {
  return `${SUPABASE_URL}/functions/v1/${fn}`;
}

function paymentPayload(eventId: string, event: string, orderId: string) {
  return {
    id: eventId,
    event,
    payload: {
      payment: {
        entity: {
          id: `pay_${orderId}`,
          order_id: orderId,
          amount: 100,
          status: event === "payment.refunded" ? "refunded" : "captured",
          notes: {},
        },
      },
    },
  };
}

/** Deliver a signed webhook exactly as Razorpay would. */
async function deliver(fn: Fn, eventId: string, event: string, orderId: string) {
  const body = JSON.stringify(paymentPayload(eventId, event, orderId));
  const signature = await hmacSha256(WEBHOOK_SECRET!, body);
  const res = await fetch(url(fn), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-razorpay-signature": signature,
      "x-razorpay-event-id": eventId,
    },
    body,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

const uid = (tag: string) => `test-${tag}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

// ─────────────────────────────────────────────────────────────
// Payment webhook (payment.captured)
// ─────────────────────────────────────────────────────────────

Deno.test("payment webhook: 3 identical deliveries give a deterministic, retry-safe outcome", async () => {
  requireEnv();
  const eventId = uid("cap-triple");
  const orderId = `order_${eventId}`;

  const first = await deliver("razorpay-webhook", eventId, "payment.captured", orderId);
  console.log("delivery 1:", first.status, first.json);
  // Unknown order → handler reports a non-retryable outcome, never a 5xx.
  assert(first.status < 500, `first delivery must not 5xx, got ${first.status}`);

  for (const attempt of [2, 3]) {
    const retry = await deliver("razorpay-webhook", eventId, "payment.captured", orderId);
    console.log(`delivery ${attempt}:`, retry.status, retry.json);
    if (first.status === 200) {
      // Successful pass recorded the event id → later retries short-circuit.
      assertEquals(retry.status, 200);
      assert(
        retry.json.status === "duplicate_event" || retry.json.status === "already_processed",
        `retry ${attempt} must short-circuit, got ${JSON.stringify(retry.json)}`,
      );
    } else {
      // A delivery that produced no side effect must NOT be swallowed as a
      // duplicate — Razorpay's retry has to be able to reach the handler
      // again. The response must stay identical and non-retryable-safe.
      assertEquals(retry.status, first.status);
      assertEquals(JSON.stringify(retry.json), JSON.stringify(first.json));
      assert(retry.json.status !== "duplicate_event", "failed pass must not be deduped");
    }
  }
});


Deno.test("payment webhook: distinct event ids for the same order stay side-effect free", async () => {
  requireEnv();
  const orderId = `order_${uid("cap-shared")}`;

  const a = await deliver("razorpay-webhook", uid("cap-a"), "payment.captured", orderId);
  const b = await deliver("razorpay-webhook", uid("cap-b"), "payment.captured", orderId);
  console.log("event A:", a.status, a.json, "| event B:", b.status, b.json);

  // Razorpay can emit two distinct event ids for the same order (e.g. captured
  // re-sent after a dashboard replay). Dedupe by event_id cannot help here, so
  // the order-level idempotency guard must produce the same terminal outcome.
  assertEquals(a.status, b.status);
  assert(a.status < 500, `must not 5xx, got ${a.status}`);
});

Deno.test("payment webhook: out-of-order authorized→captured retries never 5xx", async () => {
  requireEnv();
  const orderId = `order_${uid("cap-order")}`;

  const authorized = await deliver("razorpay-webhook", uid("auth"), "payment.authorized", orderId);
  console.log("authorized:", authorized.status, authorized.json);
  assertEquals(authorized.status, 200);
  assertEquals(authorized.json.status, "ignored");

  const captured = await deliver("razorpay-webhook", uid("cap"), "payment.captured", orderId);
  console.log("captured after authorized:", captured.status, captured.json);
  assert(captured.status < 500, `captured must not 5xx, got ${captured.status}`);
});

// ─────────────────────────────────────────────────────────────
// Refund webhook (payment.refunded)
// ─────────────────────────────────────────────────────────────

Deno.test("refund webhook: 3 identical deliveries dedupe after the first", async () => {
  requireEnv();
  const eventId = uid("ref-triple");
  const orderId = `order_${eventId}`;

  const first = await deliver("razorpay-refund-webhook", eventId, "payment.refunded", orderId);
  console.log("refund delivery 1:", first.status, first.json);
  assert(first.status < 500, `first refund delivery must not 5xx, got ${first.status}`);

  for (const attempt of [2, 3]) {
    const retry = await deliver("razorpay-refund-webhook", eventId, "payment.refunded", orderId);
    console.log(`refund delivery ${attempt}:`, retry.status, retry.json);
    assertEquals(retry.status, 200);
    assert(
      retry.json.status === "duplicate_event" || retry.json.status === "already_processed",
      `refund retry ${attempt} must short-circuit, got ${JSON.stringify(retry.json)}`,
    );
  }
});

Deno.test("refund webhook: a duplicate delivery of an ignored event is still 200", async () => {
  requireEnv();
  const eventId = uid("ref-ignored");
  const orderId = `order_${eventId}`;

  const a = await deliver("razorpay-refund-webhook", eventId, "refund.processed", orderId);
  const b = await deliver("razorpay-refund-webhook", eventId, "refund.processed", orderId);
  console.log("ignored 1:", a.status, a.json, "| ignored 2:", b.status, b.json);

  assertEquals(a.status, 200);
  assertEquals(a.json.status, "ignored");
  assertEquals(b.status, 200);
  assertEquals(b.json.status, "duplicate_event");
});

Deno.test("refund webhook: replayed body with a tampered signature is always rejected", async () => {
  requireEnv();
  const eventId = uid("ref-tamper");
  const body = JSON.stringify(paymentPayload(eventId, "payment.refunded", `order_${eventId}`));

  for (const attempt of [1, 2]) {
    const res = await fetch(url("razorpay-refund-webhook"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-razorpay-signature": "00".repeat(32),
        "x-razorpay-event-id": eventId,
      },
      body,
    });
    const json = await res.json();
    console.log(`tampered replay ${attempt}:`, res.status, json);
    assertEquals(res.status, 400);
    assertEquals(json.error, "Invalid signature");
  }
});

// ─────────────────────────────────────────────────────────────
// Payment callback path (verify-razorpay-payment)
// ─────────────────────────────────────────────────────────────

Deno.test("verify-razorpay-payment: repeated unauthenticated callbacks stay 401", async () => {
  if (!SUPABASE_URL || !ANON_KEY) {
    throw new Error(`Missing env: SUPABASE_URL=${!!SUPABASE_URL} ANON_KEY=${!!ANON_KEY}`);
  }
  const payload = JSON.stringify({
    razorpay_order_id: "order_idem_test",
    razorpay_payment_id: "pay_idem_test",
    razorpay_signature: "00".repeat(32),
    course_id: 1,
  });

  for (const attempt of [1, 2]) {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/verify-razorpay-payment`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: ANON_KEY },
      body: payload,
    });
    const json = await res.json().catch(() => ({}));
    console.log(`verify unauthenticated ${attempt}:`, res.status, json);
    assertEquals(res.status, 401);
  }
});
