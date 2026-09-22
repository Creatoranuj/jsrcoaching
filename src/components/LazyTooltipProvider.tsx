/**
 * Compatibility shim — the "lazy" tooltip provider is gone.
 *
 * The old implementation swapped `<>{children}</>` for
 * `<Provider>{children}</Provider>` once the tooltip module resolved, which
 * re-mounted the entire app tree a few hundred ms after first paint (see
 * AppTooltipProvider.tsx and src/test/appShellMountsOnce.test.tsx). The
 * module name is kept so App.tsx's import line stays untouched; new code
 * should import `AppTooltipProvider` directly.
 */
export { AppTooltipProvider as LazyTooltipProvider, AppTooltipProvider as default } from "./AppTooltipProvider";
