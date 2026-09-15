# Changelog — Safar English

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
