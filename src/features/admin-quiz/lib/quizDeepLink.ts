/**
 * Deep link between a DPP lesson (Content manager) and the Quiz Manager.
 *
 * Admin clicks "Quiz" on a DPP / DPP Attempt lesson row; the Quiz Manager
 * opens with course, chapter, lesson and type already filled. If that lesson
 * already has a quiz, the existing quiz opens for editing instead of creating
 * a duplicate.
 */

export interface QuizDeepLinkInput {
  lessonId: string;
  lessonTitle?: string | null;
  courseId?: number | string | null;
  chapterId?: string | null;
  /** Quiz type; DPP by default. */
  type?: string;
}

export interface QuizDeepLink {
  lessonId: string;
  lessonTitle: string;
  courseId: string;
  chapterId: string;
  type: string;
}

export const QUIZ_DEEP_LINK_BASE = "/admin/quiz";

export function buildQuizDeepLink(input: QuizDeepLinkInput): string {
  const params = new URLSearchParams();
  params.set("lessonId", input.lessonId);
  if (input.lessonTitle) params.set("title", input.lessonTitle);
  if (input.courseId !== undefined && input.courseId !== null && `${input.courseId}` !== "") {
    params.set("courseId", String(input.courseId));
  }
  if (input.chapterId) params.set("chapterId", input.chapterId);
  params.set("type", input.type || "dpp");
  return `${QUIZ_DEEP_LINK_BASE}?${params.toString()}`;
}

/** Returns null when the URL carries no lesson to attach a quiz to. */
export function parseQuizDeepLink(search: string): QuizDeepLink | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const lessonId = params.get("lessonId");
  if (!lessonId) return null;
  return {
    lessonId,
    lessonTitle: params.get("title") || "",
    courseId: params.get("courseId") || "",
    chapterId: params.get("chapterId") || "",
    type: params.get("type") || "dpp",
  };
}

/** Existing quiz for this lesson, so the deep link edits instead of duplicating. */
export function findQuizForLesson<T extends { lesson_id?: string | null }>(
  quizzes: T[],
  lessonId: string,
): T | undefined {
  return quizzes.find((q) => q.lesson_id === lessonId);
}

/** Lesson types that get the "Quiz" shortcut in the admin content list. */
export function lessonSupportsQuiz(lectureType: string | null | undefined): boolean {
  const t = (lectureType || "").toUpperCase();
  return t === "DPP" || t === "DPP_ATTEMPT" || t === "TEST";
}
