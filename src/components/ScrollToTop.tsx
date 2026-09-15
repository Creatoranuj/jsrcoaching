import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * Scroll-to-top on route change.
 * - Skips scroll on POP (browser back/forward) so the user's prior position is preserved.
 * - Uses rAF to run after the new route paints, avoiding fight with browser anchor restoration.
 * - Respects prefers-reduced-motion.
 */
const ScrollToTop = () => {
  const { pathname, hash } = useLocation();
  const navType = useNavigationType();

  useEffect(() => {
    if (navType === "POP") return;
    if (hash) return; // let in-page anchors work
    const id = requestAnimationFrame(() => {
      const prefersReduced =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, left: 0, behavior: prefersReduced ? "auto" : "smooth" });
    });
    return () => cancelAnimationFrame(id);
  }, [pathname, hash, navType]);

  return null;
};

export default ScrollToTop;
