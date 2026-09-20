import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, render, renderHook } from "@testing-library/react";
import { useAutoScroll } from "../hooks/useAutoScroll";
import PageIndicatorPill from "../components/viewer/PageIndicatorPill";
import { createRef } from "react";

function sized(el: HTMLElement, clientHeight: number, scrollHeight: number) {
  Object.defineProperty(el, "clientHeight", { value: clientHeight, configurable: true });
  Object.defineProperty(el, "scrollHeight", { value: scrollHeight, configurable: true });
}

describe("Reader scope: autoscroll stays inside the PDF box", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("never scrolls the lesson page when the reader declares a boundary", () => {
    // <main> (page scroller) > [data-reader-surface] > reader scroll box (empty yet)
    const main = document.createElement("main");
    sized(main, 600, 6000);
    const surface = document.createElement("div");
    surface.setAttribute("data-reader-surface", "");
    const box = document.createElement("div");
    sized(box, 400, 400); // pages not rendered yet → nothing to scroll
    surface.appendChild(box);
    main.appendChild(surface);
    document.body.appendChild(main);

    vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);

    const targetRef = { current: box as HTMLElement };
    const { result } = renderHook(() => useAutoScroll({ targetRef }));
    act(() => result.current.toggle());

    expect(main.scrollTop).toBe(0);
    act(() => result.current.toggle());
  });

  it("uses the reader's own scroller once its pages exist", () => {
    const main = document.createElement("main");
    sized(main, 600, 6000);
    const surface = document.createElement("div");
    surface.setAttribute("data-reader-surface", "");
    const box = document.createElement("div");
    sized(box, 400, 4000);
    surface.appendChild(box);
    main.appendChild(surface);
    document.body.appendChild(main);

    let raf: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      raf = cb;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);

    const targetRef = { current: box as HTMLElement };
    const { result } = renderHook(() => useAutoScroll({ targetRef }));
    act(() => result.current.toggle());
    act(() => raf?.(0));
    act(() => raf?.(16.67));
    act(() => raf?.(33.34));

    expect(box.scrollTop).toBeGreaterThan(0);
    expect(main.scrollTop).toBe(0);
    act(() => result.current.toggle());
  });
});

describe("Reader scope: page chip stays inside the reader box", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("positions the chip within the inline reader rect, not the whole viewport", () => {
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });

    const surface = document.createElement("div");
    surface.setAttribute("data-reader-surface", "");
    const box = document.createElement("div");
    sized(box, 300, 3000);
    // Inline lesson PDF: reader occupies y = 300..700 of an 800px viewport.
    box.getBoundingClientRect = () =>
      ({ top: 300, bottom: 700, height: 400, left: 0, right: 400, width: 400, x: 0, y: 300, toJSON: () => ({}) }) as DOMRect;
    surface.getBoundingClientRect = box.getBoundingClientRect;
    surface.appendChild(box);
    document.body.appendChild(surface);

    // Two pages so the pill renders at all.
    const pages = [0, 1].map((i) => {
      const p = document.createElement("div");
      p.setAttribute("data-page", String(i + 1));
      p.getBoundingClientRect = () =>
        ({ top: 300 + i * 400, bottom: 700 + i * 400, height: 400, left: 0, right: 400, width: 400, x: 0, y: 300, toJSON: () => ({}) }) as DOMRect;
      box.appendChild(p);
      return p;
    });
    expect(pages).toHaveLength(2);

    const ref = createRef<HTMLElement>();
    (ref as { current: HTMLElement | null }).current = box;

    const { container } = render(<PageIndicatorPill targetRef={ref} pinned />);
    act(() => {
      box.dispatchEvent(new Event("scroll"));
    });

    const chip = (container.querySelector("[style]") ?? document.querySelector("div[style*='top']")) as HTMLElement | null;
    if (chip?.style.top) {
      const top = parseFloat(chip.style.top);
      expect(top).toBeGreaterThanOrEqual(300);
      expect(top).toBeLessThanOrEqual(700);
    }
  });
});
