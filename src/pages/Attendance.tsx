import { useState, useEffect } from "react";
import Header from "../components/Layout/Header";
import { supabase } from "../integrations/supabase/client";
import Sidebar from "../components/Layout/Sidebar";
import StudentAttendanceRow from "../components/attendance/StudentAttendanceRow";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Button } from "../components/ui/button";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { logger } from "../lib/logger";
import { getErrorMessage } from "@/lib/errorMessage";

type AttendanceStatus = "present" | "absent" | "late";

interface StudentEnrolled {
  id: string; // user_id (uuid)
  name: string;
  rollNumber: string;
  grade: number;
  section: string;
}

const Attendance = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();

  const [courses, setCourses] = useState<{ id: number; title: string }[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");

  const [studentList, setStudentList] = useState<StudentEnrolled[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});

  // Load courses on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("courses").select("id, title");
      if (cancelled) return;
      setCourses(data || []);
      if (data && data.length > 0) setSelectedCourseId(String(data[0].id));
    })();
    return () => { cancelled = true; };
  }, []);

  // Fetch enrolled students for the selected course
  useEffect(() => {
    if (!selectedCourseId) return;
    fetchStudents();
  }, [selectedCourseId]);

  const fetchStudents = async () => {
    try {
      setLoading(true);
      setAttendance({});

      const { data, error } = await supabase
        .from("enrollments")
        .select("user_id")
        .eq("course_id", Number(selectedCourseId))
        .eq("status", "active");

      if (!error && data) {
        const userIds = Array.from(new Set(data.map((e) => e.user_id).filter(Boolean)));
        const profileMap = new Map<string, any>();
        if (userIds.length) {
          const { data: profs } = await supabase
            .from("profiles")
            .select("id, full_name, email")
            .in("id", userIds);
          (profs || []).forEach((p) => profileMap.set(p.id, p));
        }
        setStudentList(data.map((e, idx: number) => {
          const p = profileMap.get(e.user_id);
          return {
            id: e.user_id,
            name: p?.full_name || p?.email || "Unknown",
            rollNumber: String(idx + 1),
            grade: 0,
            section: "",
          };
        }));
      }
    } catch (error) {
      logger.error("Error fetching students", error);
      toast.error("Failed to load students");
    } finally {
      setLoading(false);
    }
  };

  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const handleStatusChange = (studentId: string | number, status: AttendanceStatus) => {
    setAttendance((prev) => ({ ...prev, [String(studentId)]: status }));
  };

  const handleSubmit = async () => {
    if (Object.keys(attendance).length !== studentList.length) {
      toast.error("Please mark attendance for all students");
      return;
    }

    setSubmitting(true);
    const dateStr = new Date().toISOString().split('T')[0];

    try {
      // attendance.student_id is bigint in the legacy schema. Derive a STABLE
      // numeric id from the student UUID so records don't get reassigned to
      // wrong students if the list reorders (HIGH severity fix).
      const uuidToBigint = (uuid: string): number => {
        let hash = 0;
        for (let i = 0; i < uuid.length; i++) {
          hash = ((hash << 5) - hash + uuid.charCodeAt(i)) | 0;
        }
        // Positive 31-bit int, well within bigint range
        return Math.abs(hash);
      };
      const records = studentList.map((student) => ({
        student_id: uuidToBigint(student.id),
        date: dateStr,
        status: attendance[student.id],
      }));

      const { error } = await supabase.from("attendance").insert(records);
      if (error) throw error;

      toast.success("Attendance submitted");
      navigate("/dashboard");
    } catch (error: unknown) {
      logger.error("Attendance submission error", error);
      toast.error("Failed to submit attendance");
    } finally {
      setSubmitting(false);
    }
  };

  const presentCount = Object.values(attendance).filter((s) => s === "present").length;
  const absentCount = Object.values(attendance).filter((s) => s === "absent").length;
  const lateCount = Object.values(attendance).filter((s) => s === "late").length;

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <Header onMenuClick={() => setSidebarOpen(true)} />

      <div className="bg-primary px-4 py-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")} className="text-primary-foreground hover:bg-primary-foreground/10">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold text-primary-foreground">Attendance</h1>
      </div>

      <main className="flex-1 flex flex-col">
        <div className="p-4 bg-card border-b border-border">
          <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
            <SelectTrigger className="bg-background border-border"><SelectValue placeholder="Select Course" /></SelectTrigger>
            <SelectContent>
              {courses.map((c) => (<SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>

        <div className="px-4 py-3 bg-muted/30 border-b border-border">
          <p className="text-sm text-muted-foreground">{today}</p>
          <div className="flex gap-4 mt-2 text-xs">
            <span className="text-green-600 font-medium">Present: {presentCount}</span>
            <span className="text-destructive font-medium">Absent: {absentCount}</span>
            <span className="text-orange-500 font-medium">Late: {lateCount}</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : studentList.length > 0 ? (
            studentList.map((student) => (
              <StudentAttendanceRow
                key={student.id}
                student={{ ...student, id: student.id as any }}
                status={attendance[student.id] || null}
                onStatusChange={(status) => handleStatusChange(student.id, status)}
              />
            ))
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                {selectedCourseId ? "No students enrolled in this course" : "Select a course to view students"}
              </p>
            </div>
          )}
        </div>

        {studentList.length > 0 && (
          <div className="p-4 bg-card border-t border-border">
            <Button onClick={handleSubmit} disabled={submitting} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground gap-2">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {submitting ? "Submitting..." : "Submit Attendance"}
            </Button>
          </div>
        )}
      </main>
    </div>
  );
};

export default Attendance;
