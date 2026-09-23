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

## 2026-09-23 — Phase 2 (speed, mobile tests, pipeline) + owner asks
- [x] Admin dashboard 60-second snapshot cache (React Query) — commit 62c2772
- [x] Enrollment progress writer migration checked in (`20260927090000_enrollment_progress_writer.sql`) — commit 7d7556e, drift CI green
- [ ] Playwright E2E must be reliably green AND run more than 45/64 tests: wire existing secrets to the RLS specs, auto-discover lesson/quiz fixtures in preflight, add an Android (Pixel 7 emulation) leg, prove it via workflow_dispatch before merging
- [ ] OWNER: add `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` repo secrets (dedicated admin test account) — unblocks 12 admin/refund/payment-review specs
- [ ] Load test ("kitna student load jhel sakta hai"): k6 scenarios for landing + login + dashboard + lesson, distributed from a GitHub Actions matrix, Supabase free-tier metrics scraped during the run, egress budget capped; report with breaking point + p95 per stage
- [ ] Post-load-test fixes as expert: caching, query consolidation, feature kill-switches for the heaviest free-tier consumers (candidates: `user_sessions` PATCH loop, presence/realtime, admin polling)
- [ ] Thumbnails → WebP on upload (canvas re-encode, max 1280 px, keep original when smaller)
- [ ] Page-load monitoring persisted + admin monitor screen
- [ ] Workflow SHA pinning (all `.github/workflows/*.yml`, `workflow` scope now granted)
- [x] Release bookkeeping: CHANGELOG v1.17.0, IMPLEMENTATION_STATUS (done 2026-09-23 13:xx UTC)
- [ ] Always: `save.sh` after every edit; ZIP of sandbox source into Files when credits run low / at the end of the run
- [ ] OWNER: connect Supabase project "Creatoranuj's Project" to this Lovable workspace — only possible from the Lovable UI (Project Settings → Connectors → Supabase → choose the project); chat cannot link an existing Supabase project. Once linked, the load-test observer and DB tooling can read metrics directly from chat.
- [ ] OWNER (asked again 03:25 UTC, new workspace): link Supabase project "Creatoranuj's Project" via Project Settings → Connectors → Supabase — chat can only create a NEW Lovable Cloud project (supabase--enable), which would be the wrong backend; do not call it
- [ ] (3rd ask 03:27 UTC) Supabase "Creatoranuj's Project" still not visible from the sandbox (no SUPABASE_URL, no DB tools) — owner must finish the link in Project Settings → Connectors → Supabase; re-check env on next turn
- [x] (11:34 UTC) Supabase "Creatoranuj's Project" (ref `wegamscqtvqhxowlskfm`) is now linked to the Lovable workspace — read-only inspection from chat is possible; production data/schema stays untouched, E2E fixtures are still managed through the app itself

## 2026-09-23 — Both E2E suites green (Maestro Android + Playwright), branch `ci/maestro-green`
- [x] Maestro Android E2E green for the first time (#92 → #93 → …): debug Firebase client, verified credentials preflight, Pixel 5 x86_64 emulator, Settings scroll
- [x] Playwright: per-account login session reuse (rate limit), stuck-spinner watchdog recovery, desktop lesson-page scroll-lock bug (real user-facing bug)
- [x] Comment image now opens in the in-app viewer (UniversalFileViewer IMAGE) instead of the external browser; regression spec sees `doc-reader-shell`
- [x] `openFirstLessonList` reads the enrolled course's All Content list (card layout pinned) — no more folder-only dead ends
- [x] Mark-complete spec waits for the app's own confirmation (user_progress response or "Marked as …" toast) before each reload — #286 reloaded ~300 ms after the click, aborted the PATCH in-page and hydrated the un-patched 2-min bundle (server row had changed)
- [x] Maestro artifact: `include-hidden-files: true` so `--debug-output` hierarchy dumps + failure screenshots (written under `.maestro/tests/`) actually ship
- [ ] /goal (11:13 UTC) uploaded `maestro-report.zip` (run #93, smoke SUCCESS) + `playwright-report.zip` (07:57 UTC run, 86 pass / 17 skip / 0 fail — pre-fixture state): confirm the new runs #94 / #286 are green, then merge `ci/maestro-green` → `main` and verify `main` — status: Maestro #94 SUCCESS; Playwright #286 = 85 pass / 16 skip / 2 fail (only `lesson-completion › sticks across a reload`, fixed above) → re-run pending
- [x] Maestro `pdf-back` secondary flow was a no-op (taps index 0, looks for `.pdf` text, asserts a non-existent `pdf-viewer` id, no devtools hierarchy) — replaced by `maestro/overlay-back.yaml` (deep link → Comments → image comment → in-app viewer → hardware Back closes overlay only → second Back returns home); fixture resolved by `maestro-preflight.mjs` (`MAESTRO_COURSE_ID`/`MAESTRO_LESSON_ID`); `back-button-cold-start.yaml` fixed the same way (devtools + real tokens + 180 s budget)
- [x] LessonView comment-image viewer now has a back-button sentinel (`useOverlayBackClose`) — hardware/browser Back closes the viewer and keeps the lesson; Playwright `comment-image-in-app` asserts it, unit test for the labelled image button
- [ ] Promote `overlay-back` + `back-button-cold-start` from non-blocking to gating once each has passed twice in a row on `ci/maestro-green`
- [x] Maestro #96 (7e34d5b): smoke + back-button-cold-start passed; overlay-back reached the deep link and the app stayed on the dashboard — logcat proved the VIEW intent + `appUrlOpen` arrived. Root cause: WebView 109 parses `com.jsrcoaching.app://…` host-less → `toInternalPath` returned null for EVERY custom-scheme link (lesson deep links, Razorpay payment-callback return). Fixed engine-independently in `src/config/deepLinks.ts` + legacy-Chromium URL stub tests
- [x] `ForceUpdateGate` optional nudge ("Naya version … Baad me") suppressed on the `.debug` package (release APK can't install over it anyway); `overlay-back.yaml` also dismisses a stray "Baad me"
- [x] 98a33ef: Maestro #97 SUCCESS (smoke 1/1, overlay-back PASSED — deep link now lands on the lesson, back-button-cold-start PASSED) + Playwright #289 SUCCESS (89 pass / 0 fail / 14 skip) → merged to `main` as 57dd460 (12:58 UTC); main: Playwright #291 SUCCESS, Maestro #98 dispatched
- [x] Release bookkeeping: CHANGELOG cut as v1.17.0, IMPLEMENTATION_STATUS session 6 row (docs-only commit, no APK build)
- [x] (12:33 UTC, asked again) Supabase "Creatoranuj's Project" — already linked (ref `wegamscqtvqhxowlskfm`); nothing to do
- [x] Workspace reset again at ~12:35 UTC: GitHub connection re-linked (`std_01m3745vd9e5f8s1tj105qr8gz`, repo scope only — workflow-file edit stays local until a `workflow`-scoped connection exists)
- [x] (12:00 UTC, asked again) Supabase "Creatoranuj's Project" — already linked (ref `wegamscqtvqhxowlskfm`); no action needed
- [ ] OWNER: repo secret `E2E_QUIZ_ID` = `07ad6d64-cf9f-4185-a9ea-0afb7e3c2d8d` (preflight falls back to discovery meanwhile)
- [ ] OWNER: rotate the Firebase service-account private key that was pasted into chat (Firebase console → Service accounts → generate new key, delete old)
- [ ] OWNER: GitHub secret-scanning alert #7 (Google API key in `android/app/google-services.json`) — this is the Firebase *Android* key, shipped inside every APK by design; remediation is restriction, not removal: Google Cloud Console → Credentials → that key → Application restrictions = Android apps (`com.jsrcoaching.app` + `com.jsrcoaching.app.debug` with their SHA-1s) and API restrictions = Firebase Installations / FCM / Token Service; then close the alert as "Used in tests" (or "Won't fix") with that note
- [x] (13:09 UTC) /goal: "workspace resets baar baar nahi hone chahiye — yaad rakho" → saved to project memory (mem://workflow/workspace-reset-recovery): save after every edit, push early, silent reconnect + clone + restore, never re-explain resets
- [x] (13:10 UTC, asked again after reset) Supabase "Creatoranuj's Project" — already linked from the Lovable UI (ref `wegamscqtvqhxowlskfm`); chat cannot link an external Supabase project; nothing to do (memory: mem://workflow/supabase-linking)
- [x] Maestro #98 on main (57dd460): smoke PASSED, back-button-cold-start PASSED, overlay-back FAILED (non-blocking) — artefact showed a signed-in dashboard while the flow ran the sign-in subflow: `when: notVisible` fired during hydration. Flow now decides on a decisive token + waits for the hydrated dashboard before the deep link
- [x] Same screenshots exposed two APK bugs: PWA "Install the app" banner inside the native app (Dashboard, display-mode check) and a false "Update available — tap to reload" toast (vite:preloadError wiring in the native shell) — both fixed with unit tests
- [ ] Promote overlay-back + back-button-cold-start to gating after two consecutive green runs on the fixed flow (cold-start already 3/3: #96 #97 #98)

