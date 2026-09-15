import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../integrations/supabase/client";
import { ChevronLeft, ChevronRight, Search, FileText, BookOpen, ClipboardList, FlaskConical, X } from "lucide-react";
import RouteSkeleton from "../components/RouteSkeleton";
import ListCardSkeleton from "../components/ui/skeletons/ListCardSkeleton";
import { cn } from "../lib/utils";
import { useBatch } from "../contexts/BatchContext";
import { Input } from "../components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import { toast } from "sonner";
import { logger } from "../lib/logger";
import { formatGrade } from "../lib/formatGrade";

interface Course {
  id: number;
  title: string;
  grade: string | null;
  lessonCount: number;
  completedCount: number;
}

interface Resource {
  id: string;
  title: string;
  video_url: string;
  lecture_type: string;
  course_title: string;
  course_id: number | null;
  description?: string | null;
  youtube_id?: string | null;
}

const RESOURCE_TYPE_ICONS: Record<string, React.ReactNode> = {
  PDF: <FileText className="h-5 w-5 text-red-500" />,
  DPP: <ClipboardList className="h-5 w-5 text-blue-500" />,
  NOTES: <BookOpen className="h-5 w-5 text-green-500" />,
  TEST: <FlaskConical className="h-5 w-5 text-purple-500" />,
};

const AllClasses = () => {
  const navigate = useNavigate();
  const { selectedBatch, setSelectedBatch } = useBatch();
  const [courses, setCourses] = useState<Course[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [resourcesLoading, setResourcesLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"courses" | "resources">("courses");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("title");
  

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const [coursesRes, lessonsRes] = await Promise.all([
          supabase.from("courses").select("*").order("title", { ascending: true }),
          supabase.from("lessons").select("course_id"),
        ]);

        if (coursesRes.error) throw coursesRes.error;

        // Build lesson count map
        const countMap: Record<number, number> = {};
        (lessonsRes.data || []).forEach((l) => {
          if (l.course_id) countMap[l.course_id] = (countMap[l.course_id] || 0) + 1;
        });

        // All Classes lists EVERY course. It used to filter down to the
        // selected batch, which made the page look empty/one-row after a
        // course was picked. Selection now only drives highlighting.
        const formattedCourses: Course[] = (coursesRes.data || []).map((c) => ({
          id: c.id,
          title: c.title,
          grade: c.grade,
          lessonCount: countMap[c.id] || 0,
          completedCount: 0,
        }));

        setCourses(formattedCourses);
      } catch (err) {
        logger.error("Error fetching courses", err);
      } finally {
        setLoading(false);
      }
    };

    fetchCourses();
  }, [selectedBatch]);

  useEffect(() => {
    if (activeTab !== "resources") return;
    const fetchResources = async () => {
      setResourcesLoading(true);
      try {
        // Fetch all lessons with course info that are resource types
        const { data: lessonsData, error } = await supabase
          .from("lessons")
          .select("id, title, video_url, lecture_type, description, youtube_id, course_id, courses:course_id (title)")
          .in("lecture_type", ["PDF", "DPP", "NOTES", "TEST", "MATERIAL"])
          .order("created_at", { ascending: false });

        if (error) throw error;

        const mapLesson = (l: any): Resource => ({
          id: l.id,
          title: l.title,
          video_url: l.video_url,
          lecture_type: l.lecture_type || "PDF",
          course_title: l.courses?.title || "Unknown",
          course_id: l.course_id ?? null,
          description: l.description,
          youtube_id: l.youtube_id,
        });

        const allResources: Resource[] = (lessonsData || []).map(mapLesson);

        // Resources also list across all courses (see note above).
        setResources(allResources);
      } catch (err) {
        logger.error("Error fetching resources", err);
      } finally {
        setResourcesLoading(false);
      }
    };

    fetchResources();
  }, [activeTab, selectedBatch]);

  const getSubjectCode = (title: string) => {
    const words = title.split(" ");
    if (words.length === 1) return title.substring(0, 3).toUpperCase();
    return words.map(w => w[0]).join("").substring(0, 3).toUpperCase();
  };

  const getProgress = (course: Course) => {
    if (course.lessonCount === 0) return 0;
    return Math.round((course.completedCount / course.lessonCount) * 100);
  };

  const filteredCourses = courses
    .filter(c => !searchQuery.trim() || c.title.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === "title") return a.title.localeCompare(b.title);
      if (sortBy === "lessons") return b.lessonCount - a.lessonCount;
      return 0;
    });

  const filteredResources = resources
    .filter(r => !searchQuery.trim() || r.title.toLowerCase().includes(searchQuery.toLowerCase()));

  if (loading) {
    return <RouteSkeleton label="Loading classes" />;
  }

  return (
    <main className="min-h-dvh bg-background nb-smooth-scroll">
      <header className="px-5 pt-4 pb-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/dashboard")} className="text-primary text-2xl font-medium">
            <ChevronLeft className="h-6 w-6" />
          </button>
          <h1 className="text-xl font-semibold text-foreground">
            {selectedBatch ? selectedBatch.title : "All Courses"}
          </h1>
        </div>
      </header>

      {selectedBatch && (
        <div className="flex items-center justify-between px-5 mb-3 py-2 bg-primary/5 border border-primary/20 rounded-xl mx-5">
          <span className="text-sm text-muted-foreground">
            Viewing: <strong className="text-foreground">{selectedBatch.title}</strong>
          </span>
          <button
            onClick={() => setSelectedBatch(null)}
            className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors font-medium"
          >
            <X className="h-3.5 w-3.5" />
            Show All
          </button>
        </div>
      )}

      <div className="flex gap-3 px-5 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={activeTab === "courses" ? "Search courses..." : "Search resources..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        {activeTab === "courses" && (
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="title">Name</SelectItem>
              <SelectItem value="lessons">Lessons</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="flex gap-6 px-5 border-b border-border">
        <button
          onClick={() => setActiveTab("courses")}
          className={cn("pb-3 text-base font-medium relative transition-colors", activeTab === "courses" ? "text-primary" : "text-muted-foreground")}
        >
          Courses
          {activeTab === "courses" && <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-primary rounded-full" />}
        </button>
        <button
          onClick={() => setActiveTab("resources")}
          className={cn("pb-3 text-base font-medium relative transition-colors", activeTab === "resources" ? "text-primary" : "text-muted-foreground")}
        >
          Resources
          {activeTab === "resources" && <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-primary rounded-full" />}
        </button>
      </div>

      <div className="p-5 space-y-4">
        {activeTab === "courses" && filteredCourses.map((course) => {
          const progress = getProgress(course);
          return (
            <div
              key={course.id}
              onClick={() => {
                // Picking a course here switches the app-wide active course
                // too, so Home/My Courses follow the same selection.
                setSelectedBatch({ id: course.id, title: course.title, grade: course.grade ?? null } as any);
                navigate(`/classes/${course.id}/chapters?from=all-classes`);
              }}
              className={cn(
                "flex items-center gap-4 p-4 bg-card border rounded-xl shadow-sm cursor-pointer hover:shadow-md transition-shadow",
                selectedBatch?.id === course.id ? "border-primary ring-1 ring-primary/30" : "border-border",
              )}
            >
              <div className="min-w-[52px] h-[52px] rounded-xl bg-primary/10 flex items-center justify-center">
                <span className="text-primary font-semibold text-lg">{getSubjectCode(course.title)}</span>
              </div>
              <div className="flex-1">
                <h3 className="text-base font-medium text-foreground">{course.title}</h3>
                <span className="text-xs text-muted-foreground">{course.lessonCount} lessons{course.grade ? ` • ${formatGrade(course.grade)}` : ""}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{progress}%</span>
                <div className="w-14 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground/50" />
              </div>
            </div>
          );
        })}

        {activeTab === "courses" && filteredCourses.length === 0 && (
          <div className="text-center py-12 text-muted-foreground"><p>No courses found.</p></div>
        )}

        {activeTab === "resources" && resourcesLoading && (
          <ListCardSkeleton rows={4} rowHeight={80} lines={2} label="Loading resources" />
        )}

        {activeTab === "resources" && !resourcesLoading && filteredResources.map((resource) => (
          <div
            key={resource.id}
            onClick={() => {
              // Navigate to premium lesson view if course_id is available
              if (resource.course_id) {
                navigate(`/classes/${resource.course_id}/lessons?lessonId=${resource.id}&from=all-classes`);
              } else {
                toast.error("This resource has no linked course.");
              }
            }}
            className={cn(
                "flex items-center gap-4 p-4 bg-card border rounded-xl shadow-sm cursor-pointer hover:shadow-md transition-shadow",
                selectedBatch?.id === resource.course_id ? "border-primary ring-1 ring-primary/30" : "border-border",
              )}
          >
            <div className="min-w-[44px] h-[44px] rounded-lg bg-muted flex items-center justify-center">
              {RESOURCE_TYPE_ICONS[resource.lecture_type] || <FileText className="h-5 w-5 text-muted-foreground" />}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-medium text-foreground truncate">{resource.title}</h3>
              <span className="text-xs text-muted-foreground">{resource.course_title} • {resource.lecture_type}</span>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground/50 shrink-0" />
          </div>
        ))}

        {activeTab === "resources" && !resourcesLoading && filteredResources.length === 0 && (
          <div className="text-center py-12 text-muted-foreground"><p>No resources found.</p></div>
        )}
      </div>

    </main>
  );
};

export default AllClasses;
