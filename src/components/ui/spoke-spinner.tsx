/**
 * Shared 12-spoke iOS-style spinner used by every PDF/reader loading state.
 * Keeping a single implementation means the LazyPdfViewer fallback and the
 * ReaderProgress overlay show the SAME visual, eliminating the "blue spinner
 * flash → iOS spinner" hand-off users were seeing on Android/Firefox.
 */
import { memo } from "react";

interface Props {
  /** Outer square size in pixels. Default 32 (matches mobile screenshot). */
  size?: number;
  className?: string;
  ariaLabel?: string;
}

const BARS = Array.from({ length: 12 });

export const SpokeSpinner = memo(({ size = 32, className = "", ariaLabel = "Loading" }: Props) => {
  return (
    <div
      role="status"
      aria-label={ariaLabel}
      className={`relative inline-block ${className}`}
      style={{
        width: size,
        height: size,
        animation: "nb-spoke-rotate 1s steps(12) infinite",
      }}
    >
      {BARS.map((_, i) => (
        <span
          key={i}
          className="absolute left-1/2 top-1/2 block rounded-full bg-foreground/70"
          style={{
            width: "8%",
            height: "26%",
            transform: `translate(-50%, -50%) rotate(${i * 30}deg) translateY(-115%)`,
            opacity: (i + 1) / 12,
          }}
        />
      ))}
      <style>{`@keyframes nb-spoke-rotate { to { transform: rotate(360deg); } }`}</style>
      <span className="sr-only">Loading…</span>
    </div>
  );
});

SpokeSpinner.displayName = "SpokeSpinner";
export default SpokeSpinner;