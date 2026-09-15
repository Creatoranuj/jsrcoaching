import { useState, useEffect, useCallback } from "react";
import { supabase } from "../integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import coursePlaceholder from "../assets/thumbnails/course-default.svg";
import { resolveContentUrl, resolveContentUrls } from "../lib/resolveContentUrl";
import { logger } from "@/lib/logger";
import { getCached, setCached, invalidateCache, TTL } from "@/lib/ttlCache";
import { getErrorMessage } from "@/lib/errorMessage";

const CACHE_KEY = "courses:list:v2";


export interface Course {
  id: number;
  title: string;
  description: string | null;
  grade: string | null;
  price: number | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  createdAt: string | null;
}

export interface CourseInput {
  title: string;
  description?: string;
  grade?: string;
  price?: number;
  imageUrl?: string;
  thumbnailUrl?: string;
}

function mapCourse(c: any): Course {
  return {
    id: c.id,
    title: c.title,
    description: c.description,
    grade: c.grade,
    price: c.price,
    imageUrl: c.image_url,
    thumbnailUrl: c.thumbnail_url,
    createdAt: c.created_at,
  };
}

export const useCourses = () => {
  const cached = getCached<Course[]>(CACHE_KEY, TTL.medium);
  const [courses, setCourses] = useState<Course[]>(cached ?? []);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);

  const fetchCourses = useCallback(async (force = false) => {
    try {
      if (!force) {
        const fresh = getCached<Course[]>(CACHE_KEY, TTL.medium);
        if (fresh) {
          setCourses(fresh);
          setLoading(false);
          return;
        }
      }
      setLoading(true);
      setError(null);

      const { data, error: dbError } = await supabase
        .from("courses")
        .select("id,title,description,grade,price,image_url,thumbnail_url,created_at")
        .order("created_at", { ascending: false })
        .limit(60); // Bandwidth cap — landing/list surface never renders more than ~60 cards.

      if (dbError) throw dbError;
      const mapped = (data || []).map(mapCourse);
      // Resolve legacy `/object/public/content/...` URLs to signed URLs
      // (bucket is now private). Batched into ONE storage round-trip instead
      // of 2N sequential ones. Best-effort; falls back to placeholder.
      const signed = await resolveContentUrls(
        mapped.flatMap((c) => [c.imageUrl, c.thumbnailUrl])
      );
      const resolved = mapped.map((c, i) => ({
        ...c,
        imageUrl: signed[i * 2],
        thumbnailUrl: signed[i * 2 + 1],
      }));
      setCourses(resolved);
      setCached(CACHE_KEY, resolved);

    } catch (err: unknown) {
      logger.error("Error fetching courses:", err);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCourseById = useCallback(async (id: number): Promise<Course | null> => {
    try {
      const { data, error: dbError } = await supabase
        .from("courses")
        .select("id,title,description,grade,price,image_url,thumbnail_url,created_at")
        .eq("id", id)
        .single();

      if (dbError || !data) return null;
      const c = mapCourse(data);
      return {
        ...c,
        imageUrl: await resolveContentUrl(c.imageUrl),
        thumbnailUrl: await resolveContentUrl(c.thumbnailUrl),
      };

    } catch (err: unknown) {
      logger.error("Error fetching course:", err);
      toast.error("Failed to fetch course");
      return null;
    }
  }, []);

  const fetchCoursesByGrade = useCallback(async (grade: string): Promise<Course[]> => {
    try {
      const { data, error: dbError } = await supabase
        .from("courses")
        .select("id,title,description,grade,price,image_url,thumbnail_url,created_at")
        .eq("grade", grade)
        .order("created_at", { ascending: false });

      if (dbError) throw dbError;
      return (data || []).map(mapCourse);
    } catch (err: unknown) {
      logger.error("Error fetching courses by grade:", err);
      return [];
    }
  }, []);

  const createCourse = useCallback(async (input: CourseInput): Promise<Course | null> => {
    try {
      const { data, error: dbError } = await supabase
        .from("courses")
        .insert({
          title: input.title,
          description: input.description || null,
          grade: input.grade || null,
          price: input.price || 0,
          image_url: input.imageUrl || coursePlaceholder,
          thumbnail_url: input.thumbnailUrl || null,
        })
        .select()
        .single();

      if (dbError) throw dbError;
      toast.success("Course created");
      invalidateCache(CACHE_KEY); await fetchCourses(true);
      return mapCourse(data);
    } catch (err: unknown) {
      logger.error("Error creating course:", err);
      toast.error(getErrorMessage(err) || "Failed to create course");
      return null;
    }
  }, [fetchCourses]);

  const updateCourse = useCallback(async (id: number, input: Partial<CourseInput>): Promise<boolean> => {
    try {
      const updateData: any = {};
      if (input.title !== undefined) updateData.title = input.title;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.grade !== undefined) updateData.grade = input.grade;
      if (input.price !== undefined) updateData.price = input.price;
      if (input.imageUrl !== undefined) updateData.image_url = input.imageUrl;
      if (input.thumbnailUrl !== undefined) updateData.thumbnail_url = input.thumbnailUrl;

      const { error: dbError } = await supabase
        .from("courses")
        .update(updateData)
        .eq("id", id);

      if (dbError) throw dbError;
      toast.success("Course updated");
      invalidateCache(CACHE_KEY); await fetchCourses(true);
      return true;
    } catch (err: unknown) {
      logger.error("Error updating course:", err);
      toast.error(getErrorMessage(err) || "Failed to update course");
      return false;
    }
  }, [fetchCourses]);

  const deleteCourse = useCallback(async (id: number): Promise<boolean> => {
    try {
      const { error: dbError } = await supabase
        .from("courses")
        .delete()
        .eq("id", id);

      if (dbError) throw dbError;
      toast.success("Course deleted");
      invalidateCache(CACHE_KEY); await fetchCourses(true);
      return true;
    } catch (err: unknown) {
      logger.error("Error deleting course:", err);
      toast.error(getErrorMessage(err) || "Failed to delete course");
      return false;
    }
  }, [fetchCourses]);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  return {
    courses,
    loading,
    error,
    fetchCourses,
    fetchCourseById,
    fetchCoursesByGrade,
    createCourse,
    updateCourse,
    deleteCourse,
  };
};
