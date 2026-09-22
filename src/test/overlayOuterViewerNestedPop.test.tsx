/**
 * Regression: e2e `pdf-offline.spec.ts › autoscroll` (red on main since 0d044a5).
 *
 * Shape under test — exactly what Downloads / My Library build:
 *
 *   route  →  file viewer (useOverlayBackClose "…-file-viewer")
 *          →  DocReaderShell sentinel { pdfFullscreen }
 *          →  autoscroll sheet (useOverlayBackClose "autoscroll-sheet")
 *
 * Closing the sheet (Done / Escape / backdrop) runs its cleanup `history.back()`.
 * The *outer* file viewer used to read that pop as "my sentinel is gone" and
 * unmounted the whole document. It must stay open — for the synthetic pop, and
 * for a real back press that only lands on the reader's sentinel.
 */
import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { StrictMode, useEffect, useRef } from "react";
import { useOverlayBackClose } from "../hooks/useOverlayBackClose";
import { useOverlayHistorySentinel } from "../hooks/useOverlayHistorySentinel";
import {
  beginSyntheticPop,
  isSyntheticPop,
  poppedAboveOrAt,
  pushSentinel,
  resetSyntheticPop,
  sentinelDepth,
} from "../lib/reader/overlayHistory";

const nextPop = () =>
  new Promise<void>((resolve) =>
    window.addEventListener("popstate", () => resolve(), { once: true }),
  );

/** Mirrors DocReaderShell's sentinel effect (post-fix). */
function useDocReaderSentinel(onBack: () => void) {
  const cb = useRef(onBack);
  cb.current = onBack;
  useEffect(() => {
    if (!window.history.state?.pdfFullscreen) pushSentinel({ pdfFullscreen: true });
    const onPop = () => {
      if (isSyntheticPop()) return;
      if (window.history.state?.pdfFullscreen) return;
      cb.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (window.history.state?.pdfFullscreen) {
        beginSyntheticPop();
        window.history.back();
      }
    };
  }, []);
}

describe("overlayHistory depth stamps", () => {
  it("stamps each sentinel one deeper than the entry below it", () => {
    window.history.replaceState(null, "", "/downloads");
    expect(sentinelDepth(window.history.state)).toBe(0);
    expect(pushSentinel({ overlay: "a" })).toBe(1);
    expect(pushSentinel({ pdfFullscreen: true })).toBe(2);
    expect(pushSentinel({ overlay: "c" })).toBe(3);
    expect(window.history.state).toMatchObject({ overlay: "c", nbDepth: 3 });
  });

  it("ignores garbage stamps", () => {
    expect(sentinelDepth({ nbDepth: "3" })).toBe(0);
    expect(sentinelDepth({ nbDepth: -1 })).toBe(0);
    expect(sentinelDepth(null)).toBe(0);
    expect(poppedAboveOrAt({ nbDepth: 2 }, 0)).toBe(false);
    expect(poppedAboveOrAt({ nbDepth: 2 }, 2)).toBe(true);
    expect(poppedAboveOrAt({ nbDepth: 1 }, 2)).toBe(false);
  });
});

describe("outer file viewer survives nested overlay pops", () => {
  beforeEach(() => {
    resetSyntheticPop();
    window.history.replaceState(null, "", "/downloads");
  });

  it("autoscroll sheet Done → reader and file viewer both stay open", async () => {
    const closeViewer = vi.fn();
    const closeReader = vi.fn();
    const closeSheet = vi.fn();

    const viewer = renderHook(() =>
      useOverlayBackClose(true, closeViewer, "personal-library-file-viewer"),
    );
    const reader = renderHook(() => useDocReaderSentinel(closeReader));
    const sheet = renderHook(
      ({ open }) => useOverlayBackClose(open, closeSheet, "autoscroll-sheet"),
      { initialProps: { open: true } },
    );
    expect(window.history.state).toMatchObject({ overlay: "autoscroll-sheet", nbDepth: 3 });

    // Done button → sheet unmount → cleanup history.back()
    const popped = nextPop();
    sheet.rerender({ open: false });
    await act(() => popped);
    await act(() => new Promise((r) => setTimeout(r, 10)));

    expect(closeSheet).not.toHaveBeenCalled();
    expect(closeReader).not.toHaveBeenCalled();
    expect(closeViewer).not.toHaveBeenCalled();
    expect(window.history.state).toMatchObject({ pdfFullscreen: true, nbDepth: 2 });

    reader.unmount();
    viewer.unmount();
  });

  it("hardware back on the sheet → only the sheet closes", async () => {
    const closeViewer = vi.fn();
    const closeReader = vi.fn();
    const closeSheet = vi.fn();

    const viewer = renderHook(() =>
      useOverlayBackClose(true, closeViewer, "personal-library-file-viewer"),
    );
    const reader = renderHook(() => useDocReaderSentinel(closeReader));
    const sheet = renderHook(() =>
      useOverlayBackClose(true, closeSheet, "autoscroll-sheet"),
    );

    // Real back press — not synthetic.
    const popped = nextPop();
    window.history.back();
    await act(() => popped);
    await act(() => new Promise((r) => setTimeout(r, 10)));

    expect(closeSheet).toHaveBeenCalledTimes(1);
    expect(closeReader).not.toHaveBeenCalled();
    expect(closeViewer).not.toHaveBeenCalled();

    // Second back press → reader closes, viewer still open.
    sheet.unmount();
    const popped2 = nextPop();
    window.history.back();
    await act(() => popped2);
    await act(() => new Promise((r) => setTimeout(r, 10)));
    expect(closeReader).toHaveBeenCalledTimes(1);
    expect(closeViewer).not.toHaveBeenCalled();

    // Third back press → file viewer closes.
    reader.unmount();
    const popped3 = nextPop();
    window.history.back();
    await act(() => popped3);
    await act(() => new Promise((r) => setTimeout(r, 10)));
    expect(closeViewer).toHaveBeenCalledTimes(1);
    viewer.unmount();
  });

  it("StrictMode duplicate reader sentinel (dev) still keeps the viewer open", async () => {
    // Dev-only shape observed in CI: [viewer, pdfFullscreen, pdfFullscreen', sheet]
    // — the reader's effect ran twice while the viewer's entry sat in between.
    const closeViewer = vi.fn();
    const closeReader = vi.fn();
    const closeSheet = vi.fn();

    const viewer = renderHook(() =>
      useOverlayBackClose(true, closeViewer, "personal-library-file-viewer"),
    );
    const reader = renderHook(() => useDocReaderSentinel(closeReader), { wrapper: StrictMode });
    // Simulate the entry a parent pushed between the two invocations.
    pushSentinel({ pdfFullscreen: true });
    const sheet = renderHook(
      ({ open }) => useOverlayBackClose(open, closeSheet, "autoscroll-sheet"),
      { initialProps: { open: true } },
    );

    const popped = nextPop();
    sheet.rerender({ open: false });
    await act(() => popped);
    await act(() => new Promise((r) => setTimeout(r, 10)));

    expect(closeReader).not.toHaveBeenCalled();
    expect(closeViewer).not.toHaveBeenCalled();
    expect(window.history.state).toMatchObject({ pdfFullscreen: true });

    reader.unmount();
    viewer.unmount();
  });

  it("legacy useOverlayHistorySentinel also ignores nested pops", async () => {
    const closeOuter = vi.fn();
    const closeInner = vi.fn();

    const outer = renderHook(() => useOverlayHistorySentinel(true, closeOuter));
    const inner = renderHook(
      ({ open }) => useOverlayBackClose(open, closeInner, "inner-sheet"),
      { initialProps: { open: true } },
    );

    const popped = nextPop();
    inner.rerender({ open: false });
    await act(() => popped);
    await act(() => new Promise((r) => setTimeout(r, 10)));
    expect(closeOuter).not.toHaveBeenCalled();

    // Real back on the outer → closes.
    const popped2 = nextPop();
    window.history.back();
    await act(() => popped2);
    await act(() => new Promise((r) => setTimeout(r, 10)));
    expect(closeOuter).toHaveBeenCalledTimes(1);
    outer.unmount();
  });
});
