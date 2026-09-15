/**
 * Hidden dev-only perf overlay.
 *
 * Enable with `localStorage.setItem("nb_perf", "1")` — it is never enabled
 * automatically, not even on dev builds. Shows FPS, JS heap (Chrome only),
 * Web Vitals, and the last bridge calls. Zero cost unless explicitly enabled.
 */
import { useEffect, useState } from "react";
import { getVitalsSnapshot } from "@/lib/perf/webVitals";
import { getRecentBridgeCalls, getBridgeCallTotal } from "@/lib/perf/bridgeMeter";

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: "fixed",
    // Clear the mobile bottom nav (64px) + safe-area inset so the panel can
    // never cover navigation, even when deliberately turned on.
    bottom: "calc(env(safe-area-inset-bottom, 0px) + 76px)",
    right: 8,
    zIndex: 2147483647,

    width: 220,
    padding: "8px 10px",
    background: "rgba(15,23,42,0.88)",
    color: "#e2e8f0",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 11,
    lineHeight: 1.35,
    borderRadius: 8,
    boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
    pointerEvents: "auto",
    backdropFilter: "blur(6px)",
  },
  row: { display: "flex", justifyContent: "space-between", gap: 8 },
  hr: { borderTop: "1px solid rgba(255,255,255,0.12)", margin: "4px 0" },
  list: { maxHeight: 110, overflow: "auto", fontSize: 10, opacity: 0.85 },
  close: {
    float: "right",
    background: "transparent",
    border: 0,
    color: "#94a3b8",
    cursor: "pointer",
    fontSize: 12,
    padding: 0,
    marginLeft: 6,
  },
};

function useFps() {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    let frames = 0;
    let last = performance.now();
    let raf = 0;
    const loop = () => {
      frames += 1;
      const now = performance.now();
      if (now - last >= 1000) {
        setFps(Math.round((frames * 1000) / (now - last)));
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return fps;
}

const PerfOverlay = () => {
  const [open, setOpen] = useState(true);
  const [, force] = useState(0);
  const fps = useFps();

  useEffect(() => {
    const t = window.setInterval(() => force((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, []);

  if (!open) return null;
  const vitals = getVitalsSnapshot();
  const calls = getRecentBridgeCalls();
  const heap = (performance as unknown as {
    memory?: { usedJSHeapSize: number };
  }).memory;

  return (
    <div style={styles.root}>
      <div style={styles.row}>
        <strong>perf</strong>
        <button style={styles.close} onClick={() => setOpen(false)} aria-label="Close overlay">×</button>
      </div>
      <div style={styles.row}><span>FPS</span><span>{fps}</span></div>
      <div style={styles.row}>
        <span>LCP</span>
        <span>{vitals.lcp ? Math.round(vitals.lcp) + "ms" : "—"}</span>
      </div>
      <div style={styles.row}>
        <span>CLS</span>
        <span>{vitals.cls != null ? vitals.cls.toFixed(3) : "—"}</span>
      </div>
      <div style={styles.row}>
        <span>INP</span>
        <span>{vitals.inp ? Math.round(vitals.inp) + "ms" : "—"}</span>
      </div>
      <div style={styles.row}><span>long tasks</span><span>{vitals.longTasks}</span></div>
      {heap && (
        <div style={styles.row}>
          <span>heap</span>
          <span>{(heap.usedJSHeapSize / 1048576).toFixed(1)}MB</span>
        </div>
      )}
      <div style={styles.hr} />
      <div style={styles.row}>
        <span>bridge ({getBridgeCallTotal()})</span>
        <span>{calls.length}</span>
      </div>
      <div style={styles.list}>
        {calls.slice(-10).reverse().map((c, i) => (
          <div key={i}>
            {c.plugin}.{c.method}{c.ms != null ? ` ${Math.round(c.ms)}ms` : ""}
          </div>
        ))}
        {calls.length === 0 && <div style={{ opacity: 0.5 }}>no calls yet</div>}
      </div>
    </div>
  );
};

export default PerfOverlay;
