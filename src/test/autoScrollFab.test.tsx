import { cleanup, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import AutoScrollFab from "../components/viewer/AutoScrollFab";

vi.mock("../hooks/useAutoScroll", () => ({
  useAutoScroll: () => ({
    active: false,
    speed: 1,
    setSpeed: vi.fn(),
    toggle: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
  }),
}));

afterEach(() => {
  cleanup();
  delete document.body.dataset.lovableDialogOpen;
  document.body.innerHTML = "";
});

describe("AutoScrollFab", () => {
  it("portals to body and avoids the generic floating-fab dialog hide selector", () => {
    document.body.dataset.lovableDialogOpen = "true";
    render(<AutoScrollFab bottomOffset={96} />);

    const button = screen.getByRole("button", { name: /start autoscroll/i });
    expect(button.parentElement).toBe(document.body);
    expect(button).toHaveAttribute("data-autoscroll-fab", "true");
    expect(button).not.toHaveAttribute("data-floating-fab");
    expect(button).toHaveStyle({ bottom: "calc(96px + env(safe-area-inset-bottom, 0px))" });
  });

  it("can be visually hidden by reader chrome without unmounting", () => {
    render(<AutoScrollFab visible={false} />);

    const button = screen.getByRole("button", { name: /start autoscroll/i });
    expect(button).toHaveClass("opacity-0");
    expect(button).toHaveClass("pointer-events-none");
  });
});