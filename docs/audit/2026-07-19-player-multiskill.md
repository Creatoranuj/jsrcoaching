# Audit — Video Player + Multi-Skill Sweep

**Date:** 2026-07-19
**Scope:** `MahimaGhostPlayer.tsx`, `useAutoHideControls`, `androidImmersive`, `useAndroidBackButton`, `crashShield`, `PlayerErrorBoundary`
**Skills applied (12):** capacitor-video-player-master, capacitor-back-button, app-crash-shield, mobile-view-expert, senior-architect-audit, red-team-security-audit, supabase-architect-auditor, perf-exam-ready, asset-optimization, console-error-triage, sentry-triage, soft-touch.

**Combined Rating: 4.7 / 5** — production-grade. Master-skill checklist ke 15 me se 14 pass. Sirf ek meaningful upgrade bacha hai: god-component split.

---

## Master-Skill Checklist (15 points)

| # | Check | Status |
| - | ----- | ------ |
| 1 | Single `useAutoHideControls` instance | ✅ |
| 2 | `isLocked` union enumerates every transient lock (menu, seek, endScreen, lastTen, notReady, buffering) | ✅ |
| 3 | `userHiddenRef` survives lock flips | ✅ |
| 4 | Idle timer stored in ref; cleared before re-arm | ✅ |
| 5 | Named constants (`IDLE_HIDE_MS`, `IDLE_HIDE_MS_AFTER_SEEK`) | ✅ |
| 6 | Paused state never auto-hides | ✅ |
| 7 | Tap-toggle on `touchEnd` (not `touchStart`) | ✅ |
| 8 | `suppressTapToggleRef` set by child-control / swipe / double-tap / long-press | ✅ |
| 9 | Rotation-aware axis remap before gesture classification | ✅ |
| 10 | `touchAction: 'manipulation'` on overlay | ✅ |
| 11 | Fullscreen: `exitImmersive` on show / `enterImmersive` on hide (Golden Rule) | ✅ |
| 12 | `visibilitychange` pauses idle timer | ✅ |
| 13 | Focused control holds chrome (a11y) | ✅ |
| 14 | Hardware back resets rotation before navigating (`rotationGuard`) | ✅ |
| 15 | `prefers-reduced-motion` shortens/drops fade | ⚠️ not handled |

---

## Findings

### [MEDIUM] [MAINT] `MahimaGhostPlayer.tsx` is a 1679-LOC god-component
**Where:** `src/components/video/MahimaGhostPlayer.tsx`
**Why it matters:** Gesture logic + immersive sync + fullscreen rotation + fake-fullscreen CSS + end-screen + speed menu + volume slider + watermark + back-button integration sab ek hi file me hai. Iska review, testing, aur regression detection mushkil hai. Ek chhoti si effect-order galti pura player tod sakti hai.
**Fix (deferred, out of "no-change" scope):**
- `PlayerGestures.tsx` — touchStart/Move/End handlers + suppress refs
- `PlayerImmersiveSync.tsx` — fullscreen ↔ system-nav-bar effect
- `PlayerRotationController.tsx` — rotationGuard + native orientation lock
- Core `MahimaGhostPlayer` sirf composition + state ownership rakhe (~400 LOC).

### [LOW] [MOT] `prefers-reduced-motion` respect missing
**Where:** control fade transitions in `MahimaGhostPlayer.tsx`
**Why it matters:** Accessibility guideline — reduced-motion users ke liye fade duration 0 ya near-0 hona chahiye. Abhi 200ms fade sab par apply hota hai.
**Fix:** ek `useReducedMotion()` hook (framer-motion se ya window.matchMedia) → fade duration 200ms ↔ 0ms swap.

### [MEDIUM] [OBS] Sentry breadcrumbs par `surface: 'player'` tag missing
**Where:** `playerLog` calls
**Why it matters:** Sentry triage me player-specific issues filter karna mushkil ho jata hai. Kal jab kisi lesson par crash aayega to fingerprinting me courseId + lessonId + player-surface tag chahiye.
**Fix:** `Sentry.addBreadcrumb({ category: 'player', level: 'info', message, data })` playerLog ke andar wrap karna.

### [LOW] [PERF] `delay` prop static hai par effect deps me hai
**Where:** `useAutoHideControls.ts` effects
**Why it matters:** Micro — hardcoded 3000ms bhi caller yaha se pass kar raha hai; effect har state change par re-run hoga. Cost negligible.
**Fix:** N/A — accept as-is.

---

## Red-Team (attacker POV)

| # | Vector | Result |
| - | ------ | ------ |
| 6 | Storage abuse (course-video download) | Bunny signed URL rotates; short expiry — SAFE |
| 7 | CDN signed-URL leak | URL network tab me visible hai (unavoidable for HLS); share window <expiry — ACCEPTED RISK |
| 8 | XSS in comments / captions | React auto-escape + DOMPurify (tested) — SAFE |
| 24 | WebView escape / debug on release | `webContentsDebuggingEnabled=false` in release build — SAFE |
| — | FLAG_SECURE on lesson pages | Active via `useScreenProtection` — SAFE |
| — | Watermark tamper | Rendered on top of video, positional randomization ✅ |

---

## Crash Shield + Sentry

- Console shows `[crashShield] installed (heartbeat + traps + memory)` on boot ✅
- `PlayerErrorBoundary` wraps player subtree ✅
- No player-specific FATAL / OOM entries in latest Sentry snapshot
- Recent OOM triage (nb-download) already resolved — see `docs/observer/2026-07-16-sentry-triage-oom-nbdownload.md`

---

## Skill-by-skill scores

| Skill                          | Score | Note |
| ------------------------------ | ----- | ---- |
| capacitor-video-player-master  | 4.7/5 | 14/15 checklist; reduced-motion pending |
| capacitor-back-button          | 5/5   | Singleton, rotationGuard sentinel present |
| app-crash-shield               | 4.8/5 | heartbeat + traps + memory + boundary |
| mobile-view-expert             | 4.6/5 | safe-area handled, tap targets ≥44px |
| senior-architect-audit         | 4.5/5 | god-component the only real miss |
| red-team-security-audit        | 4.5/5 | signed-URL share window is unavoidable |
| supabase-architect-auditor     | N/A   | player has no DB surface |
| perf-exam-ready                | 4.6/5 | HEARTBEAT 5m, lesson indexes verified |
| asset-optimization             | 4.8/5 | SVG icons, no PNG bloat in player |
| console-error-triage           | 5/5   | clean logs, one info line |
| sentry-triage                  | 4.5/5 | needs `surface:'player'` breadcrumb tag |
| soft-touch                     | 4.7/5 | haptic on toggle + immersive-sync mark |

---

## Fix Plan (deferred — user ne "no more changes" bola)

1. Reduced-motion support (5 min, LOW).
2. Sentry breadcrumb `surface:'player'` (10 min, MEDIUM).
3. God-component split (2-3 hrs, MEDIUM MAINT — risky, needs regression).

**Verdict:** Ship as-is. Player top-tier hai; ye 3 items future polish sprint me.

_Used the capacitor-video-player-master + senior-architect-audit + red-team-security-audit skills._