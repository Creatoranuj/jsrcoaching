# Audit — Crash Shield + Razorpay UPI recommendation

**Date:** 2026-08-01
**Scope:** `app-crash-shield`, `razorpay-payments`
**Rating: 4.5 / 5**

---

## Part 1 — Razorpay: UPI missing from "Recommended"

### Root cause (confirmed in code)

Two independent defects, both in the checkout-presentation layer:

1. **`prefill.contact` was never sent.** `src/pages/BuyCourse.tsx` passed only
   `{ name, email }`. Razorpay's *Recommended / preferred methods* block is
   built entirely from the customer's contact number — with no number the
   checkout opens on the contact-entry screen and no recommended UPI apps are
   rendered at all. The number was already available in `AuthContext`
   (`profile.mobile`), it just was not wired through.
2. **The UPI display block declared no `flows`.** `UPI_FIRST_CHECKOUT_CONFIG`
   used `instruments: [{ method: 'upi' }]`, which renders a generic UPI block
   without the GPay / PhonePe / Paytm intent tiles.

### Fixes

| File | Change |
|---|---|
| `src/utils/razorpay.ts` | Added `sanitizeRazorpayContact()` + `buildRazorpayPrefill()`; UPI block now declares `flows: ['intent']` **and** `flows: ['collect']`; added `remember_customer: true`. |
| `src/pages/BuyCourse.tsx` | Reads `profile.mobile` and builds the prefill via `buildRazorpayPrefill` (adds `contact` + `method: 'upi'`). |
| `src/utils/openSubscriptionCheckout.ts` | Same prefill builder, so subscriptions get identical UPI treatment. |
| `src/utils/razorpayNative.ts` | Prefill type accepts `method`; Sentry breadcrumb now records `has_contact` so a missing number is visible in production. |
| `src/test/razorpayPrefill.test.ts` | 6 new tests — number normalisation (`+91 73884 59249` → `7388459249`, `0…`, `91…`), invalid input omitted, both UPI flows present, UPI block pinned first. |

Contact normalisation is defensive: anything that does not reduce to a valid
10-digit Indian mobile (`[6-9]` first digit) is **omitted** rather than sent,
because Razorpay rejects a malformed `contact` and fails the whole checkout.

### Unchanged by design
Order creation, HMAC signature verification, the webhook fallback and the three
`enrollments` payment triggers are untouched. Native checkout still drops the
web-only `config.display` payload (correct — the Android SDK cannot serialise
it and silently degrades to a card-only sheet).

### Action required from you
If UPI still does not appear after this ships, the cause is server-side:
**Razorpay Dashboard → Settings → Payment Methods → UPI** must be ON, and the
account must be out of under-review / non-KYC state. No client config can
force a disabled method.

---

## Part 2 — Crash Shield audit

### Leak scan (whole `src/`, tests excluded)

| Signal | Add | Release | Verdict |
|---|---|---|---|
| `addEventListener` / `removeEventListener` | 165 | 148 | OK — see below |
| `setInterval` / `clearInterval` | 23 | 27 | OK |
| `createObjectURL` / `revokeObjectURL` | 23 | 38 | OK |

**The 17-listener gap is fully accounted for and is not a leak.** Every
unbalanced site is a *module-level singleton* registered once at import time
and intended to live for the app's lifetime:

`src/main.tsx`, `src/lib/crashShield.ts` (5), `src/lib/registerSW.ts`,
`src/lib/androidImmersive.ts`, `src/lib/nativeDebug.ts` (2),
`src/services/savedDownloads.ts` (2), `src/hooks/useScreenProtection.ts`,
`src/lib/itemPriority.ts`.

Two of these were flagged for a closer look and cleared:

- `useScreenProtection.ts:116` — the `app:resumed` listener sits at **module
  scope** inside a `typeof window !== "undefined"` guard, not inside the hook
  body. It registers exactly once per JS context. No per-mount stacking.
- `itemPriority.ts` — the React-facing subscription (`useItemPriority`) returns
  a proper unsubscribe for both `EVENT` and `storage`; only the module-level
  cross-tab cache invalidator is unbalanced, which is correct.

**Result: zero listener leaks found. No code change needed in Part 2.**

### Shield layers verified

- **Heartbeat watchdog** — 2s tick, 10s freeze threshold → `safeReload`.
- **Reload cooldown** — mirrored in `sessionStorage` *and* `localStorage`, so
  an Android WebView process kill (which wipes sessionStorage) cannot reset the
  guard and start a boot-crash-reload cycle. This is the single most important
  anti-pattern guard and it is correctly implemented.
- **Rejection trap** — `rejectionCount` is reset on the suppressed-reload
  branch, so a post-cooldown rejection cannot spam the path.
- **Memory watch** — 15s interval, warns at 400 MB used JS heap (Android OOM zone).
- **ErrorBoundary** — one silent auto-reload per 60s window, keyed on
  `nb_eb_auto_reload_at`; the manual retry button clears all three cooldown
  keys so a user is never stuck.
- **Query persister** — payload capped at 4 MB and trimmed query-by-query
  before write, so IndexedDB cannot grow into OOM territory.

### Device verification steps (for you, on a real device)

```bash
adb logcat | grep -iE "AndroidRuntime|chromium|WebView|lowmemorykiller|sadguru"
adb shell dumpsys meminfo com.sadguru.classes
adb shell am send-trim-memory com.sadguru.classes COMPLETE   # app must survive
```
Then: cold start → PDF → video → back, 20× → UI must stay responsive; background
10 min → resume → input within 2s.

---

## Verification performed

- `bunx vitest run` — **275 passed, 6 skipped, 0 failed** (32 files).
- Typecheck clean.

## Remaining (carried over, unchanged)

- 4 legacy `enrollments` rows without payment records (ids 21, 30, 35, 37).
- Leaked-password protection still needs the Supabase Dashboard toggle.
