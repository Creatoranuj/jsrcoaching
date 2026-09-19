/**
 * Behavioral spec for usePauseWhenHidden.
 *
 * Contract under test:
 *  1. Hiding the page (visibilitychange → hidden) fires onPause exactly once.
 *  2. A duplicate background signal in the SAME transition (WebView + native
 *     bridge can both fire) must NOT fire onPause twice.
 *  3. Returning to the foreground resets the latch, so the NEXT background
 *     transition fires again.
 *  4. Native appStateChange(isActive=false) pauses even when
 *     document.visibilityState stays "visible" (Android WebView case).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { usePauseWhenHidden } from "../usePauseWhenHidden";

type AppStateHandler = (state: { isActive: boolean }) => void;

// Mock the shared native bridge — capture the appStateChange handler so the
// test can drive it, and so no real Capacitor plugin is touched in jsdom.
let appStateHandler: AppStateHandler | undefined;
vi.mock("@/lib/native/app", () => ({
  loadCapacitorApp: vi.fn(async () => ({
    plugin: {
      addListener: vi.fn(async (_event: string, handler: AppStateHandler) => {
        appStateHandler = handler;
        return { remove: vi.fn() };
      }),
    },
  })),
}));

function Harness({ onPause }: { onPause: () => void }) {
  usePauseWhenHidden(onPause);
  return null;
}

const setVisibility = (state: "hidden" | "visible") => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event("visibilitychange"));
};

describe("usePauseWhenHidden", () => {
  beforeEach(() => {
    appStateHandler = undefined;
    setVisibility("visible");
  });

  it("fires once when the page is hidden", async () => {
    const onPause = vi.fn();
    render(<Harness onPause={onPause} />);
    await act(async () => setVisibility("hidden"));
    expect(onPause).toHaveBeenCalledTimes(1);
  });

  it("dedupes duplicate background signals within one transition", async () => {
    const onPause = vi.fn();
    render(<Harness onPause={onPause} />);
    await act(async () => {
      setVisibility("hidden");
      appStateHandler?.({ isActive: false }); // same transition, second signal
    });
    expect(onPause).toHaveBeenCalledTimes(1);
  });

  it("resets after returning to the foreground", async () => {
    const onPause = vi.fn();
    render(<Harness onPause={onPause} />);
    await act(async () => setVisibility("hidden"));
    await act(async () => setVisibility("visible"));
    await act(async () => setVisibility("hidden"));
    expect(onPause).toHaveBeenCalledTimes(2);
  });

  it("pauses on native appStateChange even if the DOM stays visible", async () => {
    const onPause = vi.fn();
    render(<Harness onPause={onPause} />);
    // Wait a tick so the async bridge listener is attached.
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => appStateHandler?.({ isActive: false }));
    expect(onPause).toHaveBeenCalledTimes(1);
  });
});
