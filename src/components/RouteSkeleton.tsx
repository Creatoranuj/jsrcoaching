import { memo } from "react";

/**
 * Shared skeleton for lazy-loaded routes and below-the-fold sections.
 * - Reserves vertical space so lazy chunks don't cause layout shift (CLS).
 * - Respects safe-area insets on notched devices.
 * - No framer-motion / no network — safe to render on cold start.
 *
 * Use for `<Suspense fallback={...}>` on route-level or heavy section-level
 * lazy imports. For dev-only overlays keep a zero-size fallback instead.
 */
export interface RouteSkeletonProps {
  /** Force a minimum viewport height (default: mimics full route). */
  fullScreen?: boolean;
  /** Optional class overrides for edge cases (below-fold sections). */
  className?: string;
  /** aria-label announced to assistive tech. */
  label?: string;
}

const RouteSkeleton = memo(({ fullScreen = true, className, label = "Loading" }: RouteSkeletonProps) => {
  const base = fullScreen
    ? "min-h-[100dvh] pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]"
    : "min-h-[240px]";
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className={`${base} w-full flex flex-col gap-3 p-4 bg-background ${className ?? ""}`}
    >
      <span className="sr-only">{label}</span>
      <div className="h-8 w-2/3 rounded-md bg-muted/40 animate-pulse" />
      <div className="h-4 w-full rounded bg-muted/30 animate-pulse" />
      <div className="h-4 w-5/6 rounded bg-muted/30 animate-pulse" />
      <div className="mt-4 h-40 w-full rounded-lg bg-muted/30 animate-pulse" />
    </div>
  );
});

RouteSkeleton.displayName = "RouteSkeleton";

export default RouteSkeleton;
