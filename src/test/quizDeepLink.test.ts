import { describe, it, expect } from "vitest";
import {
  buildQuizDeepLink,
  parseQuizDeepLink,
  findQuizForLesson,
  lessonSupportsQuiz,
} from "@/features/admin-quiz/lib/quizDeepLink";

describe("quiz deep link", () => {
  it("carries lesson, course, chapter and type", () => {
    const url = buildQuizDeepLink({
      lessonId: "les-1",
      lessonTitle: "Kinematics DPP",
      courseId: 42,
      chapterId: "ch-9",
    });
    expect(url.startsWith("/admin/quiz?")).toBe(true);
    const parsed = parseQuizDeepLink(url.slice(url.indexOf("?")));
    expect(parsed).toEqual({
      lessonId: "les-1",
      lessonTitle: "Kinematics DPP",
      courseId: "42",
      chapterId: "ch-9",
      type: "dpp",
    });
  });

  it("returns null without a lesson id", () => {
    expect(parseQuizDeepLink("?courseId=1")).toBeNull();
    expect(parseQuizDeepLink("")).toBeNull();
  });

  it("omits missing optional fields", () => {
    const parsed = parseQuizDeepLink(buildQuizDeepLink({ lessonId: "l" }).slice("/admin/quiz".length));
    expect(parsed?.courseId).toBe("");
    expect(parsed?.chapterId).toBe("");
    expect(parsed?.type).toBe("dpp");
  });

  it("finds an existing quiz so the link edits instead of duplicating", () => {
    const quizzes = [{ id: "q1", lesson_id: "other" }, { id: "q2", lesson_id: "les-1" }];
    expect(findQuizForLesson(quizzes, "les-1")?.id).toBe("q2");
    expect(findQuizForLesson(quizzes, "missing")).toBeUndefined();
  });

  it("offers the quiz shortcut only for DPP/DPP Attempt/Test lessons", () => {
    expect(lessonSupportsQuiz("DPP")).toBe(true);
    expect(lessonSupportsQuiz("dpp_attempt")).toBe(true);
    expect(lessonSupportsQuiz("TEST")).toBe(true);
    expect(lessonSupportsQuiz("VIDEO")).toBe(false);
    expect(lessonSupportsQuiz(null)).toBe(false);
  });
});
