# Runbook — Razorpay test → live key switch

Last reviewed: 2026-09-25 (after the test-data purge and payment-path review).

The app never hardcodes a Razorpay key. `create-razorpay-order` reads
`RAZORPAY_KEY_ID` from Supabase function secrets and returns it to the client,
so the switch is a **secrets + dashboard** operation — no app release, no APK.

## 0. Before you start

- Razorpay account fully KYC-activated (live mode unlocked in the dashboard).
- Razorpay status page green. `create-razorpay-order` re-validates a cached
  pending order against the *current* key for 10 minutes after it was
  created; a Razorpay hiccup in that window surfaces a retryable 503 to the
  student instead of a fresh order. Switch when the API is healthy, ideally at
  a low-traffic hour.
- No `pending` test orders you still care about — test-mode rows were purged
  on 2026-09-25; anything newer is disposable.

## 1. Generate live credentials (Razorpay dashboard, **Live mode** toggle ON)

1. Settings → API Keys → *Generate Live Key*. Copy `rzp_live_…` key id and the
   secret (secret is shown once).
2. Settings → Webhooks → *Add New Webhook* (webhooks are **per mode** — the
   test-mode webhooks do NOT carry over to live). Create two:

   | URL | Active events | Secret |
   | --- | --- | --- |
   | `https://wegamscqtvqhxowlskfm.supabase.co/functions/v1/razorpay-webhook` | `payment.captured` | your chosen webhook secret |
   | `https://wegamscqtvqhxowlskfm.supabase.co/functions/v1/razorpay-refund-webhook` | `payment.refunded`, `refund.processed` | **same** secret |

   Both functions read the single `RAZORPAY_WEBHOOK_SECRET`, so use one
   secret for both webhooks. Generate it yourself (`openssl rand -hex 32`).

## 2. Set the three Supabase secrets (Lovable secrets tool / Supabase → Edge Functions → Secrets)

| Secret | Value |
| --- | --- |
| `RAZORPAY_KEY_ID` | `rzp_live_…` |
| `RAZORPAY_KEY_SECRET` | live key secret |
| `RAZORPAY_WEBHOOK_SECRET` | the webhook secret from step 1.2 |

Edge functions pick up new secrets on the next cold start (usually within a
minute). No redeploy needed. **Never** put live values in GitHub Actions
secrets — `razorpay-smoke.yml` refuses non-`rzp_test_` keys by design.

## 3. Verify (10 minutes)

1. Open the app / site → any paid course → checkout. The red **TEST MODE**
   badge must be gone (`mode: "live"` in the order response).
2. Make one real payment for the cheapest course (₹1–₹10 is fine if you
   temporarily lower a course price; refund it afterwards via the admin refund
   button — that also exercises the refund path).
3. Confirm in this order:
   - `razorpay_payments` row: `status = completed`, `razorpay_payment_id` set.
   - `enrollments` row: `status = active`.
   - `webhook_events`: one row with `source = razorpay` for `payment.captured`
     (proves the live webhook + secret are wired). If verify enrolled the
     student but this row is missing, the webhook is misconfigured — fix
     before going further; the `/pay` browser flow relies on it alone.
   - Razorpay dashboard → Webhooks → the webhook shows a 200 delivery.
4. Refund the test purchase from Admin → Payments. Expect: payment row
   `refunded`, enrollment `refunded`, `audit_log` lines `refund.initiated` +
   `refund_processed`, and a `razorpay-refund` webhook event.
5. Wait for the next `Reconcile Pending Payments` run (every 15 min) — it
   should report `checked: 0` or only genuinely fresh pending rows.

## 4. Roll back

Set the three secrets back to the `rzp_test_` values and re-enable the
test-mode webhooks. The client follows automatically; in-flight live orders
stay valid on Razorpay's side and are still enrolled by the (live) webhook
until you delete it.

## What to watch in the first 24 h

- `security_alerts` with `webhook_signature_mismatch` → wrong webhook secret.
- `payment_events` with `event_type = order_reuse_skipped` spikes → students
  retrying stale orders; clears on its own within 10 minutes of the switch.
- `razorpay_payments` pending rows older than 30 min with no webhook event →
  run *Reconcile Pending Payments* manually (`workflow_dispatch`) and check
  the Razorpay dashboard for the order.
