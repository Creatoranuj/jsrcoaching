# Bandwidth Report — 2026-07-23

_Read-only audit. No query edits shipped this turn._
Used the **bandwidth-maintainer** skill.

## Top egress offenders (from `supabase--slow_queries`)

| # | Query | Calls | Total ms | Mean ms | Verdict |
|---|---|---:|---:|---:|---|
| 1 | `get_course_lesson_stats()` RPC | 637 | 20 598 | 32.3 | Top offender — needs materialized view (already flagged in `docs/audit/2026-07-22-full-12skill.md`) |
| 2 | `profiles` self-lookup (id, full_name, email, avatar_url, mobile) | 4 952 | 18 761 | 3.8 | React-Query cache landed last turn — expect drop to < 500 calls in 24 h |
| 3 | `enrollments` + `courses(id,title,grade,image_url)` join | 6 566 | 18 470 | 2.8 | Dashboard refetch — already trimmed columns; candidate for React-Query cache |
| 4 | `lessons WHERE course_id ORDER BY position` | 387 | 14 056 | 36.3 | `idx_lessons_course_position` shipped last turn — verify drop |
| 5 | `user_sessions UPDATE last_active_at` | 1 468 | 12 503 | 8.5 | Heartbeat write — check interval isn't sub-minute |

## Column-trim candidates (recommendations only — NOT applied)

To verify next turn — grep for `select('*')` on list-view surfaces:

- `src/pages/Courses.tsx`
- `src/pages/AllClasses.tsx`
- `src/pages/Materials.tsx`
- `src/pages/Library.tsx`
- `src/hooks/useBooks.ts`

Dashboard enrollment query already trims to `courses(id,title,grade,image_url)` — **keep as-is**.

## Egress-channel split — needed from user

Please paste the last-24-h split from **Supabase Dashboard → Reports → API / Storage / Realtime**
so we can confirm PostgREST is still ~95% of egress before proposing Phase-2 trims.

## Verify in 24 h

Re-run `supabase--slow_queries`. Expected deltas from last-turn ship:

- `profiles` self-lookup total: **18.7 s → < 2 s** (React-Query cache)
- `lessons ORDER BY position` mean: **36 ms → < 10 ms** (new index)
- Others unchanged pending Phase-2 approval.

## Guardrails respected

- Zero `select()` edits, zero RLS-scope changes, zero realtime channel changes.
- No proposal to move PostgREST calls into edge functions (same bytes, different meter).

### Bandwidth changes

| File | Query | Trim / change | Est. savings |
|---|---|---|---|
| _(none)_ | — | Report-only audit; no code edits this turn | — |

Verify: check Egress graph in 24 h.