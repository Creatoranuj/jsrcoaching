# Monitoring & verification

You cannot optimise what you do not measure. Always establish a baseline before touching code, and always verify after.

## Baseline (before any fix)

1. `supabase--slow_queries` with `limit: 20`. Note `query`, `calls`, `mean_time`, `total_time`. The top 3–5 by `total_time` are your targets.
2. Ask the user for a screenshot of Supabase Dashboard → Reports → API (or Billing → Usage → Egress). Record:
   - GB used this cycle / 5 GB free
   - PostgREST vs Storage vs Realtime vs Auth split
   - Daily bar height for last 7 days
3. Ask if any large upload / import happened in that window (skews baseline).

## Interpret slow_queries

| Signal | Likely cause | Fix reference |
|---|---|---|
| High `calls`, low `mean_time` | Same query re-running (missing cache, polling, refetch-on-mount) | caching-pagination.md |
| Low `calls`, high `mean_time` | Missing index or huge row (fat SELECT) | column-trimming.md, then `EXPLAIN ANALYZE` |
| `SELECT * FROM <big table>` in top 5 | Fat select on list view | column-trimming.md |
| `realtime.*` or `subscription` heavy | Channel leak / duplicate subs | realtime-leaks.md |

Run `EXPLAIN (ANALYZE, BUFFERS) <query>` via `supabase--read_query` on any query where `mean_time > 100ms`. If Seq Scan on a filter column, add an index in a migration.

## After shipping fixes

1. Re-run `supabase--slow_queries` — top query `total_time` should visibly drop for the ones you targeted.
2. Tell the user: **"Check Egress graph in 24h — daily bar should drop 40–60% after Phase 1 (column trimming) and 60–80% cumulative after Phase 2 (caching)."**
3. If drop is less than expected after 24h, the dominant query wasn't in your fix set — re-baseline.

## Report table (paste into every summary)

```markdown
### Bandwidth changes

| File | Query | Trim / change | Est. savings |
|---|---|---|---|
| src/pages/LectureListing.tsx | lessons list | 21 cols → 6, drop transcript_md/auto_transcript* | ~85% row size |
| src/hooks/useCourses.ts | courses.* | 8 explicit cols, drop teacher_bio | ~40% row size |
| src/components/live/LiveBadge.tsx | interval 30s → realtime | polling removed | ~17k calls/user/day |

**Verify:** Egress graph in 24h; expected daily drop 40–60%.
```

## Capacity math (rule of thumb)

- Free tier: 5 GB egress/month.
- Average student session (untuned): ~2 GB/month → ~2 students on free tier.
- After Phase 1: ~300 MB/session → ~15 students.
- After Phase 2 (caching + pagination): ~80 MB/session → ~60 students.
- After Phase 3 (realtime cleanup): ~50 MB/session → ~100 students.

Use these as sanity checks, not promises.
