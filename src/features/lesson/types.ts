/**
 * Shared row shapes for the lesson surface.
 *
 * Extracted from `src/pages/LessonView.tsx` so sibling components and hooks
 * can reference the same contract without importing the 2.9k-line page.
 */
export interface Lesson {
  id: string;
  title: string;
  video_url: string;
  is_locked: boolean | null;
  description: string | null;
  overview: string | null;
  course_id: number | null;
  chapter_id: string | null;
  created_at: string | null;
  class_pdf_url: string | null;
  like_count: number | null;
  lecture_type: string | null;
  thumbnail_url: string | null;
  transcript_md?: string | null;
}

export interface Chapter {
  id: string;
  code: string;
  title: string;
  parent_id?: string | null;
}
