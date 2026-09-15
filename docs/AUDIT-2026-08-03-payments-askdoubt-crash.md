# Audit: Razorpay payments + Ask Doubt + crash/stability

Date: 2026-08-03
Skills applied: `razorpay-payments`, `app-crash-shield`, `senior-architect-audit`

**Rating: 4/5** — the payment core (server-side orders, HMAC verify, Razorpay
re-fetch, idempotent webhook) is genuinely solid; the gaps were on the
*subscription* and *refund* side paths plus silent failure handling in Ask
Doubt. All CRITICAL/HIGH items below are now fixed and deployed.

> Note: the screenshot attached to the request could not be read — the upload
> mount returned an I/O error on both `/mnt/user-uploads/` and
> `/tmp/user-uploads/`. This audit is code-derived only. Re-send the image if
> it showed a specific error to be reproduced.

---

## Findings

### [HIGH] [DATA] Refund fired at Razorpay before any ownership/state check
**Where:** `supabase/functions/initiate-refund/index.ts:68`
**Why it matters:** The function jumped straight from "caller is admin" to
`POST /payments/:id/refund`. Nothing verified that the `razorpay_payment_id`
belonged to the given `razorpay_order_id`, that the order exists in
`razorpay_payments` at all, or that it was not already refunded. A typo or a
double-click issued a real, irreversible money movement — and a second refund
on the same payment returned a Razorpay error *after* the side effect window.
**Fix (applied):** Look up `razorpay_payments` by order id first; reject with
404 (unknown order), 400 (payment/order mismatch), or 409 (already refunded /
not in a refundable state) *before* touching the Razorpay API.

### [HIGH] [SEC] `verify-subscription-payment` had no rate limit
**Where:** `supabase/functions/verify-subscription-payment/index.ts`
**Why it matters:** Every other payment endpoint goes through the shared
`check_rate_limit` RPC; this one did not. An authenticated caller could loop
signature guesses and hammer the Razorpay payments API unthrottled, and each
attempt cost an outbound API call.
**Fix (applied):** Postgres-backed limiter, 10 req / 60 s per user,
**fail-closed** (503 `rate_limiter_unavailable` if the RPC errors) — matching
`verify-razorpay-payment`.

### [HIGH] [SEC] `create-subscription-order` rate limit was effectively a no-op
**Where:** `supabase/functions/create-subscription-order/index.ts:5-15`
**Why it matters:** The limiter was an in-process `Map`. Supabase edge
functions run as many short-lived isolates, so state is per-isolate and resets
on every cold start. The real ceiling was `5 x (live isolates)` — and trivially
bypassable by spacing requests so each lands on a fresh isolate. Order creation
is an outbound Razorpay write, so this was the expensive one to leave open.
**Fix (applied):** Replaced with the shared `check_rate_limit` RPC (5 / 60 s,
fail-closed).

### [MEDIUM] [SEC] CORS allow-list trusted every `*.vercel.app` origin
**Where:** `supabase/functions/_shared/cors.ts:39`
**Why it matters:** The auto-allow pattern `^https://([a-z0-9-]+\.)*vercel\.app$`
matches *any* site hosted on Vercel — i.e. anyone can deploy a page that a
logged-in user's browser will happily let call these payment endpoints
cross-origin with their session. Auth still gates the action, but this removes
the browser-side origin defence for free.
**Fix (applied):** Narrowed to `sadguruclasses.vercel.app` plus
`sadguruclasses-*.vercel.app` preview deployments.

### [MEDIUM] [UX] Ask Doubt AI answer failed completely silently
**Where:** `src/pages/Doubts.tsx:180`
**Why it matters:** After submitting, the student sees *"Sadguru AI Sahayak
jawab taiyar kar raha hai..."*. If `resolve-doubt` throws — or returns an
`error` (which the old code checked with `if (!aiError)` and then simply did
nothing on the else branch) — the user is left waiting on a promise that was
never made, with no log for us either.
**Fix (applied):** Throw on `aiError`, log to console, and show an honest
non-alarming toast: the doubt is saved, AI answer unavailable, a teacher will
reply.

### [MEDIUM] [OBS] Chatbot feedback errors swallowed by a bare `catch {}`
**Where:** `src/components/chat/ChatWidget.tsx:439`
**Why it matters:** `handleFeedback` optimistically lights the thumb, then
discards any failure — and did not even inspect the returned `error` field
(`functions.invoke` resolves rather than throws on a non-2xx). "Nobody rates
answers" and "every rating 500s" produce identical telemetry.
**Fix (applied):** Check `error`, log it. UX stays non-blocking by design.

### [LOW] [MAINT] `as any` casts on typed Supabase queries
**Where:** `src/hooks/useLiveReminder.ts:19,39,48`
**Why it matters:** `live_reminders` is in the generated `Database` type, so
the casts were stale workarounds that now hide real column/type drift on three
queries.
**Fix (applied):** Removed; typecheck passes clean.

---

## Verified-good (no action)

- **Payments** — order creation is server-only; HMAC is
  `SHA256(order_id|payment_id)` compared in constant time; the amount is
  re-fetched from Razorpay and matched in paise; `verify-razorpay-payment` is
  rate-limited fail-closed; `razorpay-webhook` is idempotent on
  `razorpay_payment_id` and enrolls independently of the callback page.
- **Platform split** — `Capacitor.isNativePlatform()` correctly routes to
  `openNativeRazorpayCheckout`; the web JS SDK is never loaded on native, so
  UPI intents to PhonePe/GPay/Paytm stay intact.
- **Replay defence** — subscription activation rejects a reused
  `razorpay_payment_id` both by pre-check and by catching the `23505` unique
  violation on the concurrent-race path.
- **Roles** — stored only in `public.user_roles`, checked via `has_role`;
  nothing role-shaped on `profiles`.
- **Crash shield** — heartbeat + global rejection trap installed; `CrashShield`
  boundary recovers via soft remount with no reload loop; blob URLs revoked;
  query cache bounded; back-button handler mounted once.
- **Capacitor config** — no `server.url`; debug WebView flag off in release.

## Backlog — closed 2026-08-03

- **Stall watchdogs consolidated.** `FastPdfReader.tsx` ran three overlapping
  timers (archive range-stall, stream-stall, hard 15s mount timeout), each
  keyed on `progress` so they were torn down and rebuilt on every percent tick
  of a healthy download, and both byte-fallback triggers could race. Replaced
  with a single 2s watchdog that reads live state from refs; thresholds
  unchanged (30s archive silence, 6s stream silence, 15s mount timeout).
  `Doubts.tsx` runs no timer of its own — the original note was inaccurate.
- **Partial refunds supported.** `initiate-refund` accepts an optional
  `amount` in paise, validated as a positive integer not exceeding the
  captured amount. Full refunds still mark the payment refunded and revoke
  enrollment; partial refunds set `partially_refunded` and keep course access.
  `process_refund` gained `_is_full` / `_refund_amount`. The admin refund
  dialog has an optional amount field (blank = full refund).
- **Dedicated refund audit row.** `initiate-refund` writes its own `audit_log`
  entry after Razorpay confirms — acting admin, order/payment/refund ids,
  course, amount in paise, and whether it was full or partial. Audit failures
  are logged and never fail an already-issued refund.