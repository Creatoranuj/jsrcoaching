import { RotateCcw, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface SkipIconProps {
  direction: "back" | "forward";
  className?: string;
  style?: React.CSSProperties;
  /** Number rendered inside the arc. Defaults to 10. */
  seconds?: number;
}

/**
 * Skip-N-seconds icon — circular rotate arrow with a seconds label
 * centered inside. Built on lucide's RotateCcw/RotateCw so the arc +
 * arrowhead geometry renders identically across Chromium, WebKit, and
 * Android WebView (Capacitor APK).
 */
export const SkipIcon = ({
  direction,
  className,
  style,
  seconds = 10,
}: SkipIconProps) => {
  const isBack = direction === "back";
  const Arrow = isBack ? RotateCcw : RotateCw;
  const label = isBack
    ? `Skip back ${seconds} seconds`
    : `Skip forward ${seconds} seconds`;

  return (
    <span
      role="img"
      aria-label={label}
      className={cn(
        "relative inline-flex items-center justify-center text-white select-none",
        className,
      )}
      style={style}
    >
      <Arrow
        aria-hidden="true"
        className="w-full h-full"
        strokeWidth={2}
      />
      <span
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center font-bold leading-none"
        style={{
          fontSize: "0.45em",
          // nudge below the arc opening so the digits sit visually centered
          paddingTop: "0.12em",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, sans-serif",
        }}
      >
        {seconds}
      </span>
    </span>
  );
};

export default SkipIcon;
