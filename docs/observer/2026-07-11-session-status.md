# Observer Report — 2026-07-11 — Session status

**Window observed:** current multi-turn session (LessonView split → PDF hardening → local library crash-fix)
**Scope:** work items introduced/promised across this session

## Resolved vs Remaining (table)

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | LessonView split — ChapterGroupedSidebar / LessonDescription / TopicsCovered extracted | ✅ Resolved | `src/components/lesson/*` present |
| 2 | Community keyset pagination (PAGE_SIZE=20) | ✅ Resolved | shipped earlier this session |
| 3 | Dashboard head-count via RPC | ✅ Resolved | already used `get_dashboard_snapshot` |
| 4 | Legacy tabs sweep (Reports/AdminAnalytics/Community/Materials) | ✅ Resolved | verified clean |
| 5 | Sentry mapping UUID capture in CI | ✅ Resolved | `.github/workflows/build-apk.yml` uses `sentry-cli difutil check` |
| 6 | Duplicate `ic_launcher_background` Android resource | ✅ Resolved | file deleted |
| 7 | `resolve-doubt` Edge Function deployed | ✅ Resolved | 401 unauth response verified |
| 8 | `useLessonChat` hook extracted | ✅ Resolved | LessonView 2962 → 2853 |
| 9 | `resolveContentUrl` batched signer + Dashboard doubts count | ✅ Resolved | Phase B shipped |
| 10 | Shimmer skeleton + custom HamburgerIcon | ✅ Resolved | `src/components/icons/HamburgerIcon.tsx` |
| 11 | Dashboard `42501` permission-denied for `get_dashboard_snapshot` | ✅ Resolved | migration `20260711041914_fix_dashboard_permissions.sql` + retry |
| 12 | Sentry verification 404 → soft-pass warning | ✅ Resolved | switched to `sentry-cli debug-files list` w/ retry |
| 13 | PDF `Invalid PDF structure` + `DataCloneError` | ✅ Resolved | magic-byte guard + defensive buffer copy |
| 14 | Local library multi-select crash | ✅ Resolved (this turn) | 25 files / 300 MB batch caps in `MyLibrary.tsx` + `FolderView.tsx` |
| 15 | Large local PDF open crash | ✅ Resolved (this turn) | `stat` probe + `convertFileSrc` streaming fallback in `useLocalPdfSource.ts` |
| — | — | — | — |
| 16 | **LessonPlayerShell** split (player + chrome) | 🟡 Remaining | deferred: "safer as separate turns" |
| 17 | **LessonAsideTabs** split (chip strip + panels) | 🟡 Remaining | deferred |
| 18 | **useLessonSession** hook (loading/rating/dpps orchestration) | 🟡 Remaining | deferred |
| 19 | **MCP auth model decision** (option C) | 🟡 Remaining | never picked |
| 20 | **Safe-area gaps** on fixed/sticky elements | 🟡 Remaining | see mobile-view sweep below |
| 21 | **Push tag v1.0.12** to verify green Sentry annotation | 🟡 Remaining | user action, not code |
| 22 | PDF worker/pdf.js overall (beyond Sentry two errors) | 🟢 Signal | no further reports |

## Follow-ups deferred
- [ ] LessonView Phase 2 slices — user said "Say the word for the next slice."
- [ ] MCP auth decision — original sequence: B → A → **C** (never reached)

## Linked to current work
- Turn 14/15 (local library crash) ↔ Turn 13 (FastPdfReader hardening) — both harden the same PDF render path; the stream-URL fallback added today means the FastPdfReader defensive copy now runs on far smaller inputs.

## Risks / ignored findings
- **Fixed/sticky elements missing safe-area padding** — 8 files (see mobile-view report below). Low risk on-screen but visible on gesture-nav Android + iOS home indicator.

## Notes on visibility
- Tool-call outputs (migrations applied, files edited) are NOT in the chat search index. Cross-checks above use the repo directly.

---

# Mobile-View Expert — APK-logic gaps

**Scope:** files with `fixed` / `sticky` positioning that ship no `env(safe-area-inset-*)` padding. On notched iOS and gesture-nav Android these elements sit behind the home indicator / status bar.

| # | File | Element | Missing |
|---|------|---------|---------|
| 1 | `src/pages/Downloads.tsx` | sticky/fixed strip | `pb-[env(safe-area-inset-bottom)]` |
| 2 | `src/pages/MyCourses.tsx` | sticky top filter | `pt-[env(safe-area-inset-top)]` |
| 3 | `src/pages/Books.tsx` | fixed action | safe-area bottom |
| 4 | `src/components/Layout/BottomNav.tsx` | fixed bottom nav | safe-area bottom (critical — primary nav) |
| 5 | `src/components/course/LectureTableView.tsx` | sticky header | safe-area top |
| 6 | `src/components/notes/SmartNotesListSheet.tsx` | sheet footer | safe-area bottom |
| 7 | `src/components/video/FastPdfReader.tsx` | floating toolbar | safe-area bottom |
| 8 | `src/components/library/SelectionActionBar.tsx` | fixed action bar | safe-area bottom |

`GlobalBottomNav` is already safe-area aware; `BottomNav.tsx` is the older component and the highest-priority fix if it's still used anywhere.

**Recommended next turn:** patch these 8 in one sweep (2-line change each) — say the word.

Skill used: **history-observer**, **mobile-view-expert**.
