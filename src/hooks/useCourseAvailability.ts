/**
 * useCourseAvailability
 * =====================
 * Reads the admin "Batch Full" switch and optional seat limit for one course.
 *
 * This is a DISPLAY gate only — it decides whether the Buy button is shown.
 * The authoritative check lives in the `complete_paid_enrollment()` database
 * function, which refuses the enrollment inside the same row lock that creates
 * it. Never rely on this hook alone to keep a batch closed.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

export interface CourseAvailability {
  enrollmentOpen: boolean;
  seatLimit: number | null;
  seatsTaken: number;
  isFull: boolean;
}

/** Fail OPEN: if the check itself errors we keep selling rather than blocking. */
const OPEN: CourseAvailability = {
  enrollmentOpen: true,
  seatLimit: null,
  seatsTaken: 0,
  isFull: false,
};

export const useCourseAvailability = (courseId: number | string | null | undefined) => {
  const [availability, setAvailability] = useState<CourseAvailability>(OPEN);
  const [loading, setLoading] = useState(true);

  const id = courseId == null || courseId === "" ? null : Number(courseId);

  const refresh = useCallback(async () => {
    if (id == null || Number.isNaN(id)) {
      setAvailability(OPEN);
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .rpc("course_availability", { _course_id: id })
        .maybeSingle();
      if (error) throw error;

      if (data) {
        const row = data as {
          enrollment_open: boolean;
          seat_limit: number | null;
          seats_taken: number;
          is_full: boolean;
        };
        setAvailability({
          enrollmentOpen: row.enrollment_open,
          seatLimit: row.seat_limit,
          seatsTaken: row.seats_taken ?? 0,
          isFull: row.is_full,
        });
      } else {
        setAvailability(OPEN);
      }
    } catch (err) {
      logger.error("course_availability failed:", err);
      setAvailability(OPEN);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  return { ...availability, loading, refresh };
};
