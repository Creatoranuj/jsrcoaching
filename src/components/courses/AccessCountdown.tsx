import { useEffect, useMemo, useState } from "react";
import { Clock, Infinity as InfinityIcon } from "lucide-react";
import { cn } from "../../lib/utils";

interface AccessCountdownProps {
  /** Course access end date (ISO string). `null` = lifetime access. */
  endDate: string | null | undefined;
  /** Compact = tiny inline pill for cards, default = badge with label. */
  size?: "sm" | "md";
  /** Show a "Lifetime access" pill when there is no end date. */
  showLifetime?: boolean;
  className?: string;
}

const parseDate = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** "12d 4h 09m" / "4h 09m" / "09m 12s" */
export const formatRemaining = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const mins = Math.floor((total % 3_600) / 60);
  const secs = total % 60;

  if (days > 0) return `${days}d ${hours}h ${String(mins).padStart(2, "0")}m`;
  if (hours > 0) return `${hours}h ${String(mins).padStart(2, "0")}m`;
  if (mins > 0) return `${mins}m ${String(secs).padStart(2, "0")}s`;
  return `${secs}s`;
};

/**
 * Live "Access expires in …" countdown for an enrolled course.
 *
 * - No `endDate`      → "Lifetime access" (or nothing when `showLifetime` is false)
 * - More than 7 days  → neutral primary pill
 * - Less than 7 days  → amber urgency pill
 * - Less than 24 h    → red pulsing pill
 * - Past              → "Access ended"
 */
const AccessCountdown = ({
  endDate,
  size = "sm",
  showLifetime = true,
  className,
}: AccessCountdownProps) => {
  const target = useMemo(() => parseDate(endDate), [endDate]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!target) return;
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, [target]);

  const base =
    size === "sm"
      ? "text-[10px] px-2 py-0.5 gap-1"
      : "text-xs px-2.5 py-1 gap-1.5";
  const iconSize = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";

  if (!target) {
    if (!showLifetime) return null;
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
          base,
          className
        )}
      >
        <InfinityIcon className={iconSize} aria-hidden="true" /> Lifetime access
      </span>
    );
  }

  const diff = target.getTime() - now;

  if (diff <= 0) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full font-semibold bg-muted text-muted-foreground",
          base,
          className
        )}
      >
        <Clock className={iconSize} aria-hidden="true" /> Access ended
      </span>
    );
  }

  const critical = diff < 86_400_000; // < 24h
  const urgent = diff < 7 * 86_400_000; // < 7 days

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-semibold tabular-nums",
        base,
        critical
          ? "bg-destructive/10 text-destructive animate-pulse"
          : urgent
            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
            : "bg-primary/10 text-primary",
        className
      )}
      aria-live="off"
    >
      <Clock className={iconSize} aria-hidden="true" />
      Access expires in {formatRemaining(diff)}
    </span>
  );
};

export default AccessCountdown;
