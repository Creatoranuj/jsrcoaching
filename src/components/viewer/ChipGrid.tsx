import type { ReactNode } from "react";

/**
 * Shared wrap-safe chip primitives for the reader surfaces.
 *
 * Every chip row in the autoscroll sheet used to repeat the same
 * `min-h-[40px] min-w-0 truncate` incantation, which is exactly how the
 * "Pause at" row drifted and started overlapping on 360px phones. Both the
 * grid and the chip live here now so the rules can't fall out of sync again.
 *
 * - `min-w-0` on the button lets the grid track shrink below the label width.
 * - the inner `<span className="truncate">` clips long labels instead of
 *   pushing siblings out of their cell.
 * - `min-h-[40px]` keeps every chip inside a comfortable tap target.
 */

type Cols = 3 | 4;

const COLS: Record<Cols, string> = {
  3: "grid-cols-3",
  4: "grid-cols-4",
};

export function ChipGrid({
  cols = 3,
  variant = "plain",
  className = "",
  children,
}: {
  cols?: Cols;
  /** `segment` renders the iOS-style grouped background used by "Pause at". */
  variant?: "plain" | "segment";
  className?: string;
  children: ReactNode;
}): JSX.Element {
  const base = variant === "segment" ? "gap-1 rounded-xl bg-muted p-1" : "gap-2";
  return <div className={`grid ${COLS[cols]} ${base} ${className}`.trim()}>{children}</div>;
}

export function Chip({
  selected,
  onClick,
  variant = "outline",
  ariaPressed,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  variant?: "outline" | "segment";
  /** Set when the chip is a toggle rather than a single-select option. */
  ariaPressed?: boolean;
  children: ReactNode;
}): JSX.Element {
  const shape =
    variant === "segment"
      ? "rounded-lg px-2 text-[11px] leading-tight"
      : "rounded-lg border px-2 text-xs tabular-nums";

  const tone = selected
    ? variant === "segment"
      ? "bg-primary text-primary-foreground shadow-sm"
      : "border-primary bg-primary text-primary-foreground"
    : variant === "segment"
      ? "text-muted-foreground active:bg-background/70"
      // `@media(hover:hover)` keeps the hover tint off touch devices, where a
      // bare `hover:` sticks after the finger lifts inside the Capacitor WebView.
      : "border-border bg-background [@media(hover:hover)]:hover:bg-accent active:bg-accent";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ariaPressed}
      className={`flex min-h-[40px] min-w-0 items-center justify-center text-center font-medium transition-colors duration-200 ${shape} ${tone}`}
    >
      <span className="block w-full truncate">{children}</span>
    </button>
  );
}
