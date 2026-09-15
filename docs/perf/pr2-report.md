# PR 2 — Web/JS Speed Layer report

## What shipped

### Skill imports (`.agents/skills/`)
- `capacitor-performance` — lazy plugin loading, bridge batching rules
- `framework-to-capacitor` — Vite/React chunk-split guidance
- `tailwind-capacitor` — safe-area + purge patterns (used in PR 3)

### Chunk graph tightening (`vite.config.ts`)
New `codeSplitting.groups` entries:

| Chunk | Contents | Priority |
| --- | --- | --- |
| `vendor-pdf` | react-pdf, pdfjs-dist | 85 |
| `vendor-notion` | react-notion-x, notion-* | 85 |
| `vendor-charts` | recharts, d3-*, victory-vendor | 85 |
| `vendor-video` | react-player, hls.js, dashjs | 85 |
| `vendor-md` | react-markdown, remark-*, rehype-*, unified pipeline | 75 |
| `vendor-forms` | react-hook-form, zod, @hookform/resolvers | 70 |
| `vendor-radix` | @radix-ui/* | 65 |
| `vendor-router` | react-router, react-router-dom, history | 65 |
| `vendor-query` | @tanstack/react-query, @tanstack/query-core | 65 |

`modulePreload.resolveDependencies` excludes all new heavy chunks from the HTML preload hint — they load on-demand when the route needs them, not on cold start.

### Budget tighten (`package.json` postbuild)
- Entry: `220 KB → 180 KB` gzipped (matches `docs/performance.md`)
- Any single chunk: `300 KB → 280 KB` gzipped

Bypass: `NB_SKIP_SIZE_CHECK=1` still available for emergency releases.

## What was audited and found clean (no changes needed)

- **Top-level Capacitor plugin imports** — `rg -n "^import .* from ['\"]@capacitor(-community)?/" src/` returned only 3 hits, all `import type` only. Runtime plugin imports were already lazy via `src/lib/native/*` wrappers. Nothing to fix.
- **Lucide star imports** — none.
- **`will-change`** — used twice (transform + scroll-position), both scoped correctly.
- **Route lazy-loading** — every non-critical route already uses `lazyWithRetry`. Downloads flagged in the plan but PDF viewer is already isolated behind that lazy boundary.

## What was deferred to a follow-up PR

- **List virtualization** on AllClasses / LectureListing / MyCourses / Notices / Materials. These need per-page row-height instrumentation with real production data (row heights vary with content). Adding `react-window` blindly risks visual regression (scroll restoration, keyboard focus quirks). Ship after we can measure list sizes from analytics.

## Before / after

Fill after the next CI run against a warm cache:

| Metric | Before (PR 1 baseline) | After (this PR) |
| --- | --- | --- |
| Initial entry gz | TBD | TBD |
| Largest chunk gz | TBD | TBD |
| Chunk count | TBD | TBD |
| Cold-start LCP (mobile LHCI) | TBD | TBD |
| Perf score (mobile LHCI) | TBD | TBD |

## Next

PR 3 — assets + splash + first-paint polish.
