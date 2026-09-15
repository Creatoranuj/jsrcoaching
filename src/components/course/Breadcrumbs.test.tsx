import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { Breadcrumbs } from "./Breadcrumbs";

/**
 * Regression guardrails — these crumbs MUST always be clickable, even when
 * they're the last segment (drill-down state navigation like "Tense" in
 * MyCourseDetail). A previous regression rendered the last crumb as a plain
 * <span>, making it unclickable.
 */
const renderAt = (ui: React.ReactElement, path = "/my-courses/abc") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/my-courses/:courseId" element={ui} />
        <Route path="*" element={ui} />
      </Routes>
    </MemoryRouter>,
  );

describe("Breadcrumbs", () => {
  it("renders the last segment as a clickable button when it has onClick", () => {
    const onClick = vi.fn();
    renderAt(
      <Breadcrumbs
        segments={[
          { label: "My Courses", href: "/my-courses" },
          { label: "Course", onClick: () => {} },
          { label: "Tense", onClick },
        ]}
      />,
    );
    const tense = screen.getByRole("button", { name: /tense/i });
    expect(tense).toBeInTheDocument();
    expect(tense).not.toBeDisabled();
    fireEvent.click(tense);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("fires parent onClick after a re-render with new segments (no stale closures)", () => {
    const a = vi.fn();
    const b = vi.fn();
    const { rerender } = renderAt(
      <Breadcrumbs
        segments={[
          { label: "Course", onClick: a },
          { label: "Tense", onClick: () => {} },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /course/i }));
    expect(a).toHaveBeenCalledTimes(1);

    rerender(
      <MemoryRouter initialEntries={["/my-courses/abc"]}>
        <Breadcrumbs
          segments={[
            { label: "Course", onClick: b },
            { label: "Tense", onClick: () => {} },
            { label: "Present", onClick: () => {} },
          ]}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: /course/i }));
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).toHaveBeenCalledTimes(1); // not called again
  });

  it("falls back to <Link> when only href is provided", () => {
    renderAt(
      <Breadcrumbs
        segments={[
          { label: "My Courses", href: "/my-courses" },
          { label: "Tense" }, // last + no handler → page label
        ]}
      />,
    );
    const link = screen.getByRole("link", { name: /my courses/i });
    expect(link).toHaveAttribute("href", "/my-courses");
  });
});
