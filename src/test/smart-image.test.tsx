import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { SmartImage } from "@/components/common/SmartImage";

/**
 * Audit 2026-09-22 — regression tests for the "thumbnails never load" bug.
 *
 * jsdom never loads images, so we drive `complete` / `naturalWidth` through
 * prototype getters to emulate three browser states:
 *   - memory-cached image decoded synchronously at commit, `load` never fires
 *     (Android WebView / Firefox) → must be visible.
 *   - image already marked broken by the browser, `error` never fires → must
 *     advance to the fallback instead of staying a grey tile.
 *   - normal path: `load` fires → visible.
 */
function stubImageState(state: { complete: boolean; naturalWidth: number }) {
  Object.defineProperty(HTMLImageElement.prototype, "complete", {
    configurable: true,
    get: () => state.complete,
  });
  Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", {
    configurable: true,
    get: () => state.naturalWidth,
  });
}

const originalComplete = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "complete");
const originalNaturalWidth = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "naturalWidth");

function restoreImageState() {
  if (originalComplete) Object.defineProperty(HTMLImageElement.prototype, "complete", originalComplete);
  else delete (HTMLImageElement.prototype as unknown as Record<string, unknown>).complete;
  if (originalNaturalWidth) Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", originalNaturalWidth);
  else delete (HTMLImageElement.prototype as unknown as Record<string, unknown>).naturalWidth;
}

describe("SmartImage reveal logic", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    restoreImageState();
    vi.useRealTimers();
  });

  it("reveals a memory-cached image even when the load event never fires", () => {
    stubImageState({ complete: true, naturalWidth: 640 });
    const { getByAltText } = render(
      <SmartImage src="/course-thumbs/cg-lecturer-batch.jpg" alt="CG Lecturer" width={640} height={360} />
    );
    const img = getByAltText("CG Lecturer") as HTMLImageElement;
    // Flush the passive reset effect that used to undo the reveal.
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(img.style.opacity).toBe("1");
    expect(img.getAttribute("src")).toBe("/course-thumbs/cg-lecturer-batch.jpg");
  });

  it("stays hidden until load fires for a not-yet-decoded image, then reveals", () => {
    stubImageState({ complete: false, naturalWidth: 0 });
    const { getByAltText } = render(
      <SmartImage src="https://cdn.example.com/thumb.jpg" alt="Thumb" width={640} height={360} />
    );
    const img = getByAltText("Thumb") as HTMLImageElement;
    expect(img.style.opacity).toBe("0");
    fireEvent.load(img);
    expect(img.style.opacity).toBe("1");
  });

  it("falls through to the fallback when the browser already marked the image broken", () => {
    stubImageState({ complete: true, naturalWidth: 0 });
    const onError = vi.fn();
    const { getByAltText } = render(
      <SmartImage
        src="/missing.jpg"
        alt="Broken"
        width={100}
        height={100}
        maxRetries={1}
        retryDelay={10}
        fallbackSrc="/placeholder.svg"
        onError={onError}
      />
    );
    const img = getByAltText("Broken") as HTMLImageElement;
    // The probe (lost `error` event) schedules retry #1 with the retry delay;
    // until it fires we are still on the original URL and hidden.
    expect(img.getAttribute("src")).toBe("/missing.jpg");
    expect(img.style.opacity).toBe("0");
    // Retry #1 commits `?_r=1`; the synchronous probe sees it is still broken
    // and advances straight to the fallback within the same tick.
    act(() => {
      vi.advanceTimersByTime(10);
    });
    expect(img.getAttribute("src")).toBe("/placeholder.svg");
    expect(img.style.opacity).toBe("1");
    expect(onError).not.toHaveBeenCalled(); // no DOM event existed to forward
  });

  it("re-probes once after commit so a load event lost later still reveals the image", () => {
    const state = { complete: false, naturalWidth: 0 };
    stubImageState(state);
    const { getByAltText } = render(
      <SmartImage src="/late.jpg" alt="Late" width={100} height={100} />
    );
    const img = getByAltText("Late") as HTMLImageElement;
    expect(img.style.opacity).toBe("0");
    // Browser finishes decoding but the event is dropped.
    state.complete = true;
    state.naturalWidth = 100;
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(img.style.opacity).toBe("1");
  });

  it("resets and retries when the src prop changes", () => {
    stubImageState({ complete: false, naturalWidth: 0 });
    const { getByAltText, rerender } = render(
      <SmartImage src="/a.jpg" alt="Swap" width={100} height={100} />
    );
    const img = getByAltText("Swap") as HTMLImageElement;
    fireEvent.load(img);
    expect(img.style.opacity).toBe("1");
    rerender(<SmartImage src="/b.jpg" alt="Swap" width={100} height={100} />);
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(img.getAttribute("src")).toBe("/b.jpg");
    expect(img.style.opacity).toBe("0");
    fireEvent.load(img);
    expect(img.style.opacity).toBe("1");
  });
});
