import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/errorMessage";

export interface Attendance {
  id: number;
  studentId: number;
  date: string;
  status: string;
  createdAt: string;
}

export interface AttendanceInput {
  studentId: number;
  date: string;
  status: 'present' | 'absent' | 'late';
}

export const useAttendance = (date?: string) => {
  const { isAdmin, isTeacher } = useAuth();
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // RELY-cleanup: guard state updates after unmount (rural-network late responses).
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);

  const fetchAttendance = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      let query = supabase
        .from("attendance")
        .select("id,student_id,date,status,created_at")
        .order("created_at", { ascending: false })
        .limit(500);

      if (date) {
        query = query.eq("date", date);
      }

      const { data, error: dbError } = await query;
      if (dbError) throw dbError;

      const formatted: Attendance[] = (data || []).map((a) => ({
        id: a.id,
        studentId: a.student_id,
        date: a.date,
        status: a.status,
        createdAt: a.created_at,
      }));

      if (aliveRef.current) setAttendance(formatted);
    } catch (err: unknown) {
      logger.error("Error fetching attendance:", err);
      if (aliveRef.current) setError(getErrorMessage(err));
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, [date]);

  const fetchAttendanceByStudent = useCallback(async (studentId: number): Promise<Attendance[]> => {
    try {
      const { data, error: dbError } = await supabase
        .from("attendance")
        .select("*")
        .eq("student_id", studentId)
        .order("date", { ascending: false });

      if (dbError) throw dbError;

      return (data || []).map((a) => ({
        id: a.id,
        studentId: a.student_id,
        date: a.date,
        status: a.status,
        createdAt: a.created_at,
      }));
    } catch (err: unknown) {
      logger.error("Error fetching student attendance:", err);
      return [];
    }
  }, []);

  const markAttendance = useCallback(async (input: AttendanceInput): Promise<boolean> => {
    if (!isAdmin && !isTeacher) {
      toast.error("Permission denied");
      return false;
    }

    try {
      const { error: dbError } = await supabase.from("attendance").insert({
        student_id: input.studentId,
        date: input.date,
        status: input.status,
      });

      if (dbError) throw dbError;

      toast.success("Attendance marked");
      await fetchAttendance();
      return true;
    } catch (err: unknown) {
      logger.error("Error marking attendance:", err);
      toast.error("Attendance save nahi hui — dobara try karo");
      return false;
    }
  }, [isAdmin, isTeacher, fetchAttendance]);

  const bulkMarkAttendance = useCallback(async (records: AttendanceInput[]): Promise<boolean> => {
    if (!isAdmin && !isTeacher) {
      toast.error("Permission denied");
      return false;
    }

    try {
      const insertData = records.map(r => ({
        student_id: r.studentId,
        date: r.date,
        status: r.status,
      }));

      const { error: dbError } = await supabase.from("attendance").insert(insertData);
      if (dbError) throw dbError;

      toast.success("Attendance saved");
      await fetchAttendance();
      return true;
    } catch (err: unknown) {
      logger.error("Error in bulk attendance:", err);
      toast.error("Kuch records save nahi hue — dobara try karo");
      return false;
    }
  }, [isAdmin, isTeacher, fetchAttendance]);

  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  return {
    attendance,
    loading,
    error,
    fetchAttendance,
    fetchAttendanceByStudent,
    markAttendance,
    bulkMarkAttendance,
  };
};
