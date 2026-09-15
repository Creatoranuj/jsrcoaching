import { useEffect, useRef } from "react";
import { beginSyntheticPop } from "../lib/reader/overlayHistory";

/**
 * Pushes a `{ overlay: <unique-key> }` history sentinel while `open` is true
 * and calls `onClose` when the user presses the Android hardware back button
 * (popstate). The back-button hook in `useAndroidBackButton` detects any
 * truthy `state.overlay` and calls `window.history.back()` instead of
 * navigating, which fires our popstate listener.
 *
 * Hardened version (was previously the source of a HIGH/RELY bug):
 *  - Each mount owns a unique sentinel key, so unmount cleanup only pops
 *    OUR entry — never a stranger's (other overlays, real routes).
 *  - `pushedRef` tracks whether we actually pushed, so a rapid open→close
 *    flip can't accidentally call `history.back()` on a real route.
 *
 * Prefer `useOverlayBackClose` for new code (it takes an explicit key).
 * This wrapper is kept for back-compat with existing call sites.
 */
let sentinelCounter = 0;

export function useOverlayHistorySentinel(
  open: boolean,
  onClose: () => void,
) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const pushedRef = useRef(false);
  const keyRef = useRef<string>("");

  useEffect(() => {
    if (!open) return;

    sentinelCounter += 1;
    const ourKey = `sentinel-${sentinelCounter}`;
    keyRef.current = ourKey;

    const currentState = window.history.state;
    // Only push if we don't already own this exact sentinel (StrictMode safety).
    if (!currentState || currentState.overlay !== ourKey) {
      window.history.pushState({ overlay: ourKey }, "");
      pushedRef.current = true;
    }

    const onPop = (e: PopStateEvent) => {
      // Our sentinel popped — close.
      if (!e.state || e.state.overlay !== ourKey) {
        pushedRef.current = false;
        onCloseRef.current();
      }
    };
    window.addEventListener("popstate", onPop);

    return () => {
      window.removeEventListener("popstate", onPop);
      // Programmatic close while our sentinel is still on top → pop it
      // so the stack stays clean. Guarded so we never pop someone else's.
      if (
        pushedRef.current &&
        window.history.state?.overlay === ourKey
      ) {
        pushedRef.current = false;
        beginSyntheticPop();
        window.history.back();
      }
    };
  }, [open]);
}
