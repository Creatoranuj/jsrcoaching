import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import { resolveContentUrl } from "../lib/resolveContentUrl";
import type { Course } from "./useCourses";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/errorMessage";


export interface Enrollment {
  id: number;
  userId: string;
  courseId: number;
  purchasedAt: string | null;
  status: string | null;
}

export interface EnrollmentWithCourse extends Enrollment {
  course?: Course;
}

export const useEnrollments = () => {
  const { user } = useAuth();
  const [enrollments, setEnrollments] = useState<EnrollmentWithCourse[]>([]);
  const [enrolledCourseIds, setEnrolledCourseIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // RELY-cleanup: prevent setState after unmount on slow networks.
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);

  const fetchEnrollments = useCallback(async () => {
    if (!user) {
      if (!aliveRef.current) return;
      setEnrollments([]);
      setEnrolledCourseIds([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: dbError } = await supabase
        .from("enrollments")
        .select("id,user_id,course_id,purchased_at,status,courses(id,title,description,grade,price,image_url,thumbnail_url,created_at)")
        .eq("user_id", user.id);

      if (dbError) throw dbError;

      // Audit F4: use allSettled so one bad signed-URL doesn't nuke the
      // whole enrollments list. Fall back to the raw stored URL on failure.
      const safeResolve = async (u: string | null | undefined) => {
        if (!u) return u ?? undefined;
        try { return await resolveContentUrl(u); } catch { return null; }
      };
      const settled = await Promise.allSettled(
        (data || []).map(async (e: any): Promise<EnrollmentWithCourse> => ({
          id: e.id,
          userId: e.user_id,
          courseId: e.course_id,
          purchasedAt: e.purchased_at,
          status: e.status,
          course: e.courses ? {
            id: e.courses.id,
            title: e.courses.title,
            description: e.courses.description,
            grade: e.courses.grade,
            price: e.courses.price,
            imageUrl: await safeResolve(e.courses.image_url),
            thumbnailUrl: await safeResolve(e.courses.thumbnail_url),
            createdAt: e.courses.created_at,
          } : undefined,
        }))
      );
      const formatted: EnrollmentWithCourse[] = settled
        .filter((r): r is PromiseFulfilledResult<EnrollmentWithCourse> => r.status === "fulfilled")
        .map((r) => r.value);

      if (!aliveRef.current) return;
      setEnrollments(formatted);
      setEnrolledCourseIds(formatted.filter(e => e.status === 'active').map((e) => e.courseId));

    } catch (err: unknown) {
      logger.error("Error fetching enrollments:", err);
      if (aliveRef.current) setError(getErrorMessage(err));
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, [user]);

  const isEnrolled = useCallback((courseId: number): boolean => {
    return enrolledCourseIds.includes(courseId);
  }, [enrolledCourseIds]);

  const checkEnrollment = useCallback(async (courseId: number): Promise<boolean> => {
    if (!user) return false;

    try {
      const { data } = await supabase
        .from("enrollments")
        .select("id, status")
        .eq("user_id", user.id)
        .eq("course_id", courseId)
        .eq("status", "active")
        .maybeSingle();

      return !!data;
    } catch (err: unknown) {
      logger.error("Error checking enrollment:", err);
      return false;
    }
  }, [user]);

  const enrollInCourse = useCallback(async (courseId: number): Promise<boolean> => {
    if (!user) {
      toast.error("Please login to enroll");
      return false;
    }

    try {
      // Server-authoritative: `self-enroll-free` re-checks the price ceiling,
      // rate-limits per user, and idempotently upserts the enrollment with
      // service-role privileges. Client no longer trusts its own price check.
      const { data, error } = await supabase.functions.invoke("self-enroll-free", {
        body: { course_id: courseId },
      });

      if (error) {
        // Edge Function returns 402/403/404/429 with a structured `error` code.
        const ctx = (error as { context?: { error?: string } })?.context?.error;
        const code = ctx || (data as { error?: string } | null)?.error;
        if (code === "PAID_COURSE") {
          toast.error("This is a paid course. Please complete payment to enroll.");
        } else if (code === "COURSE_NOT_FOUND") {
          toast.error("Course not found");
        } else if (code === "COURSE_INACTIVE") {
          toast.error("This course is not currently open for enrollment.");
        } else if (/Too many requests/i.test(error.message)) {
          toast.error("Too many enroll attempts. Please wait a few minutes.");
        } else {
          toast.error(error.message || "Failed to enroll");
        }
        return false;
      }

      const payload = data as { enrolled?: boolean; already?: boolean } | null;
      if (!payload?.enrolled) {
        toast.error("Failed to enroll");
        return false;
      }
      if (payload.already) {
        toast.info("You are already enrolled in this course", { id: "already-enrolled" });
      } else {
        toast.success("Successfully enrolled in course!");
      }
      await fetchEnrollments();
      return true;
    } catch (err: unknown) {
      logger.error("Error enrolling in course:", err);
      toast.error(getErrorMessage(err) || "Failed to enroll");
      return false;
    }
  }, [user, fetchEnrollments]);

  const cancelEnrollment = useCallback(async (enrollmentId: number): Promise<boolean> => {
    if (!user) {
      toast.error("Not authenticated");
      return false;
    }
    try {
      const { error: dbError } = await supabase
        .from("enrollments")
        .update({ status: 'cancelled' })
        .eq("id", enrollmentId)
        .eq("user_id", user.id); // defence-in-depth: RLS + client filter

      if (dbError) throw dbError;

      toast.success("Enrollment cancelled");
      await fetchEnrollments();
      return true;
    } catch (err: unknown) {
      logger.error("Error cancelling enrollment:", err);
      toast.error(getErrorMessage(err) || "Failed to cancel enrollment");
      return false;
    }
  }, [user, fetchEnrollments]);

  const getEnrolledCourses = useCallback((): Course[] => {
    return enrollments
      .filter((e) => e.course)
      .map((e) => e.course!);
  }, [enrollments]);

  useEffect(() => {
    fetchEnrollments();
  }, [fetchEnrollments]);

  return {
    enrollments,
    enrolledCourseIds,
    loading,
    error,
    fetchEnrollments,
    isEnrolled,
    checkEnrollment,
    enrollInCourse,
    cancelEnrollment,
    getEnrolledCourses,
  };
};
