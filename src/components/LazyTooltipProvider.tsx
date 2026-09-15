import { useEffect, useState, type ComponentType, type ReactNode } from "react";

type ProviderProps = { children: ReactNode; delayDuration?: number };

/**
 * Lazy-mounts @radix-ui/react-tooltip's Provider after first paint.
 * Tooltip.Root has its own internal provider fallback, so rendering
 * children without the explicit Provider for a few frames is safe —
 * the only cost is that tooltips triggered in the first ~100ms use
 * default delay timings. This keeps @floating-ui out of the initial
 * entry bundle.
 */
export function LazyTooltipProvider({ children, delayDuration }: ProviderProps) {
  const [Provider, setProvider] = useState<ComponentType<ProviderProps> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      import("@radix-ui/react-tooltip").then((mod) => {
        if (!cancelled) setProvider(() => mod.Provider as ComponentType<ProviderProps>);
      });
    };
    const w = window as unknown as { requestIdleCallback?: (cb: () => void) => number };
    if (typeof w.requestIdleCallback === "function") {
      w.requestIdleCallback(load);
    } else {
      setTimeout(load, 200);
    }
    return () => {
      cancelled = true;
    };
  }, []);

  if (!Provider) return <>{children}</>;
  return <Provider delayDuration={delayDuration}>{children}</Provider>;
}

export default LazyTooltipProvider;