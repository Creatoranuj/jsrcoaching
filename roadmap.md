# Roadmap ― 4.1 → 5/5 hardening

- [x] Typecheck + build CI (workflow `typecheck-build.yml`, commit 8334c88)
- [x] Review 17 SECURITY DEFINER functions — all verified safe-by-design (admin functions self-check role; read helpers scope by auth.uid(); all have fixed search_path). No revocation: would break app + RLS.
- [x] Migration-drift CI (workflow `migration-drift.yml`, commit e249814) — informational until baseline verified
- [x] Lint cleanup phase 1 — 617 → 576 warnings (41 stale disable-comments auto-removed)
- [x] LessonView split phase 1 — Smart Notes panel extracted to `src/features/lesson/components/LessonNotesPanel.tsx` (2558 → 2284 lines); tests/typecheck/build all green
- [x] AUDIT_REPORT.md updated — overall 4.1 → 4.7
- [ ] Leaked-password protection — deferred by owner (dashboard toggle)
- [ ] LessonView split phase 2 — attachment/PDF section
- [ ] Remaining 529 `any` warnings — gradual
- [ ] Flip migration-drift CI to blocking after first clean run

- [x] Razorpay checkout blank screen (Capacitor/app WebView) — native SDK callback lifecycle hardened; Android build #195 passed
- [x] Verify `Creatoranuj's Project` backend connection after workspace move
- [x] Harden native Razorpay callback validation and produce a verified Android APK (GitHub Android build #195 passed)
- [x] "Opening payment" stuck fix — native cancel() now reports whether the Razorpay sheet is still open; JS watchdog keeps waiting instead of orphaning a live payment
- [x] "Opening payment" stuck — REAL root cause fixed. `com.razorpay:checkout` resolved `standard-core:LATEST` (1.7.x), where `Checkout` is a Fragment that reports the result to the host Activity via `PaymentResultWithDataListener`; `MainActivity` never implemented it, so the result vanished (verified by decompiling the published APK). Fix: MainActivity implements the listeners → `RazorpayNativePlugin.deliver*()` single-settle; `standard-core` pinned to 1.7.18; JS live-sheet ceiling raised to ~10 min and now raises `RazorpaySheetUnresponsiveError` (no web fallback under a live sheet). Validation: tsc, 686 Vitest (Playwright intentionally NOT run).
- [ ] Physical-device confirmation of the fixed APK: UPI tile → GPay/PhonePe round-trip → enrollment (cannot be proven in CI)

## 2026-09-19 — Browser (Custom Tab) checkout fix + release
- [x] `/pay` browser checkout used the LIVE UPI-intent layout even on a test key → empty UPI block / sheet never rendered. Now uses `buildUpiCheckoutConfig(mode)` derived from the `rzp_test_` key prefix, and `buildRazorpayPrefill` (sanitised contact, so Razorpay skips the contact-entry screen and shows recommended UPI apps).
- [x] `openExternal()` silently fell back to `window.open()` on native — a no-op inside the Capacitor WebView, so a missing/failed in-app-browser plugin looked like "kuch hua hi nahi". It now rethrows on native so `BuyCourse` shows the real error toast.
- [x] Live backend loophole re-verification (no migration needed): enrollments INSERT policy requires free course OR completed `razorpay_payments` row; `profiles.role` column absent, `user_roles` writable by admins only (and never for self); `content` bucket is `public = false` (only `book-covers` is public).
- [x] `bun run build` + `npx cap sync android` clean; tsc clean; 706 vitest pass.

## 2026-09-19 (late) — Sentry end-to-end + audit (commit 3ed6408, release v2026.9.19.1)
- [x] In-app Razorpay sheet never opened → browser fallback. Root cause: `loadRazorpayNative()` resolved the bare Capacitor proxy; Promise `.then` probe became a native call (`"RazorpayNative.then()" is not implemented`, 120 events). Loader now returns `{ plugin }`; guard test `nativeLoadersThenSafe.test.ts`.
- [x] LessonView / AdminQuizManager TDZ (`Cannot access 'Er' before initialization`) — same-scope use-before-define; ESLint rule promoted to error + `tdzLintGuard.test.ts`.
- [x] recover-enrollment triple Sentry reporting → one canonical `EnrollmentRecoveryError` grouped by status+code; auth/offline → breadcrumbs; My Courses shows cause-specific toasts (re-login / offline / AMOUNT_MISMATCH → WhatsApp support).
- [x] `logger.error()` promotes a plain context object in the error slot; Sentry console forwarder skips `[error]` mirrors.
- [x] ChatWidget: one Sentry report per failure class per page-load; `chatbot` edge fn returns 503 `gateway_unauthorized` on AI-gateway 401/403.
- [x] pdf-proxy 403: enrollment-gate copy; 403/404 no longer captured as exceptions.
- [x] Reports: `docs/observer/2026-09-19-sentry-triage.md`, `docs/observer/2026-09-19-senior-architect-audit.md` (rating 4/5).
- [x] 7 of 8 Sentry issues marked resolved-in-next-release with commit refs (APP-13/14/15/16/17/18/19). The pdf-proxy 403 issue must be resolved manually in Sentry (ID lookup failed after the workspace move).
- [x] GitHub API reconnected in the new Lovable workspace (fresh connection; commits go through the gateway again).
- [ ] OWNER: rotate `LOVABLE_API_KEY` in Supabase → Edge Functions → Secrets (old-workspace key → chatbot 401), redeploy `chatbot`, send one test message.
- [ ] OWNER: install the v2026.9.19.1 APK, ₹1 in-app purchase, confirm the Razorpay sheet opens inside the app, then open a lesson + a PDF.
- [ ] OWNER: re-link Supabase under Project Settings → Connectors in the new Lovable workspace (only needed for DB tooling from chat).
- [ ] Bandwidth (after Egress-report baseline): `useSiteSettings()` consolidation (4 hooks → 1 query); visibility-driven `user_sessions` flush instead of tab-count × 5-min PATCH.
- [ ] Polish backlog: diagnostics panel `text-xs`; browser-escape button as `variant="link"`; Eruda `beforeSend` filter.
- [ ] Decide: bump `app_config.min_android_version` to force pre-plugin APKs to update.
- [ ] Playwright E2E (CI) — same 5 failures on every run since at least 7a46bef (pre-dates today's fixes): `auth.spec.ts:136` existing-email signup lands on /my-courses; `learning-journey.spec.ts:70` + `lesson-completion.spec.ts:35` `lesson-card` never visible for the E2E account's `E2E_COURSE_ID`; `pdf-offline.spec.ts:61/86` uploaded `test.pdf` never listed. 39 pass / 20 skip. Needs the live E2E account + course IDs (env secrets) to reproduce — check the account is still enrolled in `E2E_COURSE_ID` and that the course has published lessons before treating as a code bug.

## 2026-09-20 — Final consolidated audit
- [x] Compiled `docs/observer/2026-09-20-final-audit.md` — Sentry triage (7/8 resolved), architect audit 4/5, crash-shield, bandwidth baseline, payments status, verification (771 tests green), owner checklist.

## 2026-09-20 — chatbot redeploy + PDF flow verification
- [x] Chatbot edge function redeployed via `deploy-functions.yml` workflow_dispatch on main (a565b56) — deploy + live health gate success. Chatbot code was already latest (last change 03c22df5, included in the Sep-19 deploy).
- [x] PDF download flow verified in code (see final audit reply): pdf-proxy enrollment gate → `downloadFile()` → native Filesystem streaming with progress on APK, fetch-blob fallback on web; HTML-instead-of-PDF guard.
- [x] pdf-proxy 403/404 hard-closed in code (commit 4e34bfc): `HANDLED_NOISE_RE` drops `Unexpected server response (403|404)` at the Sentry transport, so no code path can re-open issue 7634304049; regression test `src/test/sentryNoise.test.ts` (4 tests green). OWNER: click Resolve on issue 7634304049 in Sentry UI once (no Sentry token in this workspace).
- [ ] OWNER: update `LOVABLE_API_KEY` in Supabase Edge Functions secrets if chat still shows "server key issue" after this redeploy.

- [ ] Supabase project "Creatoranuj's Project" connect karna (chat se possible nahi — user ko Lovable UI: Project Settings > Connectors > Supabase)

## 2026-09-21 — Course thumbnail display
- [x] Add one crop-safe 16:9 course artwork frame with full-image display and soft background fill.
- [x] Apply it to Dashboard, Courses, My Courses, course detail, checkout and admin upload preview.
- [x] Prefer `thumbnail_url` over legacy `image_url` in the Courses catalog.
- [x] Add 1280×720 guidance and non-blocking ratio warning to thumbnail upload.
- [x] Verify typecheck and full automated suite (955 passed, 6 intentionally skipped).
- [ ] Mobile/desktop live rendering will be confirmed after the repository commit is deployed.
