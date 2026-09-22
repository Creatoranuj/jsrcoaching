import { useEffect, useRef } from "react";
import {
  beginSyntheticPop,
  isSyntheticPop,
  poppedAboveOrAt,
  pushSentinel,
} from "../lib/reader/overlayHistory";

/**
 * Pushes a history sentinel when `open` becomes true and calls `onClose`
 * when the Android hardware back / browser back pops that sentinel.
 *
 * Pairs with `useAndroidBackButton`'s priority-1 check on `state.overlay`.
 *
 * Nested overlays are safe: a pop caused by an overlay *above* this one
 * (autoscroll sheet inside the PDF reader inside the Downloads viewer) is
 * ignored — both when it closes itself (`isSyntheticPop`) and when the user
 * presses back on it (`poppedAboveOrAt`, via the depth stamp `pushSentinel`
 * adds). Only a pop that lands *below* our entry closes this overlay.
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
  const depthRef = useRef(0);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    // Push a sentinel only if we don't already own one for this key.
    const state = window.history.state;
    if (!state || state.overlay !== key) {
      depthRef.current = pushSentinel({ overlay: key });
      pushedRef.current = true;
    }

    const onPop = (e: PopStateEvent) => {
      // Still on top — a nested entry above us was pushed then popped.
      if (e.state?.overlay === key) return;
      // A nested overlay closed itself programmatically (Done / backdrop tap /
      // unmount): its cleanup ran `history.back()`, not the user.
      if (isSyntheticPop()) return;
      // Genuine back press, but it landed on an entry still above ours (a
      // nested overlay's own sentinel) — that overlay handles it.
      if (poppedAboveOrAt(e.state, depthRef.current)) return;
      // Our sentinel is gone — close.
      pushedRef.current = false;
      onCloseRef.current();
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
