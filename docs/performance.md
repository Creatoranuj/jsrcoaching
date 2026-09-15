# Performance — Safar English

Living reference for the perf work tracked by
[`docs/briefs/06-capacitor-performance.md`](./briefs/06-capacitor-performance.md).

> Source of truth for budgets, tooling, and how to verify perf changes on
> real devices. Update this file whenever a budget or measurement workflow
> changes — do not let it drift.

## Performance budgets

| Metric                          | Target (mid-tier Android) |
|---------------------------------|---------------------------|
| Cold start to first paint       | < 1.2s                    |
| Cold start to interactive (TTI) | < 2.0s                    |
| Route transition                | < 150ms                   |
| Largest Contentful Paint (LCP)  | < 2.5s                    |
| Interaction to Next Paint (INP) | < 200ms                   |
| JS bundle (initial, gzipped)    | < 180KB                   |
| Any single chunk (gzipped)      | < 250KB                   |
| Main-thread long tasks at boot  | 0 above 50ms              |
| Scroll / gesture frame rate     | stable 60fps              |

Budgets are enforced for the bundle metrics by
[`scripts/check-bundle-size.mjs`](../scripts/check-bundle-size.mjs) on every
production build (`npm run build`). The runtime metrics are observed by
[`src/lib/perf/webVitals.ts`](../src/lib/perf/webVitals.ts) and surfaced in
the dev overlay below.

## Tooling

### 1. Web Vitals logger (`src/lib/perf/webVitals.ts`)

Zero-dep `PerformanceObserver` wrapper. Captures LCP, INP, CLS, and long
tasks (> 50ms). In dev it logs to the console; in prod it pushes Sentry
breadcrumbs so they show up next to any error report.

Initialised once from `src/main.tsx` inside `requestIdleCallback`.

### 2. Bridge meter (`src/lib/perf/bridgeMeter.ts`)

Ring buffer of the last 50 Capacitor plugin invocations + a running total.
Used by the perf overlay. Wrap any plugin call you want timed:

```ts
import { meter } from "@/lib/perf/bridgeMeter";

await meter("StatusBar", "setStyle", () =>
  StatusBar.setStyle({ style: Style.Dark }),
);
```

The wrapper is opt-in — no existing call sites are modified — so it adds
zero risk and only the calls you instrument show up in the overlay.

### 3. Dev perf overlay (`src/components/dev/PerfOverlay.tsx`)

Hidden floating widget showing FPS, JS heap, LCP/CLS/INP/long-tasks, and
the most recent bridge calls.

Enable in two ways:

- **Dev build** — appears automatically when `import.meta.env.DEV` is true.
- **Production build** — open DevTools and run:

  ```js
  localStorage.setItem("nb_perf", "1"); location.reload();
  ```

  Remove with `localStorage.removeItem("nb_perf")`.

The overlay is lazy-loaded; production bundles do not pay for it unless
the flag is set.

### 4. Persistent query cache (`src/lib/perf/queryPersister.ts`)

Persists the TanStack Query cache to `@capacitor/preferences` on native and
`localStorage` on web. Hydrated on first paint, then refreshed in the
background by React Query's normal stale logic.

Cap: ~512KB. Skips keys containing `live`, `realtime`, `presence`, or
`session`. Saves on idle every 8s and when the tab is hidden.

## CI / build guardrails

### Bundle size gate (`scripts/check-bundle-size.mjs`)

Runs automatically after `npm run build` (wired as `postbuild`). Fails the
build if any single JS chunk or the initial entry payload exceeds the
budget.

Tune locally:

```bash
NB_MAX_ENTRY_KB=200 NB_MAX_CHUNK_KB=300 npm run build
NB_SKIP_SIZE_CHECK=1 npm run build   # emergency bypass
```

### Bundle visualization (`vite-bundle-visualizer`)

```bash
ANALYZE=true npm run build
open dist/stats.html
```

### One-shot size report

```bash
npm run build && node scripts/measure-perf.ts
```

Prints the top 20 chunks (gz + raw), totals, and the initial entry
payload — handy for quickly diffing two branches without firing up the
visualizer.

## Verifying on real devices

1. **Cold start** — fully close the app from the recents tray, then
   tap the launcher icon. The native splash should fade out within
   ~200ms of React's first paint (see `SplashHider.tsx`).
2. **Route transitions** — navigate between Dashboard ↔ My Courses ↔
   Materials. The lazy chunks for each page should already be cached;
   the second visit should be instant.
3. **Bridge churn** — open the perf overlay and scroll the longest
   list. The bridge call counter should not increase during scroll.
4. **LCP** — DevTools > Performance > "Mobile" throttling > record a
   reload of `/dashboard`. Confirm LCP < 2.5s on a Pixel 4-class device.

## Rules of thumb (what to keep doing)

- Use `lazyWithRetry` for every new route.
- Never `import` a Capacitor plugin at module top-level — always
  `await import(...)` inside the function that needs it.
- Add `loading="lazy" decoding="async"` to every non-LCP `<img>`.
- For lists likely to grow past ~50 items, reach for `react-window`
  (already installed) before adding another dependency.
- Apply the `.cv-auto` utility (defined in `src/index.css`) to long
  stacks of cards that live below the fold.

## Follow-ups (deferred — not in this pass)

- Replace the boot-time service-worker unregister script with a proper
  `Cache-Control` strategy and remove it entirely once we know all
  installed APKs have cleared their SW.
- Audit `recharts` consumers (admin analytics) for further code-split
  opportunities — each chart could be its own dynamic import.
- Consider `@tanstack/react-query-persist-client` if the hand-rolled
  persister becomes a maintenance burden.
- Add a Lighthouse CI step for the marketing/landing route once we have
  a dedicated public URL.
