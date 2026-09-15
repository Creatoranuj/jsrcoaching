/**
 * Regression: closing the autoscroll settings sheet must NOT close the PDF
 * underneath it.
 *
 * The reader pushes a `{ pdfFullscreen: true }` sentinel; the sheet pushes its
 * own overlay sentinel on top. When the sheet closes programmatically (Done),
 * `useOverlayBackClose` pops its entry with `history.back()`. That fires a real
 * popstate, which the reader used to read as a hardware back press.
 */
import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { useEffect, useRef } from "react";
import { useOverlayBackClose } from "../hooks/useOverlayBackClose";
import { isSyntheticPop, resetSyntheticPop } from "../lib/reader/overlayHistory";

const nextPop = () =>
  new Promise<void>((resolve) =>
    window.addEventListener("popstate", () => resolve(), { once: true }),
  );

/** Mirrors the guarded reader listener in LessonView. */
function useReaderSentinel(open: boolean, onClose: () => void) {
  const cb = useRef(onClose);
  cb.current = onClose;
  useEffect(() => {
    if (!open) return;
    window.history.pushState({ pdfFullscreen: true }, "");
    const onPop = () => {
      if (isSyntheticPop()) return;
      if (window.history.state?.pdfFullscreen) return;
      cb.current();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [open]);
}

describe("nested overlay back handling", () => {
  beforeEach(() => {
    resetSyntheticPop();
    window.history.replaceState(null, "", "/reader");
  });

  it("closing the sheet leaves the reader open", async () => {
    const closeReader = vi.fn();
    const closeSheet = vi.fn();

    const hook = renderHook(
      ({ sheetOpen }: { sheetOpen: boolean }) => {
        useReaderSentinel(true, closeReader);
        useOverlayBackClose(sheetOpen, closeSheet, "autoscroll-sheet");
      },
      { initialProps: { sheetOpen: false } },
    );

    act(() => hook.rerender({ sheetOpen: true }));
    expect(window.history.state?.overlay).toBe("autoscroll-sheet");

    const popped = nextPop();
    act(() => hook.rerender({ sheetOpen: false })); // Done pressed
    await act(async () => { await popped; });

    expect(closeReader).not.toHaveBeenCalled();
    expect(window.history.state?.pdfFullscreen).toBe(true);
  });

  it("a genuine back press still closes the reader", async () => {
    const closeReader = vi.fn();
    renderHook(() => useReaderSentinel(true, closeReader));

    const popped = nextPop();
    act(() => { window.history.back(); });
    await act(async () => { await popped; });

    expect(closeReader).toHaveBeenCalledTimes(1);
  });
});
