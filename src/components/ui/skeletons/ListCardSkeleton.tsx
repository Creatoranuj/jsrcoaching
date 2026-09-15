import { memo } from "react";
import { Skeleton } from "../skeleton";

/**
 * Parametric list-of-cards skeleton used to replace spinner-on-blank-page
 * loading states. Reserves the same vertical space as the final content so
 * the paint-swap doesn't cause CLS. Respects reduced-motion via the shared
 * `.skeleton-shimmer` utility.
 *
 * See `docs/loading-strategy.md` and `mem://` for the "no spinner on blank
 * page" rule — always prefer a layout-matched skeleton.
 */
export interface ListCardSkeletonProps {
  /** How many placeholder rows to render. */
  rows?: number;
  /** Per-row height in px. Match the real card height to avoid layout shift. */
  rowHeight?: number;
  /** Gap between rows (Tailwind spacing key). */
  gap?: 2 | 3 | 4;
  /** Show a circular avatar block on the left. */
  showAvatar?: boolean;
  /** Number of text lines inside each row (default 2). */
  lines?: 1 | 2 | 3;
  /** Root className override. */
  className?: string;
  /** aria-label for the busy region. */
  label?: string;
  /** Border radius token — matches the target surface. */
  radius?: "md" | "lg" | "xl" | "2xl";
}

const radiusMap = {
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
  "2xl": "rounded-2xl",
} as const;

const gapMap = { 2: "space-y-2", 3: "space-y-3", 4: "space-y-4" } as const;

const ListCardSkeleton = memo(
  ({
    rows = 5,
    rowHeight = 86,
    gap = 3,
    showAvatar = false,
    lines = 2,
    className,
    label = "Loading",
    radius = "2xl",
  }: ListCardSkeletonProps) => {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        aria-label={label}
        className={`${gapMap[gap]} ${className ?? ""}`}
      >
        <span className="sr-only">{label}</span>
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className={`flex items-center gap-3 border border-border/40 bg-card p-3 ${radiusMap[radius]}`}
            style={{ minHeight: rowHeight }}
          >
            {showAvatar && (
              <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            )}
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3 rounded" />
              {lines >= 2 && <Skeleton className="h-3 w-5/6 rounded" />}
              {lines >= 3 && <Skeleton className="h-3 w-1/2 rounded" />}
            </div>
          </div>
        ))}
      </div>
    );
  },
);
ListCardSkeleton.displayName = "ListCardSkeleton";

export default ListCardSkeleton;
