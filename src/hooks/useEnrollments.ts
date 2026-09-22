import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import { resolveContentUrls } from "../lib/resolveContentUrl";
import type { Course } from "./useCourses";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/errorMessage";
import type { Tables } from "@/integrations/supabase/types";

type EnrollmentRow = Pick<Tables<"enrollments">, "id" | "user_id" | "course_id" | "purchased_at" | "status" | "progress_percentage"> & {
  courses: Tables<"courses"> | null;
};


export interface Enrollment {
  id: number;
  userId: string;
  courseId: number;
  purchasedAt: string | null;
  status: string | null;
  /** 0–100 from `enrollments.progress_percentage`; null until first computed. */
  progress_percentage: number | null;
}

export interface EnrollmentWithCourse extends Enrollment {
  course?: Course;
}

// PERF 2026-09-20: this hook is mounted by many screens at once and each
// instance used to run its own enrollments+courses select — 15,718 calls in a
// single window. One shared 60-second cache per user, with in-flight
// de-duplication, serves every mounted copy. Writes (enroll / cancel /
// payment reconcile) call `invalidateEnrollmentsCache()` so nothing goes stale
// for the student who just paid.
type CachedEnrollments = { rows: EnrollmentWithCourse[]; at: number };
const ENROLLMENTS_TTL_MS = 60_000;
let enrollmentsCache: { userId: string; data: CachedEnrollments } | null = null;
let enrollmentsInflight: { userId: string; promise: Promise<EnrollmentWithCourse[]> } | null = null;

export function invalidateEnrollmentsCache(): void {
  enrollmentsCache = null;
  enrollmentsInflight = null;
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

  // PERF (audit 2026-09-17): key off the stable user id so a token refresh
  // (new user object, same id) no longer re-runs the enrollments read.
  const userId = user?.id;
  const loadRows = useCallback(async (force: boolean): Promise<EnrollmentWithCourse[]> => {
    if (!userId) return [];
    if (force) invalidateEnrollmentsCache();

    const cached = enrollmentsCache;
    if (cached && cached.userId === userId && Date.now() - cached.data.at < ENROLLMENTS_TTL_MS) {
      return cached.data.rows;
    }
    if (enrollmentsInflight && enrollmentsInflight.userId === userId) {
      return enrollmentsInflight.promise;
    }

    const promise = (async () => {
      const { data, error: dbError } = await supabase
        .from("enrollments")
        .select("id,user_id,course_id,purchased_at,status,progress_percentage,courses(id,title,description,grade,price,image_url,thumbnail_url,created_at)")
        .eq("user_id", userId);

      if (dbError) throw dbError;

      // Audit 2026-09-20 (HIGH): this used to await TWO sequential signing
      // round-trips PER enrolment before the list could render. One batched,
      // time-capped call now covers the whole list, and a failure only means
      // the card keeps its stored URL / placeholder — never a stuck screen.
      const rows = (data || []) as EnrollmentRow[];
      let signed: Array<string | null> = [];
      try {
        signed = await resolveContentUrls(
          rows.flatMap((e) => [e.courses?.image_url ?? null, e.courses?.thumbnail_url ?? null]),
        );
      } catch {
        signed = [];
      }

      const formatted: EnrollmentWithCourse[] = rows.map((e, i) => ({
        id: e.id,
        userId: e.user_id,
        courseId: e.course_id,
        purchasedAt: e.purchased_at,
        status: e.status,
        progress_percentage: e.progress_percentage ?? null,
        course: e.courses ? {
          id: e.courses.id,
          title: e.courses.title,
          description: e.courses.description,
          grade: e.courses.grade,
          price: e.courses.price,
          imageUrl: signed[i * 2] ?? e.courses.image_url ?? undefined,
          thumbnailUrl: signed[i * 2 + 1] ?? e.courses.thumbnail_url ?? undefined,
          createdAt: e.courses.created_at,
        } : undefined,
      }));

      enrollmentsCache = { userId, data: { rows: formatted, at: Date.now() } };
      return formatted;
    })();

    enrollmentsInflight = { userId, promise };
    try {
      return await promise;
    } finally {
      if (enrollmentsInflight?.promise === promise) enrollmentsInflight = null;
    }
  }, [userId]);

  const fetchEnrollments = useCallback(async (force = true) => {
    if (!userId) {
      if (!aliveRef.current) return;
      setEnrollments([]);
      setEnrolledCourseIds([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const formatted = await loadRows(force);

      if (!aliveRef.current) return;
      setEnrollments(formatted);
      setEnrolledCourseIds(formatted.filter(e => e.status === 'active').map((e) => e.courseId));

    } catch (err: unknown) {
      logger.error("Error fetching enrollments:", err);
      if (aliveRef.current) setError(getErrorMessage(err));
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, [userId, loadRows]);

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
        } else if (code === "BATCH_CLOSED") {
          toast.error("Yeh batch abhi full hai. Nayi seats khulne par enrollment shuru ho jayega.");
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
    void fetchEnrollments(false); // shared 60s cache — no duplicate reads per mount
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
