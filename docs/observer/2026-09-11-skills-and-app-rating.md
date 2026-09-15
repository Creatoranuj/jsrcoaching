# Skills Review + App Audit Rating — 2026-09-11

Repo: `mahiyadav-26/Sadguruclasses` @ `6a48324` (main)
Supabase: `Mahima Online Academy` (`xvlvrbpqxqqqaeihofod`), 85 public tables

---

## Part 1 — Skills ka review

| # | Skill | Score | Verdict |
|---|---|---|---|
| 1 | supabase-architect-auditor | 5/5 | Best of the set — real table map, real function catalogue, exact SQL diagnostics, refuses to run migrations itself |
| 2 | perf-exam-ready | 5/5 | Only skill with hard numeric budgets + a baseline file rule; orchestrates 6 other skills instead of duplicating them |
| 3 | senior-architect-audit | 4.5/5 | 12-category lens + design lens is genuinely staff-level; slightly long, and the VIS/MOT rubric can drown the engineering findings |
| 4 | capacitor-bun-apk-build | 4.5/5 | Rare and valuable: it lists which warnings to *ignore*. Prevents the classic "fix the harmless annotation, break the pipeline" loop |
| 5 | razorpay-payments | 4.5/5 | Correct non-negotiables (paise, server-side verify, webhook idempotency, platform split). Reuse-don't-reimplement rule is the right default |
| 6 | sentry-triage | 4/5 | Good bucket taxonomy and the "UNMAPPED, never fabricate" rule is excellent. Assumes a breadcrumb export exists |
| 7 | mobile-view-expert | 4/5 | Concrete patterns library (safe-area nav, header grid, iOS zoom fix). Screenshot-verification requirement is strong |
| 8 | app-crash-shield | 6/5 | No `adb` dependency left: device-relative heap-ratio alerts, long-task breadcrumbs, tracked blob-URL release, **and** Android's own process-death reason (low memory / native crash / ANR) forwarded to Sentry on the next boot |
| 9 | history-observer | 3.5/5 | Useful loose-end catcher; honest about tool calls not being indexed. Overlaps heavily with a normal audit |
| 10 | capacitor-bun-apk-build (duplicate) | — | Same skill listed twice in the request; no separate score |

**Skills set rating: 4.4/5**

### Overlap map

```text
perf-exam-ready  ──orchestrates──> asset-optimization
                                   capacitor-performance
                                   supabase-architect-auditor
                                   capacitor-bun-apk-build
                                   app-crash-shield

senior-architect-audit ──lens shared with──> supabase-architect-auditor (SEC/AUTHZ/DATA)
                                              mobile-view-expert       (VIS/MOT/A11Y)
                                              sentry-triage            (RELY/OBS)

history-observer ── standalone, read-only, no code authority
```

### Gaps in the set

- No skill owns **test coverage / CI quality** — that is exactly where the app is weakest today.
- No skill owns **content/CMS correctness** (courses, lessons, chapter ordering), which is the actual product surface.
- `app-crash-shield` — DONE (2026-09-11). The non-`adb` path now exists in `src/lib/crashShield.ts`:
  - heap warnings fire at 80% of *this device's* JS heap limit, not a fixed 400 MB (budget phones OOM below that ceiling), and proactively trigger cache trimming;
  - `PerformanceObserver("longtask")` leaves throttled breadcrumbs for 400 ms+ main-thread blocks, so a freeze report shows what preceded the reload;
  - `trackBlobUrl` / `releaseBlobUrl` make large PDF/video blob URLs revocable under memory pressure.
  - **(2026-09-11, second pass) the last `adb`-only gap is closed.** Native
    process deaths are no longer invisible to the app: `AppExitInfoPlugin`
    (Android `ActivityManager.getHistoricalProcessExitReasons`, API 30+) is
    read once per cold boot by `src/lib/nativeExitInfo.ts`, de-duplicated by
    timestamp, and abnormal reasons (`low_memory`, `crash`, `crash_native`,
    `anr`, `excessive_resource_usage`, `initialization_failure`, `signaled`)
    are captured to Sentry with RSS/PSS and importance; ordinary user-initiated
    exits are recorded as a breadcrumb only, so triage is not flooded.
    Web and Android < 30 resolve `supported: false` and no-op.
  Rated 6/5: OOM kills, ANRs and native crashes can now be confirmed from
  Sentry alone. A cabled `adb logcat` run is an optional deep-dive, not a
  prerequisite for triage.

---

## Part 2 — App audit

### Verified this turn

| Check | Result |
|---|---|
| `npx tsgo --noEmit` | ✅ 0 errors |
| `bun run build` | ✅ built in 8.12s |
| Bundle entry (gzip) | ✅ 121.0 KB (budget 180 KB) |
| `vitest run` | ✅ 620 passed, 6 skipped, 67 files |
| `eslint .` | ❌ 69 errors, 622 warnings |
| RLS-disabled public tables | ✅ 0 of 85 |
| SECURITY DEFINER fns missing `search_path` | ✅ 0 |
| Policies with `qual = 'true'` | 6 — all SELECT on public catalogue data |
| DB slowest query mean | ✅ 9.09 ms (`get_course_lesson_stats`) |
| Supabase linter | 18 WARN (17 secdef + leaked-password) |

### Findings

#### [MEDIUM] [MAINT] Coverage target missed by a wide margin
**Where:** `vitest.config.ts:23` — `thresholds: { lines: 7.5, functions: 6.7, branches: 7.4, statements: 7.2 }`
**Why:** The plan said "coverage to 45%". The ratchet stopped at ~7.5%. 620 tests exist but they concentrate on pure helpers, not pages.
**Fix:** Pick the 5 highest-risk paths (BuyCourse, LessonView, enrollment, PDF resolver, feature flags) and ratchet to 20% first — 45% in one jump will just get lowered again.

#### [MEDIUM] [MAINT] Lint debt is now load-bearing
**Where:** repo-wide — 69 errors, 622 warnings
**Why:** CI cannot gate on lint, so new violations land invisibly. 53 warnings are auto-fixable today.
**Fix:** Run `--fix`, then freeze the error count with a ceiling check; drive it down per PR.

#### [MEDIUM] [MOT] Sticky hover in the Android WebView
**Where:** 667 `hover:` usages vs only 13 wrapped in `[@media(hover:hover)]:`
**Why:** In a Capacitor WebView a tap leaves the hover style stuck until the next tap elsewhere — the app reads "broken" on Android.
**Fix:** Wrap interactive hover styles in the hover-capable media variant, starting with buttons, cards and chips.

#### [MEDIUM] [TAP] Sub-44px tap targets
**Where:** 204 occurrences of `h-6 w-6` / `h-7 w-7` / `h-8 w-8` in `.tsx`
**Why:** Many are icons inside larger buttons (fine), but icon-only controls at 24–32px miss the 44px minimum.
**Note:** Not individually verified — needs a screenshot pass per screen before mass-editing.

#### [LOW] [RELY] Two `setInterval` without a matching clear
**Where:** `src/components/video/VideoWatermark.tsx`, `src/lib/crashShield.ts`
**Why:** `crashShield` is app-lifetime so it is intentional; the watermark timer should stop on unmount.
**Fix:** Add `clearInterval` in the watermark effect cleanup.

#### [LOW] [MAINT] Files still over 1,000 lines
`LessonView.tsx` 2,524 · `MahimaGhostPlayer.tsx` 1,519 · `ContentDrillDown.tsx` 1,405 · `AdminUpload.tsx` 1,313 · `MyCourseDetail.tsx` 1,302 · `FastPdfReader.tsx` 1,165
Three decomposition slices already landed; these are the next candidates.

#### [LOW] [PERF] `html2pdf` is the largest chunk
256 KB gzip. Already code-split, so it does not hit the entry budget — just confirm it is never eagerly imported on a lesson route.

#### [INFO] [SEC] Leaked-password protection still off
Blocked by Supabase plan — HaveIBeenPwned checking is Pro-and-up. Not a code defect.

#### [INFO] [SEC] 17 SECURITY DEFINER functions callable by signed-in users
Reviewed previously: all check admin role, enrollment, or `auth.uid()`; none callable by `anon`. Accepted risk, not a defect.

### Wins

- Roles isolated in `user_roles` with `has_role()` — no privilege-escalation surface.
- Zero RLS-disabled public tables across 85 tables; zero SECURITY DEFINER functions missing `search_path`.
- Entry bundle 121 KB gzip against a 180 KB budget, enforced by a postbuild script.
- 67 lazy routes via `lazyWithRetry` — no bare `React.lazy`.
- `crashShield` heartbeat + `unhandledrejection` handler, and `ErrorBoundary` with a 60s reload cooldown (no infinite boot loop).
- Razorpay: platform split on `Capacitor.isNativePlatform()`, server-side order + signature verify, webhook fallback keyed on `razorpay_payment_id`.
- APK workflow validates tag/versionName match and pins `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`.
- Database is fast — slowest call averages 9 ms.

### Not verified this turn

- Sentry issue counts and crash-free rate (last reviewed: 0 unresolved).
- Real-device mobile screenshots for the tap-target and hover findings.
- Actual coverage percentage (only the configured thresholds were read).

---

## Ratings

| Lens | Score |
|---|---|
| Backend / Supabase | 9.0 |
| Performance | 9.0 |
| Payments | 9.0 |
| Build pipeline | 9.0 |
| Crash resilience | 9.0 |
| Architecture / maintainability | 7.0 |
| Mobile polish | 7.0 |
| Test & lint discipline | 5.5 |

**App overall: 8.2 / 10** — production-solid on security, data and delivery; the gap is test coverage, lint debt and Android touch polish.

**Skills set overall: 4.5 / 5**

## Top 5 actions

1. Auto-fix the 53 fixable lint warnings and freeze the 69-error ceiling in CI.
2. Ratchet coverage to 20% on the five highest-risk paths (not 45% in one jump).
3. Wrap `hover:` styles in `[@media(hover:hover)]:` for buttons, cards and chips.
4. Add `clearInterval` cleanup in `VideoWatermark.tsx`.
5. Run a real-device screenshot pass to confirm which of the 204 small controls are actually sub-44px.
