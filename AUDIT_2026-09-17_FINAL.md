# JSR Coaching — Final End-to-End Audit (Verification Pass)

Date: 2026-09-17 · Commit audited: `2419151` (fresh clone) · 12 parallel audit lanes
Scope: 734 files under `src/`, 43 edge function dirs, 290 migrations, Android/Capacitor shell.
This pass applied **no fixes** — every claim below was re-verified against code; wrong claims from the
previous pass are explicitly corrected.

## Rating: 4 / 5 (up from 3.5)

The base is genuinely hardened: payments (HMAC + server-side amount re-derivation + replay
protection), RLS with `user_roles`/`has_role`, fail-closed content gating, trigger-based invariants,
Rolldown chunk groups, react-window virtualization, safe-area handling, PDF worker offload.
No proven exploitable vulnerability was found in this snapshot.

## Corrections to the previous report

| Previous claim | Verified status |
| --- | --- |
| CRITICAL: paid video unprotected — screen recording possible | **Wrong.** `FLAG_SECURE` is implemented via `@capacitor-community/privacy-screen`, ref-counted in `src/hooks/useScreenProtection.ts`, bootstrapped in `main.tsx`, admin-only bypass. |
| HIGH: `has_role()` executable by `anon` (role enumeration) | **Already fixed.** `20260731105058` does `REVOKE ALL ... FROM PUBLIC, anon` and splits anon-facing policies so they never call `has_role`. |
| CRITICAL: Tabs 28px unusable | **Partially wrong.** `TabsList` is `h-9` (36px) and the trigger `h-7` sits inside it; live Playwright at 411px found **zero** targets under 44px on rendered public pages. Downgraded to MEDIUM (dense tab rows in admin/quiz). |
| HIGH: rate limiter fail-open everywhere | Confirmed but low impact; recommend fail-closed only for `send-phone-otp`, `admin-register`, `recover-enrollment`. |

## CRITICAL

1. **Bunny video links are unsigned.** `supabase/functions/bunny-cdn/index.ts:149-155` and
   `src/lib/bunnyCdn.ts:68-75` return a bare `*.b-cdn.net` URL with no `token`/`expires`;
   `src/components/video/BunnyStreamPlayer.tsx:45-50` embeds `player.mediadelivery.net` with no
   token. If Bunny Token Authentication is off in the dashboard, a copied URL plays forever for
   anyone. Fix: generate Bunny signed URLs/embed tokens server-side with short expiry (mirror the
   1-hour signed-URL pattern already used in `get-lesson-url`).
2. **Route-level crash containment missing.** Only 5 of ~71 routes in `src/App.tsx` wrap their
   element in `ErrorBoundary`; everything else relies on the single root boundary, so one render
   error blanks the whole app (worst on `LessonView`, `Course`, `QuizAttempt`, all `Admin*`).

## HIGH

- **N+1 admin query.** `src/components/admin/ContentDrillDown.tsx:166-174` runs one count query per
  chapter sequentially — 20 chapters ≈ 6-10s on 3G. Batch with a single `.in()` or a grouped RPC.
- **No error tracking in edge functions.** 0/43 functions use Sentry; payment webhooks log only to
  `console.error`. `security_alerts` and `error_logs` are write-only/unused — a webhook-tamper event
  notifies nobody. No `x-request-id` correlation between client and server.
- **RLS regressions are invisible.** `src/lib/sentry.ts` `HANDLED_NOISE_RE` filters `PGRST301`,
  `42501`, `permission denied for table` into breadcrumbs, i.e. exactly the signature of a bad
  policy migration.
- **Native Android crashes not reported** — no `sentry-android`; only the homegrown
  `AppExitInfoPlugin`, which is not wired to alerting.
- **Android back button: 27 of 31 dialog files don't register the overlay sentinel**
  (`useAndroidBackButton`), so back press during e.g. the quiz-submit dialog navigates away instead
  of closing it.
- **0 of 43 edge functions validate input with zod**; 69 silent `catch` blocks; 201 `any` casts;
  `createClient` duplicated in 35 functions.
- **No audio focus handling** anywhere (calls/alarms don't duck or pause playback), and
  `MahimaGhostPlayer` (YouTube) never pauses on background — `BunnyStreamPlayer` does.
- **Asset weight**: 0-byte `src/assets/success.mp3` referenced twice (silent failure), PDF.js
  bundle 5.9MB shipped, 76 images without width/height, only 10/87 lazy. ~1.0-1.6MB recoverable.
- **God components**: `LessonView` 2,163 lines, `MahimaGhostPlayer` 1,519, `ContentDrillDown` 1,405,
  `MyCourseDetail` 1,321, `AdminUpload` 1,312, `FastPdfReader` 1,248.

## MEDIUM

- `useResolvedContentUrl.ts:50` — `.then()` with no `.catch()` on a storage call → unhandled
  rejection; `DocReaderShell.tsx:117` same pattern without a cancel guard.
- `admin_get_batch_roster` gates admin access with a `WHERE has_role(...)` row filter instead of
  `RAISE EXCEPTION` — bulk PII (email+mobile, 1000 rows) one bad diff from exposure.
- Unthrottled `mousemove`/`touchmove` state updates while scrubbing video (`MahimaGhostPlayer.tsx:841,872`).
- Mobile: `PaymentsSection.tsx:290` table has no `overflow-x-auto`; fixed `grid-cols-3/5` without
  breakpoints in TestimonialsManager, QuestionPalette, PlayerControls, ContentDrillDown, QuizResult,
  Reports; 4-5 column `TabsList` rows truncate at 360px.
- Missing haptics/active states on Switch, Checkbox, Radio, TabsTrigger, AccordionTrigger; async
  upload/delete buttons double-tappable (LibraryManager, FolderView, LandingCoursesManager).
- No stall/reconnect watchdog in either player; `PlayerErrorBoundary` can't see iframe network stalls.
- Orientation lock/unlock is not reference-counted (`src/lib/screenOrientation.ts:44-79`).
- Leaked-password protection disabled in Auth settings; `verify_jwt` off platform-wide (every
  function self-guards — add a CI grep for `requireUser|requireRole`).
- Sentry Replay disabled and 5s dedupe hides blast radius; `environment` only ever "production".

## LOW

- `/about`, `/contact`, `/auth` hit the 404 page and log `console.error` (`NotFound.tsx:8`) — add
  redirects or downgrade the log.
- 237 uses of `text-[10px]/[11px]`; fine for badges, too small for roster status and filenames.
- Non-null assertions after `Map.get()` in 5 admin files (safe today, fragile).
- `get-video-stream` trusts third-party Piped/Invidious instances — pin and validate hostnames.
- Breadcrumb/`max-w-[110px]` truncation stacks on 360px screens.

## Fix plan (priority order)

1. Bunny signed URLs + embed tokens (and confirm Token Authentication in the Bunny dashboard).
2. Wrap heavy routes in per-route `ErrorBoundary`; add `.catch()` to the two fire-and-forget promises.
3. Batch the ContentDrillDown counts; throttle the scrub handlers with `requestAnimationFrame`.
4. Edge-function observability: shared Sentry capture in `_shared/`, `x-request-id` propagation,
   alerting on `security_alerts` inserts, stop filtering `42501`/`PGRST301` into breadcrumbs.
5. Register the overlay sentinel in the remaining 27 dialog files; add audio-focus + background pause
   for the YouTube player.
6. Mobile pass on admin/quiz screens (table scroll wrappers, responsive grids, scrollable tab rows).
7. Assets: fix `success.mp3`, add width/height + lazy loading, trim unused/duplicate files.
8. Harden `admin_get_batch_roster` to raise; fail-closed rate limits for OTP/admin-register/recover;
   enable leaked-password protection.
9. Add zod validation to payment/AI edge functions; split the six largest components.

## Blockers outside code

- **Ask a Doubt still down live.** `_shared/cors.ts` already lists `jsrcoaching.vercel.app`, but the
  deployed functions still answer with `access-control-allow-origin: https://safarenglishka.vercel.app`
  → the edge functions need a redeploy (or `ALLOWED_ORIGINS` set) with a Supabase access token.
- **Bunny dashboard**: confirm whether Token Authentication is enabled; it decides whether C1 is an
  active content leak or just missing defense in depth.
