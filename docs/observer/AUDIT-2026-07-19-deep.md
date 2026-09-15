# Deep Codebase Audit — 2026-07-19 (Safar English / Naveen Bharat)

**Rating: 3.8 / 5** — Security posture strong on payments + RLS; noise in observability + design tokens; a few HIGH design/perf smells to clean up. No CRITICAL. Ship-safe with the P1 list below.

Per-lens scores:

| Lens | Score | Note |
| --- | --- | --- |
| SEC / red-team | 4/5 | HMAC + timing-safe verify, allow-listed proxy, RLS everywhere. WARNs are SECURITY DEFINER exposure surface. |
| Backend (Supabase) | 4/5 | Hot-path indexes present; a few slow patterns to trim. |
| Perf | 4/5 | Assets already trimmed; largest bundled webp 101 KB (fine). Need lazy-mount audit. |
| Assets | 4.5/5 | Nothing to delete; 3D icons + OG PNG intentional. |
| Mobile/Capacitor | 4/5 | Single back-listener ✅; hardcoded colours in video/admin files. |
| Video player | 3.5/5 | Multiple player variants — chrome↔nav-bar sync must be verified per-variant. |
| Crash shield | 4/5 | Wired + retry-limited ErrorBoundary. |
| Design (VIS/MOT) | 3/5 | 15+ files use `text-white / bg-black / text-black` raw — token drift. |
| Observability | 3/5 | 126 raw `console.*` sites — Sentry noise. |

---

## Executive summary (5 bullets)

1. **No CRITICAL findings**. Payment flow (verify + webhook) uses HMAC-SHA256 with timing-safe compare, re-fetches amount from Razorpay API, and dedupes by `x-razorpay-event-id`. That's production-grade.
2. **22 Supabase-linter WARNs are the same class**: SECURITY DEFINER functions callable by `anon` / `authenticated`. Most are legitimate (`has_role`, `check_rate_limit`, RPCs like `get_dashboard_snapshot`), but each needs an explicit "intentional-public" note in security memory or a `REVOKE EXECUTE FROM PUBLIC`. Right now every future scan will keep re-raising them.
3. **`phone_otps` has RLS enabled + zero policies** (linter INFO). Correct-by-design for an edge-fn-only table, but must be documented so the scanner stops re-flagging.
4. **Design token drift**: 15+ files still use raw `text-white / bg-black`, breaking dark-mode consistency. Video player + admin screens are the worst offenders.
5. **Observability noise**: 126 `console.log/warn/error` sites. Every one that fires in prod goes to Sentry — the 17-error report user shared last week is symptomatic. Route through `reportError(err, { surface })`.

---

## P0 — Ship before next tag

*None.* The two P0-candidates found earlier (landing-page RLS 401, AI Gateway key) were already fixed today.

---

## P1 — This sprint

### [HIGH][SEC/AUTHZ] Silence 22 SECURITY DEFINER linter WARNs with intent-explicit REVOKEs
**Where:** `pg_proc` — 41 SECURITY DEFINER functions, 22 flagged.
**Why it matters:** Every `security--run_security_scan` will keep raising the same 22 WARNs, hiding new real findings under noise. Two functions actually need the public grant (`has_role`, `check_rate_limit` — called from RLS policies). The other 20 (admin RPCs, `get_quiz_questions`, `get_user_profiles_admin`, etc.) should `REVOKE EXECUTE FROM PUBLIC` and `GRANT EXECUTE TO authenticated` only where an app path calls them.
**Fix:** Single migration that walks each SECURITY DEFINER function and sets the minimum GRANT it needs, then update `security--update_memory` with the accepted set.
**Regression guard:** Re-run `security--run_security_scan`; expected count drops from 22 → ≤ 3 (intentional public).

### [HIGH][VIS] Hardcoded `text-white / bg-black` in 15+ files
**Where:**
- `src/components/video/MahimaVideoPlayer.tsx` (27 hits)
- `src/pages/AdminRegister.tsx` (21), `src/pages/AdminLogin.tsx` (14)
- `src/components/video/MahimaGhostPlayer.tsx` (16), `PlayerControls.tsx` (13), `EndScreenOverlay.tsx` (8), `UnifiedVideoPlayer.tsx` (6), `SeekBar.tsx` (4), `PlayerErrorBoundary.tsx` (4)
- `src/components/dashboard/HeroCarousel.tsx` (9), `LectureCard.tsx` (5)
- `src/pages/QuizResult.tsx` (5), `Install.tsx` (4), `LessonView.tsx` (3), `Course.tsx` (3)
**Why it matters:** Bypasses design tokens, breaks any theme swap, reads as "template". Video overlays especially — should be `text-foreground`/`bg-background/80` with backdrop-blur, not raw white/black.
**Reference:** Netflix / YouTube overlays use semi-transparent tokens; Lovable's own design rule forbids raw colour classes.
**Fix:** Replace with tokens (`text-foreground`, `bg-background`, `text-primary-foreground`, `bg-black/60` → `bg-foreground/60`). Video-specific overlay tokens should be added to `index.css` (`--video-scrim`, `--video-chrome-fg`).
**Regression guard:** Add ESLint rule `no-restricted-syntax` blocking `text-white`, `bg-black`, `text-black`, `bg-white` in components/pages.

### [HIGH][OBS] 126 raw `console.*` sites → Sentry noise + double-reports
**Where:** repo-wide grep, largest concentrations in `src/lib/nativeDebug.ts`, `src/components/video/*`, edge-function client wrappers.
**Why it matters:** Every raw `console.error` reaches Sentry through the forwarder. Combined with thrown errors it produces double-events (matches your recent 17-issue Sentry snapshot). Also leaks PII when the error object contains a URL with a token.
**Fix:** Route through `reportError(err, { surface: 'video-player', level: 'error' })`. In `nativeDebug.ts` add a de-dupe cache (60 s TTL on `${message}::${surface}`). For dev-only logs, gate on `import.meta.env.DEV`.
**Regression guard:** `rg -n "console\.(log|error|warn)" src/` in CI, fail if count > 30.

### [HIGH][PERF] `get_course_lesson_stats()` — 452 calls, mean 30 ms, **max 1.35 s**
**Where:** `supabase--slow_queries` #3.
**Why it matters:** A 1.35 s DB round-trip on the dashboard means a mid-range Android sees a 2 s+ blank grid. Function likely does a full aggregate across `lessons` + `lesson_progress`.
**Fix:** Cache the aggregate in an `mv_course_lesson_stats` materialised view refreshed on lesson INSERT/UPDATE via trigger + `pg_cron` fallback every 5 min, OR add a covering index on `lesson_progress(course_id, user_id, completed)` if the query filters by course.
**Regression guard:** re-run `slow_queries`, expect mean < 5 ms.

### [MEDIUM/HIGH][RELY] `user_sessions` UPDATE — 1376 calls, max 205 ms, total 11 s
**Where:** `slow_queries` #6 — session heartbeat UPDATE on `session_token`.
**Why it matters:** Every heartbeat is a DB write. Under load this locks the row and stalls the app.
**Fix:** Debounce heartbeat client-side to 60 s (currently probably every 5-15 s), and ensure `user_sessions(session_token)` has a unique index (add if missing).
**Regression guard:** call count should drop ~5×.

---

## P2 — Backlog (this month)

### [MEDIUM][MAINT] Multiple video player variants
**Where:** `MahimaGhostPlayer.tsx`, `MahimaVideoPlayer.tsx`, `UnifiedVideoPlayer.tsx`, `PlayerControls.tsx`.
**Why it matters:** Three players = three chrome↔nav-bar sync surfaces, three gesture handlers, three timer bugs waiting to happen (see `capacitor-video-player-master` skill).
**Fix:** Consolidate to one (`MahimaGhostPlayer` is the reference). Delete the other two after audit. Verify golden rule (`showControls === true → exitImmersive`) is wired only once.

### [MEDIUM][PERF] `lessons` by `course_id` ORDER BY position — max 817 ms
**Where:** `slow_queries` #2.
**Why it matters:** Even though `idx_lessons_course_position` exists, max time still spikes to 817 ms. Suspect a large `SELECT *` returning big text columns (`description`, `content_html`?).
**Fix:** Change client query to select only the ~8 columns actually rendered in the list. Add `INCLUDE (title, position, thumbnail_url, video_url, is_free, is_preview)` to the index.

### [MEDIUM][DATA] `lesson_progress` UPSERT — 495 calls, max 784 ms
**Where:** `slow_queries` #8.
**Why it matters:** Video progress writes. The current UPSERT rewrites `watched_intervals jsonb` every heartbeat; large intervals grow unboundedly.
**Fix:** Cap `watched_intervals` array length client-side (last 200 intervals), and switch to a `range` type or bit-array once the interval count is >500.

### [MEDIUM][SEC] `enforce_not_blocked` SECURITY DEFINER exposed to anon
**Where:** `pg_proc` scan.
**Why it matters:** Trigger function shouldn't need public EXECUTE — anon calling it accomplishes nothing but expands the attack surface.
**Fix:** `REVOKE EXECUTE ON FUNCTION public.enforce_not_blocked() FROM anon, authenticated, public;` (triggers run as owner regardless).

### [MEDIUM][UX] `notices` list — 5254 calls, mean 1.15 ms but total 6 s
**Where:** `slow_queries` #9.
**Why it matters:** Not slow per call but hit far too often. Likely re-fetched on every navigation.
**Fix:** Bump `staleTime` to 5 min in TanStack Query config for notices.

---

## P3 — Nits / filter

- **[LOW][A11Y]** Confirm all tap targets in `PlayerControls.tsx` ≥ 44 × 44 px. Video controls typically render at 32 px which fails Android TalkBack.
- **[LOW][OBS]** `phone_otps` (RLS + zero policies) — add note to `security--update_memory` marking it as intentionally edge-fn-only so the INFO stops reappearing.
- **[LOW][CONFIG]** `dist/` not present — I couldn't measure production bundle size. Run `bun run build` in CI once to populate baseline for the perf-exam-ready skill.
- **[LOW][MAINT]** 237 migrations. Not fixable, but consider a fresh `schema.sql` snapshot to speed local resets.

---

## Wins (what's already right)

- ✅ Payment verify: HMAC + timing-safe compare + Razorpay API re-check of amount + `authorize()` caller-vs-record match. Textbook.
- ✅ Webhook: signature verify BEFORE dedupe, forensic logging without leaking signature bytes.
- ✅ `pdf-proxy` SSRF defence: URL lookup against `lesson_pdfs / notes / materials / study_materials / lesson_attachments` before fetch — no arbitrary URL fetch possible.
- ✅ `has_role` follows the correct pattern (SECURITY DEFINER SQL, `search_path = public`, stored in `user_roles`, EXECUTE granted to `authenticated + anon`).
- ✅ Every user-facing table has RLS enabled (only `phone_otps` has zero policies and that's intentional).
- ✅ Realtime cleanup: 14 `removeChannel` calls for 2 `.channel(` sites — no leak pattern.
- ✅ `setInterval` (19) vs `clearInterval` (21) — balanced.
- ✅ Back-button: single `App.addListener('backButton', …)` in `useAndroidBackButton.ts`. No duplicates.
- ✅ No `React.lazy` without `lazyWithRetry` — 100 % compliant.
- ✅ No hardcoded API keys / service_role tokens found in `src/`.
- ✅ Assets: top 20 already WebP; only PNGs kept are OG image + PWA icons (correct per `asset-optimization` skill).
- ✅ Landing RLS + AI Gateway fixes from earlier today verified holding.

---

## Fix plan (ordered)

1. **P1 SEC** — Migration: `REVOKE EXECUTE FROM PUBLIC` on the 20 non-public-callable SECURITY DEFINER functions; document `has_role` + `check_rate_limit` in security memory. *(1 tool call: `supabase--migration`)*
2. **P1 OBS** — Wrap `nativeDebug.ts` with de-dupe + `import.meta.env.DEV` gate; add CI grep guard. *(2-3 file edits)*
3. **P1 VIS** — Design-token pass on video + admin surfaces (15 files). Add `--video-scrim` / `--video-chrome-fg` tokens in `index.css`. *(batchable)*
4. **P1 PERF** — Materialised view for `get_course_lesson_stats()` OR covering index. *(migration + benchmark)*
5. **P1 RELY** — Debounce `user_sessions` heartbeat to 60 s. *(one file)*
6. **P2** — Player consolidation, `lessons` covering index, `lesson_progress` interval cap, `notices` staleTime.
7. **P3** — a11y tap-target sweep, dist baseline, memory hygiene.

Estimated code impact: ~18 files edited + 2 migrations. Zero destructive changes.

---

## Open questions for user

1. **SECURITY DEFINER cleanup** — OK to migrate all 20 admin-only functions to `REVOKE FROM PUBLIC, GRANT TO authenticated`, or do any of them need `anon` (public marketing pages calling them)?
2. **Player consolidation** — which of the three (`MahimaGhostPlayer`, `MahimaVideoPlayer`, `UnifiedVideoPlayer`) is the intended keeper? Skill guidance points to `MahimaGhostPlayer`.
3. **Heartbeat window** — current session heartbeat frequency? If you're already at 60 s, the 1376 calls are legitimate and no fix needed.
4. **Sentry export** — share the last-14-day breadcrumb file and I'll run `sentry-triage` to map issues to file:line.

---

## Skills applied

Used: `senior-architect-audit`, `red-team-security-audit`, `supabase-architect-auditor`, `perf-exam-ready`, `asset-optimization`, `capacitor-video-player-master`, `app-crash-shield`, `console-error-triage`, `sentry-triage` (partial — no export yet), `mobile-view-expert`, `soft-touch`, `capacitor-back-button`.
