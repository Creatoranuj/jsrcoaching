---
name: capacitor-video-player-master
description: Master architecture for Capacitor/web video players — gesture grammar, the tap-to-toggle auto-hide controls state machine (YouTube/Netflix/edtech style), and synchronization between player chrome and the Android system navigation bar (immersive mode). Apply whenever building, auditing, or fixing tap-to-toggle controls, auto-hide timing, fullscreen UX, swipe gestures, or nav-bar peek behavior in a Mahima/MX/YouTube-style player.
---

# Capacitor Video Player — Master Skill

A production video player has THREE independent visibility surfaces that must stay in sync:

1. **Player chrome** (top bar, seek bar, play button) — owned by `useAutoHideControls`.
2. **Android system nav bar + status bar** — owned by `AndroidImmersive` bridge.
3. **Gesture overlay** (taps / double-taps / swipes / long-press) — owned by the touch handlers on the ghost overlay.

The drawback this skill exists to prevent: **chrome and the system nav bar drift out of sync**. Classic symptom — user is in fullscreen, taps to bring controls back, sees the top "back" arrow but the Android system back gesture is still hidden because immersive mode was never released.

## The Golden Rule

> In fullscreen, system nav bar visibility MUST equal player chrome visibility.

When `showControls === true` → call `exitImmersive()` (system bars peek).
When `showControls === false` → call `enterImmersive()` (sticky immersive).
Outside fullscreen, the global `installImmersiveAutoToggle()` MutationObserver owns state — do not fight it.

Wire it once, near the controls hook:

```ts
useEffect(() => {
  if (!isFakeFullscreen) return;
  if (showControls) exitImmersive();
  else enterImmersive();
}, [isFakeFullscreen, showControls]);
```

## Tap-to-Toggle Auto-Hide — What Top Players Actually Do

This is the single most-noticed piece of "feel". YouTube, Netflix, Prime, Hotstar, and every serious edtech player (Vimeo OTT, Udemy, Coursera, Physics Wallah, Unacademy) implement the SAME state machine. One tap on the video surface toggles ALL controls (chrome + system nav bar) on or off together; while playing, controls auto-hide after a short idle window; while paused they stay put.

**The mental model is a single boolean `showControls` driven by an idle timer plus a set of "locks" that pin it open.** Everything else is tuning.

### Behaviour contract (copy this exactly — it's what users expect)

| Situation | Controls |
|---|---|
| Tap while controls hidden | show + arm idle timer |
| Tap while controls shown | hide immediately (user-explicit) |
| Idle timer elapses while playing | fade out |
| Video paused | stay shown, do NOT auto-hide |
| Scrubbing / dragging seek bar | stay shown (locked) |
| Settings / quality / speed menu open | stay shown (locked) |
| Buffering / not ready / error | stay shown (locked) |
| Last ~10s / end screen | stay shown (locked) |
| Play resumes after pause | show once, then re-arm idle timer |
| Mouse move (desktop/hover) | show + arm timer; hide on mouse leave |
| Keyboard focus enters a control | show + hold (a11y) until blur |
| App backgrounded | freeze timer; on resume show + re-arm |

### The parameter set of a top-class player

Expose these as named constants, not magic numbers scattered in handlers. This is the "kitne parameter hai" answer — a mature player tunes ~14 knobs:

| # | Parameter | Typical value | What it controls |
|---|---|---|---|
| 1 | `IDLE_HIDE_MS` | 3000 (YT/Netflix ~3–5s) | idle timeout before auto-hide while playing |
| 2 | `IDLE_HIDE_MS_AFTER_SEEK` | 1500 | shorter re-hide after a scrub so chrome doesn't linger |
| 3 | `FADE_DURATION_MS` | 200–300 | opacity/translate transition length |
| 4 | `FADE_EASING` | `ease-out` (in), `ease-in` (out) | asymmetric feel — reveal fast, hide gently |
| 5 | `DOUBLE_TAP_WINDOW_MS` | 250–300 | tap vs double-tap disambiguation |
| 6 | `LONG_PRESS_MS` | 500 | hold-to-2×-speed threshold |
| 7 | `SKIP_SECONDS` | 10 (YT), 10/30 (Netflix) | double-tap-edge seek amount |
| 8 | `LAST_SECONDS_LOCK` | 10 | keep chrome up near the end / end-screen |
| 9 | `SWIPE_START_THRESHOLD_PX` | 8 | movement before a tap becomes a swipe |
| 10 | `HORIZ_SCRUB_RATIO` | 1.5 | horiz vs vert dominance to enter scrub mode |
| 11 | `SCRUB_SENSITIVITY` | ±60s/screen | px→seconds mapping for horizontal drag |
| 12 | `TAP_TARGET_SLOP_PX` | 10 | max movement still counted as a tap |
| 13 | `HOVER_HIDE_MS` (desktop) | 3000 | mouse-idle hide; mouse-leave hides sooner |
| 14 | `RIPPLE_MS` | 400–600 | skip-ripple / feedback animation lifetime |

Two invisible-but-critical behavioural parameters that are NOT numbers:

- **`userHiddenRef` (explicit-hide sticky bit)** — when the user taps to hide, that intent must SURVIVE transient lock flips. A 200ms buffering blip on rotation must not yank chrome back. This is the #1 thing cheap players get wrong.
- **`isLocked` union** — the set of conditions that pin controls open regardless of the idle timer. Enumerate every one; a missing member causes chrome to vanish mid-interaction.

## Controls State Machine (`useAutoHideControls`)

| Input | Action |
|---|---|
| `kick()` | clear `userHiddenRef`, show, arm 3s timer if playing+unlocked |
| `forceHide()` | set `userHiddenRef`, hide immediately |
| `toggle()` | if visible → forceHide; else kick |
| isLocked flips ON | show (unless `userHiddenRef`) and clear timer |
| isPlaying false → true | arm timer (don't force-show if user hid) |
| isPlaying true → false | reveal once, clear timer |

`isLocked` is the union of: `menuOpen || seekDrag || lastTenSeconds || endScreen || !playerReady || isBuffering`.

**Critical invariant:** an explicit user hide (`forceHide` via tap) must SURVIVE transient lock flips (a 200ms buffering blip on rotation must not yank chrome back).

### Timer discipline (where auto-hide players leak)

- Store the timeout in a ref; **clear it before arming a new one** — every `kick()`/interaction resets the clock.
- Clear on unmount, on pause, on lock-on, and on `forceHide`.
- Never arm from inside a render — arm only from event handlers / effects with correct deps.
- Pause/re-arm on `visibilitychange` (app background) so a hidden tab doesn't hide chrome the instant the user returns.

## Gesture Grammar (single overlay, touchStart → touchEnd)

| Gesture | Trigger | Result |
|---|---|---|
| Single tap | `touchEnd` with no swipe lock, no double, no long-press | `toggleControls()` |
| Double tap center | 2 taps <300ms in middle 30% axis | `togglePlay()` (no skip ripple) |
| Double tap edge | 2 taps <300ms on same side | `skip ±10s` + ripple |
| Long press (500ms) | timer fires before any move | 2× speed until release |
| Vertical swipe (left half) | locked when `vertMag > horizMag && vertMag > 8` | brightness |
| Vertical swipe (right half) | same lock, right side | volume |
| Horizontal swipe (landscape only) | `horizMag > vertMag*1.5 && horizMag > 20` | scrub ±60s |

**Why defer tap-toggle to `touchEnd`:** toggling on `touchStart` flashes chrome at the start of every swipe/double-tap/long-press. Use `suppressTapToggleRef` set true by swipe lock, double-tap branch, or long-press timer.

**Rotation-aware axes:** when using CSS `transform: rotate(90/180/270)` for pseudo-fullscreen, remap `(deltaX, deltaY) → (gHoriz, gVert)` BEFORE classifying the gesture. Otherwise a vertical volume swipe in landscape gets misread as a seek.

```
rotation=90 : gVert = -deltaX, gHoriz =  deltaY
rotation=270: gVert =  deltaX, gHoriz = -deltaY
rotation=180: gVert = -deltaY, gHoriz = -deltaX
rotation=0  : gVert =  deltaY, gHoriz =  deltaX
```

## WebView Hardening (Android)

On the overlay element:

```tsx
style={{
  touchAction: 'manipulation',      // kills 300ms double-tap-zoom delay
  WebkitTapHighlightColor: 'transparent',
}}
onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
onDragStart={(e) => e.preventDefault()}
```

If a touch lands on a child `<button>` or `[data-player-control="true"]`, set `touchStartedOnControlRef = true` and **return early** — never let gesture logic compete with control taps.

## Back-Button Integration

In fullscreen + rotated, the first hardware-back press should reset rotation to 0° / exit fullscreen — not pop the route. Push a sentinel `history.pushState({ rotationGuard: true }, '')` and intercept `popstate`. This is separate from the global `useAndroidBackButton` singleton — do NOT register a second `App.addListener('backButton', …)`.

## Accessibility (what Netflix/YouTube add that cheap players skip)

- Keyboard focus entering any control must SHOW and HOLD chrome until blur — never auto-hide a focused control.
- Screen-reader / `prefers-reduced-motion` → shorten or drop the fade; don't animate opacity if reduced motion is set.
- Controls need real `aria-label`s and remain in the tab order only while visible (`inert`/`tabindex=-1` when hidden) so a hidden seek bar isn't focusable.
- Tap target ≥ 44×44px per control even when chrome is dense.

## Audit Checklist (apply when reviewing any player)

- [ ] Single `useAutoHideControls` instance; no parallel `setShowControls` writes
- [ ] `isLocked` enumerates every transient lock (buffering, menus, seek, end screen, not-ready, last-10s)
- [ ] `userHiddenRef` survives lock flips
- [ ] Idle timer stored in a ref; cleared before re-arm; cleared on pause/unmount/lock/forceHide
- [ ] Auto-hide delay is a named constant (`IDLE_HIDE_MS`), not a magic number
- [ ] Paused state never auto-hides
- [ ] Tap-toggle is on `touchEnd`, not `touchStart`
- [ ] `suppressTapToggleRef` set by: child-control hit, swipe lock, double-tap branch, long-press
- [ ] Rotation-aware axis remap before mode classification
- [ ] `touchAction: 'manipulation'` on overlay
- [ ] In fullscreen, `exitImmersive` on show / `enterImmersive` on hide
- [ ] Timer pauses on app background (`visibilitychange`)
- [ ] Focused control holds chrome open (a11y); reduced-motion shortens fade
- [ ] Hardware back resets rotation before navigating
- [ ] No second `App.backButton` listener registered by the player

## File Map (this project)

- `src/components/video/MahimaGhostPlayer.tsx` — main player, owns gestures + chrome sync
- `src/components/video/hooks/useAutoHideControls.ts` — state machine
- `src/lib/androidImmersive.ts` — JS bridge to MainActivity ImmersiveBridge
- `src/lib/screenOrientation.ts` — native landscape lock
- `src/hooks/useAndroidBackButton.ts` — global singleton, DO NOT duplicate

## Done When

- Audit checklist passes on `MahimaGhostPlayer`
- Tap-to-show in fullscreen reveals BOTH chrome AND system nav bar
- Tap-to-hide restores sticky immersive
- Auto-hide fires only while playing + unlocked, with a named idle constant
- Closing reply mentions "Used the capacitor-video-player-master skill."
