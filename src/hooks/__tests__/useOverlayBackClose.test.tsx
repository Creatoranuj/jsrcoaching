/**
 * Regression spec for the back-button overlay contract.
 *
 * The HIGH finding this locks in: when two overlays are stacked (e.g. select
 * mode + a confirm dialog in My Library), an Android/browser back press must
 * close the TOP overlay first (LIFO) and leave the lower one intact. A prior
 * bug popped the wrong sentinel, leaving a "Delete 0 files?" dialog stuck on
 * screen. These tests drive the real `useOverlayBackClose` hook against jsdom's
 * history + popstate so a future refactor that breaks LIFO fails immediately.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { useOverlayBackClose } from "../useOverlayBackClose";

/** Tiny harness that mounts the hook for a single overlay key. */
function Overlay({
  open,
  onClose,
  okey,
}: {
  open: boolean;
  onClose: () => void;
  okey: string;
}) {
  useOverlayBackClose(open, onClose, okey);
  return null;
}

/** Simulate a hardware/browser back press the way the app does. */
async function pressBack() {
  await act(async () => {
    const popped = new Promise<void>((resolve) =>
      window.addEventListener("popstate", () => resolve(), { once: true }),
    );
    window.history.back();
    await popped;
    // Flush any React state updates triggered by the close callback.
    await Promise.resolve();
  });
}

describe("useOverlayBackClose — overlay back contract", () => {
  beforeEach(() => {
    // Reset to a known single-entry stack between tests.
    window.history.replaceState(null, "", "/");
  });

  it("pushes a sentinel on open and closes on back press", async () => {
    const onClose = vi.fn();
    render(<Overlay open onClose={onClose} okey="sheet" />);

    expect(window.history.state?.overlay).toBe("sheet");

    await pressBack();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes the TOP overlay first (LIFO) when two are stacked", async () => {
    const closeSelect = vi.fn();
    const closeDialog = vi.fn();

    // Open select mode first…
    const select = render(
      <Overlay open onClose={closeSelect} okey="select-mode" />,
    );
    expect(window.history.state?.overlay).toBe("select-mode");

    // …then a confirm dialog opens on top of it.
    render(<Overlay open onClose={closeDialog} okey="bulk-delete" />);
    expect(window.history.state?.overlay).toBe("bulk-delete");

    // First back → dialog closes, selection survives.
    await pressBack();
    expect(closeDialog).toHaveBeenCalledTimes(1);
    expect(closeSelect).not.toHaveBeenCalled();

    // Second back → selection mode closes.
    await pressBack();
    expect(closeSelect).toHaveBeenCalledTimes(1);

    select.unmount();
  });
});

