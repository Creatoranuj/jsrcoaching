import { useState, useEffect, useCallback } from "react";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { getCached, setCached, invalidateCache, TTL } from "@/lib/ttlCache";
import { getErrorMessage } from "@/lib/errorMessage";

const cacheKey = (courseId?: number) => `lessons:course:${courseId ?? "none"}:v2`;

export interface Lesson {
  id: string;
  courseId: number | null;
  title: string;
  description: string | null;
  videoUrl: string;
  isLocked: boolean;
  duration: number;
  createdAt: string | null;
  lectureType: string | null;
  position: number | null;
  chapterId: string | null;
}

export interface LessonWithCourse extends Lesson {
  course?: {
    title: string;
    grade: string | null;
  };
}

export interface LessonInput {
  courseId: number;
  title: string;
  description?: string;
  videoUrl: string;
  isLocked?: boolean;
  duration?: number;
  lectureType?: string;
  chapterId?: string;
  position?: number;
}

function mapLesson(l: any): LessonWithCourse {
  return {
    id: l.id,
    courseId: l.course_id ?? null,
    title: l.title,
    description: l.description ?? null,
    videoUrl: l.video_url ?? "",
    isLocked: l.is_locked ?? false,
    duration: l.duration ?? 0,
    createdAt: l.created_at ?? null,
    lectureType: l.lecture_type ?? "VIDEO",
    position: l.position ?? 0,
    chapterId: l.chapter_id ?? null,
    course: l.courses ? { title: l.courses.title, grade: l.courses.grade } : undefined,
  };
}

export const useLessons = (courseId?: number) => {
  const { user, isAdmin, isTeacher } = useAuth();
  const initialCached = getCached<LessonWithCourse[]>(cacheKey(courseId), TTL.medium);
  const [lessons, setLessons] = useState<LessonWithCourse[]>(initialCached ?? []);
  const [loading, setLoading] = useState(!initialCached);
  const [error, setError] = useState<string | null>(null);

  const fetchLessons = useCallback(async (force = false) => {
    try {
      setError(null);

      if (!courseId) { setLessons([]); setLoading(false); return; }

      if (!force) {
        const fresh = getCached<LessonWithCourse[]>(cacheKey(courseId), TTL.medium);
        if (fresh) {
          setLessons(fresh);
          setLoading(false);
          return;
        }
      }

      setLoading(true);
      // Bandwidth: trim lessons.* — #4 slow_queries offender. Listing view
      // only needs card fields; detail view fetches full row via fetchLessonById.
      const { data, error: dbError } = await supabase
        .from("lessons")
        .select("id, course_id, title, description, video_url, is_locked, duration, created_at, lecture_type, position, chapter_id, courses:course_id (title, grade)")
        .eq("course_id", courseId)
        .order("position", { ascending: true })
        .limit(200); // Bandwidth cap — no course expected >200 lessons; prevents runaway payload.

      if (dbError) throw dbError;
      const mapped = (data || []).map(mapLesson);
      setLessons(mapped);
      setCached(cacheKey(courseId), mapped);
    } catch (err: unknown) {
      logger.error("Error fetching lessons:", err);
      setError(getErrorMessage(err));
      toast.error("Lessons load nahi hue — refresh karo");
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  const fetchLessonById = useCallback(async (id: string): Promise<LessonWithCourse | null> => {
    try {
      const { data, error: dbError } = await supabase
        .from("lessons")
        .select("*, courses:course_id (title, grade)")
        .eq("id", id)
        .single();

      if (dbError || !data) return null;
      return mapLesson(data);
    } catch (err: unknown) {
      logger.error("Error fetching lesson:", err);
      toast.error("Lesson load nahi hui — refresh karo");
      return null;
    }
  }, []);

  const createLesson = useCallback(async (input: LessonInput): Promise<Lesson | null> => {
    if (!user || (!isAdmin && !isTeacher)) {
      toast.error("You don't have permission to create lessons");
      return null;
    }

    try {
      const { data, error: dbError } = await supabase
        .from("lessons")
        .insert({
          course_id: input.courseId,
          title: input.title,
          description: input.description || null,
          video_url: input.videoUrl,
          is_locked: input.isLocked ?? false,
          duration: input.duration ?? 0,
          lecture_type: input.lectureType ?? "VIDEO",
          chapter_id: input.chapterId || null,
          position: input.position ?? 0,
        })
        .select()
        .single();

      if (dbError) throw dbError;
      toast.success("Lesson created");
      invalidateCache(cacheKey(courseId)); await fetchLessons(true);
      return mapLesson(data);
    } catch (err: unknown) {
      logger.error("Error creating lesson:", err);
      toast.error("Lesson create nahi hui — dobara try karo");
      return null;
    }
  }, [user, isAdmin, isTeacher, fetchLessons]);

  const updateLesson = useCallback(async (id: string, input: Partial<LessonInput>): Promise<boolean> => {
    if (!user || (!isAdmin && !isTeacher)) {
      toast.error("You don't have permission to update lessons");
      return false;
    }

    try {
      const updateData: any = {};
      if (input.courseId !== undefined) updateData.course_id = input.courseId;
      if (input.title !== undefined) updateData.title = input.title;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.videoUrl !== undefined) updateData.video_url = input.videoUrl;
      if (input.isLocked !== undefined) updateData.is_locked = input.isLocked;
      if (input.duration !== undefined) updateData.duration = input.duration;
      if (input.lectureType !== undefined) updateData.lecture_type = input.lectureType;
      if (input.chapterId !== undefined) updateData.chapter_id = input.chapterId;
      if (input.position !== undefined) updateData.position = input.position;

      const { error: dbError } = await supabase
        .from("lessons")
        .update(updateData)
        .eq("id", id);

      if (dbError) throw dbError;
      toast.success("Lesson updated");
      invalidateCache(cacheKey(courseId)); await fetchLessons(true);
      return true;
    } catch (err: unknown) {
      logger.error("Error updating lesson:", err);
      toast.error("Lesson update nahi hui — dobara try karo");
      return false;
    }
  }, [user, isAdmin, isTeacher, fetchLessons]);

  const deleteLesson = useCallback(async (id: string): Promise<boolean> => {
    if (!user || (!isAdmin && !isTeacher)) {
      toast.error("You don't have permission to delete lessons");
      return false;
    }

    try {
      const { error: dbError } = await supabase
        .from("lessons")
        .delete()
        .eq("id", id);

      if (dbError) throw dbError;
      toast.success("Lesson deleted");
      invalidateCache(cacheKey(courseId)); await fetchLessons(true);
      return true;
    } catch (err: unknown) {
      logger.error("Error deleting lesson:", err);
      toast.error("Delete nahi hua — dobara try karo");
      return false;
    }
  }, [user, isAdmin, isTeacher, fetchLessons]);

  useEffect(() => {
    fetchLessons();
  }, [fetchLessons]);

  return {
    lessons,
    loading,
    error,
    fetchLessons,
    fetchLessonById,
    createLesson,
    updateLesson,
    deleteLesson,
  };
};
