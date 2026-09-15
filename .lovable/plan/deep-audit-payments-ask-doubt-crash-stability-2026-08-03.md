# Deep Audit — Payments, Ask Doubt, Crash Stability

## First, one blocker

Your screenshot could not be opened — the upload mount returns an I/O error on `Screenshot_20260731-084414.Firefox.png`, so I have no idea what visual bug you wanted fixed. **Please re-upload it or describe it in one line.** Everything below is the deep audit you asked for, which I ran independently.

## Audit result

**Rating: 3.5 / 5** — payment security is genuinely well built (server-side pricing, timing-safe HMAC, amount re-fetch from Razorpay, idempotent webhook), and crash-shield hygiene is already mature. The gaps are on the subscription flow, refunds, CORS breadth, and silent error-swallowing in Ask Doubt.

No CRITICAL findings. Below are the HIGH and MEDIUM items, each verified against the code.

### HIGH

**[H1] [SEC] Refund fires at Razorpay before ownership/status validation**
`supabase/functions/initiate-refund/index.ts:68-99` — the Razorpay refund API is called first, and `process_refund` (which only takes `_razorpay_order_id`) runs after. A mismatched `order_id`/`payment_id` pair, or an already-refunded order, still hits Razorpay's API. The code comment itself admits "reconcile manually."
Fix: validate `(razorpay_order_id, razorpay_payment_id)` against `razorpay_payments` and confirm `status != 'refunded'` **before** calling Razorpay.

**[H2] [RELY] Subscription verify endpoint has no rate limit**
`verify-subscription-payment/index.ts` — no `check_rate_limit` call at all, unlike its sibling `verify-razorpay-payment/index.ts:47-70`. Any authenticated user can hammer it, burning Razorpay API quota.
Fix: add the same `check_rate_limit` RPC gate.

**[H3] [RELY] Subscription order rate limiter is an in-memory Map**
`create-subscription-order/index.ts:5-15` — uses a per-isolate `Map`, exactly the anti-pattern `create-razorpay-order/index.ts:5-7` documents as broken under Supabase's multi-isolate runtime. Effective limit becomes 5 x number-of-isolates.
Fix: migrate to the shared `check_rate_limit` Postgres RPC.

### MEDIUM

**[M1] [SEC] CORS allow-list wildcards all of `*.vercel.app`**
`supabase/functions/_shared/cors.ts:39-40` — every Vercel-hosted site on the internet is an allowed origin for payment endpoints. JWT still gates access, but the trust boundary is far wider than intended.
Fix: narrow to `sadguruclasses.vercel.app` plus a project-scoped preview pattern.

**[M2] [UX] Ask Doubt swallows AI failures completely**
`src/pages/Doubts.tsx:169-182` — the `resolve-doubt` call sits in a try/catch with an empty catch. On failure the user sees nothing at all, not even a soft "AI could not answer, a teacher will reply."
Fix: show a non-blocking toast and keep the doubt posted.

**[M3] [OBS] Chat feedback errors silently discarded**
`src/components/chat/ChatWidget.tsx:438-440` — thumbs up/down failures are caught with no logging. Feedback signal loss is invisible.
Fix: route through `logger.error`.

**[M4] [DATA] Double-payment window on order retry**
`create-razorpay-order/index.ts:127-128` — idempotency-key reuse expires after 10 minutes; a retry past that mints a second live order while the first is still payable. Enrollment stays idempotent, but the customer can be charged twice with no auto-refund.
Fix: void the prior pending order server-side before minting a new one.

**[M5] [DATA] Webhook dedupe is SELECT-then-INSERT, not atomic**
`razorpay-webhook/index.ts:119-132` and `:306-313` — concurrent retries of the same event can both pass the check. Safe only if `complete_paid_enrollment` is itself concurrency-safe, which I could not verify from the SQL.
Fix: switch to an upsert against the unique event id at entry, and confirm the RPC's locking.

**[M6] [MAINT] `as any` on Supabase query builders**
`src/hooks/useLiveReminder.ts:19,39,48` — bypasses generated types; a column rename fails silently at runtime.
Fix: use `Database['public']['Tables'][...]` generics.

### LOW (batch)

- `verify-razorpay-payment` uses `getClaims`, `verify-subscription-payment` uses `getUser` — inconsistent auth pattern across siblings.
- `razorpay-refund-webhook/index.ts:200-203` — audit-log insert uses `.then()` instead of `await`, response can return before it lands.
- `BuyCourse.tsx:414` — web `onFailure` copy omits the webhook-fallback sentence the native path includes.
- `src/hooks/useLessonChat.ts:9` — hardcoded teacher-name array, untranslatable.
- `FastPdfReader.tsx:591-620,779-825` — three overlapping stall watchdogs; all clean up correctly, but worth consolidating.
- `MahimaGhostPlayer.tsx:791-793` — 250ms YouTube poll not throttled when the tab is hidden.

### Wins (verified, no action needed)

- Order amounts always derived from DB, never from the client.
- Timing-safe HMAC on all four signature checks.
- Both verify endpoints re-fetch the payment from Razorpay and compare paise before enrolling.
- Webhook enrolls independently of the client callback.
- Native/web split via `Capacitor.isNativePlatform()` is consistent; web SDK never loads on native.
- Paise units correct on both paths — no rupee/paise mixup anywhere.
- `capacitor.config.ts:16-22` — debug flag gated behind env, `allowMixedContent: false`.
- `crashShield.ts` — reload cooldown plus install guard; no infinite-reload risk.
- `useAndroidBackButton.ts:15-38` — singleton prevents duplicate listener registration.
- Every `createObjectURL` call site has a matching revoke; no blob leaks found.
- `queryPersister.ts` — 4MB cap with oldest-first eviction.

## What I will do on approval

1. Write the full report to `docs/AUDIT-2026-08-03-payments-doubt-crash.md`.
2. Apply H1, H2, H3 (edge function hardening) and M1 (CORS narrowing).
3. Apply M2, M3, M6 and the LOW batch items in the frontend.
4. Leave M4 and M5 for your decision — both touch live payment sequencing and I would rather confirm the intended behaviour first.
5. Fix whatever the screenshot showed, once you re-send it.

## Out of scope

- Switching payment providers — Razorpay stays.
- Capgo / OTA updates.
- iOS native purchases.