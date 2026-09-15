---
name: razorpay-payments
description: Use when adding, modifying, or debugging Razorpay payments in the Naveen Bharat project — course purchases, subscriptions, refunds, webhook handlers, or mobile (Capacitor) checkout. Covers web SDK vs native plugin split, server-side signature verification, deep-link return on Android, and safe-area-aware checkout sheets.
---

# Razorpay Payments (Naveen Bharat)

This project already has a complete Razorpay implementation across web + Capacitor Android + Supabase edge functions. **Reuse existing files. Do not re-implement.**

## Hard rules (read every time)

1. **Platform split is mandatory.** Pick the checkout function by runtime, never load both:
   - Web / PWA → `openRazorpayCheckout` from `src/utils/razorpay.ts`
   - Capacitor native → `openNativeRazorpayCheckout` from `src/utils/razorpayNative.ts`
   - Decide with `Capacitor.isNativePlatform()`. Loading the web JS SDK on native silently breaks UPI intents to PhonePe / Google Pay / Paytm.

2. **Order creation is server-only.** Always call the `create-razorpay-order` edge function (or `create-subscription-order` for subscriptions). Never build an `order_id` on the client. The function returns the `key_id` to use — do not hardcode a frontend env var.

3. **Signature verification is server-only.** Always call `verify-razorpay-payment`. The frontend handler payload is untrusted until that function returns 200. HMAC is `SHA256(order_id + "|" + payment_id, RAZORPAY_KEY_SECRET)`.

4. **Webhook is the safety net.** `razorpay-webhook` enrolls the user even if the callback page fails (dropped network, app killed mid-redirect). Keep webhook handlers **idempotent on `razorpay_payment_id`** — never assume the callback ran first.

5. **Amounts always in paise.** Integer for the web SDK, **string of paise** for the native plugin (its quirk). Never send rupees.

6. **Friendly failure copy.** Every user-facing payment error must include: "if payment was captured, enrollment will happen automatically via webhook." See `src/pages/PaymentCallback.tsx` for the canonical wording.

7. **Secrets are already configured** — do not call `add_secret` for these:
   `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.

## Existing assets — reuse, do not duplicate

| File | Purpose |
|---|---|
| `src/utils/razorpay.ts` | Web checkout wrapper + script loader |
| `src/utils/razorpayNative.ts` | Capacitor native checkout (`capacitor-razorpay`) |
| `src/utils/openSubscriptionCheckout.ts` | Subscription flow |
| `src/pages/BuyCourse.tsx` | Canonical course-purchase UI |
| `src/pages/PaymentCallback.tsx` | Web redirect return handler |
| `supabase/functions/create-razorpay-order` | Order creation |
| `supabase/functions/create-subscription-order` | Subscription order |
| `supabase/functions/verify-razorpay-payment` | Signature verify + enrollment |
| `supabase/functions/verify-subscription-payment` | Subscription verify |
| `supabase/functions/razorpay-webhook` | Webhook fallback enrollment |
| `supabase/functions/initiate-refund` | Refund initiation |
| `supabase/functions/razorpay-refund-webhook` | Refund status webhook |

## Standard purchase flow

```text
User taps Buy
  └─ frontend chooses web vs native (Capacitor.isNativePlatform())
        └─ POST create-razorpay-order  → { order_id, key_id, amount }
              └─ open checkout (web modal OR native sheet)
                    ├─ success → POST verify-razorpay-payment → enroll
                    └─ webhook → razorpay-webhook → enroll (idempotent fallback)
```

## When to load a reference

| Task | Read |
|---|---|
| Adding/changing web checkout UX | `references/web-checkout.md` |
| Native checkout, UPI intent, plugin quirks | `references/native-checkout.md` |
| Editing any of the 3 edge functions | `references/edge-functions.md` |
| New product needs deep-link return on Android | `references/deep-link-return.md` |
| Wrapping checkout in a custom bottom sheet | `references/safe-area-checkout.md` |

## Out of scope (don't add)

- Capgo OTA live updates (paid service — user opted out)
- Stripe / Paddle (Razorpay only for Indian rupee payments)
- iOS native config (no Mac in this workflow)
- Storing payment status on `profiles` or `user_roles` (use `enrollments` / `payment_orders`)
