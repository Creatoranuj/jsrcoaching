---
name: bandwidth-maintainer
description: Audit and reduce Supabase egress/bandwidth for free-tier apps. Trigger on performance audits, slow app reports, cost/free-tier concerns, or "bandwidth/egress/PostgREST usage" mentions. Covers column trimming, query caching, pagination, and realtime leak detection.
---

# Bandwidth Maintainer

Supabase free tier gives 5 GB/month egress. On this project PostgREST (Data API) accounts for ~95% of egress — not Storage. The fix is almost always **smaller payloads + fewer refetches**, not a plan upgrade.

## Workflow (always in this order)

1. **Diagnose first — never guess.**
   - Run `supabase--slow_queries` (top 10 by `total_ms`).
   - Ask user for the Supabase Dashboard → Reports → API/Database Egress split (PostgREST vs Storage vs Realtime).
   - Establish baseline: current GB/day, top-5 queries, dominant channel.
2. **Fix in priority order:**
   1. Column trimming → `references/column-trimming.md`
   2. Query caching & pagination → `references/caching-pagination.md`
   3. Realtime leak detection → `references/realtime-leaks.md`
3. **Verify** — re-run `supabase--slow_queries`; tell user to check Egress graph in 24h (expect 40–60% daily drop after Phase 1).
4. **Report** using the exact table format below.

## Report format (mandatory)

End every audit / fix batch with:

```markdown
### Bandwidth changes

| File | Query | Trim / change | Est. savings |
|---|---|---|---|
| src/pages/X.tsx | lessons list | 21 cols → 6, drop transcript_md | ~85% row size |
```

Then a one-line "Verify: check Egress graph in 24h."

## Guardrails

- **Never** strip columns that a detail page needs. Rule: list views trim, detail views keep full select. If unsure, grep the column name across the repo first.
- **Never** remove `.eq()`/`.in()` filters on `user_id`/`auth.uid()` scoped queries — that's an RLS/security concern, not bandwidth.
- **Always** typecheck after a batch. `.select()` string mismatches surface as row-type errors.
- **Never** add a `realtime` channel to "fix" polling without confirming the table is in `supabase_realtime` publication and RLS scopes reads.
- **Never** touch edge-function invocation limits by moving PostgREST calls into functions — same bytes still egress, just via a different meter.

## Reference files

- `references/column-trimming.md` — heavy-column blacklist for this project + `select(sel(...))` type-perf pattern
- `references/caching-pagination.md` — React Query defaults, `.limit()/.range()`, `useInfiniteQuery`
- `references/realtime-leaks.md` — channel cleanup rules, polling audit, heartbeat cadence
- `references/monitoring.md` — slow_queries interpretation, dashboard reading, verification loop

## Done when

- Baseline captured before changes.
- Every changed query listed in the report table.
- Typecheck passes.
- User told when to re-check dashboard.
- Closing reply names the skill: "Used the bandwidth-maintainer skill."
