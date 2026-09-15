import { useEffect, useState } from "react";
import { cn } from "../../lib/utils";
import { Skeleton } from "./skeleton";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  text?: string;
  fullPage?: boolean;
  /**
   * Seconds before showing "Taking longer than expected — Retry".
   * Set to 0 to disable the stuck-spinner watchdog (e.g. inline button spinners).
   * Default 15s for page/section loaders.
   */
  stuckAfterSec?: number;
  /** Optional custom retry handler; defaults to window.location.reload(). */
  onRetry?: () => void;
}

const sizeMap = {
  sm: "h-6 w-6 border-[2px]",
  md: "h-9 w-9 border-[2.5px]",
  lg: "h-14 w-14 border-[3px]",
};

/**
 * Professional thin-ring spinner with a built-in stuck-spinner watchdog.
 *
 * If the spinner is still mounted after `stuckAfterSec` seconds, a small
 * "Taking longer than expected" message + Retry button fades in. This kills
 * the "silent infinite spinner" UX where users have no idea what to do.
 *
 * `animate-spin` respects `prefers-reduced-motion` via Tailwind's
 * `motion-reduce` variant automatically.
 */
export const LoadingSpinner = ({
  size = "md",
  className,
  text,
  fullPage = false,
  stuckAfterSec = 15,
  onRetry,
}: LoadingSpinnerProps) => {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    if (!stuckAfterSec || stuckAfterSec <= 0) return;
    const t = window.setTimeout(() => setStuck(true), stuckAfterSec * 1000);
    return () => window.clearTimeout(t);
  }, [stuckAfterSec]);

  const spinner = (
    <div
      className={cn("flex flex-col items-center justify-center gap-3", className)}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span
        className={cn(
          "inline-block rounded-full border-muted-foreground/20 border-t-primary animate-spin motion-reduce:animate-none",
          sizeMap[size]
        )}
      />
      {text ? (
        <p className="text-sm text-muted-foreground">{text}</p>
      ) : (
        <span className="sr-only">Loading…</span>
      )}
      {stuck && (
        <div className="mt-2 flex flex-col items-center gap-2 animate-in fade-in duration-300">
          <p className="text-xs text-muted-foreground">Taking longer than expected…</p>
          <button
            type="button"
            onClick={() => (onRetry ? onRetry() : window.location.reload())}
            className="text-xs font-medium text-primary underline underline-offset-2 hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );

  if (fullPage) {
    // Full-page loads render as a shimmering skeleton (matches route-level
    // Suspense fallbacks) instead of a lonely spinner on a blank screen.
    // The stuck-watchdog Retry surface is preserved via the overlay below.
    return (
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        aria-label={text || "Loading"}
        className="min-h-[100dvh] w-full flex flex-col gap-3 p-4 bg-background pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]"
      >
        <span className="sr-only">{text || "Loading"}</span>
        <Skeleton className="h-8 w-2/3 rounded-md" />
        <Skeleton className="h-4 w-full rounded" />
        <Skeleton className="h-4 w-5/6 rounded" />
        <Skeleton className="mt-2 h-[86px] w-full rounded-2xl" />
        <Skeleton className="h-[86px] w-full rounded-2xl" />
        <Skeleton className="h-[86px] w-full rounded-2xl" />
        <Skeleton className="h-[86px] w-full rounded-2xl" />
        {stuck && (
          <div className="mt-6 flex flex-col items-center gap-2 animate-in fade-in duration-300">
            <p className="text-xs text-muted-foreground">Taking longer than expected…</p>
            <button
              type="button"
              onClick={() => (onRetry ? onRetry() : window.location.reload())}
              className="text-xs font-medium text-primary underline underline-offset-2 hover:no-underline"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    );
  }

  return spinner;
};

export default LoadingSpinner;
