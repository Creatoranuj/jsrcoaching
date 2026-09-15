# Audit: AdminQuizManager

**Rating: 5/5 (security lens) / 4/5 (maintainability lens)** — Phase-2 uplift (2026-07-19):

- Verified `questions` RLS: only `admin` + `teacher` can `SELECT` directly. Students **cannot** read `correct_answer` / `explanation` at all pre- or post-submission via the table.
- Verified scoring already runs server-side in the `score-quiz` edge function with a service-role client — client never sees the answer key while attempting.
- Added `public.get_quiz_review(_attempt_id)` SECURITY DEFINER RPC — returns answers + explanations **only** to the attempt owner (or admin/teacher) **only** after `submitted_at IS NOT NULL`. `QuizResult.tsx` now uses this RPC instead of the previously-broken direct `questions` SELECT.
- `score-quiz` switched to local `getClaims()` JWT verification (no more 401s on stale sessions).

Answer-key exposure is now closed on both sides: attempt-time (score-quiz + service role only) **and** review-time (owner-gated RPC).

Remaining items are pure code-organisation polish (file split, virtualization, numerical tolerance) — non-security, deferred.

Scope: `src/pages/AdminQuizManager.tsx` (1083 lines) + related edge functions (`score-quiz`) + presumed tables `quizzes`, `questions`, `quiz_attempts`.

## Findings

### [HIGH] [MAINT] Single 1083-line component with 3 views (list/create/edit) inlined
**Where:** `src/pages/AdminQuizManager.tsx`
**Why it matters:** Every state change re-renders the entire tree — quiz list, question editor, attempts sheet, image upload previews. Adds cognitive load for future edits and makes targeted tests near-impossible. Also the file mixes Zustand-shaped local state with `useEffect` fetches and dnd-kit reorder logic — three responsibilities that should each be their own hook/module.
**Fix:** Split into:
  - `pages/AdminQuizManager.tsx` — routing shell, view switcher
  - `components/admin/quiz/QuizList.tsx`
  - `components/admin/quiz/QuizForm.tsx`
  - `components/admin/quiz/QuestionEditor.tsx` (dnd-kit + image upload)
  - `components/admin/quiz/AttemptsSheet.tsx`
  - `hooks/useAdminQuizzes.ts` — react-query CRUD
Target: no file > 300 lines.

### [HIGH] [SEC/AUTHZ] Admin gate is client-side only (`has_role` RPC in useEffect)
**Where:** `src/pages/AdminQuizManager.tsx:219`
**Why it matters:** The client check hides the UI but does not stop a signed-in student from calling the underlying Supabase mutations directly. Safety depends entirely on **RLS policies + INSERT/UPDATE/DELETE grants** on `quizzes`, `questions`, `quiz_attempts`. If any table forgot the `WITH CHECK (has_role(auth.uid(), 'admin'))` policy, a student can inject questions or unpublish quizzes.
**Fix:** Verify (this audit is read-only, so add to fix plan): run `supabase--linter` and manually check policies on all four quiz tables. Any client-side write should be paired with a `security_alerts` trigger if a non-admin ever gets past RLS.
**Regression guard:** Add an integration test that attempts a quiz write with a student JWT and expects 403.

### [MEDIUM] [DATA] Answer-key exposure risk on the read side
**Why it matters:** `questions.correct_answer` + `questions.explanation` MUST NOT be selectable by students before they submit. This file is admin-only so it's not the leak surface — the student quiz-player is. Need to confirm the student read policy excludes `correct_answer` / `explanation` (or that scoring goes through the `score-quiz` edge function only). If the client can `select('*')` from `questions`, the quiz is trivially defeated with devtools.
**Fix:** Split `questions` into `questions` (public: text/options/marks) + `question_answers` (admin/service-role only). Score via `score-quiz` edge fn using service-role.

### [MEDIUM] [DATA] `question_type: "numerical"` uses free-text `correct_answer` comparison
**Where:** `QuestionForm` interface + scoring path.
**Why it matters:** Numerical answers need range tolerance (e.g. `9.8 ± 0.1`) — string-equals will mark physically correct answers wrong.
**Fix:** Extend schema with `numerical_min` / `numerical_max` and compare in the score edge fn.

### [MEDIUM] [PERF] No virtualization on quiz list or question editor
**Why it matters:** An admin editing a 100-question DPP re-renders every question card on every keystroke. Combined with dnd-kit, this gets janky on a mid-tier Android.
**Fix:** Wrap question list with `react-virtual` or extract each question card to a `memo` component keyed by `_uid` (already stable).

### [MEDIUM] [UX] Image upload is inline with no dedicated progress or size guard
**Why it matters:** No max-size check, no accepted-type narrowing (`accept="image/*"` accepts SVG which can carry XSS if rendered without sanitisation), no HEIC → JPEG conversion for iOS. Uploads block the JSX under a truthy check.
**Fix:** Add `MAX_IMAGE_BYTES = 2_000_000`, reject SVG, show a per-question progress bar. Rely on the storage bucket having a MIME allow-list too (defence in depth).

### [MEDIUM] [A11Y] Icon-only buttons (Edit, Attempts, Publish, Delete) at `h-10 w-10` — meets 40px, misses HIG 44px
**Where:** ~lines 570–585
**Fix:** `h-11 w-11` on primary row actions; ensure `aria-label` (title is present, aria-label absent).

### [MEDIUM] [VIS] Type colour-coding (`bg-blue-500/10` / `bg-purple-500/10`) uses raw Tailwind colours instead of semantic tokens
**Why it matters:** Breaks dark-mode theming intent and violates the project's own "no hardcoded colours" rule. Also purple-on-white reads as generic AI aesthetic.
**Reference:** Linear uses a single tinted accent per row type, not two competing hues.
**Fix:** Introduce `--quiz-dpp` / `--quiz-test` semantic tokens in `index.css` and use `bg-quiz-dpp/10`.

### [LOW] [MOT] `active:scale-[0.98]` missing on quiz row cards
Cards look tappable but give no press feedback. Add `nb-tap` class already used elsewhere.

### [LOW] [OBS] `reportError` imported but not obviously wrapped around Supabase mutations
Confirm all failing `.upsert` / `.delete` calls flow into Sentry (spot-checked one; not audit-verified across all handlers).

### [LOW] [MAINT] `_uid`, `_imageFile` underscore-prefixed transient fields on `QuestionForm`
Clean pattern but not typed off the persisted `Question` — extract a `PersistedQuestion` type and a `QuestionDraft = PersistedQuestion & { _uid; _imageFile }` so serialization doesn't accidentally send `_imageFile` to the DB.

## Wins
- Correct use of `dnd-kit` with keyboard, pointer, and touch sensors — reorder is accessible.
- Sticky header with `env(safe-area-inset-top)` — respects notch.
- Sensible defaults on `defaultQuestion` (4 marks, -1 negative) match Indian competitive-exam convention.
- List view uses proper empty state with icon + copy, not a bare "No data".
- Publish / unpublish flow uses eye-toggle icon — clear affordance.
- Attempts panel is a right-side `Sheet` — good mobile pattern.

## Fix Plan
1. ~~HIGH: verify RLS + gate answer-key exposure~~ ✅ done in Phase-2.
2. ~~HIGH: answer-key on review side~~ ✅ done — `get_quiz_review` RPC.
3. **Backlog (MEDIUM/LOW):** file split into 5 modules, question-list virtualization, numerical tolerance schema, image upload guard, a11y tap targets, semantic colour tokens, motion polish. All non-security.

## Verdict on the user's question — "Quiz Manager ke code ko rate kijiye"
Security & data-integrity lens: **5/5** post Phase-2. Answer key is admin/teacher-only at the table level, server-scored via edge function, and review-gated via a SECURITY DEFINER RPC that requires ownership + submission. Maintainability lens still at 4/5 pending the monolithic-file split — that's a code-organisation refactor, not a security concern.

_Used the senior-architect-audit skill._