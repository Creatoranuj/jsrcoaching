import { useEffect } from "react";

/**
 * Lovable-style edge swipe to open the sidebar.
 *
 * Because sidebar open/close state lives inside each page (via `setSidebarOpen`),
 * we programmatically click the header's hamburger button — which every
 * authenticated screen already mounts — instead of introducing a global
 * SidebarProvider that would touch 20+ files.
 *
 * Trigger: horizontal drag that STARTS within 22px of the left edge and
 * moves right ≥ 48px within 400ms while staying mostly horizontal.
 * Auto-disables when a sidebar/dialog/drawer/reader is already open so we
 * never fire during the wrong context.
 */
// Lovable-style: generous edge zone so swipes starting mid-screen also work,
// snappy trigger threshold, forgiving duration.
const EDGE_ZONE_PX = 120; // start-point tolerance from the left edge
const MIN_DELTA_X = 28;   // horizontal distance to commit
const MAX_DELTA_Y = 60;   // vertical tolerance before we treat as scroll
const MAX_DURATION_MS = 600;

export function useEdgeSwipeToOpenSidebar(): void {
  useEffect(() => {
    if (typeof window === "undefined") return;

    let startX = 0;
    let startY = 0;
    let startT = 0;
    let tracking = false;
    let fired = false;

    const isBlocked = () => {
      if (typeof document === "undefined") return false;
      const b = document.body;
      if (b.hasAttribute("data-reader-open")) return true;
      // Any open sidebar/dialog/drawer/sheet suppresses the gesture.
      return !!document.querySelector(
        '[role="dialog"][data-state="open"], [data-state="open"][role="menu"], aside[aria-hidden="false"], [data-sidebar-open="true"]',
      );
    };

    const onStart = (e: TouchEvent) => {
      if (isBlocked()) return;
      const t = e.touches[0];
      if (!t) return;
      if (t.clientX > EDGE_ZONE_PX) return;
      startX = t.clientX;
      startY = t.clientY;
      startT = Date.now();
      tracking = true;
      fired = false;
      document.body.setAttribute("data-edge-swipe", "tracking");
      // Broadcast progress = 0 so the indicator can fade in.
      window.dispatchEvent(
        new CustomEvent("edge-swipe-progress", { detail: { progress: 0 } }),
      );
    };

    // Progressive reveal: as finger moves right past threshold mid-gesture,
    // fire the open immediately so the sidebar tracks the finger visually.
    const onMove = (e: TouchEvent) => {
      if (!tracking || fired) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = Math.abs(t.clientY - startY);
      if (dy > MAX_DELTA_Y) {
        tracking = false;
        document.body.removeAttribute("data-edge-swipe");
        window.dispatchEvent(
          new CustomEvent("edge-swipe-progress", { detail: { progress: 0 } }),
        );
        return;
      }
      // Progress 0..1 based on distance to threshold, for the indicator fade.
      const progress = Math.max(0, Math.min(1, dx / (MIN_DELTA_X * 2)));
      window.dispatchEvent(
        new CustomEvent("edge-swipe-progress", { detail: { progress } }),
      );
      if (dx > MIN_DELTA_X) {
        fired = true;
        // Haptic #1 — fade begins (sidebar opens now).
        try {
          void import("@/lib/native/haptics").then((m) => m.selectionHaptic());
        } catch {
          /* no-op */
        }
        const btn = document.querySelector<HTMLButtonElement>(
          'button[aria-label="Open menu"]',
        );
        btn?.click();
        // Haptic #2 — fade complete (matches Sidebar transition ~280ms).
        window.setTimeout(() => {
          try {
            void import("@/lib/native/haptics").then((m) =>
              m.selectionHaptic(),
            );
          } catch {
            /* no-op */
          }
        }, 280);
      }
    };

    const onEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      document.body.removeAttribute("data-edge-swipe");
      window.dispatchEvent(
        new CustomEvent("edge-swipe-progress", { detail: { progress: 0 } }),
      );
      if (fired) return;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = Math.abs(t.clientY - startY);
      const dt = Date.now() - startT;
      if (dx < MIN_DELTA_X) return;
      if (dy > MAX_DELTA_Y) return;
      if (dt > MAX_DURATION_MS) return;
      try {
        void import("@/lib/native/haptics").then((m) => m.selectionHaptic());
      } catch {
        /* no-op */
      }
      const btn = document.querySelector<HTMLButtonElement>(
        'button[aria-label="Open menu"]',
      );
      btn?.click();
      window.setTimeout(() => {
        try {
          void import("@/lib/native/haptics").then((m) => m.selectionHaptic());
        } catch {
          /* no-op */
        }
      }, 280);
    };

    const onCancel = () => {
      tracking = false;
      document.body.removeAttribute("data-edge-swipe");
      window.dispatchEvent(
        new CustomEvent("edge-swipe-progress", { detail: { progress: 0 } }),
      );
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onCancel, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onCancel);
    };
  }, []);
}