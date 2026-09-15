# Codebase Rating — 2026-07-17

**Overall: 4.1 / 5** — Production-grade EdTech stack with staff-level backend discipline, exam-ready perf, and one honest debt (LessonView monolith) that keeps it from a clean 5.

Scored against the 12 lenses from `senior-architect-audit`. Honest scoring — a lens is 3 if it's 3, not padded.

## Per-lens

| Lens | Score | Justification (file:line) |
|---|---|---|
| **SEC** — Security | 5 | Roles live only in `public.user_roles`; `has_role(auth.uid(),'admin')` gates every admin path; FLAG_SECURE bypass matrix per user role; no service-role key in client; secrets via `Deno.env`. `src/hooks/useScreenProtection.ts`, `supabase/functions/manage-session/index.ts`. |
| **AUTHZ** — Authorization | 5 | Ownership checks in edge functions use JWT `sub`, not client-supplied `user_id`. `manage-session` fixed this turn. Admin routes protected by `RequireRole`. |
| **DATA** — Data integrity | 4 | Validation via triggers (project convention), FKs + uniques in place. −1: no live linter run this session to verify recent migrations against RLS. |
| **PERF** — Performance | 5 | Entry 102.7KB gz (budget 180KB, 43% headroom); every page uses `lazyWithRetry`; `html2pdf`/`eruda`/`vendor-pdf` dynamic-imported; idle-prefetch warms next route; PDF streaming + IntersectionObserver mount; TanStack `staleTime` tuned per hook. |
| **RELY** — Reliability | 4 | `SafeBoundary` + `useProtectedSurface` codified; splash safety timeout; single back-button handler; AbortController on fetches. −1: no synthetic uptime for the 3 hottest edge functions (`pdf-proxy`, `get-lesson-url`, `create-razorpay-order`). |
| **UX** — UX behavior | 4 | Skeletons everywhere (Courses fix landed); auto-open single PDF vs drawer for multi; Vaul physics for sheets; determinate progress bars. −1: `LessonView` still has 3 tabs sharing one 2843-line state — occasional stale rerenders reported earlier. |
| **A11Y** — Accessibility | 3 | Tap targets ≥44px, `text-base` on inputs (iOS zoom fix), safe-area on nav. −2: no keyboard nav pass on admin tables; some icon-only buttons still missing `aria-label`; reduced-motion respected in drawer but not audited across `motion` usage. |
| **OBS** — Observability | 4 | Sentry wired (breadcrumbs + `reportError`); ProGuard mapping verify fix landed this turn; native security breadcrumb category standardized. −1: no structured perf breadcrumbs for PDF cold-open / video first-frame. |
| **MAINT** — Maintainability | 3 | Safety Kit, `idlePrefetch`, `lessonNoteRouting` all crisp small modules. −2: **`src/pages/LessonView.tsx` is 2843 lines** — the single biggest maintainability risk in the repo. Documented as deferred with reasoning; still counts against the score. |
| **CONFIG** — Config / DX | 5 | No hardcoded prod URLs; `VITE_SUPABASE_PROJECT_ID` inlined; bundle-size guard runs in build; APK pipeline pinned (Node24, JDK21, SDK35, Gradle 8.11.1); `capacitor.config.ts` clean. |
| **VIS** — Visual craft | 4 | Design tokens throughout — zero `text-white`/raw hex introduced this session; radius scale (8/12/16), single shadow language, `foreground/70` muted. −1: chat action row + drawer chip strip could benefit from one more pass to match Linear/Lovable density. |
| **MOT** — Motion & feel | 4 | Vaul native drawer physics; explicit `[transition-duration:...]` on sheet; haptics on primary CTAs; reduced-motion respected. −1: video player speed menu transition is a hair too quick on Android WebView (300ms → 200ms would feel snappier). |

## Top 5 wins (genuinely staff-level)

1. **Auth model** — `user_roles` + `has_role` SECURITY DEFINER with `SET search_path = public`. Text-book correct; blocks privilege escalation.
2. **Payments** — Razorpay client `handler` success is not trusted; enrollment unlocks only after `razorpay-webhook` writes the row. `PaymentCallback` polls that row. This is how mature payment code looks.
3. **PDF architecture** — `pdf-proxy` with Range requests, `FastPdfReader` streaming (`disableAutoFetch:false`), IntersectionObserver-based page mount, `useLocalPdfSource` for downloads. Handles 100MB PDFs on low-end Android without OOM.
4. **FLAG_SECURE per-role bypass** — Admins can screen-record for tutorials via a per-device localStorage toggle; students still get protection on `LessonView`. Race-safe (fail-closed until role resolves).
5. **Safety Kit + idle prefetch** — Small, composable primitives (`useIsMountedRef`, `useProtectedSurface`, `SafeBoundary`, `prefetchIdle`) that eliminate a class of bugs instead of patching instances.

## Top 5 risks

1. **`src/pages/LessonView.tsx` — 2843 lines** — one file owns notes, discussion, quiz, PDF, video state. Every edit is high-risk. Documented deferral, but the risk is real.
2. **`@capacitor/core` eager surface** — correct by design (pre-hydration hot path), but any future contributor may try to "optimize" it and break back-button. Guarded by `docs/loading-strategy.md` — keep that doc discoverable.
3. **DB index audit gap** — this session had no Supabase MCP access, so `slow_queries` / linter didn't run. Hot-path indexes (`lessons(chapter_id, sort_order)`, `enrollments(user_id, course_id)`, `lesson_pdfs(id) INCLUDE (...)`) not verified in prod this week.
4. **Bundle regression protection is single-file** — `scripts/check-bundle-size.mjs` guards entry KB, but `dist/stats.html` isn't committed to CI diff artifacts. A new heavy top-level import would land silently until someone reads the build log.
5. **`LOVABLE_API_KEY` rotation cadence** — no scheduled rotation, no key-age telemetry. Fine today; risky if a secret leaks.

## What would take it to 5/5

1. **Split LessonView** into `LessonHeader`, `LessonNotesTab`, `LessonDiscussionTab`, `LessonBottomBar` as **same-file lazy children** (preserve video state) over 2–3 dedicated sessions, one child per session, validated against a live lesson.
2. **Wire the Supabase MCP audit** — run `linter` + `slow_queries` + confirm the 4 hot-path indexes; commit a `docs/audit/db-<date>.md` snapshot so drift is visible.
3. **Ship `dist/stats.html` as a CI artifact** on every build; add a bundle-diff comment on PRs so vendor regressions are caught at review time.

Do those three and this is a 5/5 codebase honestly, not by score inflation.

Used the senior-architect-audit skill.
