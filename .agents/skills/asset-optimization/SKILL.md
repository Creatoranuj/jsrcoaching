---
name: asset-optimization
description: Audit and optimize app images/icons/logos by converting simple PNGs to compressed SVG, photo/mascot PNGs to WebP, updating all code/CSS/manifest references, safely removing duplicates and confirmed-unused Supabase storage objects, and producing a before/after size report. Use when the user asks to optimize assets, reduce bundle size, compress images, convert PNG to SVG/WebP, audit icons/logos, clean up unused assets, or fix slow load caused by heavy images.
---

# Asset Optimization Skill

Goal: faster app loads with no visual regressions and no broken imports.

## Rule-set (apply per asset)

1. Simple icons / UI symbols / flat logos / file-type thumbnails → **clean hand-authored SVG** + SVGO max-safe compression.
2. Photo-like / mascot / 3D-rendered transparent images → **optimized WebP** (quality 75–85, preserve alpha).
3. PWA manifest icons (`icon-192.png`, `icon-512.png`) → **keep PNG**.
4. Open Graph / social preview (`*_og_image.png`) → **keep PNG/JPG** (social platforms prefer these).
5. Never auto-vectorize complex 3D/photo PNGs — if SVG output is larger or visually worse, use WebP.
6. Delete duplicates/unused only after confirming zero references in code, CSS, HTML, manifest, service worker, and Supabase URL strings.

## Workflow

### 1. Audit
- Scan `src/`, `public/`, CSS, TS/TSX/JS/JSX, HTML, manifest, service worker for `.png|.jpg|.jpeg|.webp|.svg`.
  ```bash
  find src public -type f \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' -o -iname '*.svg' \) -printf '%s\t%p\n' | sort -n
  ```
- For each asset, grep references:
  ```bash
  rg -n --no-heading "<basename>" src public index.html
  ```
- Also grep for Supabase storage URLs (`/storage/v1/object/public/`, bucket names) to spot remote assets duplicating local ones.
- Produce a table: path | bytes | refs | action (KEEP / →SVG / →WebP / DELETE).

### 2. Conversions
- **PNG → SVG** (only for flat/simple): hand-author the SVG (do not trace 3D renders). Then compress:
  ```bash
  npx --yes svgo -i path/file.svg -o path/file.svg --multipass \
    --config='{"plugins":[{"name":"preset-default","params":{"overrides":{"removeViewBox":false}}},"removeDimensions","cleanupIds","sortAttrs"]}'
  ```
- **PNG → WebP** (photo/mascot/3D-transparent):
  ```bash
  nix run nixpkgs#libwebp -- cwebp -q 82 -alpha_q 90 -m 6 input.png -o output.webp
  ```
  Compare sizes; if WebP ≥ original, keep original.
- Keep originals on disk until step 3 finishes and validation passes.

### 3. Update references
- Replace every `import`, `src=`, `url(...)`, manifest entry, meta tag pointing at the old file.
- Use ripgrep + line_replace; verify zero remaining references before deleting the old file:
  ```bash
  rg -n "old-file\.png" src public index.html
  ```
- Prefer local optimized assets over remote/Supabase copies for anything bundled with the app.

### 4. Supabase storage cleanup (safety-first)
- List buckets/objects via `supabase--read_query` against `storage.objects` or the storage API.
- For each remote object that duplicates a now-local asset OR is unreferenced anywhere in the repo: mark candidate.
- **First** ship code that no longer references it. **Then** delete the storage object (only with explicit confirmation if uncertain).
- Never delete objects that may be used by historical user data (e.g. avatars, receipts, course-videos uploaded by users).

### 5. Validation
- `rg` again for any deleted filename to confirm zero refs.
- Visually verify favicon, PWA icons, OG preview, app logo, video player icons, default thumbnails, mascot.
- The harness runs build/typecheck automatically — check the result.

### 6. Final report (always deliver)
Table with columns:
- asset path
- old format + size
- new format + size
- % saved
- files changed
- assets deleted (local + Supabase)
- intentionally-kept-as-PNG items with reason

## Hard rules
- No visual regression.
- No broken imports.
- No runtime image conversion in the browser.
- Never delete PWA PNG icons or OG image unless safely replaced and tested.
- Do not convert 3D/photo PNGs to SVG if SVG becomes larger.
- Keep PNG sources around until the very last validation step.

## Known project audit baseline (Naveen Bharat app)
- Keep PNG: `src/assets/icons/{bell,checkmark,cube,doubts,home,science,student}-3d.png` (3D transparent).
- Keep PNG: `public/branding/logo_og_image.png`, `public/icons/icon-192.png`, `public/icons/icon-512.png`.
- → SVG: `src/assets/icons/play-button.png`, `src/assets/thumbnails/{pdf,notes,dpp}-default.png`.
- → WebP: `src/assets/branding/sadguru-mascot.png`, `src/assets/sarthi-avatar.png`.
- Evaluate: `public/branding/logo_primary_web.png` (SVG/WebP if safe), `public/logo.png` (dedupe vs `public/logo.webp`).
