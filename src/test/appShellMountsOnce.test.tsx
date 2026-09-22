/**
 * Regression: the provider that wraps the whole app shell must never swap the
 * element type at its tree position after first paint.
 *
 * `LazyTooltipProvider` rendered `<>{children}</>` first and
 * `<Radix.Provider>{children}</Radix.Provider>` once the tooltip module
 * resolved. React reconciles by type + position, so that swap unmounted and
 * re-mounted EVERYTHING beneath it: BrowserRouter, every route, ExitHint,
 * Toaster/Sonner, QueryCacheBoot, NativeChromeInit... Boot effects ran twice
 * and any state set before the swap (an "exit hint" pill, a toast, a route
 * skeleton) was thrown away. It was also the reason
 * `e2e/exit-hint.spec.ts › exit hint fires on /dashboard` failed on the
 * production build in CI: the pill's `setVisible(true)` landed on the fiber
 * that the swap was about to discard.
 *
 * `vendor-radix` (which already contains the tooltip module) is a static
 * import of the entry chunk, so the lazy import saved nothing.
 */
import { act, render, screen } from "@testing-library/react";
import { useEffect, useState } from "react";
import { describe, expect, it } from "vitest";
import { AppTooltipProvider } from "@/components/AppTooltipProvider";

const flushIdle = async () => {
  // requestIdleCallback is not implemented in jsdom → the old wrapper fell
  // back to setTimeout(load, 200); the new one has no async step at all.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 260));
  });
  await act(async () => {
    await Promise.resolve();
  });
};

describe("app shell provider keeps children mounted", () => {
  it("mounts a child exactly once across the provider's lifetime", async () => {
    let mounts = 0;
    let unmounts = 0;
    const Probe = () => {
      useEffect(() => {
        mounts += 1;
        return () => {
          unmounts += 1;
        };
      }, []);
      return <span data-testid="probe">probe</span>;
    };

    render(
      <AppTooltipProvider>
        <Probe />
      </AppTooltipProvider>,
    );
    expect(screen.getByTestId("probe")).toBeInTheDocument();
    await flushIdle();

    expect(mounts).toBe(1);
    expect(unmounts).toBe(0);
  });

  it("keeps state that a child set before the tooltip module could arrive", async () => {
    // Mirrors ExitHint: a window event flips local state; that state must
    // survive whatever the provider does after first paint.
    const Pill = () => {
      const [visible, setVisible] = useState(false);
      useEffect(() => {
        const show = () => setVisible(true);
        window.addEventListener("nb:back-exit-hint", show);
        return () => window.removeEventListener("nb:back-exit-hint", show);
      }, []);
      return visible ? <div role="status">Press back again to exit</div> : null;
    };

    render(
      <AppTooltipProvider>
        <Pill />
      </AppTooltipProvider>,
    );
    act(() => {
      window.dispatchEvent(new CustomEvent("nb:back-exit-hint"));
    });
    expect(screen.getByRole("status")).toHaveTextContent("Press back again to exit");

    await flushIdle();

    expect(screen.getByRole("status")).toHaveTextContent("Press back again to exit");
  });
});
