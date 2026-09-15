import { describe, it, expect } from "vitest";
import {
  buildLessonChips,
  likeChipLabel,
  lessonProgressPercent,
  isDocumentLessonType,
} from "@/features/lesson/lib/lessonChips";

describe("buildLessonChips", () => {
  const base = { hasNotes: false, isAdminOrTeacher: false, hasLiked: false, likeCount: 0 };

  it("hides Smart Notes when there are no notes and the viewer is a student", () => {
    const ids = buildLessonChips(base).map((c) => c.id);
    expect(ids).not.toContain("notes");
    expect(ids[0]).toBe("comments");
    expect(ids).toContain("rating");
  });

  it("shows Smart Notes when the lesson has notes", () => {
    const ids = buildLessonChips({ ...base, hasNotes: true }).map((c) => c.id);
    expect(ids).toContain("notes");
  });

  it("shows Smart Notes for admin/teacher even without notes", () => {
    const ids = buildLessonChips({ ...base, isAdminOrTeacher: true }).map((c) => c.id);
    expect(ids).toContain("notes");
  });

  it("marks only the like chip with an action", () => {
    const withAction = buildLessonChips(base).filter((c) => c.action);
    expect(withAction).toHaveLength(1);
    expect(withAction[0].id).toBe("like");
  });
});

describe("likeChipLabel", () => {
  it("covers all four states", () => {
    expect(likeChipLabel(false, 0)).toBe("Like");
    expect(likeChipLabel(false, 3)).toBe("Like 3");
    expect(likeChipLabel(true, 0)).toBe("Liked");
    expect(likeChipLabel(true, 7)).toBe("Liked 7");
  });
});

describe("lessonProgressPercent", () => {
  it("returns 0 for an empty lesson list", () => {
    expect(lessonProgressPercent(0, 0)).toBe(0);
    expect(lessonProgressPercent(5, 0)).toBe(0);
  });

  it("rounds to the nearest percent", () => {
    expect(lessonProgressPercent(1, 3)).toBe(33);
    expect(lessonProgressPercent(2, 3)).toBe(67);
    expect(lessonProgressPercent(4, 4)).toBe(100);
  });

  it("clamps out-of-range input", () => {
    expect(lessonProgressPercent(9, 4)).toBe(100);
    expect(lessonProgressPercent(-2, 4)).toBe(0);
  });
});

describe("isDocumentLessonType", () => {
  it("matches document types case-insensitively", () => {
    expect(isDocumentLessonType("pdf")).toBe(true);
    expect(isDocumentLessonType("DPP_ATTEMPT")).toBe(true);
    expect(isDocumentLessonType("Notes")).toBe(true);
  });

  it("rejects video and missing types", () => {
    expect(isDocumentLessonType("VIDEO")).toBe(false);
    expect(isDocumentLessonType(null)).toBe(false);
    expect(isDocumentLessonType(undefined)).toBe(false);
  });
});
