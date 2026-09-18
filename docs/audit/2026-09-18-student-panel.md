# Audit: Student Panel Learning Flow (Courses → Buy → My Courses → Lesson/Chapter → Quiz → Result, + Library/Downloads/Attendance/Materials/Books/Profile/Settings)

**Rating: 4/5** — Core security and progress-integrity are solid (server-verified enrollment RLS, server-side quiz scoring, deduped/offline-queued progress writes, single-RPC course bundles). Remaining gaps are polish-level: inconsistent loading UX, a few sub-44px tap targets, and hardcoded chart colors.

## Findings

### [MEDIUM] [UX] Full-page spinner instead of skeleton on several sub-pages
**Where:** `src/pages/Attendance.tsx:180`, `src/pages/Materials.tsx:209`, `src/pages/Downloads.tsx:391`
**Why it matters:** Most flagship pages in scope (`QuizAttempt`, `QuizResult`, and the router) already standardize on `RouteSkeleton` for perceived-performance on first load. These three pages instead show a bare centered `Loader2` spin, which reads as "stuck" longer and is visually inconsistent with the rest of the student panel.
**Fix:** PROPOSED — swap the centered spinner for a `RouteSkeleton`/list-skeleton matching the page's eventual layout. Not applied here because it changes visible markup/behavior on 3 pages and should be reviewed with design before merging.

### [LOW] [UX/A11Y] Icon-only back button under 44px tap target
**Where:** `src/pages/QuizResult.tsx:380` (fixed), `src/pages/AllClasses.tsx:162`, `src/pages/AdminCMS.tsx:341`
**Why it matters:** The button had no padding/min-size — the actual hit box was ~20×20px (icon size only), well under the 44×44px minimum recommended for touch targets, making it easy to mis-tap on a phone, especially inside a Capacitor WebView with no cursor affordance.
**Fix applied:** Added `min-h-11 min-w-11 flex items-center justify-center rounded-md` and an `aria-label` to the `QuizResult` back button, matching the pattern already used by the sibling `QuizAttempt` exit button. `AllClasses.tsx`/`AdminCMS.tsx` instances are out of the requested scope and left as PROPOSED follow-ups.

### [LOW] [VIS] Hardcoded Tailwind color scale classes instead of theme tokens
**Where:** `src/pages/QuizResult.tsx` (~24 occurrences of `text-green-400/500/600`, `text-red-400`, `text-yellow-400/500/600`)
**Why it matters:** The rest of the design system uses semantic tokens (`text-primary`, `text-destructive`, `text-muted-foreground`) so a theme/dark-mode change propagates everywhere. These raw Tailwind color-scale literals in the score/verdict UI won't follow palette or dark-mode adjustments and will drift visually from the rest of the app over time.
**Fix:** PROPOSED — introduce `text-success`/`text-warning` semantic tokens (there's already `text-destructive`) and replace the green/red/yellow literals. Left unapplied: touches ~24 call sites and is a design-system change beyond "low risk."

### [LOW] [OBS] Silent swallow on payment-recovery poll
**Where:** `src/pages/BuyCourse.tsx:249-255`
**Why it matters:** If the `recoverEnrollment` edge function throws, the error is logged via `logger.error` but the user sees no feedback at all — they're left on the buy page with a stale "Recovering your enrollment…" toast and no retry affordance, which reads as a hang after a real payment.
**Fix:** PROPOSED — show a toast with a manual "Contact support" / retry action when recovery fails, instead of only logging. Not applied — touches user-visible copy/behavior on a payment path, which needs product sign-off.

### [LOW] [MAINT] Two independent "watched % complete" signals for the same lesson
**Where:** `src/hooks/useLessonProgress.ts` (`lesson_progress`, 90% unique-interval gate) vs. inline `handleVideoTimeUpdate` writing to `user_progress` (80% total-time gate) referenced in `LessonView.tsx` comments around line 222-225
**Why it matters:** Two tables track "is this lesson done" with different thresholds and different anti-cheat rigor (interval-merge vs. raw elapsed time). Downstream code (Dashboard %, MyCourseDetail progress bar) needs to know which one is authoritative, and a future refactor risks reading the wrong one or double-writing.
**Fix:** PROPOSED — this is called out in the code's own comments as intentional/staged; recommend consolidating onto `lesson_progress` in a follow-up migration rather than touching it inside this audit pass.

## Wins
- **Server-enforced paid-content access:** `lessons` SELECT RLS (`Enrolled users and staff can view lessons`, migration `20260410174547`) gates rows by `enrollments.status = 'active'` or a free course price — the UI's `hasPurchased`/`is_locked` checks are a UX convenience layered on top of a real server boundary, not the only gate.
- **Quiz integrity done right:** `QuizAttempt` never fetches `correct_answer`; scoring happens server-side via the `score-quiz` edge function, and `QuizResult` only gets answers/explanations through the `get_quiz_review` RPC that verifies the caller owns a submitted attempt. A `submittedRef` guard also prevents the timer auto-submit and a manual submit from racing into duplicate attempts.
- **Progress-write hygiine:** `useLessonProgress` debounces to one upsert/15s, skips no-op writes via a signature hash (explicitly fixing a prior 6,696-upsert incident per its own comment), and falls back to an offline mutation queue when `navigator.onLine` is false or the request fails — a genuinely resilient design for patchy mobile networks.
- **Course-bundle N+1 already eliminated:** `MyCourseDetail`/`LessonView` fetch course+chapters+lessons+progress via a single Promise.all/RPC bundle with a fast local cache path (`readBundleSync`/`recallLastLesson`), avoiding the classic per-lesson fan-out.
- **`hoverOnlyWhenSupported: true`** is set in `tailwind.config.ts`, so every `hover:` utility across these pages already compiles to `@media (hover:hover) and (pointer:fine)` — the "sticky hover in WebView" failure mode called out in the brief is handled globally, not ad hoc.
- localStorage quiz answer/flag caches are correctly scoped per-user (`quiz_answers_${user.id}_${quizId}`), preventing answer leakage across accounts on a shared device.

## Fix Plan
1. Applied now (low risk, verified with `tsc --noEmit` + `eslint`): 44px tap target + `aria-label` on `QuizResult` back button.
2. Next PR (needs design sign-off): unify `Attendance`/`Materials`/`Downloads` loading states onto `RouteSkeleton`.
3. Next PR (design-system): add `text-success`/`text-warning` tokens and migrate `QuizResult`'s hardcoded green/red/yellow classes.
4. Next PR (product decision): user-visible failure/retry affordance for payment-recovery errors in `BuyCourse`.
5. Backlog: consolidate `lesson_progress` vs `user_progress` completion signals into one source of truth.
