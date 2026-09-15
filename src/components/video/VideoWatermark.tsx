import { useEffect, useRef, useState } from "react";

interface Props {
  /** Watermark text content (already masked). e.g. "SCC • 98xxxxxx42 • a3f9" */
  label: string;
}

/**
 * Drifting SVG watermark for the secure lecture player.
 *
 * • SVG `<text>` (harder to remove via DOM filter than a styled <div>).
 * • Cycles through 9 positions on a 3×3 grid every 8–12s (randomised).
 * • requestAnimationFrame loop (no setInterval) for smooth scheduling.
 * • Honours `prefers-reduced-motion` — stays centred.
 * • pointer-events: none so it never blocks playback controls.
 *
 * This is a deterrent / traceability tool. It does NOT prevent screen
 * recording — that is handled by FLAG_SECURE (Android) and the iOS capture
 * overlay.
 */
export default function VideoWatermark({ label }: Props) {
  const [pos, setPos] = useState(4); // start centre
  const lastChangeRef = useRef<number>(performance.now());
  const nextDelayRef = useRef<number>(10000);
  const rafRef = useRef<number | null>(null);

  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (reduceMotion) return;
    const tick = (now: number) => {
      if (now - lastChangeRef.current >= nextDelayRef.current) {
        let next = Math.floor(Math.random() * 9);
        // never repeat same cell back-to-back
        if (next === pos) next = (next + 1) % 9;
        setPos(next);
        lastChangeRef.current = now;
        nextDelayRef.current = 8000 + Math.random() * 4000; // 8–12s
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [pos, reduceMotion]);

  const safeLabel = label?.trim() || "Protected lecture";

  // 3×3 grid positions in % (x,y) for SVG text anchor centre
  const row = Math.floor(pos / 3);
  const col = pos % 3;
  const x = [18, 50, 82][col];
  const y = [22, 50, 78][row];

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 20,
      }}
    >
      <text
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="middle"
        style={{
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
          fontSize: "2.4px",
          fontWeight: 600,
          fill: "rgba(255,255,255,0.18)",
          paintOrder: "stroke",
          stroke: "rgba(0,0,0,0.35)",
          strokeWidth: 0.15,
          letterSpacing: "0.05px",
          transition: reduceMotion ? "none" : "x 1.6s ease, y 1.6s ease",
        } as React.CSSProperties}
      >
        {safeLabel}
      </text>
    </svg>
  );
}
