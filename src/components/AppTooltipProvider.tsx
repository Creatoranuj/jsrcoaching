import type { ReactNode } from "react";
import { Provider as RadixTooltipProvider } from "@radix-ui/react-tooltip";

type ProviderProps = { children: ReactNode; delayDuration?: number };

/**
 * The single Radix tooltip provider that wraps the whole app shell.
 *
 * Why this is a plain static import and not the old `LazyTooltipProvider`:
 *
 * 1. The lazy version rendered `<>{children}</>` first and
 *    `<Provider>{children}</Provider>` once `import("@radix-ui/react-tooltip")`
 *    resolved. That swaps the element type at the root of the app tree, so
 *    React unmounted and re-mounted every descendant — BrowserRouter, every
 *    page, ExitHint, both toasters, QueryCacheBoot, NativeChromeInit, the
 *    offline banner... — a few hundred ms after first paint. Every boot
 *    effect ran twice and any UI state set in that window was lost (the
 *    "Press back again to exit" pill in `e2e/exit-hint.spec.ts` on the
 *    production build, for one).
 * 2. It saved no bytes. Every `@radix-ui/*` package is pinned into the
 *    `vendor-radix` chunk (vite.config.ts `codeSplitting.groups`) and the
 *    entry chunk imports that chunk statically for Toast/Dialog/Label, so
 *    the tooltip module is already evaluated before React mounts.
 *
 * `src/test/appShellMountsOnce.test.tsx` guards the mount-once contract.
 */
export function AppTooltipProvider({ children, delayDuration }: ProviderProps) {
  return <RadixTooltipProvider delayDuration={delayDuration}>{children}</RadixTooltipProvider>;
}

export default AppTooltipProvider;
