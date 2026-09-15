# Audit — YouTube "∞" (Link/Share) Chip in Landscape

**Date:** 2026-07-24
**Scope:** Bottom-left overlay chip visible on paused YouTube embed (`youtube-nocookie.com/embed`) inside `MahimaGhostPlayer` when player is in landscape.

## What the chip is
On the paused/idle overlay of the YouTube IFrame embed, a small round chip appears in the bottom-left corner containing the "link / infinity" (∞) glyph — YouTube's share/copy-link affordance. To its right sit two faint indicators (wifi + battery placeholders). The user refers to the round ∞ chip as the "infinity symbol".

Above the chip YouTube also renders the current-time text (`0:01 / 25:12`) and the red progress-bar start dot. Those are separate concerns; this audit measures only the ∞ chip.

## Method
Standalone HTML probe (`youtube-nocookie.com/embed/v1y9a87sGeA`, `modestbranding=1&rel=0&controls=1`) rendered at four landscape sizes. Video started, then paused so the overlay chip is visible. Screenshot of the `<iframe>` container captured with Playwright and analyzed with PIL (bright-pixel bbox in bottom-left 8% × 10% region).

Artifacts: `/tmp/browser/yt-audit/paused_*.png`, `/tmp/browser/yt-audit/zoom_1280.png`.

## Measurements (∞ chip only)

| Player size | Chip w × h (px) | Left margin | Bottom margin | % of width | % of height |
|-------------|-----------------|-------------|---------------|------------|-------------|
| 640 × 360   | 38 × 33         | 13 px       | 3 px          | 5.94 %     | 9.17 %      |
| 960 × 540   | 56 × 49         | 20 px       | 5 px          | 5.83 %     | 9.07 %      |
| 1280 × 720  | 76 × 66         | 26 px       | 6 px          | 5.94 %     | 9.17 %      |
| 1600 × 900  | 98 × 82         | 30 px       | 8 px          | 6.12 %     | 9.11 %      |

**Key finding — the chip scales linearly with player width, so its size in CSS px is *not* fixed. A fixed 44 × 44 mask (as the previous portrait code used) under-covers at ≥ 960 px width.**

Stable ratios (use these):

- **Diameter**  ≈ **6 % of player width** (≈ 9 % of player height, aspect 16:9)
- **Left offset** ≈ **2 % of player width**
- **Bottom offset** ≈ **1 % of player height** (essentially flush)

## Recommendation for the landscape mask
Render the mask with percentage sizing anchored to the video container:

```
width:  6.5% of container width   (small safety pad)
height: 6.5% of container width   (square, matches chip)
left:   1.8% of container width
bottom: 0.8% of container height
border-radius: 50%
```

Concretely at common landscape sizes:

| Player      | Mask (w=h) | left | bottom |
|-------------|------------|------|--------|
| 640 × 360   | 42 px      | 12   | 3      |
| 960 × 540   | 62 px      | 17   | 4      |
| 1280 × 720  | 83 px      | 23   | 6      |
| 1600 × 900  | 104 px     | 29   | 7      |

The previously-removed portal mask used a fixed 44 × 44 px block — that only covers the chip below ~720p landscape and is off-anchor. Use the responsive spec above when the mask is re-introduced.

## Notes / follow-ups
- The wifi + battery icons right of the chip (~2× chip width extra) are ambient — they do not carry the YouTube brand. Mask only if a wider brand pill is desired.
- The `0:01 / 25:12` timer text above the chip is native player chrome (`modestbranding` does not remove it). Not part of this audit.
- APK/native fullscreen scaling matches the ratios above; no separate spec needed.
