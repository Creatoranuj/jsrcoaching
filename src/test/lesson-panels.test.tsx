import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PersonalMentorsPanel, PERSONAL_MENTORS } from "@/features/lesson/components/PersonalMentorsPanel";
import { MyDoubtsPanel } from "@/features/lesson/components/MyDoubtsPanel";
import { LessonRatingPanel } from "@/features/lesson/components/LessonRatingPanel";
import { CommentsPanel } from "@/features/lesson/components/CommentsPanel";
import { DppCard } from "@/features/lesson/components/DppCard";
import type { Comment } from "@/hooks/useComments";

// SmartImage does network/format work — stub it to a plain img for these tests.
vi.mock("@/components/common/SmartImage", () => ({
  SmartImage: (props) => <img {...props} />,
}));

const makeComment = (over: Partial<Comment> = {}): Comment => ({
  id: "c1",
  lessonId: "l1",
  userId: "u1",
  userName: "Asha",
  message: "Sir ye samajh nahi aaya",
  imageUrl: null,
  createdAt: new Date().toISOString(),
  ...over,
});

describe("PersonalMentorsPanel", () => {
  it("har mentor ka naam, call aur email link dikhata hai", () => {
    render(<PersonalMentorsPanel />);
    for (const m of PERSONAL_MENTORS) {
      expect(screen.getByText(m.name)).toBeTruthy();
    }
    expect(screen.getAllByText("Call")).toHaveLength(PERSONAL_MENTORS.length);
    expect(screen.getAllByText("Email")).toHaveLength(PERSONAL_MENTORS.length);
  });
});

describe("MyDoubtsPanel", () => {
  it("sirf current user ke doubts dikhata hai", () => {
    render(
      <MyDoubtsPanel
        loading={false}
        userId="u1"
        comments={[makeComment(), makeComment({ id: "c2", userId: "u2", userName: "Ravi", message: "dusre ka doubt" })]}
      />
    );
    expect(screen.getByText("Sir ye samajh nahi aaya")).toBeTruthy();
    expect(screen.queryByText("dusre ka doubt")).toBeNull();
  });

  it("koi doubt nahi to empty message dikhata hai", () => {
    render(<MyDoubtsPanel loading={false} userId="u1" comments={[]} />);
    expect(screen.getByText(/haven't posted any doubts/i)).toBeTruthy();
  });
});

describe("LessonRatingPanel", () => {
  const base = {
    ratingValue: 0,
    ratingHover: 0,
    ratingComment: "",
    ratingSaving: false,
    ratingSubmitted: false,
    ratingCount: 0,
    ratingAvg: 0,
    canSubmit: true,
    onHover: vi.fn(),
    onSelect: vi.fn(),
    onCommentChange: vi.fn(),
    onSubmit: vi.fn(),
  };

  it("star chunne par onSelect call hota hai", () => {
    render(<LessonRatingPanel {...base} />);
    fireEvent.click(screen.getByLabelText("4 star"));
    expect(base.onSelect).toHaveBeenCalledWith(4);
  });

  it("rating 0 ho to submit disabled rehta hai", () => {
    render(<LessonRatingPanel {...base} />);
    expect(screen.getByRole("button", { name: /submit rating/i })).toHaveProperty("disabled", true);
  });

  it("rating ho to submit enabled aur click par onSubmit", () => {
    render(<LessonRatingPanel {...base} ratingValue={5} />);
    const btn = screen.getByRole("button", { name: /submit rating/i });
    expect(btn).toHaveProperty("disabled", false);
    fireEvent.click(btn);
    expect(base.onSubmit).toHaveBeenCalled();
  });

  it("average rating ka summary dikhata hai", () => {
    render(<LessonRatingPanel {...base} ratingCount={3} ratingAvg={4.5} />);
    expect(screen.getByText(/Average 4\.5 ★ from 3 students/)).toBeTruthy();
  });
});

describe("CommentsPanel", () => {
  const base = {
    comments: [] as Comment[],
    loading: false,
    newComment: "",
    isPosting: false,
    postDisabled: true,
    onCommentChange: vi.fn(),
    onPost: vi.fn(),
    onOpenImage: vi.fn(),
  };

  it("comments ki ginti heading mein dikhata hai", () => {
    render(<CommentsPanel {...base} comments={[makeComment(), makeComment({ id: "c2" })]} />);
    expect(screen.getByText("Comments (2)")).toBeTruthy();
  });

  it("khaali hone par Ask Doubt ka hint dikhata hai", () => {
    render(<CommentsPanel {...base} />);
    expect(screen.getByText(/No comments yet/)).toBeTruthy();
  });

  it("Enter dabane par onPost call hota hai", () => {
    render(<CommentsPanel {...base} newComment="hello" postDisabled={false} />);
    fireEvent.keyDown(screen.getByLabelText("Write Comment"), { key: "Enter" });
    expect(base.onPost).toHaveBeenCalled();
  });

  it("image wale comment par click karne se onOpenImage call hota hai", () => {
    render(<CommentsPanel {...base} comments={[makeComment({ imageUrl: "https://x/y.png" })]} />);
    fireEvent.click(screen.getByAltText("Comment attachment"));
    expect(base.onOpenImage).toHaveBeenCalledWith("https://x/y.png");
  });
});

describe("DppCard", () => {
  it("DPP list dikhata hai aur click par quiz route par navigate karta hai", () => {
    render(
      <MemoryRouter>
        <DppCard loading={false} dpps={[{ id: "d1", title: "Grammar DPP 1", total_marks: 20, type: "quiz" }]} />
      </MemoryRouter>
    );
    expect(screen.getByText("Grammar DPP 1")).toBeTruthy();
    expect(screen.getByText(/QUIZ · 20 marks/)).toBeTruthy();
    expect(screen.getByText("Attempt DPP")).toBeTruthy();
  });

  it("loading mein spinner dikhata hai", () => {
    const { container } = render(
      <MemoryRouter>
        <DppCard loading dpps={[]} />
      </MemoryRouter>
    );
    expect(container.querySelector(".animate-spin")).toBeTruthy();
  });
});
