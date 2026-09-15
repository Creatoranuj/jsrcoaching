/**
 * Pure lesson-access and comment rules extracted from LessonView.tsx.
 * Same semantics as the inline versions — just testable in isolation.
 */
import type { Lesson } from "../types";

/** Locked lessons need a purchase; unlocked (preview) lessons are always open. */
export function canAccessLesson(
  lesson: Pick<Lesson, "is_locked">,
  hasPurchased: boolean,
): boolean {
  return !lesson.is_locked || hasPurchased;
}

/** Max size for an image attached to a lesson comment. */
export const MAX_COMMENT_IMAGE_BYTES = 5 * 1024 * 1024;
export const COMMENT_IMAGE_TOO_LARGE = "Image must be under 5MB";

export function checkCommentImage(
  file: { size: number },
): { ok: true; error?: never } | { ok: false; error: string } {
  if (file.size > MAX_COMMENT_IMAGE_BYTES) {
    return { ok: false, error: COMMENT_IMAGE_TOO_LARGE };
  }
  return { ok: true };
}

/**
 * Normalises a lesson row from the course bundle: the API may omit optional
 * fields, and the UI relies on `''`/`null` rather than `undefined`.
 */
export function normalizeLesson(row: any): Lesson {
  return {
    ...row,
    video_url: row.video_url || "",
    class_pdf_url: row.class_pdf_url || null,
    overview: row.overview || null,
    lecture_type: row.lecture_type || null,
  } as Lesson;
}

export function normalizeLessons(rows: unknown[] | null | undefined): Lesson[] {
  return (rows || []).map(normalizeLesson);
}
