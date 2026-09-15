import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useNavigationHistory } from "../contexts/NavigationHistoryContext";
import { resolveBackTarget, EXIT_ROUTES } from "../config/backNavigation";

/**
 * Edge-swipe-right → go back. Mirrors the Android back-button resolver so
 * gesture and hardware button stay in lockstep.
 *
 * Rules:
 *  - Touch must start within 24px of the left edge.
 *  - Horizontal travel ≥ 80px and ≥ 2× the vertical travel.
 *  - Skipped while the user is inside a PDF reader, video player, or any
 *    element opted-out via `data-no-swipe-back`.
 *  - Skipped on EXIT routes so the gesture never accidentally triggers exit.
 */
export const useSwipeBack = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const history = useNavigationHistory();

  useEffect(() => {
    if (typeof window === "undefined") return;

    let startX = 0;
    let startY = 0;
    let tracking = false;
    const EDGE = 24;
    const THRESH_X = 80;

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      // Edge-only — prevents conflict with horizontal scrollers and sliders.
      if (t.clientX > EDGE) return;
      // Opt-out for readers / players / carousels.
      const target = e.target as Element | null;
      if (target?.closest?.("[data-no-swipe-back],video,canvas,.no-swipe-back")) return;
      startX = t.clientX;
      startY = t.clientY;
      tracking = true;
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = Math.abs(t.clientY - startY);
      if (dx < THRESH_X || dx < dy * 2) return;

      const path = location.pathname;
      if ((EXIT_ROUTES as readonly string[]).includes(path)) return;

      const prev = history.peekPrevious();
      if (prev) {
        window.history.back();
        return;
      }
      const search = new URLSearchParams(window.location.search);
      const target = resolveBackTarget(path, search);
      if (target) navigate(target);
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [navigate, location.pathname, history]);
};

export default useSwipeBack;
