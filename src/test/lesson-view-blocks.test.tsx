import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LessonDesktopHeader } from "@/features/lesson/components/LessonDesktopHeader";
import { LessonLockedOverlay } from "@/features/lesson/components/LessonLockedOverlay";
import { LessonChipStrip } from "@/features/lesson/components/LessonChipStrip";
import { buildLessonChips } from "@/features/lesson/lib/lessonChips";

describe("LessonDesktopHeader", () => {
  it("shows the course, grade and lesson count and fires back", () => {
    const onBack = vi.fn();
    render(
      <LessonDesktopHeader
        courseTitle="Physics Foundation"
        gradeLabel="Class 10"
        lessonCount={12}
        hasPurchased
        onBack={onBack}
        onBuy={vi.fn()}
      />,
    );
    expect(screen.getByText("Physics Foundation")).toBeInTheDocument();
    expect(screen.getByText("Class 10")).toBeInTheDocument();
    expect(screen.getByText(/12 Lessons/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Buy Now" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("shows Buy Now when the course is not purchased", () => {
    const onBuy = vi.fn();
    render(
      <LessonDesktopHeader
        courseTitle="Maths"
        gradeLabel="Class 9"
        lessonCount={3}
        hasPurchased={false}
        onBack={vi.fn()}
        onBuy={onBuy}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Buy Now" }));
    expect(onBuy).toHaveBeenCalledTimes(1);
  });
});

describe("LessonLockedOverlay", () => {
  it("renders the lock message with the lesson count and buys on click", () => {
    const onBuy = vi.fn();
    render(<LessonLockedOverlay lessonCount={24} onBuy={onBuy} />);
    expect(screen.getByText("Content Locked")).toBeInTheDocument();
    expect(screen.getByText(/24 lessons/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Full course kholo" }));
    expect(onBuy).toHaveBeenCalledTimes(1);
  });
});

describe("LessonChipStrip", () => {
  const chips = buildLessonChips({
    hasNotes: true,
    isAdminOrTeacher: false,
    hasLiked: false,
    likeCount: 2,
  });

  it("renders every chip and selects a panel chip", () => {
    const onSelect = vi.fn();
    render(
      <LessonChipStrip
        chips={chips}
        activeChip="comments"
        hasLiked={false}
        likesLoading={false}
        collapsed={false}
        onSelect={onSelect}
        onToggleLike={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Smart Notes" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Bookmarks" }));
    expect(onSelect).toHaveBeenCalledWith("bookmarks");
  });

  it("routes the like chip to onToggleLike, not onSelect", () => {
    const onSelect = vi.fn();
    const onToggleLike = vi.fn();
    render(
      <LessonChipStrip
        chips={chips}
        activeChip="comments"
        hasLiked={false}
        likesLoading={false}
        collapsed={false}
        onSelect={onSelect}
        onToggleLike={onToggleLike}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Like 2" }));
    expect(onToggleLike).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("disables the like chip while likes are loading", () => {
    const likedChips = buildLessonChips({
      hasNotes: true,
      isAdminOrTeacher: false,
      hasLiked: true,
      likeCount: 2,
    });
    render(
      <LessonChipStrip
        chips={likedChips}
        activeChip="comments"
        hasLiked
        likesLoading
        collapsed={false}
        onSelect={vi.fn()}
        onToggleLike={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Liked 2" })).toBeDisabled();
  });

  it("hides the strip when collapsed", () => {
    const { container } = render(
      <LessonChipStrip
        chips={chips}
        activeChip="comments"
        hasLiked={false}
        likesLoading={false}
        collapsed
        onSelect={vi.fn()}
        onToggleLike={vi.fn()}
      />,
    );
    expect(container.firstElementChild?.className).toContain("hidden");
  });
});
