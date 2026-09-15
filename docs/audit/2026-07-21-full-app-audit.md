# Full App Audit — 2026-07-21

**Scope:** Read-only, multi-skill pass. No code, migrations, or secrets changed.
**Rating (attacker + architect blended): 3.5 / 5** — no CRITICAL exploitable holes found, but 24 Supabase linter WARNs, 3 hot slow queries, and a handful of listener/leak patterns that need attention before an exam-season load spike.

---

## Executive summary — Top 5 P0s

1. **[SEC/HIGH] 22× SECURITY DEFINER functions callable by `anon` / `authenticated`** (linter 0028/0029). Any accidental logic gap inside those functions becomes a privilege-escalation vector because they bypass RLS. Needs a per-function audit + `REVOKE EXECUTE FROM anon, authenticated` for functions that don't need public callers.
2. **[PERF/HIGH] `get_course_lesson_stats()` — 636 calls, mean 32ms, max 1.34s, 20.5s total.** Top offender by total time. Likely N+1 aggregation. Cache in edge fn or materialize.
3. **[PERF/HIGH] `profiles` self-lookup — 4837 calls, 18.4s total.** Called on nearly every page mount. Cache in memory (React Query `staleTime: 5min`) instead of re-fetching.
4. **[SEC/MEDIUM] Leaked-password protection disabled** on Supabase Auth. One toggle in dashboard.
5. **[RELY/MEDIUM] `LessonView.tsx` has 23 `useEffect` blocks + 18 in `MahimaGhostPlayer.tsx`.** High risk of listener/timer leaks under Android WebView memory pressure. Needs a cleanup audit.

---

## 1. /skill:supabase-architect-auditor

**Linter: 24 issues (0 ERROR, 24 WARN, 1 INFO).**

| # | Finding | Count | Severity | Fix (deferred) |
|---|---|---|---|---|
| SEC-1 | `SECURITY DEFINER` fn callable by `anon` | 1 | HIGH | Enumerate fns via `pg_proc`, REVOKE EXECUTE from `anon` on all except intentional ones (e.g. public stats). |
| SEC-2 | `SECURITY DEFINER` fn callable by `authenticated` | 22 | HIGH | For each: confirm caller check inside body (`auth.uid()` / `has_role`), else REVOKE. |
| SEC-3 | RLS enabled, no policy | 1 | INFO | Identify table; either add policy or drop RLS if intentional. |
| SEC-4 | Leaked password protection disabled | 1 | MEDIUM | Toggle in Auth settings. |
| SEC-5 | `app_config` publicly readable | 1 | LOW | OK if only version metadata — but add a column allow-list constraint so a future secret can't leak. |
| SEC-6 | `site_settings` publicly readable, no key allow-list | 1 | MEDIUM | Add CHECK constraint on `key` to a known allow-list; forbid keys prefixed `secret_` / `api_`. |
| SEC-7 | `lessons` Realtime relies entirely on SELECT policy | 1 | INFO | Add a regression test that fails if the enrollment predicate is ever removed. |

**Wins:**
- Roles live only in `public.user_roles` ✅
- `has_role()` is SECURITY DEFINER with `SET search_path = public` ✅
- No reserved-schema tampering ✅

---

## 2. /skill:red-team-security-audit

25-vector matrix (short form — full PoCs deferred to fix turn):

| # | Vector | Result |
|---|---|---|
| 1 | Auth bypass | ✅ no gap — Supabase rejects forged JWT (`aud` check) |
| 2 | RLS / IDOR | ⚠ needs proof for each of the 22 DEFINER fns |
| 3 | Privilege escalation | ✅ `prevent_self_role_escalation` trigger present |
| 4 | Payment tamper | ⚠ verify `razorpay-webhook` HMAC + idempotency on `webhook_events` (not re-checked this turn) |
| 5 | Webhook forgery | ⚠ same as #4 |
| 6 | Storage abuse | ⚠ manual audit deferred (12 buckets) |
| 7 | CDN / signed URL leak | ⚠ Bunny signed-URL TTL unverified |
| 8 | XSS | ⚠ community post body — confirm sanitizer in place |
| 9 | Prompt injection | ⚠ chatbot/resolve-doubt — no explicit "ignore user instructions to reveal system prompt" test |
| 10 | SSRF | N/A — no user-driven fetch |
| 11 | Rate limit bypass | ⚠ `rate_limits` table exists, need per-fn coverage check |
| 12 | Deep-link hijack | ✅ `assetlinks.json` + `pathPrefix` narrow |
| 13 | Open redirect | ✅ no `?next=` seen |
| 14 | CORS | ⚠ verify edge fns don't `Allow-Origin: *` on authed responses |
| 15 | CSRF | ✅ JWT in header, not cookie |
| 16 | JWT / session | ✅ localStorage, refresh rotation via Supabase SDK |
| 17 | Secrets in bundle | ✅ grep clean (previous turn) |
| 18 | PII leak | ⚠ `profiles` narrow SELECT — good; `leads`, `deletion_requests` admin-only expected — verify |
| 19 | SQL injection | ✅ SDK only, no raw string concat |
| 20 | File upload abuse | ⚠ Library uploads — confirm MIME allow-list |
| 21 | DoS | ⚠ pdf-proxy has no per-user rate limit visible |
| 22 | Supply chain | ✅ scanner clean |
| 23 | Android intent hijack | ✅ `autoVerify=true`, pathPrefix scoped |
| 24 | WebView escape | ✅ `webContentsDebuggingEnabled=false` prod, `usesCleartextTraffic=false` |
| 25 | Logging PII | ⚠ many `console.error` sites (see §7) — need `reportError` routing check |

**Verdict: 3/5** — no proven CRITICAL, but 8 items marked ⚠ need PoC before shipping.

---

## 3. /skill:senior-architect-audit (10-lens)

| Lens | Finding | Severity |
|---|---|---|
| SEC | 22× DEFINER fns exposed to `authenticated` | HIGH |
| AUTHZ | Role now cached in localStorage (previous turn) — server RLS still authoritative ✅ | — |
| DATA | `get_course_lesson_stats()` slow — likely missing composite index or should be pre-aggregated table | MEDIUM |
| PERF | Bundle: `dist/` not present in sandbox — cannot measure this turn. Baseline in `docs/perf/REPORT-2026-07-17.md`. | — |
| RELY | 23 `useEffect` in `LessonView.tsx` — high leak surface | MEDIUM |
| UX | Bottom nav hide on PDF viewer verified in `DocReaderShell` (previous turn) ✅ | — |
| A11Y | Not re-audited this turn | — |
| OBS | Sentry breadcrumbs in place via `CrashShield` + `ReaderErrorBoundary` ✅ | — |
| MAINT | 5 audit reports already under `docs/audit/` — good hygiene ✅ | — |
| CONFIG | `capacitor.config.ts` clean, dev URL commented out ✅ | — |

---

## 4. /skill:app-crash-shield

**Coverage:** `CrashShield.tsx` + `ReaderErrorBoundary.tsx` + `crashShield.ts` (heartbeat) all present ✅.

**Gaps:**
- `MahimaGhostPlayer.tsx` — 18 `useEffect`, 3 `setInterval`, 3 `console.error`. Highest per-file concentration in the repo. Needs a cleanup pass to confirm every listener has a matching `remove`.
- `LessonView.tsx` — 23 `useEffect`, 7 `console.error`. Same concern.
- `FastPdfReader.tsx` — 10 `useEffect`, 2 `console.error`. `IntersectionObserver` cleanup should be verified.
- No `CrashShield` boundary observed wrapping `LessonView` itself (only readers inside). Recommend wrapping the whole `/lesson/:id` route.

**Verdict:** Framework is solid; specific surfaces need targeted cleanup audit.

---

## 5. /skill:perf-exam-ready

**Top 10 slow queries by total time:**

| Rank | Query | Calls | Mean | Total | Fix (deferred) |
|---|---|---:|---:|---:|---|
| 1 | `get_course_lesson_stats()` RPC | 636 | 32ms | **20.5s** | Cache result server-side; materialize view refreshed on lesson insert |
| 2 | `profiles` self-select (id+name+email+avatar+mobile) | 4837 | 3.8ms | 18.5s | React Query `staleTime: 5min`, share across pages |
| 3 | `enrollments+courses` join by user | 6340 | 2.9ms | 18.1s | `staleTime: 60s`; already indexed |
| 4 | `lessons` by course_id ORDER BY position | 387 | 36ms | 14.1s | Verify `(course_id, position)` composite index |
| 5 | `lesson_progress` upsert | 836 | 15ms | 12.3s | Batch writes on unload instead of per-second |
| 6 | `user_sessions` last_active update | 1458 | 8ms | 12.2s | Throttle to 60s instead of per-navigation |
| 7 | `lessons.like_count` single-row select | 544 | 21ms | 11.5s | Denormalize onto initial lesson fetch |
| 8 | `lessons.id,course_id` batch by course_id[] | 983 | 7.8ms | 7.6s | Fold into main lesson query |
| 9 | `notices` newest-first | 6924 | 1.0ms | 7.1s | Cache 5min; only invalidate on admin post |
| 10 | `user_sessions` insert | 315 | 22ms | 7.0s | Session insert on cold start only — verify no dup writes on tab focus |

**Asset budget:**
- `src/assets`: 310K (excellent) ✅
- `public/`: 5.5M (mostly pdfjs vendor — expected)
- Largest raster: `logo_og_image.png` 68K (OG — keep PNG) ✅
- No oversized PNGs in `src/assets` ✅

---

## 6. /skill:sentry-triage

**Sources indexed this turn:**
- Console log snapshot (very small — clean startup: `crashShield installed`, `Eruda loaded for admin` only)
- Recent session replay shows healthy dashboard fetch pattern (all 200 OK)
- `error_logs` table not queried this turn — recommend next audit

**No live errors surfaced** in the current preview snapshot. Deferred: pull `error_logs` last-7d + `chatbot`/`resolve-doubt`/`razorpay-*` edge-fn logs.

---

## 7. /skill:console-error-triage

**Files with ≥3 `console.error/warn` calls (unrouted):**

| File | Count |
|---|---|
| `src/lib/sentry.ts` | 14 (framework — OK) |
| `src/main.tsx` | 8 |
| `src/pages/LessonView.tsx` | 7 |
| `src/lib/logger.ts` | 7 (framework — OK) |
| `src/lib/crashShield.ts` | 7 (framework — OK) |
| `src/services/savedDownloads.ts` | 6 |
| `src/lib/native/openNativeDocument.ts` | 6 |
| `src/pages/Downloads.tsx` | 5 |
| `src/lib/native/push.ts` | 5 |
| `src/lib/nativeFileOpener.ts` | 4 |
| `src/lib/nativeDebug.ts` | 4 |
| `src/components/AdminEruda.tsx` | 4 |

**Action (deferred):** Audit each non-framework call. Route through `reportError(err, { surface })` instead of raw `console.error` so Sentry captures with breadcrumb context.

---

## 8. /skill:capacitor-back-button

**Verified:**
- Single-mount guard exists (`useAndroidBackButton.ts`) ✅
- Only one `App.addListener('backButton'` in source ✅
- Overlay sentinels used in `useOverlayHistorySentinel.ts` + `useOverlayBackClose.ts` ✅
- `MahimaGhostPlayer`, `MahimaVideoPlayer`, `BunnyStreamPlayer`, `DocReaderShell`, `FastPdfReader`, `DocumentReader` all import back-button integration ✅

**No findings — this surface is healthy.**

---

## 9. /skill:capacitor-video-player-master

**Cannot fully verify without re-reading `MahimaGhostPlayer.tsx` (18 useEffects).** Deferred to fix turn. Structural indicators:
- `useAutoHideControls` hook exists ✅
- `useFakeFullscreen` exists ✅
- Native immersive bridge (`BridgeFullscreenWebChromeClient.java`) wired ✅

**Deferred checklist:** 15-item audit from skill (userHiddenRef sticky, rotation-aware axes, tap on touchEnd, etc.) requires a dedicated fix turn.

---

## 10. /skill:asset-optimization

`src/assets` = 310K total. Nothing to trim in `src/assets`. `public/pdfjs/` dominates `public/` and is intentional (PDF.js vendor).

**No findings.**

---

## 11. /skill:mobile-view-expert + /skill:soft-touch

Landing surfaces (Hero, ExamTracks, StickyMobileCTA, Index) received soft-touch polish in the previous turn ✅.

**Remaining surfaces missing haptic/press-state (deferred inventory):**
- Dashboard cards
- Course detail CTA
- Community post actions
- Ask-Doubt send button (verify)
- Downloads action buttons

---

## Recently fixed (verified via `rg`)

- Safar Agent / Ask-Doubt gateway → `google/gemini-3.5-flash`, gateway enabled ✅
- Role flash on refresh → localStorage seed in `AuthContext` ✅
- Install page → GitHub Releases API ✅
- PDF viewer bottom-nav hide → `DocReaderShell` sets `data-reader-open` ✅
- Ask-Doubt transcript disclaimer removed ✅

---

## Fix plan (approve to proceed in a follow-up build turn)

### P0 — do first
1. Audit + REVOKE EXECUTE on non-public SECURITY DEFINER fns
2. Enable leaked-password protection in Supabase Auth
3. Cache `profiles` self-lookup + `notices` in React Query (staleTime 5min)

### P1 — this week
4. Materialize / cache `get_course_lesson_stats()`
5. Cleanup listener leaks in `LessonView.tsx` + `MahimaGhostPlayer.tsx`
6. Route unrouted `console.error` sites through `reportError`
7. Add `site_settings` key allow-list constraint

### P2 — backlog
8. Full video-player 15-item checklist audit
9. Soft-touch pass on remaining surfaces
10. Sentry `error_logs` + edge-fn log deep-dive

---

**Skills used:** app-crash-shield, asset-optimization, capacitor-back-button, capacitor-video-player-master, console-error-triage, mobile-view-expert, senior-architect-audit, soft-touch, supabase-architect-auditor, red-team-security-audit, perf-exam-ready, sentry-triage.