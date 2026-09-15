import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * On route/hash change, smoothly scrolls to the element matching `location.hash`.
 * Respects `prefers-reduced-motion`. Pairs with `scroll-padding-top` in CSS
 * to clear the fixed top nav.
 */
const useHashScroll = () => {
  const { hash, pathname } = useLocation();

  useEffect(() => {
    if (!hash) return;
    const id = decodeURIComponent(hash.slice(1));
    if (!id) return;

    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    // Defer to next frame so the new route/section has mounted.
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({
          behavior: prefersReduced ? "auto" : "smooth",
          block: "start",
        });
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [hash, pathname]);
};

export default useHashScroll;
