import { useState, useEffect, useCallback } from "react";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../contexts/AuthContext";
import { reportError } from "../lib/sentry";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/errorMessage";

export interface LectureSchedule {
  id: string;
  courseId: number | null;
  chapterId: string | null;
  title: string;
  description: string | null;
  scheduledDate: string;
  scheduledTime: string;
  durationMinutes: number | null;
  meetingLink: string | null;
  createdBy: string | null;
  createdAt: string;
  courseName?: string;
}

export interface LectureScheduleInput {
  courseId?: number;
  chapterId?: string;
  title: string;
  description?: string;
  scheduledDate: string;
  scheduledTime: string;
  durationMinutes?: number;
  meetingLink?: string;
}

export const useLectureSchedules = () => {
  const { user, isAdmin, isTeacher } = useAuth();
  const [schedules, setSchedules] = useState<LectureSchedule[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSchedules = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("lecture_schedules")
        .select("*, courses(title)")
        .order("scheduled_date", { ascending: true })
        .order("scheduled_time", { ascending: true });

      if (error) throw error;

      setSchedules(
        (data || []).map((s) => ({
          id: s.id,
          courseId: s.course_id,
          chapterId: s.chapter_id,
          title: s.title,
          description: s.description,
          scheduledDate: s.scheduled_date,
          scheduledTime: s.scheduled_time,
          durationMinutes: s.duration_minutes,
          meetingLink: s.meeting_link,
          createdBy: s.created_by,
          createdAt: s.created_at,
          courseName: s.courses?.title || null,
        }))
      );
    } catch (err: unknown) {
      reportError(err, { surface: "useLectureSchedules.fetch" });
    } finally {
      setLoading(false);
    }
  }, []);

  const createSchedule = useCallback(async (input: LectureScheduleInput): Promise<boolean> => {
    if (!user || (!isAdmin && !isTeacher)) {
      toast.error("Permission denied");
      return false;
    }
    try {
      const { error } = await supabase.from("lecture_schedules").insert({
        title: input.title,
        description: input.description || null,
        course_id: input.courseId || null,
        chapter_id: input.chapterId || null,
        scheduled_date: input.scheduledDate,
        scheduled_time: input.scheduledTime,
        duration_minutes: input.durationMinutes || 60,
        meeting_link: input.meetingLink || null,
        created_by: user.id,
      });
      if (error) throw error;
      toast.success("Schedule created!");
      await fetchSchedules();
      return true;
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || "Failed to create schedule");
      return false;
    }
  }, [user, isAdmin, isTeacher, fetchSchedules]);

  const updateSchedule = useCallback(async (id: string, input: LectureScheduleInput): Promise<boolean> => {
    if (!user || (!isAdmin && !isTeacher)) {
      toast.error("Permission denied");
      return false;
    }
    try {
      const { error } = await supabase.from("lecture_schedules").update({
        title: input.title,
        description: input.description || null,
        course_id: input.courseId || null,
        chapter_id: input.chapterId || null,
        scheduled_date: input.scheduledDate,
        scheduled_time: input.scheduledTime,
        duration_minutes: input.durationMinutes || 60,
        meeting_link: input.meetingLink || null,
      }).eq("id", id);
      if (error) throw error;
      toast.success("Schedule updated!");
      await fetchSchedules();
      return true;
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || "Failed to update schedule");
      return false;
    }
  }, [user, isAdmin, isTeacher, fetchSchedules]);

  const deleteSchedule = useCallback(async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase.from("lecture_schedules").delete().eq("id", id);
      if (error) throw error;
      toast.success("Schedule deleted");
      await fetchSchedules();
      return true;
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || "Failed to delete");
      return false;
    }
  }, [fetchSchedules]);

  const upcomingSchedules = schedules.filter(
    s => new Date(`${s.scheduledDate}T${s.scheduledTime}`) >= new Date()
  );

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  return {
    schedules,
    upcomingSchedules,
    loading,
    fetchSchedules,
    createSchedule,
    updateSchedule,
    deleteSchedule,
  };
};
