# PR 3 — Assets + Splash + LCP

## Skills imported

Only `capacitor-splash-screen` (upstream). PR 2 already brought in
`capacitor-performance`, `framework-to-capacitor`, `tailwind-capacitor`.
Built-in `migrate-to-assets` + `asset-optimization` used for the offloads.

## A. LCP

Landing hero (`Hero.tsx`) already renders via `<Picture>` with:
- `width` / `height` set (no CLS)
- `priority` → `loading="eager"` + `fetchpriority="high"`
- AVIF-first `<source>` order
No code change needed here — infra was in place from earlier work.
Index.html `<link rel="preload" as="image">` still points at `/brand/nb-mark.webp`
(small brand mark) which is the correct LCP for the app shell on `/`.
The landing hero on `/landing` is served from CDN; browsers pick it up via
the `<img>` tag with `fetchpriority="high"`.

## B. Landing images → CDN (biggest win)

Migrated 8 files (4 AVIF + 4 WebP pairs) to Lovable CDN via `.asset.json`
pointers. Originals deleted from `src/assets/landing/`.

| Asset | Bytes removed from bundle |
| --- | ---: |
| hero_banner_coaching_center.webp | 120,796 |
| hero_banner_coaching_center.avif | 70,327 |
| graduation_success.webp | 126,488 |
| graduation_success.avif | 72,279 |
| classroom_interaction.webp | 57,682 |
| classroom_interaction.avif | 30,541 |
| online_learning_visualization.webp | 54,694 |
| online_learning_visualization.avif | 26,997 |
| **Total** | **559,804 B ≈ 547 KB** |

Call sites updated:
- `src/components/Landing/Hero.tsx`
- `src/components/Landing/GraduationBanner.tsx`
- `src/components/Landing/WhyChooseUs.tsx`
- `src/components/Landing/OnlineLearning.tsx`

Pattern:
```ts
import heroAvifPtr from "…hero.avif.asset.json";
const heroAvif = heroAvifPtr.url;
```

## C. `<picture>` AVIF-first

Already implemented via `<Picture>` component from prior work. No change.

## D. Splash handoff

`capacitor.config.ts` already correct:
- `launchAutoHide: false`
- `backgroundColor: '#F7F4EE'` (matches HTML/body cream — zero white flash)
- `showSpinner: false`
- `androidScaleType: 'CENTER_CROP'`
- `splashFullScreen: true` + `splashImmersive: true`
- `launchFadeOutDuration: 200`

`SplashHider.tsx` hides splash on first React paint with a 2s safety
timeout. No change.

## E. Icon PNG → WebP

| Icon | PNG | WebP | Saved |
| --- | ---: | ---: | ---: |
| checkmark-3d | 12,868 | 5,590 | 57% |
| home-3d | 9,530 | 3,548 | 63% |
| bell-3d | 5,079 | 2,062 | 59% |
| **Total** | 27,477 | 11,200 | **59%** |

References updated in:
- `src/pages/Dashboard.tsx`
- `src/components/Layout/BottomNav.tsx`
- `src/components/course/LectureGalleryCard.tsx`

Kept as PNG per spec: `public/branding/logo_og_image.png`,
`public/icons/*.png` (PWA manifest).

## F. Build gate

`bun run build` → **OK**. Initial entry gz **102.9 KB** (budget 180 KB).
No regression.

## Not included / deferred

- Preload swap: not needed — nb-mark.webp is the right target for `/`.
- Any Supabase storage cleanup: none of the migrated assets were duplicated
  in remote storage.
- Signed-smoke: unchanged (soft-fail from PR 2 still in place).
