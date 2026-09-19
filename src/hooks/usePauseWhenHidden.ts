import { useEffect, useRef } from "react";
import { loadCapacitorApp } from "@/lib/native/app";

/**
 * Pause media when the app/tab goes to the background.
 *
 * Covers both worlds with one listener set:
 * - Web / PWA: `visibilitychange` (tab switch, minimise, screen lock).
 * - Native (Capacitor): `appStateChange` — on Android the WebView may keep
 *   `document.visibilityState` "visible" briefly while the activity is
 *   backgrounded, so the native bridge event is the reliable signal there.
 *
 * The callback fires **once per background transition**: both events can
 * arrive for a single backgrounding (WebView + bridge), and without a guard
 * the consumer would run its pause path twice. The latch resets when the
 * app becomes visible/active again.
 *
 * The latest callback is always used (ref pattern) — safe to pass an
 * inline closure; the listeners are attached once.
 *
 * Like the other native-touching hooks, this uses the shared memoized
 * bridge (`loadCapacitorApp`) instead of a static `@capacitor/app` import,
 * so SSR/web builds stay native-free.
 */
export function usePauseWhenHidden(onPause: () => void): void {
  const cbRef = useRef(onPause);
  cbRef.current = onPause;

  useEffect(() => {
    // Latch: true while we are in the "backgrounded, pause already fired"
    // half of the transition. Reset on return-to-foreground.
    let firedForThisTransition = false;

    const fireOnce = () => {
      if (firedForThisTransition) return;
      firedForThisTransition = true;
      cbRef.current();
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") fireOnce();
      else firedForThisTransition = false;
    };

    document.addEventListener("visibilitychange", onVisibility);

    // Capacitor bridge — may reject on pure web, hence the guard.
    let appHandle: { remove: () => void } | undefined;
    let cancelled = false;
    loadCapacitorApp()
      .then(({ plugin }) =>
        plugin.addListener("appStateChange", ({ isActive }) => {
          if (!isActive) fireOnce();
          else firedForThisTransition = false;
        }),
      )
      .then((handle) => {
        if (cancelled) void handle.remove();
        else appHandle = handle;
      })
      .catch(() => {
        /* web-only environment — visibilitychange above is enough */
      });

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void appHandle?.remove();
    };
  }, []);
}

export default usePauseWhenHidden;
