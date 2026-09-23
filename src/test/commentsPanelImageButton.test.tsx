import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommentsPanel } from "../features/lesson/components/CommentsPanel";
import type { Comment } from "../hooks/useComments";

afterEach(() => cleanup());

const base: Comment = {
  id: "c1",
  lessonId: "l1",
  userId: "u1",
  userName: "Anuj",
  message: "See attached",
  imageUrl: "https://example.com/comment.png",
  createdAt: new Date().toISOString(),
};

function renderPanel(comments: Comment[], onOpenImage = vi.fn()) {
  render(
    <CommentsPanel
      comments={comments}
      loading={false}
      newComment=""
      isPosting={false}
      postDisabled
      onCommentChange={() => {}}
      onPost={() => {}}
      onOpenImage={onOpenImage}
    />,
  );
  return onOpenImage;
}

describe("CommentsPanel image attachment", () => {
  it("renders the image inside a labelled button so Maestro/keyboard users can open it in-app", () => {
    const onOpenImage = renderPanel([base]);

    // Maestro's WebView walker drops <img> nodes and maps aria-label onto
    // resource-id — the button label is the only handle the Android
    // overlay-back flow has (maestro/overlay-back.yaml).
    const button = screen.getByRole("button", { name: "Open comment image" });
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveAttribute("data-testid", "comment-image-open");
    // Playwright's comment-image-in-app.spec.ts still targets the <img>.
    expect(button.querySelector('img[alt="Comment attachment"]')).not.toBeNull();

    fireEvent.click(button);
    expect(onOpenImage).toHaveBeenCalledTimes(1);
    expect(onOpenImage).toHaveBeenCalledWith(base.imageUrl);
  });

  it("renders no image button for text-only comments", () => {
    renderPanel([{ ...base, id: "c2", imageUrl: null }]);
    expect(screen.queryByRole("button", { name: "Open comment image" })).toBeNull();
  });
});
