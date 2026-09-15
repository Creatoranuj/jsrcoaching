# Fix Razorpay payments on sadguruclasses.vercel.app (Edge Function not reachable)

## Diagnosis (verified just now, not guessed)

I called your live Supabase functions endpoint directly from the `https://sadguruclasses.vercel.app` origin. Result:

```text
create-razorpay-order        404  NOT_FOUND_FUNCTION_BLOB
verify-razorpay-payment      404  NOT_FOUND_FUNCTION_BLOB
razorpay-webhook             404  NOT_FOUND_FUNCTION_BLOB
recover-enrollment           404
create-subscription-order    404
verify-subscription-payment  404
self-enroll-free             404
initiate-refund              404
pdf-proxy                    200  (deployed)
manage-session               200  (deployed)
```

**Every payment edge function is missing from the deployed project.** The code exists in `supabase/functions/`, but only `pdf-proxy`, `notion-page` and `manage-session` are actually live (the edge-function log listing confirms the same three). So the browser's `supabase.functions.invoke("create-razorpay-order")` gets a 404 from the gateway and the app shows the generic "Failed to send a request to the Edge Function" / not-fetch error. This is a deployment gap, not a code bug.

Second, smaller issue found in `supabase/functions/_shared/cors.ts`: the auto-allow list covers `*.lovable.app`, localhost and Capacitor origins, but **not** `sadguruclasses.vercel.app`. Today it still works only because `ALLOWED_ORIGINS` is unset, which makes the helper fall back to `*`. The moment anyone sets that secret, the Vercel site breaks. Worth pinning now.

## What I will do

1. **Deploy the 8 missing payment functions** — `create-razorpay-order`, `verify-razorpay-payment`, `razorpay-webhook`, `recover-enrollment`, `create-subscription-order`, `verify-subscription-payment`, `self-enroll-free`, `initiate-refund`. No logic rewrite; the existing implementations already do server-side order creation, HMAC signature verification, Razorpay API re-fetch, amount-in-paise match and idempotent webhook enrollment.
2. **Add the production host to the CORS allow-list** — `https://sadguruclasses.vercel.app` (plus `*.vercel.app` preview deploys) as an auto-allow pattern in `_shared/cors.ts`, so payments keep working regardless of the `ALLOWED_ORIGINS` secret.
3. **Verify UPI is actually offered** — the web checkout already sends a UPI-first block (`UPI_FIRST_CHECKOUT_CONFIG`: `intent` tiles for GPay/PhonePe/Paytm + `collect` VPA fallback, UPI block pinned first, `remember_customer: true`) and `buildRazorpayPrefill` passes the normalised `contact` needed for the "Recommended" section. I'll re-confirm this is wired on both `BuyCourse` and the subscription flow, and that the native Capacitor path routes through `openNativeRazorpayCheckout`.
4. **Test end-to-end myself** — after deploy: re-run the reachability probe from the Vercel origin (expect 200/401 instead of 404), then sign in in a real browser as `Mahimaacademe@gmail.com`, open a paid course, press Buy, and confirm the Razorpay sheet opens with UPI on top and a real `order_...` id. I will not complete a live payment.
5. **Webhook check** — confirm the Razorpay dashboard webhook URL should point at the now-live `.../functions/v1/razorpay-webhook`; I'll give you the exact URL to paste if it needs updating.

## Technical notes

- Secrets `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` are already configured — nothing to re-enter.
- `create-razorpay-order` fails fast if the key prefix is neither `rzp_test_` nor `rzp_live_`; if the deployed probe returns that error I'll flag the key mode rather than patch around it.
- Nothing in the payment logic, DB triggers (`trg_enforce_enrollment_payment`, `guard_enrollment_update_trg`) or RLS is being changed.

## Out of scope
- Switching providers (Stripe/Paddle) — Razorpay stays.
- iOS native purchases (blocked by App Store IAP policy, already handled).
- The 4 legacy unpaid enrollments (21, 30, 35, 37) — still a business decision.
