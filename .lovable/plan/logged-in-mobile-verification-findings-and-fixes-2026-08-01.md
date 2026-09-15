# Logged-in Mobile Verification — Findings and Fixes

I signed into the app in a real browser with the test account at 390x844 (mobile) and
walked through Dashboard, My Courses, Courses, Timetable, All Classes and Downloads.

## What is already correct

- Login works and lands on `/dashboard`.
- No horizontal overflow on any of the 6 pages (`scrollWidth == clientWidth == 390`).
- No "Class Class 12" / "Grade Grade" duplication anywhere — `formatGrade` is holding.
- No runtime console errors (only React dev-mode `forwardRef` warnings, which never ship).
- Bottom nav renders on every page and page content scrolls clear of it.
- Perf snapshot per page: 60 FPS, CLS 0.000-0.005, LCP 0.68-1.4s, JS heap flat at 22 MB
  across all six navigations — no memory growth, so no leak on route changes.

## Issues found

### 1. Perf debug overlay covers the bottom navigation (P1, visible on every page)

A dark `perf` panel is pinned bottom-right at z-index 2147483647 and sits directly on top
of the "My Courses" and "Downloads" tabs, making them untappable. It appears on all six
pages. Cause: it auto-enables on any dev build, and the Lovable preview is a dev build, so
you see it every time you use the preview.

Fix: make it strictly opt-in (`localStorage.nb_perf = "1"` only, drop the automatic
dev-build trigger) and lift it above the bottom-nav height plus safe-area inset so it can
never cover navigation even when deliberately turned on.

### 2. "Knowledge Hub" course shows the red PDF placeholder (P1, data)

Confirmed in the database: course 15 has both `image_url` and `thumbnail_url` set to NULL,
so the card falls back to the generic red PDF tile on Courses and My Courses. The other
course (Class 12 Batch 2027) has a valid image and renders correctly, so the image pipeline
itself is fine.

Fix: this needs a real image. Two options — upload one through the admin panel, or I
generate a course-banner image, upload it to the `content/courses/` bucket and set both
columns. Additionally, replace the red PDF fallback with a neutral branded gradient tile
carrying the course title, so any future course without an image still looks intentional.

### 3. Inner scroll containers ignore bottom-nav spacing (P2)

The global `body[data-has-bottom-nav]` padding only protects pages that scroll the body.
Pages with their own `overflow-y-auto` / `ScrollArea` (Admin screens, `Doubts.tsx:715`)
keep their last row underneath the tab bar.

Fix: add bottom padding inside those scroll containers.

### 4. Fixed-pixel scroll heights break on small phones (P2)

`h-[500px]` / `h-[400px]` ScrollAreas in `Admin.tsx`, `AdminChatbotSettings.tsx`,
`AdminCMS.tsx`, `AdminUpload.tsx` exceed a 360x640 viewport.

Fix: replace with `max-h-[calc(100dvh-220px)]` so they scale down.

### 5. Twelve stale test assertions (P2)

`Login.test.tsx` (10), `pdf-system.test.ts` (2), `signedSmokeRegression.test.ts` (1) fail on
outdated queries — the login page now has more than one "sign in" button, so the selector is
ambiguous. These are test-side only; the app behaves correctly.

Fix: tighten the selectors and update the assertions to current markup.

## Technical detail

- `src/App.tsx:41-50` — drop `import.meta.env.DEV` from `perfOverlayEnabled`.
- `src/components/dev/PerfOverlay.tsx:18` — `bottom: 8` becomes
  `calc(env(safe-area-inset-bottom) + 72px)` on mobile widths.
- `src/components/CourseCard.tsx` — swap the PDF-icon fallback for a gradient + title tile.
- Course 15 image: generate, upload to `content/courses/`, then update
  `courses.image_url` / `thumbnail_url` via migration.
- Admin ScrollArea heights and the Doubts scroller: padding + responsive max-height.
- Test files: `src/test/components/Login.test.tsx`, `src/test/pdf-system.test.ts`,
  `src/test/signedSmokeRegression.test.ts`.

## Not changed

No auth, RLS, payment-gate or Capacitor config changes — those were verified in the previous
audit and all triggers remain attached and enabled.
