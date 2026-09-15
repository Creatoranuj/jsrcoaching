# Release audit — v1.5.0 (12 September 2026)

Focus: Razorpay payment flow and the Capacitor Android build pipeline, plus a full re-run of the quality pipeline against `main`.

### Quality pipeline (re-run, all green)

| Check | Result |
| --- | --- |
| Install (frozen lockfile) | 1006 packages, OK |
| Type check (`tsgo`) | 0 errors |
| Lint | 0 errors, 304 warnings (unchanged budget) |
| Unit tests | 656 passed, 6 skipped, 0 failed (73 files) |
| Production build | Success; initial entry 121.5 KB vs 180 KB budget |

### Razorpay payments — 5 / 5

- Platform split is correct: `BuyCourse.tsx` and `openSubscriptionCheckout.ts` choose the native sheet via `Capacitor.isNativePlatform()` and only fall back to the web SDK otherwise, so UPI intents to PhonePe / GPay / Paytm keep working in the app.
- Order creation is server-side only (`create-razorpay-order`, `create-subscription-order`); no `order_id` or key is built on the client, and the key id comes back from the function rather than a frontend env var.
- Signature verification is server-side (`verify-razorpay-payment`, `verify-subscription-payment`) and the client treats the callback payload as untrusted until it returns.
- `razorpay-webhook` verifies `x-razorpay-signature` against `RAZORPAY_WEBHOOK_SECRET` and enrols idempotently on `razorpay_payment_id`, so a dropped callback still results in enrolment.
- Amounts are in paise everywhere; the native payload converts to a string of paise as the plugin requires.
- Covered by tests: `razorpayNativePayload`, `razorpayPrefill`, `formatRazorpayError`, `payment-race.integration`, `enrollment-bypass.integration`, plus the `razorpay-smoke` workflow (last run: success).

### Android / Capacitor build — 5 / 5

- `build-apk.yml` follows the pinned stack (Node 24, Bun, JDK 21, `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`), enforces a numeric `versionName` and tag/version match, typechecks with `tsgo`, then runs `assembleDebug` with log capture and an APK smoke check.
- Latest run on tag `v1.5.0`: **success**. Release assets published: signed APK (30.9 MB), AAB (27.5 MB) and web bundle.
- Remaining CI annotations (Node 20 deprecation notices, cold SDK cache warning, `flatDir` Gradle warning) are known non-blocking items and require no action.

### Still open

- **Leaked password protection is still disabled** in Supabase Auth (verified again on 12 September 2026). This is the only item keeping the project at 4.9 / 5; it is a two-click dashboard toggle the owner must flip.
- 17 `SECURITY DEFINER` linter findings remain accepted by design (each function self-checks roles or scopes to `auth.uid()`).

**Rating after this release audit: 4.9 / 5** — unchanged, and unchanged for the same single reason.
