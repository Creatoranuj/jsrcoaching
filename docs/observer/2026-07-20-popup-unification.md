# Observer Report — 2026-07-20 — Popup unification + stray FAB fix

**Window observed:** current session, popup + Bookmark-sheet turns
**Scope:** shadcn Dialog/AlertDialog primitives, BookmarkNoteDialog, floating FABs

## Shipped this turn
- `src/components/ui/dialog.tsx` — Lovable card (rounded-2xl, hairline + soft shadow, overlay `z-[60]`, content `z-[70]`, ghost close btn, blurred overlay). Ref-counted `data-lovable-dialog-open` body flag.
- `src/components/ui/alert-dialog.tsx` — identical upgrade + same body flag ref-count.
- `src/index.css` — CSS rule: `body[data-lovable-dialog-open="true"] [data-chat-widget], [data-floating-fab]` hidden. Kills the stray Safar "S" logo bleeding over the Bookmark sheet reported in screenshot 2.
- `src/components/video/BookmarkNoteDialog.tsx` — chips retrofitted to Lovable invert-on-active pill; removed `text-emerald-500 / bg-emerald-500/10 / border-emerald-500` in favor of semantic `foreground/background/border` tokens; title `font-semibold`.
- `src/components/viewer/AutoScrollFab.tsx` — added `data-floating-fab="true"` so it hides under any dialog. ChatWidget already carries `data-chat-widget="true"`.
- `mem://design/lovable-dialog` + `mem://index.md` Core rule — future dialogs inherit the look automatically; new FABs must carry the tag.

## Automatic reach
Because the fix lives in the shadcn primitives, EVERY existing `Dialog`/`AlertDialog` caller now shows the Lovable look with zero touch:
- `ForceUpdateGate`, `ConfirmDialog`, `AdminTrustedHosts`, `StudyMaterialAdminMenu`, `PlayerControls`, plus all AlertDialog usages.

## Still open (tracked, not resolved this turn)
- Video player consolidation (`MahimaGhostPlayer` vs `MahimaVideoPlayer` vs `UnifiedVideoPlayer`) — large refactor surface; keep in own turn.
- Sheet primitive (`src/components/ui/sheet.tsx`) still uses the old shadcn defaults — mostly used for right-side admin sheets, lower visual priority. Retrofit in a follow-up pass.
- Sentry breadcrumb triage — awaiting 14-day export upload.

## Risks / accepted
- FAB hide is global while any dialog is open. Intentional — matches Lovable/Linear behavior (nothing floats over a modal). If a specific FAB must survive, don't tag it.
- Overlay `z-[60]` bumps above legacy `z-50` FABs. Any custom stacking above 60 was already a bug.

## Notes on visibility
Tool activity (this turn's edits) is not in chat search. Cross-check via repo:
- `rg "data-floating-fab" src` → AutoScrollFab
- `rg "data-lovable-dialog-open" src` → CSS + both primitives
