# Asset Performance Budget

Source of truth for image asset sizes/formats in this repo. Lovable's
`asset-optimization` skill enforces these rules during audits.

## Budgets

| Asset Type            | Ideal       | Max                       |
| --------------------- | ----------- | ------------------------- |
| Simple SVG icon       | 0.2–3 KB    | 5 KB                      |
| Custom SVG icon       | 3–15 KB     | 30 KB                     |
| Logo SVG              | 2–15 KB     | 25 KB                     |
| Small WebP avatar     | 8–30 KB     | 50 KB                     |
| Mascot / loading WebP | 10–80 KB    | 100 KB                    |
| Hero / banner WebP    | 80–250 KB   | 400 KB                    |
| PWA PNG icon          | keep as-is  | do not delete blindly     |
| OG / social image     | 100–500 KB  | quality-dependent, ≤ 1 MB |

## JS bundle budget (gzipped)

Enforced by `scripts/check-bundle-size.mjs` via the `postbuild` script in
`package.json`. Current enforced thresholds:

| Metric                | Budget   |
| --------------------- | -------- |
| Initial entry payload | 220 KB   |
| Any single chunk      | 300 KB   |

Current actual entry payload: ~194 KB (well under 220 KB budget).

**Future target** (after further code-splitting / dep trimming):
entry 180–200 KB, chunk 250 KB. Tighten `NB_MAX_ENTRY_KB` /
`NB_MAX_CHUNK_KB` in `package.json` once sustained below those numbers.

## Format rules

- **SVG** — UI/nav/player icons, file-type thumbnails, flat logos. Must
  have `viewBox`; prefer `currentColor`; no embedded raster.
- **WebP** — mascots, avatars, photos, banners, 3D-style images where
  SVG would balloon. Preserve alpha when needed (`-alpha_q 90`).
- **PNG/JPG** — keep ONLY for PWA manifest icons, Apple touch icons,
  OG/social previews, and 3D transparent renders where WebP loses fidelity.

## Hard rules

- Never auto-vectorize photos/3D PNGs into huge SVGs.
- Never delete PWA icons or OG image.
- Always grep references (code, CSS, HTML, manifest, sw.js, Supabase
  URLs) before removing any asset.
- Right-size before re-compressing — a 2048px hero shrunk to 1280px
  saves more than any quality tweak.

## Current baseline (Jun 2026)

| Asset                                       | Size  | Status      |
| ------------------------------------------- | ----- | ----------- |
| `public/icons/icon-192x192.png`             | 14 KB | PWA — keep  |
| `public/icons/icon-512x512.png`             | 58 KB | PWA — keep  |
| `public/branding/logo_og_image.png` (1200²) | 295 KB| OG — keep   |
| `public/brand/nb-mark.webp` (128²)          | 7 KB  | shell mark  |
| `src/assets/branding/logo_icon_web.webp`    | 30 KB | in-app logo |
| `src/assets/branding/sadguru-mascot.webp`   | 11 KB | mascot      |
| `src/assets/sarthi-avatar.webp`             | 11 KB | avatar      |
| Landing hero WebPs (1280×714)               | 99–127 KB | banners |
| 3D transparent PNGs (`*-3d.png`)            | 5–38 KB   | nav icons |

## Removed (Jun 2026 polish pass)

- `public/branding/logo_primary_web.webp` (53 KB) — confirmed orphan
  after `sw.js` v8 dropped its precache entry. Final reference search
  (src, public, index.html, sw.js, manifest, meta) returned zero hits.
  Deleted.

## Supabase storage

No remote assets currently duplicate local optimized assets. No deletions
proposed. Re-audit whenever uploads bucket grows.
