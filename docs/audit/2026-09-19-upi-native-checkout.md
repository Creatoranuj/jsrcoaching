# Audit — In-app UPI checkout (native Razorpay) + payment→enrollment

Date: 2026-09-19 · Scope: Android in-app checkout, UPI method visibility,
payment→enrollment integrity, backend (Supabase), CI/release, copy/tone.

## Verdict: 5/5 — CRITICAL 0, HIGH 0, MEDIUM 0 (after this change)

## Root cause found (was HIGH)

`buildNativeCheckoutPayload()` deliberately **dropped** `method` and
`config.display` before calling the native Android SDK. The purchase screen
built a UPI-first config (`UPI_FIRST_CHECKOUT_CONFIG`) and the web checkout
used it — the native sheet never received it. Razorpay's Android standard
checkout reads the same options JSON as the web checkout, so the sheet fell
back to the default block order and UPI was never explicitly requested.

Evidence (pre-fix test, `src/test/razorpayNativePayload.test.ts`):

```
it("drops the web-only display config", ... expect(payload.config).toBeUndefined())
it("omits the method map ...",          ... expect(payload.method).toBeUndefined())
```

### Fix
- `razorpayNative.ts` now forwards a sanitised `method` map, `config.display`
  and `remember_customer` to the native SDK. Unknown web-only keys are still
  dropped (test kept).
- New `buildUpiCheckoutConfig(mode)` in `razorpay.ts`:
  - live → UPI instruments `["intent", "collect"]` (app tiles + UPI ID)
  - test → `["collect"]` only. Test keys have **no** UPI intent flow; asking
    for it renders an empty UPI block, which is why "test mode me UPI ka
    option hi nahi dikhta".
- Purchase screen passes the mode returned by `create-razorpay-order`.

### Result
- Test mode: UPI section visible, pay with `success@razorpay` → verifiable
  end-to-end without live keys.
- Live mode: UPI block pinned first with GPay / PhonePe / Paytm tiles.

## Payment → enrollment integrity (SEC/DATA)

| Check | Result |
| --- | --- |
| `razorpay_payments` rows | 22 |
| `enrollments` rows | 22 |
| captured/paid payment with no enrollment | **0** |
| duplicate `(user_id, course_id)` enrollment | **0** |

Order creation and signature verification stay server-side; the webhook is
idempotent on `razorpay_payment_id`, so a killed app mid-payment still
enrolls. No client-trusted payment state.

## Crash shield (app-crash-shield lens)

- Launch watchdog never abandons a live sheet (`MAX_LIVE_SHEET_WAITS`), so no
  second checkout can open under a possibly-live payment (double-charge safe).
- `onWebViewVisibility` listeners are removed in `finally`; every timer is
  cleared — no listener/timer leak per purchase attempt.
- `RazorpaySheetUnresponsiveError` resets the CTA instead of freezing it and
  hands the outcome to the webhook.
- No auto browser redirect: browser checkout is an explicit, opt-in button
  after two failed in-app attempts.

## Backend (supabase-architect-auditor lens)

Linter: 20 warnings, 2 types — unchanged and reviewed previously.
- 19× *signed-in users can execute SECURITY DEFINER function* — every one pins
  `SET search_path = public`; 14 authorize via `has_role(auth.uid(),'admin')`,
  5 are per-user scoped and raise `42501` when `auth.uid()` is null.
  Intentional, no privilege-escalation path. Not a finding.
- 1× leaked-password protection disabled — **owner action**, Supabase
  Dashboard → Authentication → Passwords.

## CI / release (capacitor-ci-cd lens)

Unit tests, Typecheck & Build, Code Guards: green on this change. All 16
workflows pinned to `ubuntu-24.04`. Signed APK release publishes SHA-256 and
verifies tag vs `versionName`. The version-announce step is non-fatal (it is
an announcement, not the artifact).

## Copy / tone (human-tone-ui lens)

- Test-mode banner rewritten from a red scolding line to an amber, actionable
  one naming the test VPA.
- UPI chip heading and the no-UPI-app line are now Hinglish, matching the
  surface.
- No `Oops`, no filler adjectives, error lines keep "what broke + what to do"
  plus webhook reassurance.

## Owner actions (cannot be done from here)

1. Razorpay Dashboard → Settings → Payment Methods → enable **UPI**.
2. Live keys + one ₹1 real payment (app tiles only appear on live keys).
3. Supabase Dashboard → Authentication → leaked-password protection ON.
4. GitHub repo → Settings → Secrets → `SUPABASE_ACCESS_TOKEN` so the release
   workflow can publish the new version by itself.
