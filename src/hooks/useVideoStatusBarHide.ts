import { useEffect, useRef } from "react";
import { hideStatusBar, showStatusBar } from "../lib/nativeChrome";
import { enterImmersive, exitImmersive } from "../lib/androidImmersive";

/**
 * YouTube-style status-bar auto-hide during video playback.
 *
 * Problem this fixes (audit F-STATUSBAR-01, landscape APK):
 *   In landscape APK, the Android status bar remained visible for the
 *   entire video because immersive mode only fired on fake-fullscreen
 *   transitions, never on plain playback. Users saw a persistent
 *   time/battery strip over the video.
 *
 * Behavior (matches YouTube / MX Player):
 *   - When `isPlaying` flips to true, wait `delayMs` (default 3000ms)
 *     of *uninterrupted* playback, then hide the status bar AND enter
 *     Android immersive mode (belt-and-suspenders — StatusBar.hide()
 *     alone doesn't cover the Android system nav bar).
 *   - When `isPlaying` flips to false (pause / end / seek-scrub), the
 *     pending timer is cancelled AND the bar is restored immediately.
 *   - Cleanup on unmount always restores the bar so navigating away
 *     mid-playback doesn't leave the app in a hidden-chrome state.
 *
 * Native-only (both helpers no-op on web).
 *
 * Optional `disabled` lets the caller skip the whole effect (e.g. on
 * live-lesson chat overlays where the operator wants the clock visible).
 */
export function useVideoStatusBarHide(opts: {
  isPlaying: boolean;
  delayMs?: number;
  disabled?: boolean;
}) {
  const { isPlaying, delayMs = 3000, disabled = false } = opts;
  const timerRef = useRef<number | null>(null);
  const restoreTimerRef = useRef<number | null>(null);
  const hiddenRef = useRef(false);

  useEffect(() => {
    if (disabled) return;

    const clearHideTimer = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    const clearRestoreTimer = () => {
      if (restoreTimerRef.current !== null) {
        window.clearTimeout(restoreTimerRef.current);
        restoreTimerRef.current = null;
      }
    };

    if (!isPlaying) {
      // Root fix (audit MED — scrub race): brief pause->play flips inside
      // ~400ms (Bunny seek scrubs, buffering blips) used to fully restore
      // the status bar and re-arm the 3s hide, causing a visible flash on
      // every scrub. Debounce the restore so only genuine pauses (>400ms)
      // bring the bar back.
      clearHideTimer();
      if (!hiddenRef.current) return;
      clearRestoreTimer();
      restoreTimerRef.current = window.setTimeout(() => {
        restoreTimerRef.current = null;
        hiddenRef.current = false;
        void showStatusBar();
        exitImmersive();
      }, 400);
      return;
    }

    // Playing → cancel any pending restore (this was a transient scrub)
    // and schedule the hide from scratch if not already hidden.
    clearRestoreTimer();
    if (hiddenRef.current) return;
    clearHideTimer();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      hiddenRef.current = true;
      void hideStatusBar();
      enterImmersive();
    }, delayMs);

    return () => {
      clearHideTimer();
      clearRestoreTimer();
    };
  }, [isPlaying, delayMs, disabled]);

  // Always restore on unmount — never orphan a hidden status bar.
  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      if (restoreTimerRef.current !== null) window.clearTimeout(restoreTimerRef.current);
      if (hiddenRef.current) {
        void showStatusBar();
        exitImmersive();
      }
    },
    [],
  );
}