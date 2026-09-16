# Holistic audit — floating buttons (v1.7.0, 2026-09-16)

Scope: deep fix of the floating WhatsApp button plus a full pass over every
floating/overlay control, safe-area handling, back-button contract, dead code,
perf budget and security-sensitive surfaces.

## HIGH — WhatsApp FAB hidden behind the JSR Agent bubble (FIXED)

Three files positioned right-column FABs with independent hard-coded offsets:

| Surface | Before | Result |
| --- | --- | --- |
| ChatWidget FAB | `bottom: 5rem`, `z-[55]`, 56px | — |
| WhatsAppFab (home) | `bottom: 6.5rem`, `z-40`, 56px | 2rem overlap, taps stolen by chat (higher z) |
| WhatsAppFloat (`liftOnMobile={false}`, exam pages) | `bottom: 5.5rem` | 3rem overlap — almost fully covered |

Exam landing routes (`/up-board-english`, `/cbse-english`, `/cg-lecturer-english`)
are all in the chat widget allow-list, so the worst case shipped on three pages.

Fix: new `src/config/fabStack.ts` is the single source of truth — `FAB_SIZE_REM`
(3.5), `FAB_GAP_REM` (1), `FAB_SLOT_STEP_REM` (4.5), shared `FAB_Z` (55), and
`fabBottom()` / `fabBottomDesktop()` helpers that always add
`env(safe-area-inset-bottom)`. Slots: `base` (chat bubble, 5rem mobile / 1.5rem
desktop), `raised` (WhatsApp, 9.5rem / 6rem). `ChatWidget`, `WhatsAppFab` and
`WhatsAppFloat` all read the module; `liftOnMobile` and the 6.5rem default are
gone. `src/test/fabStack.test.ts` fails the build if two slots ever come closer
than one button diameter.

## MEDIUM

1. **WhatsApp FAB was desktop-invisible** — `className="sm:hidden"` on the home
   page hid it above 640px. Removed; it now renders at the raised desktop slot.
2. **Duplicate phone constant** — `Index.tsx` carried its own `WHATSAPP_PHONE`
   literal alongside the canonical `WHATSAPP_NUMBER`. Removed; one source now.
3. **Dead duplicate component** — `src/components/common/FloatingAuthButton.tsx`
   was unreferenced (the rendered one is local to `Index.tsx`). Deleted.

## LOW / observations

- `src/components/notes/FloatingNotesButton.tsx` (base slot, `z-40`) is currently
  unreferenced. Left in place, but it must adopt `fabStack` before being wired up.
- `AutoScrollFab` (`z-[68]`, 84px + 56px stacked) and the Notion save-as-PDF FAB
  (`z-50`) only render on reader/lesson routes, which are in the chat widget's
  `BLOCKED_PREFIXES` — no collision possible.
- `StickyMobileCTA`, `BottomNav` (`z-30`) and the home auth pill all sit below the
  base FAB slot; the 5rem base offset clears them.
- Safe-area: every fixed bottom element verified to use
  `env(safe-area-inset-bottom)` or the `safe-area-bottom` utility.
- Back button: single listener (`useAndroidBackButton`), overlay sentinel contract
  untouched by this change — no FAB pushes history.

## Verification

- 701 tests passed, 6 skipped (78 files) — includes the 5 new stack tests
- `tsc --noEmit -p tsconfig.app.json` clean
- production build green
- bundle gate: initial entry 115.5KB (budget 180KB) — unchanged

## Still on the user

Vercel project rename to `jsrcoaching`; `.github/workflows` edits (maestro
`set -e`, unit-test action versions) — connector lacks `workflow` scope; release
keystore SHA-256 into `assetlinks.json`; Supabase connector link; admin password
rotation.
