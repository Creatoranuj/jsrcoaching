# Loading Strategy

Goal: users never see a logo pop in, a refresh icon flicker, a blank panel,
or a generic spinner on a route they've already visited.

## Asset rules

| Asset class            | Strategy                                                     | Where                                |
| ---------------------- | ------------------------------------------------------------ | ------------------------------------ |
| Primary brand mark     | Inline SVG via `BrandMark` — zero network                    | `src/components/brand/BrandMark.tsx` |
| Marketing/login logo   | Bundled `.webp` import (Vite fingerprints + hashes)          | `src/assets/branding/*.webp`         |
| Toolbar / nav icons    | `lucide-react` named imports (tree-shaken, in JS bundle)     | every page                           |
| Above-the-fold images  | `loading="eager"`, `fetchpriority="high"` on LCP             | Landing, Dashboard hero              |
| Below-the-fold images  | `loading="lazy"` + `decoding="async"` + explicit w/h         | feeds, recommendations               |
| Fonts (Inter/Fraunces) | CDN with `media=print onload` swap + `document.fonts.ready` gate on splash | `index.html`, `SplashHider`          |
| TanStack Query cache   | Persisted via Capacitor Preferences (native) / localStorage  | `src/lib/perf/queryPersister.ts`     |

## Route classification

| Class | Behavior                                                | Routes                                              |
| ----- | ------------------------------------------------------- | --------------------------------------------------- |
| Hot   | Bundled eagerly in `App.tsx` — no `lazy()`              | `/`, `/login`, `/profile`, `/downloads`             |
| Warm  | Lazy chunk + prefetched on idle via `startIdlePrefetch` | Dashboard, MyCourses, Courses, Materials, Notices, Timetable, AllClasses, LectureListing |
| Cold  | Fully lazy, never prefetched                            | All `/admin/*`, Privacy, DeleteAccountPublic        |

Warm prefetch is fired by `<IdlePrefetcher />` after first paint.

## Splash → first-paint handoff

`SplashHider` resolves on the first to occur of:

1. `document.fonts.ready` + double `requestAnimationFrame` (preferred —
   guarantees fonts have swapped before reveal).
2. Hard 1.5s safety timeout (splash NEVER hangs).

The inline boot placeholder in `index.html` is killed by a MutationObserver
on `<div id="root">` the millisecond React commits its first render.

## Adding a new route

1. Add the `lazyWithRetry(() => import(...))` declaration in `App.tsx`.
2. If the route is **Warm** (expected within first session), append it to
   `WARM_ROUTES` in `src/lib/prefetch.ts`.
3. If the route is **Hot** (visible in first 30s), switch to a static
   `import` instead — but only if it does not bloat the initial chunk
   past the 180 KB gzipped entry budget (`scripts/check-bundle-size.mjs`).

## Adding a new asset

- **< 4 KB raster or any logo/icon:** prefer inline SVG (`BrandMark`-style
  component) or rely on Vite's automatic data-URI inlining.
- **Above-the-fold image on a Hot route:** import statically, set explicit
  `width` + `height`, drop `loading="lazy"`, set `fetchpriority="high"` on
  the LCP image, and consider an `<link rel="preload" as="image">` in
  `index.html` if it is the same image on every cold start.
- **Below-the-fold or per-row imagery:** keep `loading="lazy"` +
  `decoding="async"`. These are the *good* lazy loads.

## Bundle budget

Enforced by `scripts/check-bundle-size.mjs` (runs in `postbuild`):

- Initial entry: **< 180 KB gzipped**
- Any single chunk: **< 250 KB gzipped**

If a preload would break the budget, prefetch on idle instead.

## Early-boot native imports (Capacitor)

Decision of record — do not re-litigate in future audits.

### Eager (by design)

`@capacitor/core` value symbols (`Capacitor`, `CapacitorHttp`) are imported **synchronously** at every call-site:

- `src/lib/platform.ts`
- `src/lib/bridge/index.ts`
- `src/lib/native/haptics.ts`
- `src/lib/native/network.ts`
- `src/lib/native/naveenStoragePdf.ts`
- `src/lib/native/nativePdfHttp.ts`
- `src/lib/native/capacitorFunctionFetch.ts`
- `src/components/video/NotionPageRenderer.tsx`

**Why eager:** `Capacitor.isNativePlatform()` is a pre-hydration gate for the back-button hook, keyboard listener, and route guards. Converting it to `await import()` widens the race between listener registration and the user's first hardware-back press — violates the capacitor-core rule *"Never let the OS default close the app."* `CapacitorHttp` sits on the PDF fetch retry path where an extra chunk fetch on a flaky network costs more than the ~4 KB it would save.

**Cost is negligible:** `vendor-capacitor` chunk is ~32 KB raw / ~11 KB gzipped, single chunk, SW-cached after first launch.

### Lazy (via `src/lib/native/*.ts` container loaders)

These plugins go through memoized `load*()` loaders — one promise per process, wrapped in a container so the plugin proxy's `.then` is never probed:

- `@capacitor/app` → `src/lib/native/app.ts`
- `@capacitor/preferences` → `src/lib/native/preferences.ts`
- `@capacitor/filesystem` → `src/lib/native/filesystem.ts`
- `@capacitor/haptics` → dynamic-imported inside `haptics.ts` after the eager platform gate

### Rule for new `@capacitor/*` plugins

1. Default = lazy via a new `src/lib/native/<plugin>.ts` container.
2. Exception = pre-hydration hot path (back-button, platform gate, first-paint route guard). Then eager, and add a code comment citing this section.

