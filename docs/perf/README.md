# Perf tracking — Bijli-Fast Sweep

Rolling perf reports for the 6-PR performance overhaul defined in
`.lovable/plan.md`. Each PR lands with a `pr<N>-report.md` here containing
before/after numbers so regressions are impossible to hide.

## How to snapshot a baseline

```bash
ANALYZE=true npm run build
node scripts/measure-perf.ts > docs/perf/measure-$(date +%F).txt
open dist/stats.html   # visual chunk map
```

Paste the totals + top 10 chunks into the current PR report.

## Budgets

See `docs/performance.md` for the authoritative budget table. Any PR that
raises a budget must justify it in its report.

## Files

- `baseline-2026-07-16.md` — pre-sweep snapshot (PR 1)
- `pr<N>-report.md` — per-phase before/after (PR 2-6)
