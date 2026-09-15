import { memo } from "react";
import { Users, BookOpen, Radio, Star } from "lucide-react";
import { usePlatformStats } from "@/hooks/usePlatformStats";

const fmt = (n: number) => {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "")}k+`;
  if (n >= 100) return `${Math.floor(n / 100) * 100}+`;
  return `${Math.max(n, 1)}+`;
};

/**
 * Live trust strip — pulls real counts from platform-stats edge fn
 * with hardcoded fallback so it never renders zeros.
 */
const TrustStrip = memo(() => {
  const { stats } = usePlatformStats();

  const items = [
    { icon: Users, value: fmt(stats.total_students), label: "Learners" },
    { icon: BookOpen, value: fmt(stats.total_courses), label: "Courses" },
    { icon: Radio, value: "Daily", label: "Live classes" },
    { icon: Star, value: "4.8", label: "Rating" },
  ];

  return (
    <section aria-label="Trusted by learners" className="border-y border-border/60 bg-muted/30">
      <div className="container mx-auto max-w-7xl px-4 md:px-10 py-4">
        <ul className="grid grid-cols-4 gap-2 md:gap-6">
          {items.map(({ icon: Icon, value, label }) => (
            <li
              key={label}
              className="flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 text-center"
            >
              <Icon className="h-4 w-4 md:h-5 md:w-5 text-primary shrink-0" aria-hidden />
              <div className="flex flex-col md:flex-row md:items-baseline md:gap-1.5">
                <span className="text-sm md:text-base font-bold tabular-nums text-foreground leading-none">
                  {value}
                </span>
                <span className="text-[10px] md:text-xs uppercase tracking-wider text-muted-foreground">
                  {label}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
});

TrustStrip.displayName = "TrustStrip";
export default TrustStrip;
