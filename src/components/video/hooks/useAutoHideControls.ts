import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Single source of truth for video player controls auto-hide logic.
 *
 * Rules:
 *  1. Becomes visible when playback stops, but still respects manual tap hide while paused.
 *  2. While "locked" (menu open, seek drag, last 10s, buffering, etc.) controls are
 *     normally kept visible — BUT an explicit user-triggered hide (tap toggle /
 *     forceHide) must be honoured, otherwise transient locks (e.g. a 200ms
 *     buffering blip on landscape rotation) keep snapping the chrome back on
 *     and breaking the tap-show / tap-hide cycle.
 *  3. While playing + unlocked, hide after `delay` ms of no interaction.
 *  4. Any call to `kick()` shows controls immediately and resets the timer.
 *  5. `forceHide()` hides instantly (used by single-tap toggle).
 *  6. The auto-hide timer is paused while the app/tab is backgrounded
 *     (`visibilitychange`) so a hidden tab doesn't yank chrome away the
 *     instant the user returns — matches YouTube/Netflix behaviour.
 */

/** Idle window (ms) before chrome auto-hides while playing — the top-player default. */
export const IDLE_HIDE_MS = 3000;
/** Shorter re-hide after a scrub so chrome doesn't linger post-seek (YT/Netflix parity). */
export const IDLE_HIDE_MS_AFTER_SEEK = 1500;

export interface UseAutoHideControlsOpts {
  isPlaying: boolean;
  /** Anything that should freeze controls visible: open menus, seek drag, end screen, etc. */
  isLocked?: boolean;
  delay?: number;
}

export function useAutoHideControls({
  isPlaying,
  isLocked = false,
  delay = IDLE_HIDE_MS,
}: UseAutoHideControlsOpts) {
  const [visible, setVisible] = useState(true);
  const visibleRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const wasPlayingRef = useRef(isPlaying);
  // Tracks an explicit user hide so transient lock flips (buffering, rotation,
  // playerReady toggling) don't yank the chrome back on without a tap.
  const userHiddenRef = useRef(false);

  const clear = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
  };

  const kick = useCallback((customDelay?: number) => {
    userHiddenRef.current = false;
    visibleRef.current = true;
    setVisible(true);
    clear();
    if (isPlaying && !isLocked) {
      timerRef.current = setTimeout(() => {
        visibleRef.current = false;
        setVisible(false);
      }, customDelay ?? delay);
    }
  }, [isPlaying, isLocked, delay]);

  const forceHide = useCallback(() => {
    userHiddenRef.current = true;
    clear();
    visibleRef.current = false;
    setVisible(false);
  }, []);

  const toggle = useCallback(() => {
    if (visibleRef.current) forceHide();
    else {
      // User-initiated SHOW via tap → sticky: no auto-hide timer.
      // This makes tap behave as a clean ON/OFF toggle (every tap flips
      // visibility, no 3s drift). Auto-hide still applies to non-tap
      // shows (initial play, pause→play reveal) via the effect below.
      userHiddenRef.current = false;
      visibleRef.current = true;
      setVisible(true);
      clear();
    }
  }, [forceHide]);

  // Re-evaluate whenever play state or lock changes.
  useEffect(() => {
    const wasPlaying = wasPlayingRef.current;
    wasPlayingRef.current = isPlaying;

    if (isLocked) {
      // Respect a user-issued hide even when something is "locked" — otherwise
      // brief landscape buffering re-shows the chrome the user just dismissed.
      if (!userHiddenRef.current) {
        visibleRef.current = true;
        setVisible(true);
      }
      clear();
      return;
    }
    if (!isPlaying) {
      if (wasPlaying) {
        // Just paused — reveal once. User may then tap to hide again.
        userHiddenRef.current = false;
        visibleRef.current = true;
        setVisible(true);
      }
      clear();
      return;
    }
    // Playing + not locked. If the user explicitly hid chrome (tap-toggle),
    // KEEP it hidden — don't snap back on transient lock release (buffering,
    // rotation, playerReady flip). Only auto-arm the timer when chrome is
    // already visible or this is a fresh play transition.
    if (userHiddenRef.current) {
      clear();
      return;
    }
    // Fresh playing state (or lock just released while visible): arm timer
    // WITHOUT forcing setVisible(true) — that's what re-shows after user hide.
    clear();
    timerRef.current = setTimeout(() => {
      visibleRef.current = false;
      setVisible(false);
    }, delay);
    return clear;
  }, [isPlaying, isLocked, delay]);

  // Pause the idle timer while the app/tab is backgrounded, then re-arm on
  // return. Without this, a timer that fires while hidden would hide the chrome
  // the moment the user comes back (classic cheap-player bug). Only re-arm when
  // playing, unlocked, currently visible, and not user-hidden.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        clear();
        return;
      }
      if (isPlaying && !isLocked && visibleRef.current && !userHiddenRef.current) {
        clear();
        timerRef.current = setTimeout(() => {
          visibleRef.current = false;
          setVisible(false);
        }, delay);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [isPlaying, isLocked, delay]);

  // A11y: keyboard focus on any player control HOLDS chrome open until blur.
  // Matches YouTube/Netflix — a focused seek bar or button must not vanish
  // mid-interaction. Only reacts to real focus (keyboard/AT); mouse click on
  // a control is a transient focus that blurs immediately.
  useEffect(() => {
    const isControl = (t: EventTarget | null) =>
      t instanceof Element && !!t.closest('[data-player-control="true"]');
    const onFocusIn = (e: FocusEvent) => {
      if (!isControl(e.target)) return;
      clear();
      visibleRef.current = true;
      setVisible(true);
    };
    const onFocusOut = (e: FocusEvent) => {
      if (!isControl(e.target)) return;
      // Re-arm on blur if still playing + unlocked + not user-hidden.
      if (isPlaying && !isLocked && !userHiddenRef.current) {
        clear();
        timerRef.current = setTimeout(() => {
          visibleRef.current = false;
          setVisible(false);
        }, delay);
      }
    };
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, [isPlaying, isLocked, delay]);

  return { visible, setVisible, kick, forceHide, toggle };
}
