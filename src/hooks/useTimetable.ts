import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import { reportError } from "../lib/sentry";

export interface TimetableEntry {
  id: string;
  courseId: number | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room: string | null;
  teacherId: string | null;
  createdAt: string;
}

export interface TimetableEntryWithCourse extends TimetableEntry {
  course?: {
    title: string;
    grade: string | null;
  };
}

export interface TimetableInput {
  courseId: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room?: string;
  teacherId?: string;
}

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const TIMETABLE_KEY = ["timetable"] as const;

export const useTimetable = () => {
  const { user, isAdmin, isTeacher } = useAuth();
  const queryClient = useQueryClient();

  const timetableQuery = useQuery({
    queryKey: TIMETABLE_KEY,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<TimetableEntryWithCourse[]> => {
      const { data, error } = await supabase
        .from("timetable")
        .select("*, courses:course_id (title, grade)")
        .order("day_of_week", { ascending: true })
        .order("start_time", { ascending: true });

      if (error) throw error;

      return (data ?? []).map((t) => ({
        id: t.id,
        courseId: t.course_id,
        dayOfWeek: t.day_of_week,
        startTime: t.start_time,
        endTime: t.end_time,
        room: t.room,
        teacherId: t.teacher_id,
        createdAt: t.created_at,
        course: t.courses ? { title: t.courses.title, grade: t.courses.grade } : undefined,
      }));
    },
  });

  const timetable = timetableQuery.data ?? [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: TIMETABLE_KEY });

  const getTimetableByDay = useCallback(
    (dayOfWeek: number): TimetableEntryWithCourse[] =>
      timetable.filter((entry) => entry.dayOfWeek === dayOfWeek),
    [timetable]
  );

  const getTodaySchedule = useCallback(
    (): TimetableEntryWithCourse[] => getTimetableByDay(new Date().getDay()),
    [getTimetableByDay]
  );

  const createMutation = useMutation({
    mutationFn: async (input: TimetableInput) => {
      const { error } = await supabase.from("timetable").insert({
        course_id: input.courseId,
        day_of_week: input.dayOfWeek,
        start_time: input.startTime,
        end_time: input.endTime,
        room: input.room || null,
        teacher_id: input.teacherId || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Schedule added");
      invalidate();
    },
    onError: (err: unknown) => {
      reportError(err, { surface: "useTimetable.create" });
      toast.error("Schedule add nahi hua — dobara try karo");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: Partial<TimetableInput> }) => {
      const updateData: {
        course_id?: number;
        day_of_week?: number;
        start_time?: string;
        end_time?: string;
        room?: string | null;
        teacher_id?: string | null;
      } = {};
      if (input.courseId !== undefined) updateData.course_id = input.courseId;
      if (input.dayOfWeek !== undefined) updateData.day_of_week = input.dayOfWeek;
      if (input.startTime !== undefined) updateData.start_time = input.startTime;
      if (input.endTime !== undefined) updateData.end_time = input.endTime;
      if (input.room !== undefined) updateData.room = input.room || null;
      if (input.teacherId !== undefined) updateData.teacher_id = input.teacherId || null;

      const { error } = await supabase.from("timetable").update(updateData).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Schedule updated");
      invalidate();
    },
    onError: (err: unknown) => {
      reportError(err, { surface: "useTimetable.update" });
      toast.error("Update nahi hua — dobara try karo");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("timetable").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Schedule removed");
      invalidate();
    },
    onError: (err: unknown) => {
      reportError(err, { surface: "useTimetable.delete" });
      toast.error("Delete nahi hua — dobara try karo");
    },
  });

  const createEntry = useCallback(
    async (input: TimetableInput): Promise<boolean> => {
      if (!user || (!isAdmin && !isTeacher)) {
        toast.error("You don't have permission to modify timetable");
        return false;
      }
      try {
        await createMutation.mutateAsync(input);
        return true;
      } catch {
        return false;
      }
    },
    [user, isAdmin, isTeacher, createMutation]
  );

  const updateEntry = useCallback(
    async (id: string, input: Partial<TimetableInput>): Promise<boolean> => {
      try {
        await updateMutation.mutateAsync({ id, input });
        return true;
      } catch {
        return false;
      }
    },
    [updateMutation]
  );

  const deleteEntry = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        await deleteMutation.mutateAsync(id);
        return true;
      } catch {
        return false;
      }
    },
    [deleteMutation]
  );

  return {
    timetable,
    loading: timetableQuery.isLoading,
    error: timetableQuery.error ? (timetableQuery.error as Error).message : null,
    fetchTimetable: () => timetableQuery.refetch(),
    getTimetableByDay,
    getTodaySchedule,
    createEntry,
    updateEntry,
    deleteEntry,
    DAY_NAMES,
  };
};
