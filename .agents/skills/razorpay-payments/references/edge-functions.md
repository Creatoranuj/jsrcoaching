# Edge function contracts

All three live in `supabase/functions/`. `verify_jwt = false` (validated in code).

## `create-razorpay-order`

**Request** (POST, JWT required):
```json
{ "course_id": 123 }
```

**Response 200:**
```json
{
  "order_id": "order_xxx",
  "key_id": "rzp_test_xxx",
  "amount": 49900,
  "currency": "INR",
  "description": "Enrollment for <course title>"
}
```

Server responsibilities:
- Validate JWT, look up `auth.uid()`.
- Fetch course + price from DB (never trust client amount).
- Call Razorpay Orders API with `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`.
- Insert pending row in `payment_orders` (so webhook can reconcile).

## `verify-razorpay-payment`

**Request** (POST, JWT required):
```json
{
  "razorpay_order_id": "order_xxx",
  "razorpay_payment_id": "pay_xxx",
  "razorpay_signature": "hex...",
  "course_id": 123
}
```

**Verification:**
```ts
const expected = hmacSha256(
  `${razorpay_order_id}|${razorpay_payment_id}`,
  Deno.env.get("RAZORPAY_KEY_SECRET")!
);
if (expected !== razorpay_signature) return 400;
```

On success: upsert `enrollments` row (idempotent on `(user_id, course_id)`), mark `payment_orders` paid. Return `{ enrolled: true }`.

## `razorpay-webhook`

**No JWT.** Validated via header `x-razorpay-signature` = `hmacSha256(rawBody, RAZORPAY_WEBHOOK_SECRET)`.

Handles events:
- `payment.captured` → enroll if not already (idempotent by `razorpay_payment_id`)
- `payment.failed` → mark order failed, optionally notify
- `subscription.charged` → extend subscription
- `refund.processed` → handled by `razorpay-refund-webhook`

**Always return 200 quickly** (under 5s) — Razorpay retries on non-2xx, which can double-enroll if your handler is slow and not idempotent.

## CORS

All three include `corsHeaders` from `npm:@supabase/supabase-js@2/cors` and respond to `OPTIONS`.

## Configure webhook in Razorpay dashboard

Endpoint: `https://cmbattmjwriiesibayfk.supabase.co/functions/v1/razorpay-webhook`
Secret: `RAZORPAY_WEBHOOK_SECRET` (already set).
Events: `payment.captured`, `payment.failed`, `subscription.charged`, `refund.processed`.
