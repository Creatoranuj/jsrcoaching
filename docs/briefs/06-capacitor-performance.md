# Lovable Prompt — Capacitor Performance Hardening

> Paste this whole block into Lovable. It is written as a senior mobile-architect
> brief: scoped, measurable, and incremental. Do not skip the “Acceptance criteria”.

---

## Role
Act as a **Senior Mobile Performance Architect** specializing in Capacitor 6+
(iOS WKWebView + Android System WebView). Your job is to take this web app and
make it feel **native-fast** on real devices — especially low‑end Android —
without breaking existing features.

## Mission
Refactor the codebase for **cold‑start, runtime, and perceived performance**.
Optimize the web layer, the Capacitor bridge, and the native shells together
as one system. Ship measurable wins, not vibes.

## Performance Budgets (must hit)
| Metric                          | Target (mid-tier Android)     |
|---------------------------------|-------------------------------|
| Cold start to first paint       | **< 1.2s**                    |
| Cold start to interactive (TTI) | **< 2.0s**                    |
| Route transition                | **< 150ms**                   |
| Largest Contentful Paint (LCP)  | **< 2.5s**                    |
| Interaction to Next Paint (INP) | **< 200ms**                   |
| JS bundle (initial, gzipped)    | **< 180KB**                   |
| Main-thread long tasks          | **0 above 50ms during boot**  |
| Scroll / gesture frame rate     | **stable 60fps**              |

## Scope of Work

### 1. Boot path
- Audit `index.html`, root layout, and entry chunk. Remove any synchronous
  third‑party scripts, blocking fonts, and render‑blocking CSS.
- Inline critical CSS for the first route; lazy-load the rest.
- Preconnect / preload only the assets needed for first paint.
- Replace `<SplashScreen>` flashing with a **synchronized handoff**: native
  splash hides only after the first meaningful frame is committed
  (use `SplashScreen.hide({ fadeOutDuration: 200 })` after `requestIdleCallback`
  or an explicit `appReady` signal).

### 2. JavaScript & bundling
- Enforce **route-level code splitting** for every screen.
- Move heavy libs (charts, PDF, markdown, date pickers, crypto) behind
  `dynamic import()` triggered by user intent, not on boot.
- Tree-shake icon sets — never ship the full library.
- Replace moment/lodash with `date-fns` / native equivalents where used.
- Configure Vite/Rollup `manualChunks` to isolate vendor, router, and UI kit.
- Turn on `build.target: 'es2020'` (or higher) for smaller, faster bundles —
  WKWebView and modern Android WebView both support it.

### 3. Rendering & runtime
- Convert any list >50 items to a **virtualized list**
  (`@tanstack/react-virtual` or equivalent).
- Memoize expensive components; wrap event handlers in `useCallback`
  only where it measurably helps (avoid blind memoization).
- Replace layout-thrashing patterns: batch DOM reads/writes, use
  `transform`/`opacity` for animations, never `top`/`left`/`width`.
- Add `content-visibility: auto` to long off-screen sections.
- Ensure all animations run on the compositor (GPU); avoid `box-shadow`
  transitions on large surfaces.

### 4. Images & media
- Use responsive `srcset` + modern formats (AVIF/WebP) with fallbacks.
- Add `loading="lazy"` and `decoding="async"` to non-critical images.
- Set explicit `width`/`height` to eliminate CLS.
- Cache remote images via `@capacitor/filesystem` or a service-worker cache
  for offline + instant re-render.

### 5. Capacitor bridge & native
- **Batch bridge calls**. Never call a plugin inside a render loop or a
  scroll handler. Debounce and aggregate.
- Prefer **event subscriptions** over polling (`App`, `Network`, `Keyboard`).
- For Android, enable hardware acceleration and set
  `android:largeHeap="true"` only if profiling proves it’s needed.
- For iOS, ensure `WKWebView` uses `limitsNavigationsToAppBoundDomains`
  appropriately and that `allowsBackForwardNavigationGestures` matches UX.
- Warm critical plugins (e.g., `Preferences`, `SQLite`) **after** first paint,
  not before.

### 6. Network & data
- Add an HTTP layer with **request deduplication**, **stale-while-revalidate**,
  and **retry with backoff** (TanStack Query or SWR).
- Persist query cache to disk via `@capacitor/preferences` or SQLite so the
  app renders meaningful UI on next cold start before the network responds.
- Compress payloads (gzip/brotli) at the edge; reject responses >500KB on
  first-paint routes.

### 7. Observability
- Add a lightweight perf logger that captures:
  - `performance.timing` / `PerformanceObserver` entries
  - LCP, INP, CLS, long tasks
  - Bridge call counts per screen
- Surface a hidden dev overlay (toggle via 5-tap on version label) that shows
  current FPS, JS heap, last 10 bridge calls, and active network requests.

### 8. Build & CI guardrails
- Add a CI step that fails the build if:
  - Initial JS bundle > 180KB gzipped
  - Any single chunk > 250KB gzipped
  - Lighthouse mobile Performance score < 90 on the marketing/landing route
- Generate a bundle visualization (`rollup-plugin-visualizer`) per build.

## Constraints
- **No breaking UI changes.** All visual output must remain pixel-identical
  unless a change is required to meet a budget — in that case, call it out.
- **No new heavyweight dependencies.** Justify every package added.
- **Web + iOS + Android parity.** Every optimization must work on all three.
- Keep TypeScript strict mode green.

## Deliverables
1. A PR-style summary at the top of your response listing every change,
   grouped by the 8 scope sections above.
2. Updated source files with the refactors applied.
3. A new `docs/performance.md` documenting:
   - Budgets and how to measure them
   - The dev perf overlay and how to enable it
   - The CI guardrails and how to tune them
4. A `scripts/measure-perf.ts` (or equivalent) that runs a scripted boot trace
   and prints LCP / TTI / bundle size to the console.

## Acceptance Criteria (Lovable: verify before finishing)
- [ ] Initial JS bundle is under 180KB gzipped (show the number).
- [ ] No render-blocking third-party scripts in `index.html`.
- [ ] At least one heavy route is lazy-loaded via `React.lazy` / dynamic import.
- [ ] Splash screen hides on an explicit `appReady` signal, not a timeout.
- [ ] At least one long list is virtualized.
- [ ] A perf overlay is reachable in dev builds.
- [ ] `docs/performance.md` exists and is accurate.
- [ ] App still builds for `ios` and `android` with `npx cap sync` succeeding.

## Output format
1. **Plan** (bulleted, 8 sections).
2. **Diffs / file changes** grouped by section.
3. **Before/after metrics table** (estimate where you can’t measure).
4. **Follow-ups** — anything you intentionally deferred and why.

Begin.
