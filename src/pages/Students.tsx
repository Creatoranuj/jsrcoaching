import { useState, useEffect } from "react";
import Header from "../components/Layout/Header";
import { supabase } from "../integrations/supabase/client";
import Sidebar from "../components/Layout/Sidebar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Button } from "../components/ui/button";
import { ArrowLeft, Search, User } from "lucide-react";
import ListCardSkeleton from "../components/ui/skeletons/ListCardSkeleton";
import { useNavigate } from "react-router-dom";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { List, type RowComponentProps } from "react-window";
import { logger } from "../lib/logger";

interface StudentProfile {
  id: string;
  fullName: string | null;
  email: string | null;
  mobile: string | null;
  courseTitles: string[];
}

const Students = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCourse, setSelectedCourse] = useState("all");
  const [studentsData, setStudentsData] = useState<StudentProfile[]>([]);
  const [courses, setCourses] = useState<{ id: number; title: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch courses for filter
      const { data: coursesData } = await supabase.from("courses").select("id, title");
      setCourses(coursesData || []);

      // No FK between enrollments.user_id and profiles.id, so PostgREST cannot
      // embed profiles. Fetch both sides and join in JS.
      const { data: enrollments, error } = await supabase
        .from("enrollments")
        .select("user_id, course_id, courses(title)")
        .eq("status", "active");

      if (error) {
        logger.error("Error fetching students", error);
        setStudentsData([]);
        return;
      }

      const userIds = Array.from(new Set((enrollments || []).map((e) => e.user_id).filter(Boolean)));
      let profileMap = new Map<string, any>();
      if (userIds.length) {
        const { data: profs, error: profErr } = await supabase
          .from("profiles")
          .select("id, full_name, email, mobile")
          .in("id", userIds);
        if (profErr) logger.error("Error fetching students", profErr);
        profileMap = new Map((profs || []).map((p) => [p.id, p]));
      }

      // Group by user
      const userMap = new Map<string, StudentProfile>();
      for (const e of (enrollments || [])) {
        const userId = (e as any).user_id as string;
        if (!userId) continue;
        const p = profileMap.get(userId);
        if (!userMap.has(userId)) {
          userMap.set(userId, {
            id: userId,
            fullName: p?.full_name ?? null,
            email: p?.email ?? null,
            mobile: p?.mobile ?? null,
            courseTitles: [],
          });
        }
        const courseTitle = (e.courses as any)?.title;
        if (courseTitle) userMap.get(userId)!.courseTitles.push(courseTitle);
      }

      setStudentsData(Array.from(userMap.values()));
    } catch (error) {
      logger.error("Error fetching students", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredStudents = studentsData.filter((student) => {
    const matchesCourse = selectedCourse === "all" || student.courseTitles.some(t => 
      courses.find(c => String(c.id) === selectedCourse)?.title === t
    );
    const matchesSearch =
      (student.fullName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (student.email || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (student.mobile || "").includes(searchQuery);
    return matchesCourse && matchesSearch;
  });

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <Header onMenuClick={() => setSidebarOpen(true)} />

      <div className="bg-primary px-4 py-4 flex items-center gap-3">
        <Button aria-label="Back to dashboard" variant="ghost" size="icon" onClick={() => navigate("/dashboard")} className="text-primary-foreground hover:bg-primary-foreground/10">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold text-primary-foreground">Students</h1>
      </div>

      <main className="flex-1 flex flex-col">
        <div className="p-4 bg-card border-b border-border space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by name, email, or phone..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10 bg-background border-border" />
          </div>
          <Select value={selectedCourse} onValueChange={setSelectedCourse}>
            <SelectTrigger className="bg-background border-border"><SelectValue placeholder="All Courses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Courses</SelectItem>
              {courses.map((c) => (<SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>

        <div className="px-4 py-2 bg-muted/30 border-b border-border">
          <p className="text-sm text-muted-foreground">{loading ? "Loading..." : `${filteredStudents.length} enrolled students found`}</p>
        </div>

        <div className="flex-1 overflow-hidden p-4">
          {loading && (
            <ListCardSkeleton rows={6} rowHeight={92} showAvatar lines={2} label="Loading students" />
          )}

          {!loading && filteredStudents.length === 0 && (
            <div className="text-center py-12"><p className="text-muted-foreground">No students found.</p></div>
          )}

          {!loading && filteredStudents.length > 0 && (
            <List
              rowCount={filteredStudents.length}
              rowHeight={92}
              rowComponent={StudentRow}
              rowProps={{ students: filteredStudents }}
              style={{ height: "100%" }}
              overscanCount={4}
            />
          )}
        </div>
      </main>
    </div>
  );
};

type StudentRowProps = { students: StudentProfile[] };

const StudentRow = ({ index, style, students }: RowComponentProps<StudentRowProps>) => {
  const student = students[index];
  if (!student) return null;
  return (
    <div style={style} className="pb-3">
      <div className="flex items-center gap-4 p-4 bg-card rounded-xl border border-border transition-all hover:border-primary/30 hover:shadow-md">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
          <User className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground">{student.fullName || "Unnamed"}</h3>
          <p className="text-sm text-muted-foreground truncate">{student.email || student.mobile || "—"}</p>
          <div className="flex gap-1 mt-1 flex-wrap">
            {student.courseTitles.slice(0, 2).map((t, i) => (
              <Badge key={`${t}-${i}`} variant="secondary" className="text-[10px]">{t}</Badge>
            ))}
            {student.courseTitles.length > 2 && (
              <Badge variant="outline" className="text-[10px]">+{student.courseTitles.length - 2}</Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Students;
