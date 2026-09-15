import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import React from "react";
import useHashScroll from "./useHashScroll";

describe("useHashScroll", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="why-choose-us"></div>';
    // jsdom doesn't implement scrollIntoView — install it on the prototype.
    (HTMLElement.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = vi.fn();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 0;
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("scrolls to element when hash present", () => {
    const el = document.getElementById("why-choose-us")!;
    const spy = el.scrollIntoView as ReturnType<typeof vi.fn>;

    renderHook(() => useHashScroll(), {
      wrapper: ({ children }) =>
        React.createElement(MemoryRouter, { initialEntries: ["/#why-choose-us"] }, children),
    });

    expect(spy).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });

  it("does nothing when no hash", () => {
    const el = document.getElementById("why-choose-us")!;
    const spy = el.scrollIntoView as ReturnType<typeof vi.fn>;

    renderHook(() => useHashScroll(), {
      wrapper: ({ children }) =>
        React.createElement(MemoryRouter, { initialEntries: ["/"] }, children),
    });

    expect(spy).not.toHaveBeenCalled();
  });
});
