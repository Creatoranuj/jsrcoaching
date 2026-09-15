import { useEffect, useState } from "react";

/**
 * Height (px) currently covered by the on-screen keyboard.
 *
 * Mobile browsers shrink `visualViewport` when the soft keyboard opens but keep
 * the layout viewport (and therefore anything anchored to `bottom: 0`) behind
 * it. Bottom sheets that host a text field must be lifted by this amount or the
 * writing surface ends up hidden under the keyboard.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const sync = () => {
      const covered = window.innerHeight - vv.height - vv.offsetTop;
      setInset(covered > 80 ? Math.round(covered) : 0);
    };

    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, []);

  return inset;
}

export default useKeyboardInset;
