# Observer Report — 2026-07-19 — P1 ship + session close

**Window observed:** turns 33…42 (this session's tail, after the deep audit).
**Scope:** P1 fix ship, remaining items from `docs/observer/AUDIT-2026-07-19-deep.md`.

## Incomplete
- [ ] **PERF — `get_course_lesson_stats()` still spikes to 1.35s.** *turn 34, item #4* — evidence: `supabase--slow_queries` right now shows `mean_ms 30.54, max_ms 1345.02, calls 452, total_ms 13801`. Covering index on `lessons(course_id, duration)` was added earlier but mean improved only marginally and P99 is unchanged. Next action: `EXPLAIN (ANALYZE, BUFFERS)` on the function body, then either (a) convert to a single CTE + `GROUP BY` (no per-course loop), or (b) materialized view refreshed every 5–10 min.
- [ ] **VIS — 172 raw `text-white`/`bg-black` still in tree.** *turn 41* — evidence: `scripts/check-design-tokens.mjs` BUDGET=172. Only `LectureCard` (2 sites) was migrated this pass. Progressive — no urgency, but the ratchet only bites when someone lowers the budget.
- [ ] **OBS — 141 raw `console.*` still in tree.** *turn 34, item #3* — evidence: `scripts/check-console-usage.mjs` BUDGET=141, wrapper `src/lib/log.ts` in place. No sites migrated yet. Also progressive.

## Follow-ups deferred (need user input)
- [ ] **Player consolidation — keeper decision.** *turn 34, item #6; turn 41 close* — three players live: `MahimaGhostPlayer`, `MahimaVideoPlayer`, `UnifiedVideoPlayer`. Skill guidance points to Ghost. Blocker: user must confirm before deletion PR.
- [ ] **Sentry 14-day breadcrumb export.** *turn 34, item #7* — blocker: user must upload the export file so `/skill:sentry-triage` can map issues to file:line.

## Linked to current work
- **Landing RLS fix (turn ~2) ↔ SECURITY DEFINER migration (turn 40).** The migration re-granted `has_role` + `check_rate_limit*` + `search_lectures` + `get_platform_stats` to `anon` — this preserves the landing-page fix. Confirmed in `mem://constraints/security-definer-grants`.
- **CI guard scripts (turn 32) ↔ code-guards workflow (turn 41).** Scripts existed but weren't wired; now they run on every PR + main push via `.github/workflows/code-guards.yml`.

## Dropped
- None this session. Every item from turn 34's remaining table has either been shipped (1, 5), left in progressive-ratchet mode (2, 3), flagged still-open (4), or explicitly parked pending user input (6, 7).

## Risks / ignored findings
- **Supabase linter WARNs 0028/0029 remain on 25 functions** — *turn 41* — accepted because: all 25 are on the documented whitelist (5 anon-callable landing/rate/search, 20 auth-only admin/quiz/enrollment). Do NOT try to silence these further. Source of truth: `mem://constraints/security-definer-grants` + `src/test/definer-grants.integration.test.ts`.
- **`profiles` single-row fetch: 3896 calls / 14.5s total, max 244ms** — *not previously flagged* — high call volume suggests missing client cache on profile lookups. Not blocking; log for future perf pass.
- **`lessons.like_count` single-column fetch: 544 calls, max 1.4s** — *not previously flagged* — likely N+1 from like-count polling. Not blocking; candidate for a subscribe-once realtime channel.

## Signal-only (nothing to do)
- `user_sessions` heartbeat is 5min already — better than the 60s target in the audit; no change needed.
- Payment HMAC + timing-safe compare, `pdf-proxy` SSRF allow-list, all-tables RLS: verified in earlier turns, no drift this session.

## Notes on visibility
- Tool activity (migrations applied, files written, security scans) is NOT in the chat search index. Cross-checks used: `supabase--read_query` on `pg_proc` (confirmed grants shipped), `rg -c` on `src/` (confirmed 172 count), `supabase--slow_queries` (confirmed `get_course_lesson_stats` still slow).
