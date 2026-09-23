/**
 * Keeps every cache layer behind the My Courses detail screen in step with a
 * lesson-completion write, so the state a student just confirmed survives a
 * reload or a back-navigation.
 *
 * Two layers feed that screen on mount:
 *   1. the React-Query entry `["my-course-detail", courseId, userId]`
 *      (staleTime 2 min — no refetch while fresh), and
 *   2. the synchronous localStorage bundle from `chapterBundleCache`, used as
 *      `initialData` with `initialDataUpdatedAt = cachedAt`.
 *
 * Until 2026-09-23 a "Mark as done" tap (MyCourseDetail) or an 80 %-watched
 * auto-complete (LessonView) only wrote `user_progress` and component state.
 * A reload inside the 2-minute window hydrated the pre-toggle snapshot, which
 * React-Query considered fresh, so the lesson showed as *not done* again until
 * the next background refetch. That is the bug behind the red
 * `lesson-completion › marking a lesson complete sticks across a reload` spec,
 * and exactly what students saw after pulling to refresh.
 *
 * `syncLessonCompletion` patches both layers from whichever one exists. It is
 * a pure cache write: no network, no invalidation (a refetch would replay five
 * queries for a state we already know), safe on the free-tier backend.
 */
import type { QueryClient } from "@tanstack/react-query";
import { readBundleSync, writeBundle, type CachedCourseBundle } from "./chapterBundleCache";

export const COURSE_DETAIL_KEY = "my-course-detail";

export function courseDetailQueryKey(courseId: string | number, userId: string | null | undefined) {
  return [COURSE_DETAIL_KEY, String(courseId), userId ?? null] as const;
}

export interface ChapterCountLike {
  id: string;
  completedLessons?: number;
}

export interface LessonChapterLike {
  id: string;
  chapterId?: string | null;
}

/**
 * Derives exact per-chapter completion counts from the source-of-truth set.
 * Prevents double-counting on re-entry, hot-reload, or concurrent updates.
 * `"__all__"` is the synthetic "All Content" chapter and counts every lesson.
 */
export function recomputeChapterCounts<T extends ChapterCountLike>(
  completedSet: Set<string>,
  allLessons: LessonChapterLike[],
  prevChapters: T[],
): T[] {
  return prevChapters.map((ch) => {
    if (ch.id === "__all__") {
      return { ...ch, completedLessons: allLessons.filter((l) => completedSet.has(l.id)).length };
    }
    const chLessons = allLessons.filter((l) => l.chapterId === ch.id);
    return { ...ch, completedLessons: chLessons.filter((l) => completedSet.has(l.id)).length };
  });
}

/** Loose view of the query data / bundle — only the fields this module touches. */
interface CourseDetailLike {
  lessons: LessonChapterLike[];
  chapters: ChapterCountLike[];
  allChapters: ChapterCountLike[];
  completedSet: Set<string> | string[] | Record<string, unknown> | null | undefined;
  lastWatched?: string | null;
  [extra: string]: unknown;
}

export function toCompletedSet(value: CourseDetailLike["completedSet"]): Set<string> {
  if (value instanceof Set) return new Set(value);
  if (Array.isArray(value)) return new Set(value);
  if (value && typeof value === "object") return new Set(Object.keys(value));
  return new Set();
}

export interface SyncResult {
  /** The completed-set both caches now hold. */
  completedSet: Set<string>;
  /** Which layers were patched; empty when no cached bundle existed yet. */
  patched: Array<"query" | "bundle">;
}

/**
 * Applies `lessonId` completed/not-completed to the cached course bundle.
 * Returns what was patched so callers (and tests) can reason about it.
 */
export function syncLessonCompletion(
  client: QueryClient,
  courseId: string | number,
  userId: string | null | undefined,
  lessonId: string,
  completed: boolean,
): SyncResult {
  const key = courseDetailQueryKey(courseId, userId);
  const cached = client.getQueryData<CourseDetailLike>(key);
  const bundle = cached ? null : readBundleSync(courseId);
  const base: CourseDetailLike | null = cached ?? (bundle as unknown as CourseDetailLike | null);
  if (!base || !Array.isArray(base.lessons)) {
    return { completedSet: new Set(), patched: [] };
  }

  const next = toCompletedSet(base.completedSet);
  if (completed) next.add(lessonId);
  else next.delete(lessonId);

  const updated: CourseDetailLike = {
    ...base,
    completedSet: next,
    chapters: recomputeChapterCounts(next, base.lessons, base.chapters ?? []),
    allChapters: recomputeChapterCounts(next, base.lessons, base.allChapters ?? []),
    lastWatched: completed ? lessonId : (base.lastWatched ?? null),
  };

  const patched: SyncResult["patched"] = [];
  if (cached) {
    client.setQueryData(key, updated);
    patched.push("query");
  }

  const { cachedAt: _dropped, ...rest } = updated as CourseDetailLike & { cachedAt?: number };
  void writeBundle(courseId, {
    ...(rest as unknown as Omit<CachedCourseBundle, "cachedAt" | "completedSet">),
    completedSet: Array.from(next),
  });
  patched.push("bundle");

  return { completedSet: next, patched };
}
