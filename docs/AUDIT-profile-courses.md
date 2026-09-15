# Audit: Profile + Courses

**Rating: 3/5** — Both pages function, but image handling had a real UX bug (avatars/thumbnails silently degrading to a transparent placeholder), plus scattered MEDIUM concerns worth cleaning up before shipping.

Applied the `senior-architect-audit` and `asset-optimization` skills.

## Findings

### [HIGH] [UX] Avatars & course thumbnails often show only initials/placeholder — FIXED
**Where:** `src/components/common/SmartImage.tsx:93-108`
**Why it matters:** The step-1 branch (`attempt !== src && !attempt.startsWith("data:")`) matched *any* URL that wasn't the raw `src`, including the component's own cache-bust retry URLs (`?_r=N`). Result: a transient network hiccup caused (a) `supabaseTransformsDisabled` to be flipped globally for the session and (b) the retry state to bounce back to `src`, wasting the retry budget and swapping in the transparent fallback GIF. On the Profile page the initials underlay showed instead of the avatar; on Courses the placeholder showed instead of the real thumbnail.
**Fix:** Narrowed the branch to fire only when the failing URL is actually the Supabase `render/image/public/` endpoint.

### [MEDIUM] [PERF] `Courses.fetchLessonCounts` pulls every lesson row
**Where:** `src/pages/Courses.tsx:34-52`
**Why it matters:** `select("course_id, duration")` on the entire `lessons` table runs on every mount, hits the 1000-row default cap, and blows past it as content grows. Duration + count should be aggregated in a Postgres RPC (`select course_id, count(*), sum(duration) from lessons group by course_id`) and cached.
**Fix:** Add a `get_course_lesson_stats()` SECURITY DEFINER function; call it once per mount.

### [MEDIUM] [DATA] `Courses` fetches all courses with no pagination / no `is_published` filter
**Where:** `src/pages/Courses.tsx:81-84`
**Why it matters:** Unpublished/draft courses will surface once a `is_published` column exists. Also missing `limit` + range pagination.
**Fix:** Filter by `is_published=true` (add column if missing) and paginate via `.range()`.

### [MEDIUM] [MAINT] Duplicate `formatDuration` import + local shadow
**Where:** `src/pages/Courses.tsx:11` + `71-76`
**Why it matters:** Local `formatDuration` shadows the imported one; the import is dead code and confuses maintainers.
**Fix:** Remove the import.

### [MEDIUM] [UX] Profile page has no error surface when Supabase update fails silently on auth-cache-only render
**Where:** `src/pages/Profile.tsx:63-70`
**Why it matters:** If `getProfile()` returns no row and there's no cached auth profile, the page returns `null` with no visible feedback.
**Fix:** Show an inline retry state instead of `return null`.

### [LOW] [A11Y] Profile edit icon button has no `aria-label`
**Where:** `src/pages/Profile.tsx:130-136`
**Fix:** Add `aria-label="Change avatar"`.

### [LOW] [MAINT] `Courses` uses `https://placehold.co/...` as image fallback
**Where:** `src/pages/Courses.tsx:91`
**Fix:** Use a local SVG placeholder from `src/assets/thumbnails/` to avoid third-party dependency and offline breakage inside APK.

## Wins
- `ProfileAvatar` keeps an initials underlay so alt text never bleeds — the earlier "Mr Anuj Kumar Yadav" APK bug stays fixed.
- `SmartImage` centralizes lazy-loading, retry, and fallback logic across the app.
- Role UI reads from `user_roles` via `has_role()` — no client-side role checks.

## Asset Optimization (Profile + Courses surface)
Verified against the baseline in the `asset-optimization` skill:
- No new bitmap assets are introduced by these pages beyond existing ones already covered by the project baseline (mascot → WebP, play-button/thumbnail defaults → SVG, PWA/OG PNGs kept intentionally).
- Recommendation: replace the remote `placehold.co` fallback in `Courses.tsx` with the local `src/assets/thumbnails/pdf-default.svg`-style SVG (see LOW finding above) to drop one external network round-trip on every empty course card.

## Fix Plan
1. **DONE** — SmartImage step-1 guard (HIGH/UX).
2. Add `get_course_lesson_stats` RPC + swap Courses to use it (MEDIUM/PERF).
3. Add `is_published` filter + pagination to Courses list.
4. Remove dead `formatDuration` import in Courses.
5. Swap `placehold.co` for a local SVG placeholder.
6. Add `aria-label` to the avatar-change button.

## Open Questions
- Do you want me to apply fixes 2–6 now, or leave them as backlog for a focused PR?

---

## Applied in follow-up pass (2026-07-03)

- **Fix 2 — DONE.** New Postgres RPC `public.get_course_lesson_stats()` (STABLE, SECURITY DEFINER, GRANT EXECUTE to anon/authenticated/service_role). `Courses.fetchLessonCounts` now calls the RPC instead of pulling every lesson row.
- **Fix 4 — DONE.** Removed dead `formatDuration` import from `MahimaVideoPlayer` in `Courses.tsx`; local implementation retained.
- **Fix 5 — DONE.** `Courses.tsx` fallback image now uses local `src/assets/thumbnails/pdf-default.svg` instead of remote `placehold.co`. One less third-party round-trip and works fully offline inside the APK.
- **Fix 6 — DONE.** Added `aria-label="Change profile picture"` to the avatar-edit button in `Profile.tsx`.
- **Fix 3 — DEFERRED.** `courses` table has no `is_published` column. Adding one is a data-visibility decision that would hide existing courses on next deploy — needs product sign-off before shipping. Recommendation stands: add `is_published boolean NOT NULL DEFAULT true`, then filter in `fetchCourses`.

## PDF-not-loading — audit note

Re-read the full PDF path (`DocumentReader` → `LazyPdfViewer` → `PdfViewerWithAutoScroll` → `PdfViewer` → `FastPdfReader`/iframe). No deterministic bug found without a concrete failing URL. The routing has the right guards:

- Drive PDFs are force-proxied through `googleDrivePdfProxyUrl` (never Drive's blank `/preview` iframe on mobile WebView).
- Iframe branch has 6s (Drive) / 10s (others) watchdog with a Retry CTA — no infinite blank screen.
- `useOfflineResolvedUrl` prefers a downloaded copy when present.

To progress fix: share the failing PDF URL (or lesson id) and the console line printed by `[PdfViewer]` after enabling `localStorage.setItem('nb_pdf_debug','1')`. With that I can pinpoint which branch is failing (`route-selected` trace tells us Drive vs Docs vs iframe vs pdf).

## Capacitor back-button audit — quick pass

Reviewed against the `capacitor-back-button` skill checklist:
- `useAndroidBackButton` is the single mount point (registered once in `App.tsx`), returns an unsubscribe — ✅ no duplicate listeners.
- Reader mode pushes a synthetic history entry (`readerHistoryTokenRef`) and pops on back — ✅ back closes the PDF instead of exiting the app.
- Root route falls back to `App.exitApp()` — ✅.

Verdict: back-button logic is production-grade. No changes required.
