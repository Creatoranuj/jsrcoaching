# Changelog — Safar English

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [v1.17.0] — 2026-09-23

Both end-to-end suites green on the same commit for the first time —
Maestro Android E2E #97 (smoke + overlay-back + back-button-cold-start) and
Playwright E2E #289 (89 passed, 0 failed, 14 skipped) on `98a33ef`, merged to
`main` as `57dd460`.

### CI — Maestro Android E2E (never green before)
- Every run since the `.debug` applicationIdSuffix landed died in
  `:app:processDebugGoogleServices` — "No matching client found for package
  name 'com.jsrcoaching.app.debug'" — before the emulator ever booted.
  Registered `com.jsrcoaching.app.debug` as a second Android app in the
  `jsr-app-403f6` Firebase project (app id
  `1:586153778410:android:1c0bd81f8573da97034b93`) and refreshed
  `android/app/google-services.json` with the console-generated file, which
  now carries both clients. Production client + keys are unchanged; debug/CI
  builds get their own Firebase app instead of a hand-duplicated entry.
- Run #88 (first to reach the emulator) showed three more layers:
  1. `bunx cap sync android` ran without `CAP_DEBUG=1`, so
     `capacitor.config.ts` shipped `webContentsDebuggingEnabled: false` and
     the flows' `androidWebViewHierarchy: devtools` had no DevTools socket to
     read — the landing rendered (logcat: crashShield installed, hero images
     served) while every text assertion timed out. Cap sync now sets
     `CAP_DEBUG=1`, same as signed-apk-smoke.
  2. The Nexus 6 (1440x2560) AVD under swiftshader ran out of memory: lmkd
     "device is not responding", `com.google.android.gms.persistent` died and
     Android killed the app with it ("depends on provider
     …FontsProvider in dying proc"). Emulator is now `pixel_5`, 4 GB RAM,
     512 MB heap, 3 cores, `-no-snapshot`; Maps/YouTube/Messages/QSB are
     disabled on the device before install.
  3. The runner's inline `script:` executes each line via a fresh `sh -c`, so
     `trap`/`set -e`/`LOGCAT_PID` never carried over and no final screenshot
     or Maestro debug output was collected. Moved to
     `scripts/ci/maestro-emulator.sh` (single bash process, EXIT trap,
     `--debug-output`, meminfo + devtools socket dumps, logcat crash tail on
     failure).
- `maestro/smoke.yaml`: first-paint tokens refreshed to the current JSR
  COACHING landing ("Admission help|Signup|Login|Dashboard|…"); the old
  "Angreji bolne|safar shuru|Free lesson dekhein" copy no longer exists.
- Run #89 (all of the above applied) booted in 55 s, rendered the landing,
  opened Login, typed the stored account and was told "Invalid email or
  password." — the emulator/devtools/tokens are right; the password secret
  the workflow used is stale. New `.github/scripts/maestro-preflight.mjs`
  runs before the APK build: it tries `MAESTRO_*`, then `E2E_*` (the pair
  playwright-e2e verifies every run), then `TEST_USER_*` against the Supabase
  password grant and exports the first working pair as
  `MAESTRO_EMAIL/PASSWORD` (masked) for the emulator step. No working pair
  fails in ~2 s naming the secrets to refresh instead of 10 min later with a
  red-banner screenshot.
- Known, non-blocking: Firebase Installations returns 403
  `API_KEY_ANDROID_APP_BLOCKED` for the debug package (the Android API key is
  restricted to `com.jsrcoaching.app`). Push tokens fail on CI only; add the
  debug package + debug-keystore SHA-1 to the key restriction in Google Cloud
  → Credentials if CI ever needs FCM.
- Run #91 (preflight applied) signed in with the verified pair and walked
  Dashboard → My Courses → Downloads → Profile. It failed on the last
  assertion only: the Settings button sits below the fold on Profile, so both
  optional taps (`profile-settings` id, "Settings" text) were skipped and the
  Settings-screen check ran against Profile. `maestro/smoke.yaml` now scrolls
  the button into view first (same pattern as `login-submit`) and the
  Settings check also accepts the Notifications/Preferences card titles.

### Fixed — lesson completion survives a reload
- "Mark as done" (My Courses) and the 80 %-watched auto-complete (lesson
  player) only wrote `user_progress` and component state. The course-detail
  screen hydrates from a 2-minute-fresh React-Query entry and a localStorage
  bundle (`initialData`), so a refresh inside that window painted the
  pre-toggle snapshot and the tick vanished until the next background
  refetch. New `lib/perf/courseProgressCache.syncLessonCompletion()` patches
  both layers after the confirmed write (no extra network) — root cause of
  the red `lesson-completion › sticks across a reload` E2E spec on desktop
  and Pixel 7. Unit-tested (`courseProgressCache.test.ts`).

### CI — Playwright E2E
- Run #283: four tests (learning-journey, lesson-completion x2, payment-flow)
  landed on `/login` after a correct submit and Pixel 7 legs flaked the same
  way. ~100 password sign-ins per run from one runner IP exceed Supabase's
  default sign-in limit (30 / 5 min / IP). `e2e/helpers/auth.ts#signIn` now
  drives the login form once per account per worker, captures the
  `sb-<ref>-auth-token` localStorage entry, and restores it for every later
  call (landing on `/dashboard` directly; falls back to the form if the app
  bounces). Wrong-credential tests never cache; `smoke › login flow` and
  `auth › redirect to dashboard` pass `{ fresh: true }` so the real form is
  still exercised on every project.
- `auth › dashboard within 20 s`: the retry loop re-clicked without
  re-filling, so after one wiped render every attempt submitted an empty
  form and the Pixel 7 leg burned its whole budget (flaky). Each attempt now
  re-fills and only counts once the sign-in request left the page; the
  stopwatch starts at that click.
- Run #284/#285 (session reuse applied): the remaining reds were app bugs
  and brittle navigation, not data.
  1. **Desktop lesson page froze** — `LessonView` applied its landscape
     scroll-lock (`body { position: fixed; overflow: hidden }`, the
     screenshot-shield class) on every landscape viewport, including a
     1280 px desktop window, so Comments / Notes / Rating below the player
     could never be scrolled or clicked. The lock now applies only to
     coarse-pointer (touch) devices. Real user-facing bug.
  2. **Comment images opened in the external browser** (`openResource`
     → `openExternal`), so the "no new tab / in-app reader" regression spec
     could never see a reader. Comment image taps now mount
     `UniversalFileViewer` (IMAGE) inside the lesson; its wrapper carries
     `data-testid="doc-reader-shell"` like `DocReaderShell`.
  3. **Lesson discovery** walked `/classes/:id/chapters` → chapter → folder
     and could stop on a folder-only screen ("reached a screen with no
     lesson cards"). `e2e/helpers/course.ts` now opens
     `/my-courses/:id?chapter=__all__`, pins the card layout
     (`nb_lesson_view`) and returns the `Lecture:` cards — the same list
     students use for Mark-as-done.
  4. **Mark-complete "sticks across a reload"** reloaded ~300 ms after the
     restore click. The toggle flips optimistically but the course-detail
     cache (React-Query entry + 2-minute-fresh localStorage bundle) is only
     patched once the `user_progress` request resolves; the reload aborted
     that request in the page, hydrated from the un-patched bundle and showed
     the old state for the whole stale window although the row had changed
     server-side (trace: `PATCH …user_progress → -1`). The spec now waits for
     the app's own confirmation (`user_progress` response or the "Marked as
     …" toast) before every reload — the signal a student sees.
  5. New `e2e/helpers/stall.ts` (`settleApp`, `pollWithStallRecovery`)
     presses the app's own "Taking longer than expected… Retry" the way a
     student would; buy-gate, lecture-list and lesson-progress specs use it.
  6. `auth › duplicate email`: a throttled signup request is accepted as the
     correct outcome instead of a red.

### CI — Maestro artifact
- `maestro test --debug-output DIR` writes its per-command hierarchy dumps
  and failure screenshots under `DIR/.maestro/tests/<timestamp>/`; the
  upload step skipped dot-directories, which is why runs #88-#93 only ever
  shipped `final-screen.png`. `include-hidden-files: true` added.

### Fixed — hardware Back inside the comment-image viewer
- The in-app image viewer LessonView mounts for comment attachments had no
  history sentinel: on Android, hardware Back fell through
  `useAndroidBackButton` to route-level back and dropped the student out of
  the lesson (browser Back did the same on web). LessonView now registers the
  overlay with `useOverlayBackClose("lesson-comment-image")` — Back closes the
  viewer, the lesson and its Comments panel stay put; programmatic close pops
  the sentinel itself.
- The comment image is a real `<button aria-label="Open comment image">`
  wrapping the `<img>` (keyboard focusable; Maestro's DevTools DOM walker
  drops `<img>` nodes and maps aria-label → resource-id, so this is the only
  handle the Android flow can tap). Playwright still targets the `<img>` and
  now also asserts the Back contract (`e2e/comment-image-in-app.spec.ts`);
  unit test `src/test/commentsPanelImageButton.test.tsx`.

### CI — Maestro secondary flows (rewritten)
- `maestro/pdf-back.yaml` never exercised anything: it tapped `index: 0` on
  My Courses, waited for ".pdf" text (the E2E course has no PDF lesson) and
  asserted `id: pdf-viewer`, which does not exist in the app — and it ran
  without `androidWebViewHierarchy: devtools`, so every assertion was blind
  anyway. Replaced by `maestro/overlay-back.yaml`: warm launch (reuses the
  smoke session, signs in only when needed), `openLink` deep link to the
  lesson's Comments tab (safe now — the app has hydrated and MainActivity is
  `singleTask`), tap the image comment, assert `doc-reader-shell`, hardware
  Back → viewer gone + still on the lesson, second Back → home, app alive.
- Fixture discovery: `maestro-preflight.mjs` resolves a lesson with an image
  comment inside an enrolled course with the verified session (honours
  `E2E_LESSON_ID` / `E2E_COURSE_ID` when still valid) and exports
  `MAESTRO_COURSE_ID` / `MAESTRO_LESSON_ID`; `maestro-emulator.sh` passes
  them via `--env` and skips the flow with a notice when none is found. Each
  secondary flow gets its own `--debug-output` dir.
- `back-button-cold-start.yaml` gained `androidWebViewHierarchy: devtools`
  (same blind-assertion root cause as the smoke flow on 2026-07-16), real
  landing tokens (`Admission help|Signup|Login`) and a 180 s first-paint
  budget instead of 8 s — a cold WebView on the swiftshader emulator needs
  60-120 s.
- Both secondary flows stay non-blocking until they pass twice in a row.

### Fixed — custom-scheme deep links never worked on WebView < 130 (found by Maestro #96)
- Run #96's first `overlay-back` attempt showed the VIEW intent reaching
  `MainActivity`, Capacitor firing `appUrlOpen` to a live listener — and the
  app staying on the dashboard. Android System WebView 109 (the API 33 image,
  and every phone whose WebView never got a Play update) parses non-special
  schemes as an opaque path: `new URL("com.jsrcoaching.app://classes/30/…")`
  returns `host: ""` and `pathname: "//classes/30/…"`. `toInternalPath` joined
  `host + pathname`, got `//classes/…`, failed the allow-list and returned
  `null` — silently, for every custom-scheme link: lesson deep links, the
  Razorpay `com.jsrcoaching.app://payment-callback?…` return (the resume
  reconciler was quietly covering for it), `openLink` in every Maestro flow
  since 2026-07. Modern engines (Chromium ≥ 130, Firefox, Safari, Node) return
  `host: "classes"`, which is why the unit tests passed.
- `src/config/deepLinks.ts` now cuts the scheme off itself and re-parses the
  remainder against an https base, so the result is identical on every
  engine (dot segments normalised before the allow-list check, `?`/`#`
  preserved, backslashes folded). `src/test/deepLinks.test.ts` gained a
  legacy-Chromium `URL` stub that reproduces the quirk and proves the old
  implementation returned `null` for the lesson link and the payment return.
- The smoke.yaml note that blamed only listener timing for dropped
  `openLink`s carries the real root cause now; `overlay-back.yaml` is the
  on-device regression test.

### Fixed — APK showed web-only banners (found by Maestro #98 screenshots)
- Dashboard "Install the JSR COACHING app for a better experience" banner
  rendered inside the Android app: the Capacitor WebView reports
  `display-mode: browser`, so the standalone check never matched. Hidden when
  the native bridge is present (`isNativeRuntime()`).
- "Update available — tap to reload" toast inside the APK: `appUpdate.ts`
  listened for `vite:preloadError` everywhere, but in the native shell the
  bundle is fixed and served locally, so a failed chunk preload is a transient
  hiccup, not a deploy — and the APK cannot update itself. The prompt is no
  longer wired in the native shell (`isCapacitorShell()`); `lazyWithRetry` /
  `chunkError` keep retrying + one reload as before. Unit tests cover both
  the guard and the web wiring.

### CI — overlay-back sign-in decision (Maestro #98 flake)
- The flow evaluated `when: notVisible: <dashboard tokens>` about a second
  after the first paint while the dashboard was still hydrating (main thread
  janked ~6 s after the warm launch), concluded "signed out", ran the sign-in
  subflow on a signed-in dashboard and failed on "Welcome Back". It now waits
  for a decisive token (hydrated dashboard OR sign-in entry), signs in only
  when a signed-out token is positively visible, and waits for the hydrated
  dashboard again before firing the deep link.

### Fixed — optional-update nudge on the `.debug` package
- `ForceUpdateGate` showed "Naya version (1.8.9) aa gaya hai" on the CI/QA
  debug build. "Update karein" fetches the release APK, whose applicationId
  differs, so it cannot install over the debug build — the tester just ends
  up with two apps. The nudge also sat over every screen in the Maestro
  flows (a Radix dialog blocks the taps underneath). The optional nudge is
  now skipped when `App.getInfo().id` ends in `.debug`
  (`isDebugPackageId`, unit-tested); forced/minimum-version blocks still
  apply so that path stays testable. `overlay-back.yaml` additionally
  dismisses a stray "Baad me" before touching the lesson, for older APKs.


---

## [v1.16.3] — 2026-09-21

### CI — Playwright E2E (third pass, from run artifacts)
- `pdf-offline › autoscroll`: drives the real controls — gear opens the speed
  sheet, picks 0.1x, Escape closes it, play FAB starts — and measures the
  pages' actual scroll container. The old spec pressed play first and then
  waited for a speed chip that only exists inside the sheet.
- `auth › dashboard within 20 s`: retries a submit click that landed before
  the handler mounted and times only the attempt that navigated.

---

## [v1.16.2] — 2026-09-21

### Fixed — My Library
- Tapping a file row now opens the file. Previously only the small "Open"
  text button did; a tap on the name/icon did nothing.

### CI — Playwright E2E (second pass, from run artifacts)
- `pdf-offline`: after a reload the spec clicked the folder-switcher menu
  trigger (labelled with the current folder name) instead of the folder card;
  the open Radix menu swallowed every later click. The spec now checks the
  breadcrumb, targets non-menu buttons, and opens documents via the row's
  "Open" action.
- `lesson-completion`: presses play (headless never autoplays) and accepts
  the player's progress slider as proof the tracker mounted when the embed
  cannot start in CI.
- `learning-journey › quiz`: when `E2E_QUIZ_ID` is not attemptable by the
  E2E account the app bounces to the dashboard; the spec now skips with the
  reason instead of clicking the banner carousel for 45 s.

---

## [v1.16.1] — 2026-09-21

### Fixed — My Library
- Adding a file with the "+" button while a folder was open did not show the
  file until the folder was re-opened (the bytes were saved, the list was not
  told). Every add now broadcasts the library refresh event the open folder
  listens for, so the new row appears immediately.

### CI — Playwright E2E (5 failures diagnosed from run artifacts, none were timing)
- `learning-journey` / `lesson-completion`: the helper clicked the first
  chapter card, which is the synthetic "All Content" folder (renders
  sub-chapter folders, never lesson cards). It now opens the first chapter
  with a non-zero lecture count and descends folders when needed.
- `auth › existing email`: leaked-password protection rejected the textbook
  test password ("appeared in a known data breach") before the duplicate-email
  check ran. The spec now uses a unique, never-breached password.
- `pdf-offline`: the spec set the fixture on whichever `<input type="file">`
  came first; it now targets the PDF-accepting picker and waits for the
  refresh broadcast above.

---

## [v1.16.0] — 2026-09-21

### Fixed — "paisa kat gaya, course nahi aaya"

- **Browser UPI return said "Link poora nahi mila".** `/pay` wrote
  `?payment=success&course=<id>` while `/payment-callback` only read
  `course_id=`. Both sides now go through ONE parser
  (`parsePaymentReturnParams`) that also accepts every legacy name, so no
  return link — old APK, support link, Razorpay redirect — can be misread.
- **Every confirmed enrollment now lands on the My Courses LIST**
  (`buildPostEnrollmentPath`), never a course detail page. In-app checkout,
  callback screen and the interrupted-payment resume all use the same
  destination, so a paying student always sees the new course sitting there.
- **App Links could not open the app.** `assetlinks.json` published a
  fingerprint that no shipped APK was signed with. It now publishes the real
  release key (`B2:8B:E6:…`), with the old one kept for existing installs, and
  a test fails the build if they ever drift apart again.
- **Paid students bounced to "Please purchase this course".** The 7-day
  LessonView bundle and the warm chapter cache carry `hasPurchased`, and both
  guards fired before the server answered. Lesson pages now redirect only
  after a fresh access answer, and `markEnrollmentChanged()` clears all four
  enrollment-bearing caches (shared list, My Courses snapshot, chapter bundle,
  LessonView bundle) the moment an enrollment lands.
- **My Courses announced "0 courses enrolled" while still loading** — read as
  "mera course gayab hai". It now says the list is loading.
- **My Courses missed browser returns.** The arrival/reconcile hook now also
  accepts `?course=<id>`, not just router state, which does not survive a full
  page load.
- **Two pollers on one purchase.** The resume hook now stands down on the My
  Courses list too, not just the old detail URL.

---

## [v1.15.1] — 2026-09-21

### Fixed
- **Tap targets below the 44px minimum.** The markdown toolbar in the lecture
  notes editor (10 buttons), the remove-attachment button in Messages, and the
  rename confirm/cancel buttons in the Smart Notes sheet were 24–32px. All are
  now `h-11 w-11`. The `check-tap-targets` guard ratchets from 43 to 31, which
  un-reds the Code Guards job.

---

## [v1.15.0] — 2026-09-21

End-to-end repair of the pay → enrollment → course path, from three student
screen recordings (2026-09-21 12:58 / 12:59 / 13:08). Root cause in every case:
the app stopped believing a payment that was actually alive or already done.

### Fixed
- **Watchdog abandoned a live payment sheet.** The native watchdog only trusted
  the bridge's `dismissed:false` when our WebView reported itself hidden. But
  Razorpay's CheckoutActivity is a *translucent* overlay, so Android keeps
  reporting the WebView as visible while the sheet is open. Result: at 5 s the
  app declared the launch dead, dropped the eventual success callback, and the
  student landed back on an active "Pay ₹299" button with money already
  captured. The bridge is now the only authority, and the launch window is 8 s
  to cover a cold Activity start on mid-range phones.
- **"A checkout is already open" red error.** A second tap for the same order
  now re-attaches to the live sheet and resolves with its real result. When no
  handle exists (WebView reloaded), a calm `RazorpayCheckoutBusyError` asks the
  student to finish the open payment — no second checkout is ever opened under
  a possibly-live one.
- **Late success no longer lost.** A signed result that arrives after the
  watchdog gave up is delivered on a late-success channel and verified normally.
  Partial payloads (no signature) are left to webhook recovery.
- **Endless "Enrollment confirm ho raha hai".** The payment-return screen keyed
  its effect on the `user` object, so every token refresh cancelled the waiter
  and restarted it — 29 s of spinner over an already-unlocked course. It now
  keys on the user id, cancels only on unmount, and always reaches a terminal
  state with "Dobara check karein" / "My Courses" after 20 s.
- **Double charge risk.** A last enrollment check runs immediately before order
  creation, and any screen showing a pay CTA leaves it the moment enrollment
  lands from any source.
- **Silent edge-function skip.** `deploy-functions.yml` returned green when
  `SUPABASE_ACCESS_TOKEN` was missing, so live functions silently drifted behind
  `main`. A push that changes functions now fails loudly.

### Added
- `nb:enrollment-landed` broadcast — webhook sweep, recovery, direct read and
  verify all announce a landing, so every open screen moves at once.
- Rate-safe enrollment waiting: a direct RLS-scoped read of the student's own
  enrollment row every 3 s, interleaved with a `recover-enrollment` schedule
  that never exceeds the server's 5-calls-per-60 s limit and now covers ~5 min.
- Identity-stable auth state (`src/lib/authIdentity.ts`).

### Tests
- 928 passing. New: `authIdentity.test.ts`, `reconcileEnrollment.test.ts`
  (rate-limit budget, cancellation, per-course broadcast) and six new native
  guards incl. translucent-sheet waiting, 8 s window, late success, partial
  payload rejection, re-attach and busy checkout.

---

## [v1.14.1] — 2026-09-21

### Added
- **Guardian: leaked-password gate.** New neutral (⚪) gate plus an "Aapke hisse
  ka kaam" card linking straight to Supabase Auth providers. App-side HIBP check
  (`src/lib/leakedPassword.ts`) already blocks breached passwords on signup,
  reset and change; the Supabase Auth toggle is dashboard-only and cannot be
  read from SQL, so the gate stays neutral by design instead of faking green.

### Fixed
- **Guardian open-write gate false red.** `service_role`-only permissive
  policies (`pdf_source_resolutions`) are excluded — service_role bypasses RLS,
  so such a policy is not an open door.

### Verified
- `npx cap sync android`: 20 native plugins registered, `capacitor.build.gradle`
  and `capacitor.settings.gradle` byte-identical to `main` — no drift, no plugin
  change needed (Capacitor 7.6.5, not 6.x).
- Bundle: 355 JS chunks, 5.8 MB raw / 1.8 MB gzip total; first paint pulls
  ~186 kB (57 kB gz) `index` + 196 kB gz CSS/vendor set. Heaviest lazy chunks:
  html2pdf 935 kB, vendor-sentry 476 kB, vendor-pdf 419 kB, vendor-charts
  405 kB. Guardian screen itself is 6.9 kB (2.7 kB gz).
- 922 tests pass, typecheck and lint clean.

---

## [v1.14.0] — 2026-09-21

### Added
- **Backend Guardian (admin-only, read-only).** New `/admin/guardian` screen plus
  `public.admin_guardian_snapshot()` (STABLE SECURITY DEFINER, `search_path =
  public, pg_catalog`, raises `forbidden` 42501 for anon/non-admin). Reports live
  proof per gate: RLS on every public table, enrollment INSERT policies that check
  admin/payment, open write policies on `user_roles`, a stray `profiles.role`
  column, public storage buckets, any policy with `USING/WITH CHECK true`,
  SECURITY DEFINER functions missing `search_path`, `cron.job` activity,
  `audit_security_policies()` regressions, completed Razorpay payments without a
  matching enrollment, and the 8 largest tables (free-tier bandwidth watch).
  Guard: `src/test/admin-guardian-gates.test.ts` (7 cases) asserts every gate
  turns red on its own failure shape. No Capacitor plugin change, so no
  `cap sync` needed.

---

## [v1.13.1] — 2026-09-22

### Fixed
- **Mobile Upload Center form was cut off on the right.** The upload form card
  measured 843px inside a 411px phone viewport because the upload-type tab strip
  (`flex gap-2 overflow-x-auto`) has nowrap buttons summing to ~800px min-content,
  and the grid item's default `min-width: auto` expanded the card to fit. Added
  `min-w-0` to both Upload Center cards and `min-w-0 w-full max-w-full` to the tab
  strip. Verified live at 411x745: cards 379px, document overflow 0.
- **Lesson rows overflowed to 527px on phones.** Radix ScrollArea's viewport child
  is `display: table; min-width: 100%`, which sizes to the widest row's max-content.
  Forced a block box on the viewport child in `src/components/ui/scroll-area.tsx`.
- **Upload Center "Dashboard" back button was invisible** (white text on the default
  white outline background). It now uses a transparent background.

### Added
- `src/test/adminRowLayout.test.ts` — 5 more regression tests (form card min-w-0,
  lesson card min-w-0, shrinkable tab strip, ScrollArea viewport block, readable
  back button).
- `src/test/survivalMode.test.ts` — 15 tests locking survival-mode defaults, the
  protected critical paths, and the admin wiring.

---

## [v1.13.0] — 2026-09-21

### Fixed
- **Upload Center edit/delete were invisible on phones.** Chapter and sub-folder
  actions used `opacity-0 group-hover:opacity-100`; a touch device has no hover,
  so admins could never see them. They are now always visible and fade only on
  devices that report `hover: hover`.
- Upload Center chapter/sub-folder rows stack title-over-actions below `sm` and
  truncate long titles, matching the content drill-down fix from v1.12.1.

### Added
- `aria-label`s on Upload Center chapter and sub-folder edit/delete buttons.
- Guard tests in `src/test/adminRowLayout.test.ts` covering hover-only actions,
  stacked rows, truncation and labels in `AdminUpload.tsx`.

### Audit (no code change needed)
- All `admin_*` SECURITY DEFINER functions verified to check `has_role()` internally;
  the only anon-executable definers (`course_availability`, `lookup_email_hint`)
  are rate-limited and return masked data.
- Live anon probes: enrollment insert, `user_roles`, `profiles`, `razorpay_payments`,
  `lessons` all 401; unsigned webhook 400. Auth/Storage/PostgREST 200.
- Slow-query review: `user_sessions` hot columns already indexed; latency is RLS +
  free-tier cold start, not a missing index.
- Payment settlement engine (v1.12.0) untouched.

## [v1.12.1] — 2026-09-21

### Fixed
- **Admin chapter rows no longer overlap on phones.** Subject and chapter rows
  stack title-over-actions below `sm`, the title truncates instead of wrapping,
  and every reorder/edit/delete button is `shrink-0` — the reorder arrows can no
  longer be drawn on top of the chapter name (reported on a 411px device).
- Reorder arrows in both lists now carry `aria-label`s.

### Added
- **DPP → Quiz shortcut.** DPP / DPP Attempt / Test lessons get a Quiz button in
  the admin content manager that opens the Quiz Manager pre-filled with course,
  chapter, lesson and type. If that lesson already has a quiz, the existing quiz
  opens for editing instead of creating a duplicate
  (`src/features/admin-quiz/lib/quizDeepLink.ts`).

### Tests
- `src/test/quizDeepLink.test.ts`, `src/test/adminRowLayout.test.ts`.

---

## [v1.12.0] — 2026-09-21

### Added
- **Post-payment settlement engine** (`src/lib/paymentEngine.ts`). One brain for
  "the sheet closed, now what?": server verify → enrolled → caches dropped →
  redirect to My Courses **immediately** (no artificial wait). Verify timed out
  / 5xx → two bounded reconcile calls → "pending" hands the student to the
  course page's "Syncing your course…" gate instead of stranding them on the
  payment page. Hard 4xx (bad signature, refunded) is the only real failure.
- **Single-flight settlement.** Duplicate handler calls for the same Razorpay
  order share one promise — verify is never raced against itself.
- **Dismiss safety check.** A dismissed sheet triggers exactly one quiet
  server check (UPI intent flows can finish inside the UPI app). Money landed →
  celebrate + redirect; genuine cancel → device reminder cleared so resume never
  shows a false "payment mil gaya" toast.
- The in-app checkout (native + web) now remembers the purchase on the device
  **before** the sheet opens, so an app killed mid-UPI is finished by
  `usePaymentResume` on the next open. The reminder is cleared the moment the
  server confirms.

### Changed
- `usePaymentResume` no longer polls while `/buy-course/*`, `/payment-callback`
  or `/my-courses/:id?payment=success` own the purchase — one poller at a time,
  so the 5-calls/60 s limiter is never tripped by two loops.
- `usePaymentSync` clears the device reminder once the server confirms.

### Verified
- 881 unit/integration tests pass (6 skipped); `tsc --noEmit` clean; ESLint
  clean on touched files. New: `src/test/paymentEngine.test.ts` (14 tests).

---

## [v1.9.0] — 2026-09-20

### Fixed
- **Razorpay UPI in the Android app.** The Capacitor WebView silently dropped
  `upi:` / `intent://` links (`ERR_UNKNOWN_URL_SCHEME`), so the browser UPI
  option never opened a UPI app. `RecoveryWebViewClient` now overrides
  `shouldOverrideUrlLoading` with an external-scheme allow-list, parses
  `intent://` via `Intent.parseUri` with `browser_fallback_url`, and falls back
  to the system browser (or a clear Hindi message) when no app handles it.
- Offline / slow-network PDF opens no longer freeze at a stuck percentage:
  network pre-check, 45 s byte-fallback deadline, and auto-retry when
  connectivity returns.
- Free-course enrollment now honours the batch gate (batch closed / seats full),
  fail-closed when the gate cannot be read.

### Added
- Sanitized UPI/intent diagnostics in the WebView — scheme + authority only
  (120-char cap), resolved handler package, device tag. Payment order ids and
  tokens are never logged. Visible via `adb logcat -s RecoveryWebView`.
- JSR brand mark in both update dialogs, replacing the generic sparkle icon.
- Public `/releases` history page and Admin → App Releases publishing flow.
- Scheduled reconcile of stuck payments every 15 minutes (`x-cron-secret`).

### Verified
- Build green; 814 unit/integration tests pass (6 skipped); 12/12 completed
  payments have matching enrollments.

---

## [v1.8.2] — 2026-09-18

### Fixed
- **Storage-uploaded course thumbnails / banners / subject icons did not load.**
  The `content` bucket is private (it also holds enrollment-gated lessons,
  materials and notes), so the permanent `getPublicUrl()` links used for the
  five presentation prefixes returned 400. Those paths are now signed like
  every other object.
- Storage RLS: added `content_presentation_read`, granting `anon` +
  `authenticated` SELECT on exactly `courses/`, `thumbnails/`,
  `hero-banners/`, `chapter-icons/`, `banners/` — so signed-out visitors can
  load course cards while gated study material stays private.
- Storage RLS: four admin-manage policies (`content`, `book-covers`,
  `course-videos`, `notices`) targeted role `public`, so their `has_role()`
  call was evaluated for `anon` and made **every** anonymous storage request
  fail with `permission denied for function has_role`. Scoped to
  `authenticated`.

### Verified (live)
- Anonymous sign + fetch of `thumbnails/course_35_*.jpg` → HTTP 200, 314 KB.
- Anonymous sign of `lessons/*` → denied.
- ESLint 0, `tsc --noEmit` clean, 712 tests passing, build OK, cap sync OK.

---

## [v1.8.1] — 2026-09-18

Maintenance release. Consolidates the merged audit work (PR #48, #49, #50) and
the admin icon-by-link feature; no behaviour changes beyond what those PRs
introduced.

### Added
- Subject / chapter icons can be set **or updated by link** after creation
  (Paste Link / Upload Icon toggle in the inline edit row); clearing the field
  removes the icon.
- Storage-backed icons now render through the content-URL resolver in the admin
  list, so `storage://` paths no longer show as broken images.

### Security
- Live database verification of the two revenue/privilege loopholes
  (paid enrollment without payment, role escalation via a profile row):
  both confirmed CLOSED against the live project — paid enrollment only through
  `complete_paid_enrollment()`, roles only in `public.user_roles` + `has_role()`.
- The missing `content` storage bucket was restored and the affected course
  thumbnail re-uploaded.

### Verified
- ESLint 0 problems, `tsc --noEmit` clean, 712 tests passing (6 skipped),
  production build OK, `npx cap sync android` OK (21 plugins).

---

## [v1.8.0] — 2026-09-18

Release after a full end-to-end audit (engineering + design + crash/memory)
and the type-safety cleanup that removed every ESLint problem from the tree.

### Changed
- Type-safety cleanup across ~125 files: every `any` replaced with precise
  Supabase row / narrowed `unknown` types; hook dependency arrays corrected
  without behaviour changes. ESLint: 318 problems → 0.
- Design tokens: hardcoded `green-*`/`amber-*`/raw HSL swapped for semantic
  `success` / `gold` tokens on admin surfaces.
- Service worker precache now points at `/brand/jsr-mark.webp`; the stale
  pre-rebrand `/brand/nb-mark.webp` entry fetched 31 KB nothing rendered.
- Boot-time debug console shim is typed (no `as any`, no eslint-disable).

### Removed
- 8 unreferenced image assets (~196 KB): pre-rebrand `nb-mark` copies,
  orphaned `jsr-mark.png`, `sarthi-avatar.webp`, `sadguru-mascot.webp`,
  `student-3d.webp`, `home-3d.webp`.

### Fixed
- Sub-44px icon-only dismiss control in the library manager upload row.
- Course thumbnails: missing storage bucket is now probed once per session, so
  cards paint the branded placeholder immediately instead of firing broken
  image requests.

---

## [Unreleased]

### Added
- Stripe payment integration (configuration pending)
- GitHub Actions automated APK build workflow

### Changed
- Complete rebrand from "Sadguru Coaching Classes" to "Safar English"
- Chatbot renamed from "Sadguru Sarthi" to "Safar Sarthi"
- Session management stripped for instant login
- Fetch retry with exponential backoff on Supabase client
- Vercel deployed to Mumbai region (bom1)

---

## [v1.4.2] — 2026-09-11

### Added
- **Native exit-reason reporting (no `adb` required).** New `AppExitInfo`
  Android plugin reads `ActivityManager.getHistoricalProcessExitReasons`
  (API 30+); `src/lib/nativeExitInfo.ts` reports the newest unseen record once
  per cold boot. Low-memory kills, native crashes and ANRs now reach Sentry
  with RSS/PSS and importance; normal user exits stay breadcrumb-only.
- Crash shield: heap warnings at 80% of the device's real JS heap limit,
  throttled `longtask` breadcrumbs (400 ms+), and `trackBlobUrl` /
  `releaseBlobUrl` for revocable large PDF/video blob URLs.

### Changed
- **Full-screen PDF fits the device.** `computeFitPageSize` keeps the
  edge-to-edge width fit in portrait and caps width by visible height in
  landscape, so a rotated phone shows a whole page instead of a sliver.
  `FastPdfReader` refits on resize, `visualViewport`, `orientationchange` and
  `screen.orientation` change.
- **Auto-scroll survives rotation** — `useAutoScroll` resyncs its scroll
  position against the new layout instead of jumping back or parking at the
  bottom.
- Full-screen player heights use `dvh` fallbacks for gesture-navigation
  devices.

### Fixed
- APK workflow: branch names containing `/` no longer break artifact upload or
  the APK copy step (`SAFE_VERSION`).

---

## [v1.4.1] — 2026-09-10

### Added
- Reader auto-scroll respects the admin toggle: the auto-scroll FAB in the
  library doc reader, PDF viewer and Notion notes now hides when
  `lesson_reader_autoscroll` is off; Smart Notes reader follows
  `lesson_notes_autoscroll`.
- `useLessonFeatureFlag` — provider-free, cached, defaults ON flag reader for
  surfaces rendered outside the react-query tree.

---

## [v1.4.0] — 2026-09-10

### Changed
- `Admin.tsx` 1,296 → 932 lines: overview cards, payments tab, teachers tab,
  courses tab and the refund dialog extracted to `src/features/admin` (#46).
- `LessonView.tsx` 2,576 → 2,518 lines: desktop header, locked overlay and the
  chip strip extracted to `src/features/lesson`, with pure chip helpers in
  `src/features/lesson/lib/lessonChips.ts` (#47).
- `AdminUpload.tsx` 1,370 → 1,314 lines: upload type tabs and breadcrumb
  extracted to `src/features/admin-upload`, with label/icon/colour and
  breadcrumb rules moved into `uploadRules.ts` (#48).

### Added
- Unit tests for shared helpers: masking, grade labels, password strength,
  disposable-email blocking, filename decoding, quiz answer matching, safe
  storage, file-type detection, download URL rewriting, item priorities and
  format chips.
- E2E journeys: lesson completion with progress persistence
  (`e2e/lesson-completion.spec.ts`) and the admin refund guard rail
  (`e2e/refund-journey.spec.ts`).

### Internal
- Coverage ratchet raised: lines 7.5, functions 6.7, branches 7.4, statements 7.2.

---

## [v1.3.0] — 2026-09-10

### Changed
- `Admin.tsx` 1,432 → 1,296 lines: payment unification, search/status filtering,
  teacher lists and CSV shaping extracted to `src/features/admin/lib/adminFilters.ts`;
  users tab, sessions tab and role/status badges extracted as components (#43).
- `LessonView.tsx` 2,636 → 2,576 lines: Notes/Attachments chip panel extracted to
  `src/features/lesson/components/LessonAttachmentsPanel.tsx` (#44).

### Added
- 45 tests covering admin filters, admin panels and the lesson attachments panel.
  Suite 470 → 515 passing.

### CI
- Coverage ratchet raised to lines 6.7 / functions 5.6 / branches 6.2 / statements 6.3.

No behaviour, permission, RLS, migration or API contract changes.

---

## [v1.0.0] — 2026-03-08

### Added
- Full student dashboard with course browsing and enrollment
- Video player with watermark, custom controls, end-screen overlay
- PDF viewer supporting direct links, Google Drive, and Archive.org
- Quiz engine with timer, question palette, mark-for-review, score results
- Safar Sarthi AI chatbot (RAG-powered, Hinglish support)
- Razorpay payment integration with manual UPI fallback
- Admin panel: course management, chapter/lesson editor, quiz builder, analytics
- Live class support (YouTube Live embed + Zoom)
- Mentor chat with online status indicators
- Notices, timetable, syllabus, and attendance tracking
- PWA support (installable from browser on Android and iOS)
- Capacitor Android APK support

### Security
- Row-level security on all Supabase tables
- Admin/teacher/student role separation via `user_roles` table
- Secure quiz answer delivery via `questions_for_students` view

---

## How to Create a New Release

1. Make your changes and push to `main`
2. Tag the release:
   ```bash
   git tag v1.1.0
   git push origin v1.1.0
   ```
3. GitHub Actions automatically builds the APK and publishes it to the Releases page
4. Share the GitHub Releases URL with students
