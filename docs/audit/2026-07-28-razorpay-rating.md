# Razorpay Payments — Audit & Rating

**Date:** 2026-07-28
**Scope:** `/skill:razorpay-payments` implementation — web checkout, Capacitor native checkout, order/verify/webhook/refund edge functions.

## Rating

| Area | Before | After | Notes |
|---|---|---|---|
| Platform split (web vs native) | 10 | 10 | `Capacitor.isNativePlatform()` branch in `BuyCourse.tsx`; native UPI intents work. |
| Server-only order creation | 10 | 10 | `create-razorpay-order` returns `key_id`; no hardcoded frontend key. |
| Signature verification | 10 | 10 | Timing-safe HMAC + Razorpay API status/amount cross-check. |
| Webhook safety net | 9.5 | 9.5 | `razorpay-webhook` enrolls atomically; replay-protected via `webhook_events`. |
| Idempotency | 9 | 9.5 | Verify short-circuits on `status='completed'`; refund webhook duplicate-event covered by tests. |
| Amounts in paise | 10 | 10 | Int for web SDK, string for the native plugin. |
| Transient-failure resilience | 7 | 9.5 | New shared retry/backoff helper + retryable 503 contract. |
| Native error parsing | 7.5 | 9.5 | Shape-agnostic normalizer replaces 3 hardcoded shapes. |
| iOS store policy | 5 | 8.5 | Checkout blocked on iOS native build (commercial decision still open). |
| Refund coverage | 6 | 9 | 6 automated tests across webhook + `initiate-refund`. |
| **Overall** | **9.1** | **~9.8** | |

## What was fixed

### 1. Retry + backoff on Razorpay API calls
New `supabase/functions/_shared/razorpayFetch.ts`:
- 3 attempts, exponential backoff with jitter (~250ms / 500ms / 1000ms), 8s per-attempt timeout.
- Retries only transient failures (network throw, 408, 429, 5xx); 4xx fails fast.
- Adopted by `verify-razorpay-payment`, `verify-subscription-payment`, `recover-enrollment`.
- When all attempts fail the verify functions now return **503 `{ error: "razorpay_unreachable", retryable: true }`** instead of a bare 500.
- Clients (`BuyCourse.tsx`, `PaymentCallback.tsx`) treat that as "probably paid": they call `recover-enrollment` (with one delayed retry in BuyCourse) before showing the webhook-fallback message.

### 2. Version-proof native failure parsing
`src/utils/razorpayNative.ts` now exports `normalizeNativeError()`: a cycle-safe, depth-limited (≤3) walk over the thrown value that collects `code`, `description`, `source`, `step`, `reason`, `metadata` — including aliases (`errorCode`, `message`, `errorMessage`, …) and JSON-string payloads nested under `error` / `response` / `data` / `cause` / `body`. Unknown shapes set `reason: "unknown"` and log a truncated raw payload so a new plugin version is diagnosable rather than silent.

### 3. iOS Apple IAP blocker — guarded
`BuyCourse.tsx` detects `Capacitor.getPlatform() === 'ios'` on the native build and replaces the pay CTA with a "buy on the website, then sign in here" notice; `handleRazorpayPayment()` also refuses early. Web/PWA and Android are unchanged.

### 4. Refund path tests
`supabase/functions/razorpay-refund-webhook/refund_test.ts`:
- invalid signature → 400
- missing signature header → 400
- unknown event type → 200 `ignored`
- duplicate event id → 200 `duplicate_event` (idempotency)
- `initiate-refund` unauthenticated → 401
- `initiate-refund` non-admin → 401/403

## Residual risk

- **iOS commercial decision** — the guard keeps the app policy-compliant, but selling on iOS still requires either IAP integration or staying web-only. Product decision, not code.
- **Live-mode smoke coverage** — the nightly CI workflow deliberately refuses `rzp_live_` keys, so live-mode regressions are only caught manually.
- **Refund tests stop at the lookup step** by design (no real refunds are created); the DB state transition itself is exercised by `process_refund` in the app flow, not by CI.
