# Engineering Audit — 2026-09-18

Scope: full inventory of `src/` (routes, pages, hooks, components) and `supabase/`
(functions, migrations). This is a mature, previously-audited codebase — most
prior findings (role-in-profiles, hardcoded WebView allowlist, debug console
shipping to prod, admin FLAG_SECURE trap, mutation queue never draining) are
already fixed and documented inline with `AUDIT` comments. This pass focused on
finding anything still open.

## Inventory
- **Routes/pages**: ~90 lazy-loaded pages in `src/App.tsx`, split public/auth-gated/admin, wrapped per-route in `<ErrorBoundary fallbackTitle=...>` for the data-heavy screens (Dashboard, Course, Lesson, Quiz, Live).
- **Hooks**: ~80 hooks in `src/hooks/`, mostly TanStack Query wrappers over Supabase tables plus native-integration hooks (`useAndroidBackButton`, `useScreenProtection`, `useDeepLinks`, `useResumeRecovery`).
- **Edge functions**: 44 functions under `supabase/functions/`, including payment (`create-razorpay-order`, `verify-razorpay-payment`, `razorpay-webhook`, `verify-subscription-payment`), auth (`send-phone-otp`, `verify-phone-otp`, `manage-session`), and content-serving (`get-lesson-url`, `get-video-stream`, `pdf-proxy`, `resolve-storage-pdf`).
- **Migrations**: 292 files; roles were migrated out of `profiles` into a dedicated `user_roles` table with `has_role()` as the authorization source of truth (see `20260123135424_...sql`, `20260227013113_...sql`, `20260228011535_...sql`).

## Findings

### [LOW] [MAINT] Unsafe `console as any` shim in boot code
**Where:** `src/main.tsx:52-56` (before fix)
**Why it matters:** Two `eslint-disable-next-line @typescript-eslint/no-explicit-any` directives plus two `as any` casts existed purely to reassign `console[lvl]`. `any` widens the type surface and hides typos in the level union at compile time.
**Fix:** Build a typed `Record<LogEntry["level"], (...a: unknown[]) => void>` lookup instead of casting `console` to `any`, so both the read (`original[lvl]`) and write (`console[lvl] = ...`) paths stay type-checked.
**Status:** [APPLIED]

### [PROPOSED — no change needed, verified safe] [SEC] `dangerouslySetInnerHTML` usage
**Where:** `src/components/ui/chart.tsx:70`, `src/components/books/BookCard.tsx:87`, `src/pages/Books.tsx:185`, `src/components/lecture/ObsidianNotes.tsx:368`
**Why it matters:** Any unescaped user-controlled string reaching `dangerouslySetInnerHTML` is a stored-XSS vector.
**Fix / verification:** `chart.tsx` only interpolates static config keys/hex colors, not user input. `BookCard.tsx`/`Books.tsx` JSON-LD blocks explicitly escape `<`, `>`, `&` before injection. `ObsidianNotes.tsx` runs `DOMPurify.sanitize` twice — once to strip all tags from raw input, once on the generated HTML with a strict allow-list. No change required; documenting as verified so a future refactor doesn't accidentally drop the sanitize calls.
**Status:** N/A (verified, not a finding)

### [PROPOSED] [DATA] No visible database-level uniqueness constraint audit for enrollment/payment idempotency
**Where:** `supabase/functions/verify-razorpay-payment`, `supabase/functions/razorpay-webhook`, migrations under `supabase/migrations/`
**Why it matters:** Payment verification + webhook both write enrollment/payment rows from two independent triggers (client-verify call and Razorpay webhook). If both fire concurrently for the same `razorpay_payment_id` without a DB-level `UNIQUE` constraint (not just an application-side check), a race can create duplicate enrollment/payment rows or double-grant access.
**Fix:** Confirm (or add) a `UNIQUE` constraint on `payments.razorpay_payment_id` (and equivalent for subscriptions) plus `ON CONFLICT DO NOTHING`/`DO UPDATE` upserts in both the verify function and the webhook handler, so the second writer is a no-op instead of a race.
**Status:** [PROPOSED] — requires a migration + touching two payment-critical edge functions; too risky to apply without a DB session to confirm current constraints and a way to test the payment flow end-to-end.

### [PROPOSED] [PERF] Hook fan-out on lesson/course detail pages
**Where:** `src/hooks/useLessonAttachments.ts`, `useLessonNotesCounts.ts`, `useLessonLikes.ts`, `useLessonBookmarks.ts`, `useLessonMarkers.ts`, `useLessonChat.ts` all queried per-lesson from `LessonView`/`LessonTabs`
**Why it matters:** Each hook issues its own Supabase query keyed by `lessonId`; a lesson page can fire 6+ parallel requests instead of one aggregate RPC. Not N+1 in the classic per-row sense (TanStack Query dedupes/caches), but it is avoidable request fan-out on every lesson navigation, which matters on slow mobile networks (this app explicitly optimizes for that — see splash/query-persister comments).
**Fix:** Consider a single Postgres RPC (`get_lesson_detail_bundle`) returning attachments/counts/likes/bookmarks/markers in one round trip, mirroring the pattern already used by `get_user_profiles_admin`/`get_platform_stats`.
**Status:** [PROPOSED] — architectural change spanning multiple hooks + a new RPC + RLS review; out of scope for a low-risk pass.

### [PROPOSED] [OBS] Broad `console.error`/`console.warn` usage without a consistent structured-logging wrapper
**Where:** 139 call sites across `src/` use raw `console.log/warn/error`
**Why it matters:** No consistent breadcrumb/context (user id, route) is guaranteed at every call site, so triage relies on ad hoc message text. The project does have `guard:console` (a script gating console usage) and a Sentry-style `nativeDebug`/error-reporting layer (`_shared/errorReporting.ts` for edge functions), so this is a completeness gap, not a missing capability.
**Fix:** Audit remaining raw `console.error` call sites in `src/` and route them through the existing client-side error reporter (mirroring `_shared/errorReporting.ts` on the edge-function side) so production errors reach the same triage pipeline consistently.
**Status:** [PROPOSED] — a sweep across 139 call sites is a large diff; flagging for a dedicated pass rather than touching call sites individually here.

## Wins
- Roles live in a dedicated `user_roles` table with a `has_role()` SECURITY DEFINER function as the sole authorization source; `profiles.role` was dropped in a follow-up migration — a full close-out of the classic "role on profiles" AUTHZ bug.
- Capacitor config is already hardened per the Capacitor lens: `webContentsDebuggingEnabled` gated on `CAP_DEBUG=1` (off by default/CI), no `*.google.com`-style wildcards in `allowNavigation` (narrowed to specific hosts, with an inline note explaining why), `PrivacyScreen.enable: false` with JS as the single source of truth to avoid trapping admins, and a documented JS safety timeout (800ms) on the splash screen.
- `verify-razorpay-payment` verifies signatures with a timing-safe HMAC comparison, checks auth via `getClaims`, and fails closed (503) if the Postgres rate limiter is unreachable rather than silently allowing the request through.
- `ObsidianNotes.tsx` double-sanitizes user markdown through `DOMPurify` (strip-all on input, allow-list on generated HTML) before `dangerouslySetInnerHTML` — the highest-risk XSS surface in the app is handled correctly.
- Extensive inline `AUDIT` comments throughout the codebase document prior findings and their fixes (e.g. debug console gated out of prod bundles, mutation-queue drain wiring, admin FLAG_SECURE bypass logic) — this is a codebase that has been genuinely audited and iterated on, not just shipped once.

## Rating: 4/5
Well-architected, actively hardened codebase with correct authz separation and payment-verification fundamentals. Docked one point for the payment-idempotency constraint that couldn't be confirmed without direct DB access, and for the per-lesson hook fan-out that will matter more as usage scales.

## Prioritized fix plan
1. Confirm/add a DB-level `UNIQUE` constraint + idempotent upsert on `payments.razorpay_payment_id` (and subscription equivalent) — closes a potential double-grant race between webhook and client-verify paths. [PROPOSED]
2. Consolidate the lesson-detail hook fan-out into a single RPC bundle to cut mobile request count on the highest-traffic screen. [PROPOSED]
3. Sweep remaining raw `console.error` sites into the existing structured error-reporting pipeline for consistent OBS coverage. [PROPOSED]
4. (Done) Remove the last `any`-cast/`eslint-disable` pair in the boot console shim. [APPLIED]
