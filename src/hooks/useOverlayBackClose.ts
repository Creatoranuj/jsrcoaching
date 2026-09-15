import { useEffect, useRef } from "react";
import { beginSyntheticPop } from "../lib/reader/overlayHistory";

/**
 * Pushes a history sentinel when `open` becomes true and calls `onClose`
 * when the Android hardware back / browser back pops that sentinel.
 *
 * Pairs with `useAndroidBackButton`'s priority-1 check on `state.overlay`.
 *
 * Usage:
 *   useOverlayBackClose(open, () => setOpen(false), "filters-sheet");
 */
export function useOverlayBackClose(
  open: boolean,
  onClose: () => void,
  key: string,
) {
  const pushedRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    // Push a sentinel only if we don't already own one for this key.
    const state = window.history.state;
    if (!state || state.overlay !== key) {
      window.history.pushState({ overlay: key }, "");
      pushedRef.current = true;
    }

    const onPop = (e: PopStateEvent) => {
      // Our sentinel just popped — close.
      if (!e.state || e.state.overlay !== key) {
        pushedRef.current = false;
        onCloseRef.current();
      }
    };
    window.addEventListener("popstate", onPop);

    return () => {
      window.removeEventListener("popstate", onPop);
      // Programmatic close while sentinel is still on the stack: pop it
      // so history stays clean (next back press behaves normally).
      if (pushedRef.current && window.history.state?.overlay === key) {
        pushedRef.current = false;
        // Mark this as a self-inflicted pop so lower overlays (fullscreen PDF
        // viewer, player fullscreen) don't read it as a hardware back press.
        beginSyntheticPop();
        window.history.back();
      }
    };
  }, [open, key]);
}

export default useOverlayBackClose;
