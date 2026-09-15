# Audit — Razorpay Payment Gateway + Deep-Link Course Access
Date: 2026-08-01 · Scope: `/skill:razorpay-payments`, `/skill:capacitor-deep-linking`, `/skill:senior-architect-audit`

## 1. Findings

### P0 — Deep-link host was wrong (FIXED)
Android App Links and the JS URL allow-list were pinned to `safarenglishka.vercel.app`,
a domain this app no longer uses. Consequence: **every https deep link
(`/course/:id`, `/my-courses`, `/payment-callback`, password reset) opened in the
browser instead of the app**, and `assetlinks.json` could never verify.

Fixed by introducing `src/config/deepLinks.ts` as the single source of truth
(`APP_SCHEME`, `APP_LINK_HOSTS = ["sadguruclasses.vercel.app"]`, path prefixes,
`toInternalPath`) and mirroring it in `AndroidManifest.xml`.

### P1 — Deep links accepted any path on a trusted host (FIXED)
The old parser forwarded *any* pathname to the router. Now only claimed prefixes
are accepted; everything else returns `null`. Preview/sandbox hosts are accepted
only when `import.meta.env.DEV` is true — they can no longer be abused in a
release APK.

### P1 — 4 legacy unpaid active enrollments (OPEN, data only)
`enrollments` ids **21, 30, 35, 37** (all course 15, ₹199) are `active` with no
captured `razorpay_payments` row. These predate the payment triggers. Not a code
hole — needs a business decision: revoke (`admin_revoke_enrollment`) or whitelist
(`admin_mark_enrollment_legit`).

## 2. Verified correct (no change needed)

**Payment gateway**
- Order creation is server-side only; price read from `courses`, never the client
  (`create-razorpay-order`), idempotency key + order reuse present.
- `verify-razorpay-payment` enforces: JWT claims → Postgres rate limit (fail-closed)
  → HMAC `SHA256(order|payment)` timing-safe compare → Razorpay API re-fetch →
  **amount match in paise** → `status === 'captured'` → enrollment write. Refunded
  and already-completed orders short-circuit (409 / idempotent).
- `razorpay-webhook` is the fallback and is idempotent per order
  (`already_processed`), so callback + webhook cannot double-enroll.
- Platform split respected: `openNativeRazorpayCheckout` on Capacitor (UPI intents,
  `<queries>` block covers PhonePe/GPay/Paytm), `openRazorpayCheckout` on web.
- iOS native purchases blocked (App Store IAP policy).

**DB payment gate** — triggers confirmed attached and enabled on `enrollments`:
`trg_enforce_enrollment_payment`, `guard_enrollment_update_trg`,
`trg_prevent_enrollment_status_tampering`. Client-side self-enrollment on a paid
course raises `Payment required before enrolling in this course`.

**Access after payment** — `/my-courses` reads enrollments live from Postgres (no
stale local cache), and `useEnrollmentArrival` reconciles a purchase that lands
before the webhook: `recover-enrollment` call → bounded 15s poll → realtime
`enrollments` subscription backstop → manual "recover" button. Router state
`justPurchased` drives the highlight.

## 3. Changes shipped
| File | Change |
|---|---|
| `src/config/deepLinks.ts` | New — hosts, scheme, path allow-list, `toInternalPath` |
| `src/hooks/useDeepLinks.ts` | Uses shared config; dev hosts gated on `import.meta.env.DEV` |
| `android/app/src/main/AndroidManifest.xml` | App Links host → `sadguruclasses.vercel.app`; added `/buy-course` |
| `src/test/deepLinks.test.ts` | New — 7 tests (host allow/deny, path deny, callback params, hash, dev gate) |

## 4. Verification
- `bunx vitest run` → **269 passed, 6 skipped, 0 failed**.
- Typecheck clean.
- DB: trigger presence query + unpaid-enrollment query (results above).

## 5. Follow-ups (owner action)
1. Deploy so `https://sadguruclasses.vercel.app/.well-known/assetlinks.json` is live
   (fingerprint `9E:E4:0B:…:09:84`, package `com.sadguru.classes`), then on device:
   `adb shell pm get-app-links com.sadguru.classes` → expect `verified`.
2. Decide on enrollments 21 / 30 / 35 / 37.
3. Supabase Dashboard → Auth → enable leaked-password protection.

## Rating: **4.5 / 5**
Payment path is defence-in-depth correct (server price, HMAC, API re-check, amount,
capture status, DB triggers, idempotent webhook). Half point withheld for the 4
legacy unpaid rows and the fact App Link verification cannot be confirmed until the
new domain serves `assetlinks.json`.
