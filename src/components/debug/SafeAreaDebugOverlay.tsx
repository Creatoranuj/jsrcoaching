import { useEffect, useState } from "react";
import { safeGet, safeSet } from "../../lib/storage";

/**
 * SafeAreaDebugOverlay
 *
 * Visualizes the four safe-area insets (top/bottom/left/right) and — when a
 * `<video>` or `[data-video-container]` exists — overlays its bounding box.
 * Use to confirm the status bar / notch never crosses the video on APK during
 * immersive transitions.
 *
 * Enable by setting `localStorage.nb_debug_safe_area = '1'` and reloading,
 * or by appending `?debugSafeArea=1` to the URL (persists for the session).
 * Disable: `localStorage.removeItem('nb_debug_safe_area')`.
 */
export const SafeAreaDebugOverlay = () => {
  const [enabled, setEnabled] = useState(false);
  const [insets, setInsets] = useState({ top: 0, bottom: 0, left: 0, right: 0 });
  const [videoBox, setVideoBox] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get("debugSafeArea") === "1") {
        safeSet("nb_debug_safe_area", "1");
      }
      setEnabled(safeGet("nb_debug_safe_area") === "1");
    } catch {}
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const measure = () => {
      const probe = document.createElement("div");
      probe.style.cssText =
        "position:fixed;top:0;left:0;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);visibility:hidden;pointer-events:none;";
      document.body.appendChild(probe);
      const cs = getComputedStyle(probe);
      setInsets({
        top: parseFloat(cs.paddingTop) || 0,
        bottom: parseFloat(cs.paddingBottom) || 0,
        left: parseFloat(cs.paddingLeft) || 0,
        right: parseFloat(cs.paddingRight) || 0,
      });
      document.body.removeChild(probe);

      const el =
        document.querySelector<HTMLElement>("[data-video-container]") ||
        document.querySelector<HTMLElement>("video") ||
        document.querySelector<HTMLElement>("iframe");
      setVideoBox(el ? el.getBoundingClientRect() : null);
    };
    measure();
    const id = window.setInterval(measure, 500);
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, [enabled]);

  // Debug-only snapshot util: exposes window.__nbSnapshotSafeArea() which
  // logs the current insets + video bounds + overlap to console (and returns
  // them so an E2E/logcat consumer can assert on the result). Verifies that
  // the video container never overlaps the status/notch area across route
  // changes. No-op unless overlay is enabled (gates dev/debug builds).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const snap = () => {
      const el =
        document.querySelector<HTMLElement>("[data-video-container]") ||
        document.querySelector<HTMLElement>("video") ||
        document.querySelector<HTMLElement>("iframe");
      const box = el?.getBoundingClientRect() ?? null;
      const overlapTop = box ? Math.max(0, insets.top - box.top) : 0;
      const result = {
        ts: Date.now(),
        route: window.location.pathname + window.location.search,
        insets,
        video: box
          ? { x: box.x, y: box.y, w: box.width, h: box.height }
          : null,
        overlapTop,
        safe: overlapTop === 0,
      };
      console.warn("[safe-area-snapshot]", JSON.stringify(result));
      return result;
    };
    window.__nbSnapshotSafeArea = snap;
    if (enabled) snap();
    return () => {
      try { delete window.__nbSnapshotSafeArea; } catch {}
    };
  }, [enabled, insets]);

  if (!enabled) return null;

  const band: React.CSSProperties = {
    position: "fixed",
    background: "rgba(255,0,0,0.28)",
    outline: "1px dashed rgba(255,255,255,0.7)",
    zIndex: 2147483646,
    pointerEvents: "none",
    fontSize: 10,
    color: "#fff",
    fontFamily: "monospace",
    textShadow: "0 0 2px #000",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  return (
    <>
      <div style={{ ...band, top: 0, left: 0, right: 0, height: Math.max(insets.top, 1) }}>
        top {insets.top.toFixed(0)}px
      </div>
      <div style={{ ...band, bottom: 0, left: 0, right: 0, height: Math.max(insets.bottom, 1) }}>
        bottom {insets.bottom.toFixed(0)}px
      </div>
      <div style={{ ...band, top: 0, bottom: 0, left: 0, width: Math.max(insets.left, 1) }}>
        {insets.left.toFixed(0)}
      </div>
      <div style={{ ...band, top: 0, bottom: 0, right: 0, width: Math.max(insets.right, 1) }}>
        {insets.right.toFixed(0)}
      </div>
      {videoBox && (
        <div
          style={{
            position: "fixed",
            top: videoBox.top,
            left: videoBox.left,
            width: videoBox.width,
            height: videoBox.height,
            outline: "2px solid #00e5ff",
            background: "rgba(0,229,255,0.08)",
            zIndex: 2147483645,
            pointerEvents: "none",
            color: "#00e5ff",
            fontFamily: "monospace",
            fontSize: 10,
            padding: 2,
          }}
        >
          video {Math.round(videoBox.width)}×{Math.round(videoBox.height)} @ y=
          {Math.round(videoBox.top)} (overlap={Math.max(0, insets.top - videoBox.top).toFixed(0)}px)
        </div>
      )}
    </>
  );
};

export default SafeAreaDebugOverlay;
