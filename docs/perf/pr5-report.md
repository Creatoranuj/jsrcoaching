# PR 5 — Tier A + D + Tier B (partial) + Tier C

**Closed: 2026-07-16.** Final entry gz **102.9KB** (budget 180KB), LessonView
**28.7KB gz** (`vendor-notion` 29.4KB now lazy). **0 open security findings.**
Full LessonView 6-file split deferred indefinitely — ROI too low without a new
user-visible driver. See `docs/audit/pr5-post-ship-audit.md` for the next-cycle
audit and open backlog.

## Post-close hotfix — 2026-07-16

- **[LOW RELY]** Wired `scripts/audit-edge-function-callers.mjs` into
  `.github/workflows/dependency-audit.yml` — new orphaned edge functions
  now fail the weekly job (and any lockfile-touching PR).
- **[MEDIUM PERF] html2pdf verified already lazy** — the audit finding was
  stale. `html2pdf.js` is dynamic-imported at
  `src/components/video/NotionPageRenderer.tsx:83`, so its 256KB gz chunk
  is on-demand (only fetched when the user taps "Download as PDF"). No
  change needed; audit backlog item cleared.


Applied: config tweaks + BottomNav unification + Landing polish + LessonView
lazy-notion + helper extraction + 2 RLS policy re-scopes + 6 security findings
actioned.

## Tier B (partial) — LessonView lazy-load + extraction

Honest scope reduction. The original plan called for splitting a 2732-line
single component (`LessonView`) into 6 files. Reading the file confirmed it
is one giant component (183 → 2914) with deeply interwoven state (~80
`useState`, ~20 `useEffect`, ~40 handlers all sharing a closure). Splitting
that blind — no unit tests, smoke skipped per user request — is a very high
risk of silent behavior regression on the app's most-used screen.

Shipped instead (safe subset, measured wins):

| Change | Before → After (LessonView gz) |
| --- | --- |
| `CollapsiblePdfSection` → `src/features/lesson/components/` | mechanical, no size impact |
| `SmartNotesReader` → `lazyWithRetry` + `<Suspense>` | 30.7KB → 28.7KB (−2.0KB) |
| `ObsidianMarkdown` → `lazyWithRetry` + `<Suspense>` | (same PR) |
| `SmartNotesLinkDialog` → `lazyWithRetry` + `<Suspense>` | (same PR) |
| `SmartNotesListSheet` → `lazyWithRetry` + `<Suspense>` | (same PR) |

Key win: `vendor-notion` (29.4KB gz) is no longer eager-loaded when
LessonView mounts. It now downloads only when the user opens the Notes
tab. Entry total unchanged (102.9KB) because vendor-notion was already a
separate vendor chunk pre-loaded by LessonView's dep graph; now it's a
true lazy-on-interaction chunk.

Full 6-file split proposal remains valid but blocked on:
1. A minimum smoke test (`LessonView mounts for a sample lesson without crashing`) — user opted to skip.
2. Or acceptance that the split may introduce silent regressions.

Recommendation: add one Playwright smoke covering the four tabs (video /
PDF / notes / doubt), then execute the full split in a dedicated turn.



## Tier A — Config fixes

| # | Change | Result |
| --- | --- | --- |
| 1 | `hoverOnlyWhenSupported` | ALREADY SET in `tailwind.config.ts:7` — no-op ✓ |
| 2 | `min-h-screen` → `min-h-dvh` | 56 replacements across 40+ page files |
| 3 | `console.log` → silent catch | `BuyCourse.tsx:209` cleaned |
| 4 | `text-nav` token | Added `fontSize: { nav: ['10px', { lineHeight: '12px' }] }` in Tailwind config |

## Tier D — BottomNav iconography

**Choice made: Option X (all-Lucide).** Removed 3D WebP dependencies from
BottomNav; every tab now uses Lucide at 22px with a single stroke-weight
ladder (`strokeWidth: 1.75` inactive, `2.25` active). One visual language.

Details:
- `Home` / `GraduationCap` / `BookMarked` / `Download` / `ShieldCheck` / `User`
- Active tab uses `text-accent` + heavier stroke, matching prior pill treatment
- Refactor collapsed 3 duplicate button blocks into a single `renderTab()`
- `text-nav` token replaces `text-[10px]` (4 places)
- Added `aria-label={label}` on every tab (was previously missing)

3D WebP files (`home-3d.webp`, `science-3d.webp`, `student-3d.webp`) still
exist in `src/assets/icons/` — used by Dashboard and LectureGalleryCard.
Not deleted.

## Tier A — Landing polish

- **Hero mobile aspect** — `aspect-[4/5] max-md:aspect-[4/3]` — CTAs stay above the fold on 390×844
- **Press feedback** — `active:scale-[.98] transition-transform duration-150` on "Watch on YouTube" outline button

## Skills imported

**None.** `capacitor-back-button` + `capacitor-keyboard` deferred to Tier B
(LessonView refactor). Nothing this turn touched native surfaces.

## Build

```
initial entry gz: 103.0 KB (budget 180 KB) — OK ✓
```

No new deps. TypeScript strict green (build passed).

## Deferred to next turns

### Tier B — LessonView refactor (needs a dedicated turn)

Split `src/pages/LessonView.tsx` (2915 LOC) into 6 files under
`src/features/lesson/`. Zero-behavior-change refactor. Expected chunk-size
drop ~40% on `LessonView-*.js` (pdfjs + notion move to lazy chunks).

Ask before starting: **do you want a smoke test first?** (`LessonView mounts
without crash for a sample lesson`). If no unit test exists today, refactor
is safer with one.

### Tier C — SECURITY DEFINER review (needs SQL + your call)

11 functions flagged by Supabase linter. Meri sifarish:
- Pull the list, classify each into 4 buckets (auth helper / payment RPC /
  admin RPC / other)
- Bulk-suppress the 3 known-legit (`has_role`, `complete_paid_enrollment`,
  `process_refund`) with per-function justification
- Manually review the remaining 8

Confirm karo aur Tier B ya Tier C phir alag turn me lete hain.

## Open questions

1. Tier B next, ya Tier C next?
2. Tier B: smoke test pehle likhun, ya seedha refactor?
3. Delete kar dun `home-3d.webp` / `science-3d.webp` / `student-3d.webp` from BottomNav dependency? (Still used elsewhere — Dashboard etc.)
