import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

interface Props {
  /** ISO date or human-readable date string (e.g. "2026-08-01" or "1 Aug 2026") */
  startDate: string;
}

const parse = (s: string): Date | null => {
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  return null;
};

/**
 * Live countdown pill for batch cards. Auto-picks:
 *  - "Ongoing — join anytime" if past
 *  - "Starting soon" red pill if <7 days
 *  - "Xd Xh Xm" otherwise
 */
const CountdownPill = ({ startDate }: Props) => {
  const target = parse(startDate);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!target) return;
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [target]);

  if (!target) return null;

  const diff = target.getTime() - now;

  if (diff <= 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[11px] font-semibold px-2 py-0.5">
        <Clock className="h-3 w-3" /> Ongoing — join anytime
      </span>
    );
  }

  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);

  const soon = days < 7;

  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-full text-[11px] font-semibold px-2 py-0.5 tabular-nums",
        soon
          ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 animate-pulse"
          : "bg-primary/10 text-primary",
      ].join(" ")}
    >
      <Clock className="h-3 w-3" />
      {soon ? "Starts in " : "Starts in "}
      {days > 0 ? `${days}d ` : ""}
      {hours}h {mins}m
    </span>
  );
};

export default CountdownPill;
