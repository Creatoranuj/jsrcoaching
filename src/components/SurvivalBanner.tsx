import { useEffect, useState } from "react";
import { Leaf } from "lucide-react";

import { degradedRemainingMs, isDegraded, subscribeServiceHealth } from "@/lib/serviceHealth";

/**
 * Shaant Hinglish banner — koi laal error nahi.
 *
 * Kab dikhta hai: jab device khud "halka mode" me chala jata hai (60 second me
 * 3 baar server se baat na ban paye). 2 minute baad apne aap gayab.
 *
 * Kyun aisa: student ko darana nahi hai. Message bas itna kehta hai ki padhai
 * chalti rahegi, kuch extra cheezein thodi der ke liye band hain.
 */
const SurvivalBanner = () => {
  const [degraded, setDegraded] = useState<boolean>(() => isDegraded());
  const [, setTick] = useState(0);

  useEffect(() => subscribeServiceHealth(setDegraded), []);

  useEffect(() => {
    if (!degraded) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 10_000);
    return () => window.clearInterval(id);
  }, [degraded]);

  if (!degraded) return null;

  const mins = Math.max(1, Math.ceil(degradedRemainingMs() / 60_000));

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-0 right-0 z-[59] flex items-center justify-center gap-2 border-b border-amber-200/60 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900 shadow-sm dark:border-amber-900/40 dark:bg-amber-950/70 dark:text-amber-100"
      style={{ top: "max(env(safe-area-inset-top, 0px), var(--nb-status-floor, 0px))" }}
    >
      <Leaf className="h-3.5 w-3.5 shrink-0" />
      <span className="text-center">
        App abhi halke mode me hai — lecture, PDF aur video chalte rahenge. Baaki cheezein
        {" "}
        {mins} minute me apne aap wapas.
      </span>
    </div>
  );
};

export default SurvivalBanner;
