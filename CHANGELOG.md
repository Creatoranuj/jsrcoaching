# Changelog — Safar English

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
