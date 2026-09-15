import { useState, useEffect } from "react";
import { safeGet, safeSet } from "@/lib/storage";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../integrations/supabase/client";
import { ChevronLeft } from "lucide-react";
import { LoadingSpinner } from "../components/ui/loading-spinner";
import { cn } from "../lib/utils";
import { Breadcrumbs, ChapterCard } from "../components/course";
import { ContentViewSwitcher, type ViewMode } from "../components/course/ContentViewSwitcher";
import { useAuth } from "../contexts/AuthContext";
import { useNavigationHistory } from "../contexts/NavigationHistoryContext";
import { resolveCourseRoot, resolveFromParam } from "../config/backNavigation";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

interface Chapter {
  id: string;
  code: string;
  title: string;
  description: string | null;
  position: number;
  lessonCount: number;
  completedLessons: number;
  dppCount: number;
  thumbnailUrl?: string | null;
}

interface Course {
  id: number;
  title: string;
  grade: string | null;
}

const ChapterView = () => {
  const navigate = useNavigate();
  const { courseId } = useParams();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const fromParam = resolveFromParam(searchParams, courseId);
  const [course, setCourse] = useState<Course | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetched, setFetched] = useState(false);
  const [activeTab, setActiveTab] = useState<"chapters" | "material">("chapters");
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = typeof window !== "undefined" ? safeGet("chapterview:view") : null;
    return (saved as ViewMode) || "list";
  });
  useEffect(() => {
    safeSet("chapterview:view", viewMode);
  }, [viewMode]);
  const { isAdmin, isTeacher } = useAuth();
  const isAdminOrTeacher = isAdmin || isTeacher;
  const { peekPrevious } = useNavigationHistory();

  useEffect(() => {
    const fetchData = async () => {
      if (!courseId) return;

      try {
        // Fetch ALL data in a single parallel batch
        const [courseRes, chaptersRes, subChaptersRes, lessonsRes, quizzesRes, progressRes] = await Promise.all([
          supabase.from("courses").select("id, title, grade").eq("id", Number(courseId)).single(),
          supabase.from("chapters").select("id, code, title, description, position, thumbnail_url").eq("course_id", Number(courseId)).is("parent_id", null).order("position", { ascending: true }),
          supabase.from("chapters").select("id, parent_id").eq("course_id", Number(courseId)).not("parent_id", "is", null),
          supabase.from("lessons").select("id, chapter_id").eq("course_id", Number(courseId)),
          supabase.from("quizzes").select("id, chapter_id").eq("course_id", Number(courseId)).eq("is_published", true),
          user?.id
            ? supabase.from("user_progress").select("lesson_id").eq("user_id", user.id).eq("course_id", Number(courseId)).eq("completed", true)
            : Promise.resolve({ data: null }),
        ]);

        if (courseRes.error) throw courseRes.error;
        setCourse(courseRes.data);

        const lessonsData = lessonsRes.data || [];
        const quizzesData = quizzesRes.data || [];
        const subChaptersData = subChaptersRes.data || [];

        // Build lookup maps in single pass
        const lessonCountMap: Record<string, number> = {};
        let totalLessons = 0;
        for (const l of lessonsData) {
          totalLessons++;
          if (l.chapter_id) lessonCountMap[l.chapter_id] = (lessonCountMap[l.chapter_id] || 0) + 1;
        }

        const dppCountMap: Record<string, number> = {};
        let totalDpps = 0;
        for (const q of quizzesData) {
          totalDpps++;
          if (q.chapter_id) dppCountMap[q.chapter_id] = (dppCountMap[q.chapter_id] || 0) + 1;
        }

        // Completed lessons
        const completedMap: Record<string, number> = {};
        let totalCompleted = 0;
        const completedLessonIds = new Set((progressRes.data || []).map((p) => p.lesson_id));
        totalCompleted = completedLessonIds.size;
        for (const l of lessonsData) {
          if (completedLessonIds.has(l.id) && l.chapter_id) {
            completedMap[l.chapter_id] = (completedMap[l.chapter_id] || 0) + 1;
          }
        }

        const allContentChapter: Chapter = {
          id: "__all__",
          code: "ALL",
          title: "All Content",
          description: "All lectures and materials for this course",
          position: -1,
          lessonCount: totalLessons,
          completedLessons: totalCompleted,
          dppCount: totalDpps,
        };

        // Build parent -> sub-chapter ID mapping
        const subChaptersByParent: Record<string, string[]> = {};
        for (const sc of subChaptersData) {
          if (sc.parent_id) {
            (subChaptersByParent[sc.parent_id] ??= []).push(sc.id);
          }
        }

        const mappedChapters: Chapter[] = (chaptersRes.data || []).map((ch) => {
          const subIds = subChaptersByParent[ch.id] || [];
          const totalLessonCount = (lessonCountMap[ch.id] || 0) + subIds.reduce((sum, sid) => sum + (lessonCountMap[sid] || 0), 0);
          const totalComp = (completedMap[ch.id] || 0) + subIds.reduce((sum, sid) => sum + (completedMap[sid] || 0), 0);
          return {
            id: ch.id,
            code: ch.code,
            title: ch.title,
            description: ch.description,
            position: ch.position,
            lessonCount: totalLessonCount,
            completedLessons: totalComp,
            dppCount: (dppCountMap[ch.id] || 0) + subIds.reduce((sum, sid) => sum + (dppCountMap[sid] || 0), 0),
            thumbnailUrl: ch.thumbnail_url || null,
          };
        });

        setChapters([allContentChapter, ...mappedChapters]);
      } catch (err) {
        logger.error("Error fetching data:", err);
      } finally {
        setLoading(false);
        setFetched(true);
      }
    };

    fetchData();
  }, [courseId, user?.id]);

  // Enrollment guard: redirect unenrolled non-admin users
  useEffect(() => {
    if (loading || !courseId || !user) return;
    const checkEnrollment = async () => {
      if (isAdminOrTeacher) return;
      const { data: enrollment } = await supabase
        .from("enrollments")
        .select("id")
        .eq("user_id", user.id)
        .eq("course_id", Number(courseId))
        .eq("status", "active")
        .maybeSingle();
      if (!enrollment) {
        toast.error("Please purchase this course to access content.", { id: "course-locked" });
        navigate(`/buy-course?id=${courseId}`, { replace: true });
      }
    };
    checkEnrollment();
  }, [loading, courseId, user, isAdminOrTeacher, navigate]);

  if (loading && !fetched) {
    return <LoadingSpinner fullPage size="lg" text="Chapter load ho raha hai…" />;
  }

  if (fetched && !course) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Course not found</p>
      </div>
    );
  }

  if (!course) {
    return <LoadingSpinner fullPage size="lg" text="Chapter load ho raha hai…" />;
  }

  const root = resolveCourseRoot(fromParam);

  return (
    <main className="min-h-dvh bg-background">
      <header
        className="px-4 pt-[max(1.5rem,calc(env(safe-area-inset-top)+0.5rem))] pb-3 sticky top-0 z-20 bg-background"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 1.5rem)" }}
      >

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (peekPrevious()) window.history.back();
              else navigate(root.href);
            }}
            className="text-primary hover:opacity-80 transition-opacity inline-flex items-center justify-center min-h-[44px] min-w-[44px] -ml-2"
            aria-label="Go back"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <h1 className="text-xl font-semibold text-foreground flex-1 truncate">{course.title}</h1>
          <ContentViewSwitcher activeView={viewMode} onViewChange={setViewMode} />
        </div>
      </header>



      <div className="flex gap-6 px-5 border-b border-border" role="tablist">
        <button
          onClick={() => setActiveTab("chapters")}
          className={cn(
            "pb-3 pt-3 min-h-[44px] text-base font-medium relative transition-colors",
            activeTab === "chapters" ? "text-primary" : "text-muted-foreground"
          )}
          role="tab"
          aria-selected={activeTab === "chapters"}
        >
          Chapters
          {activeTab === "chapters" && (
            <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-primary rounded-full" />
          )}
        </button>
        <button
          onClick={() => setActiveTab("material")}
          className={cn(
            "pb-3 pt-3 min-h-[44px] text-base font-medium relative transition-colors",
            activeTab === "material" ? "text-primary" : "text-muted-foreground"
          )}
          role="tab"
          aria-selected={activeTab === "material"}
        >
          Study Material
          {activeTab === "material" && (
            <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-primary rounded-full" />
          )}
        </button>
      </div>

      <div className="p-5 pb-24 md:pb-6">
        {activeTab === "chapters" && (() => {
          const goTo = (chapter: Chapter) => {
            const fromSuffix = fromParam ? `?from=${fromParam}` : "";
            const target = chapter.id === "__all__" ? "__all__" : chapter.id;
            navigate(`/classes/${courseId}/chapter/${target}${fromSuffix}`);
          };

          if (viewMode === "gallery") {
            return (
              <div className="grid grid-cols-2 gap-3">
                {chapters.map((chapter) => (
                  <button
                    key={chapter.id}
                    onClick={() => goTo(chapter)}
                    className="text-left rounded-xl border border-border bg-card p-3 hover:shadow-md hover:border-primary/40 transition-all"
                  >
                    <div className="aspect-video rounded-lg bg-muted mb-2 overflow-hidden flex items-center justify-center">
                      {chapter.thumbnailUrl ? (
                        <img src={chapter.thumbnailUrl} alt={chapter.title} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-2xl font-bold text-muted-foreground">{chapter.code}</span>
                      )}
                    </div>
                    <p className="text-xs font-semibold text-foreground line-clamp-2">{chapter.title}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {chapter.lessonCount} lectures · {chapter.dppCount} DPPs
                    </p>
                  </button>
                ))}
              </div>
            );
          }

          if (viewMode === "table") {
            return (
              <div className="overflow-x-auto rounded-xl border border-border bg-card">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Code</th>
                      <th className="px-3 py-2">Chapter</th>
                      <th className="px-3 py-2 text-right">Lectures</th>
                      <th className="px-3 py-2 text-right">Done</th>
                      <th className="px-3 py-2 text-right">DPPs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chapters.map((chapter) => (
                      <tr
                        key={chapter.id}
                        onClick={() => goTo(chapter)}
                        className="border-t border-border cursor-pointer hover:bg-accent/30"
                      >
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{chapter.code}</td>
                        <td className="px-3 py-2 font-medium text-foreground">{chapter.title}</td>
                        <td className="px-3 py-2 text-right">{chapter.lessonCount}</td>
                        <td className="px-3 py-2 text-right text-primary">{chapter.completedLessons}</td>
                        <td className="px-3 py-2 text-right">{chapter.dppCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }

          return (
            <div className="space-y-4">
              {chapters.map((chapter) => (
                <ChapterCard
                  key={chapter.id}
                  code={chapter.code}
                  title={chapter.title}
                  lectureCount={chapter.lessonCount}
                  completedLectures={chapter.completedLessons}
                  dppCount={chapter.dppCount}
                  thumbnailUrl={chapter.thumbnailUrl}
                  showCode={false}
                  onClick={() => goTo(chapter)}
                />
              ))}
            </div>
          );
        })()}

        {activeTab === "material" && (
          <div className="text-center py-12 text-muted-foreground">
            <p>No study material available yet.</p>
          </div>
        )}

        {activeTab === "chapters" && chapters.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <p>No subjects available yet.</p>
          </div>
        )}
      </div>
    </main>
  );
};

export default ChapterView;
