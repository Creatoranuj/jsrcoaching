import { useEffect, useState } from "react";

/**
 * Human-readable "how long ago" label for a timestamp that re-renders on a
 * coarse tick (every 10 s) so it never becomes a render hot-spot.
 *
 * Returns "" when `timestamp` is 0 / undefined (nothing loaded yet).
 */
export function formatRelativeAge(timestamp: number, now: number = Date.now()): string {
  if (!timestamp || timestamp <= 0) return "";
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function useRelativeAge(timestamp: number | undefined, tickMs = 10_000): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!timestamp) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), tickMs);
    return () => window.clearInterval(id);
  }, [timestamp, tickMs]);
  return formatRelativeAge(timestamp ?? 0, now);
}
