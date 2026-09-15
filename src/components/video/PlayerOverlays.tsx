import { memo } from "react";
import { Sun, Volume2 } from "lucide-react";
import { SkipIcon } from "./SkipIcon";

/**
 * Pure presentational overlays extracted from MahimaGhostPlayer.
 *
 * These components receive ALL state as props and render JSX only — they
 * own no refs, no effects, no timers. Safe to memo: parent re-renders
 * (e.g. on every `currentTime` tick at 4 Hz) no longer re-walk this JSX
 * subtree unless the specific overlay's visibility or value changes.
 *
 * Behavioral parity: classes / inline styles / animation names are copied
 * 1:1 from the original inline JSX in MahimaGhostPlayer.tsx.
 */

// ─── Double-tap skip ripple (YouTube-style ±10s) ──────────────────────
export type DoubleTapRippleState = { side: "left" | "right"; key: number } | null;

interface DoubleTapRippleProps {
  ripple: DoubleTapRippleState;
}

export const DoubleTapRipple = memo(function DoubleTapRipple({ ripple }: DoubleTapRippleProps) {
  if (!ripple) return null;
  return (
    <div
      key={ripple.key}
      className="absolute inset-y-0 pointer-events-none z-50 flex items-center"
      style={{
        left: ripple.side === "left" ? 0 : "50%",
        right: ripple.side === "right" ? 0 : "50%",
        overflow: "hidden",
        borderRadius: ripple.side === "left" ? "0 999px 999px 0" : "999px 0 0 999px",
      }}
    >
      <div
        className="absolute"
        style={{
          width: "160px",
          height: "160px",
          borderRadius: "50%",
          background: "rgba(255,255,255,0.15)",
          top: "50%",
          marginTop: "-80px",
          ...(ripple.side === "left" ? { left: "-70px" } : { right: "-70px" }),
          animation: "dt-ripple 0.75s ease-out forwards",
        }}
      />
      <div
        className="absolute flex flex-col items-center gap-1.5"
        style={{
          top: "50%",
          transform: "translateY(-50%)",
          ...(ripple.side === "left" ? { left: "20px" } : { right: "20px" }),
          animation: "dt-label 0.75s ease-out forwards",
        }}
      >
        <SkipIcon
          direction={ripple.side === "left" ? "back" : "forward"}
          style={{ width: "40px", height: "40px", filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.8))" }}
        />
        <span
          style={{
            color: "white",
            fontSize: "12px",
            fontWeight: 700,
            textShadow: "0 1px 6px rgba(0,0,0,0.9)",
            whiteSpace: "nowrap",
          }}
        >
          {ripple.side === "left" ? "– 10 seconds" : "+ 10 seconds"}
        </span>
      </div>
    </div>
  );
});

// ─── Swipe gesture pill (brightness / volume) ─────────────────────────
export type SwipeIndicatorState = {
  type: "brightness" | "volume";
  value: number;
  visible: boolean;
} | null;

interface SwipeIndicatorPillProps {
  indicator: SwipeIndicatorState;
}

export const SwipeIndicatorPill = memo(function SwipeIndicatorPill({ indicator }: SwipeIndicatorPillProps) {
  if (!indicator?.visible) return null;
  // Brightness range is 20..150 (mapped → 0..100%); volume is already 0..100.
  const pct =
    indicator.type === "brightness"
      ? ((indicator.value - 20) / 130) * 100
      : indicator.value;
  const clamped = Math.min(100, Math.max(0, pct));

  return (
    <div
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none"
      style={{
        background: "rgba(0,0,0,0.72)",
        backdropFilter: "blur(8px)",
        borderRadius: "16px",
        padding: "12px 20px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "6px",
        minWidth: "100px",
      }}
    >
      {indicator.type === "brightness" ? (
        <Sun className="h-6 w-6 text-yellow-400" />
      ) : (
        <Volume2 className="h-6 w-6 text-blue-400" />
      )}
      <div
        style={{
          width: "96px",
          height: "6px",
          background: "rgba(255,255,255,0.25)",
          borderRadius: "99px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            background: "white",
            borderRadius: "99px",
            width: `${clamped}%`,
            transition: "width 0.05s linear",
          }}
        />
      </div>
      <span style={{ color: "white", fontSize: "12px", fontWeight: 600 }}>
        {Math.round(indicator.value)}%
      </span>
    </div>
  );
});

// ─── Long-press 2× speed badge ────────────────────────────────────────
interface LongPressSpeedBadgeProps {
  active: boolean;
}

export const LongPressSpeedBadge = memo(function LongPressSpeedBadge({ active }: LongPressSpeedBadgeProps) {
  if (!active) return null;
  return (
    <div
      className="absolute top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none flex items-center gap-2 px-4 py-2 rounded-full"
      style={{
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(8px)",
        border: "1px solid rgba(255,255,255,0.2)",
      }}
    >
      <span style={{ fontSize: "18px" }}>⚡</span>
      <span style={{ color: "white", fontSize: "14px", fontWeight: 700, letterSpacing: "0.03em" }}>
        2× Speed
      </span>
    </div>
  );
});
