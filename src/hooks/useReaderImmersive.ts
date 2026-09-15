import { useEffect, useRef } from "react";
import { hideStatusBar, showStatusBar } from "../lib/nativeChrome";
import { enterImmersive, exitImmersive } from "../lib/androidImmersive";

/**
 * Hide the native status bar (and Android nav bar when `deep` is active)
 * while a full-screen reader/viewer is open.
 *
 * Restores chrome automatically on unmount so navigating away or closing
 * the reader never leaves the app chrome-less.
 *
 * Safe no-op on web / iOS — the native helpers guard for Capacitor/Android.
 */
export function useReaderImmersive(active: boolean, deep = false) {
  const activeRef = useRef(active);
  const deepRef = useRef(deep);

  useEffect(() => {
    activeRef.current = active;
    deepRef.current = deep;

    if (active) {
      void hideStatusBar();
      if (deep) enterImmersive();
      return;
    }

    // `active` flipped from true → false: restore chrome immediately.
    if (!active) {
      void showStatusBar();
      exitImmersive();
    }
  }, [active, deep]);

  // Always restore on unmount — never orphan a hidden status bar.
  useEffect(() => {
    return () => {
      if (activeRef.current) {
        void showStatusBar();
      }
      if (deepRef.current) {
        exitImmersive();
      }
    };
  }, []);
}
