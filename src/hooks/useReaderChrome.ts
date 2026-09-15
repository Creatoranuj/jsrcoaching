import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Reader-mode auto-hide chrome controller.
 * - Chrome is visible by default.
 * - After `hideAfterMs` of inactivity it fades out.
 * - Any pointer/scroll activity (or `show()` call) brings it back.
 *
 * The returned `visible` flag should drive opacity + pointer-events on the
 * floating header / FAB / download button so they fade gracefully without
 * causing layout shift inside the document.
 */
export function useReaderChrome(hideAfterMs = 2500) {
  const [visible, setVisible] = useState(true);
  const timer = useRef<number | null>(null);
  const pinnedRef = useRef(false);

  const clear = () => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const arm = useCallback(() => {
    clear();
    if (pinnedRef.current) return;
    timer.current = window.setTimeout(() => setVisible(false), hideAfterMs);
  }, [hideAfterMs]);

  const show = useCallback(() => {
    setVisible(true);
    arm();
  }, [arm]);

  const toggle = useCallback(() => {
    setVisible((v) => {
      const next = !v;
      if (next) arm();
      else clear();
      return next;
    });
  }, [arm]);

  /** Keep chrome forced visible regardless of idle timer (e.g. while autoscroll active). */
  const setPinned = useCallback((pinned: boolean) => {
    pinnedRef.current = pinned;
    if (pinned) {
      setVisible(true);
      clear();
    } else {
      arm();
    }
  }, [arm]);

  useEffect(() => {
    arm();
    return clear;
  }, [arm]);

  return { visible, show, toggle, setPinned };
}
