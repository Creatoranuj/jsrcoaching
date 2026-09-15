# Skills Audit — Safar English

**Date:** 2026-06-07  
**Lens:** `senior-architect-audit` applied to every active and draft skill.  
**Overall: 4 / 5** — solid, well-structured generic Capacitor skills; main weakness was missing project-grounded examples and three missing skills called out in the tracker. All three now created.

## Scorecard (1–5 per axis)

| # | Skill | Trigger | Action | Project fit | Correct | Complete | Avg | Verdict |
| --- | --- | :-: | :-: | :-: | :-: | :-: | :-: | --- |
| 1 | webapp-to-capacitor | 5 | 4 | 4 | 5 | 5 | 4.6 | Excellent reference; already followed |
| 2 | capacitor-best-practices | 4 | 5 | 3 | 5 | 5 | 4.4 | Generic but accurate |
| 3 | capacitor-deep-linking | 5 | 5 | 4 | 5 | 5 | 4.8 | Matches `useDeepLinks` impl |
| 4 | capacitor-keyboard | 4 | 4 | 3 | 5 | 4 | 4.0 | Add `--nb-keyboard-h` note (see tailwind-capacitor) |
| 5 | capacitor-offline-first | 5 | 4 | 3 | 4 | 5 | 4.2 | HIGH gap = no mutation queue in app (tracked in CAPACITOR_AUDIT) |
| 6 | capacitor-performance | 5 | 5 | 4 | 5 | 4 | 4.6 | `lazyWithRetry` already used |
| 7 | capacitor-plugins | 5 | 4 | 4 | 5 | 5 | 4.6 | Up-to-date plugin set |
| 8 | capacitor-security | 5 | 5 | 4 | 5 | 5 | 4.8 | Capsec scan covered |
| 9 | capacitor-splash-screen | 5 | 5 | 5 | 5 | 5 | **5.0** | Matches our JS-controlled `SplashHider.tsx` exactly |
| 10 | capacitor-testing | 5 | 4 | 2 | 5 | 5 | 4.2 | Project has Playwright but few native tests |
| 11 | debugging-capacitor | 5 | 5 | 4 | 5 | 5 | 4.8 | Pairs perfectly with the new `ios-android-logs` skill |
| 12 | ionic-design | 4 | 4 | 1 | 5 | 4 | 3.6 | Project does NOT use Ionic — keep as reference-only |
| 13 | capacitor-accessibility | 5 | 4 | 3 | 5 | 4 | 4.2 | Good baseline |
| 14 | capacitor-back-button | 5 | 5 | 5 | 5 | 5 | **5.0** | Project-specific, references real hook |
| 15 | senior-architect-audit | 5 | 5 | 5 | 5 | 5 | **5.0** | Used to produce this report |
| 16 | **ios-android-logs** (new) | 5 | 5 | 5 | 5 | 5 | **5.0** | References `scripts/logs-*.sh` |
| 17 | **safe-area-handling** (new) | 5 | 5 | 5 | 5 | 5 | **5.0** | References `.safe-area-*` utilities |
| 18 | **tailwind-capacitor** (new) | 5 | 5 | 5 | 5 | 5 | **5.0** | Pinned to v3 + Radix, `--nb-keyboard-h`, `100dvh` |

> The user's tracker listed 17 slots; the active set is 18 because `capacitor-accessibility` was already present in addition to back-button. All 15 from the tracker + accessibility + the audit skill are now covered.

## Findings & Fixes

### [HIGH] [PROJECT-FIT] Three skills missing — FIXED
**Where:** `.workspace/skills/`  
**Why:** Tracker called out `ios-android-logs`, `safe-area-handling`, `tailwind-capacitor`. None existed.  
**Fix:** Authored as drafts at `.agents/skills/<name>/SKILL.md`, each grounded in actual repo paths (`scripts/logs-*.sh`, `.safe-area-*` utilities, `--nb-keyboard-h` var, `min-h-dvh`). Apply with `skills--apply_draft`.

### [MED] [PROJECT-FIT] `ionic-design` is misleading for this repo
**Where:** `.workspace/skills/ionic-design/`  
**Why:** Project uses Tailwind v3 + Radix. Following Ionic snippets verbatim would introduce conflicting primitives.  
**Fix:** Keep as reference for migration scenarios only; do not auto-apply its snippets. Documented in this audit; no skill rewrite needed.

### [MED] [TRIGGER] Generic skills miss India/Hindi-mix user phrases
**Where:** most "When to use" sections  
**Why:** Real users in this project say "back button kaam nahi kar raha", "PDF load nahi ho raha". Retrieval still fires on the English equivalents, so this is **LOW** in practice. Leave as-is; revisit only if retrieval misses.

### [LOW] [COMPLETE] No "Verify" step in older skills
**Where:** `capacitor-best-practices`, `capacitor-keyboard`, etc.  
**Why:** The new skills include a Verify section; the old ones don't. Not critical — they're already actionable.  
**Fix:** Backlog. Update when a skill is next touched.

## Wins

- The three highest-impact skills for this project (`capacitor-back-button`, `capacitor-splash-screen`, `senior-architect-audit`) are already 5/5 and tied to real implementation files.
- Plugin lazy-loading + `lazyWithRetry` + JS-controlled splash align with `capacitor-best-practices` and `capacitor-performance` recommendations — the project follows its own skills.
- New skills reference real artefacts (`scripts/logs-*.sh`, `--nb-keyboard-h`, `applyNativeChrome`) so retrieval grounds in this codebase, not generic Capacitor docs.

## Next Steps (prioritized)

1. Run `skills--apply_draft` on the 3 new drafts to activate them.
2. (Optional) Add a Verify section to the 5 weakest generic skills next time they're edited.
3. Re-run `senior-architect-audit` after the offline mutation queue lands (see `CAPACITOR_AUDIT.md`) — that's the only HIGH still open at the app level.

Used the `senior-architect-audit` skill.
