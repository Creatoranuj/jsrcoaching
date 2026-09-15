import { useState, useEffect, useMemo } from "react";
import { reportError } from "@/lib/sentry";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../integrations/supabase/client";
import { ChevronLeft, PackageOpen, FolderOpen, ClipboardList, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "../lib/utils";
import { useAuth } from "../contexts/AuthContext";
import { useNavigationHistory } from "../contexts/NavigationHistoryContext";
import { Breadcrumbs, LectureCard } from "../components/course";
import { resolveCourseRoot, resolveFromParam } from "../config/backNavigation";
import { useLessonNotesCounts } from "../hooks/useLessonNotesCounts";
import { ContentViewSwitcher, type ViewMode } from "../components/course/ContentViewSwitcher";
import { LectureGalleryCard } from "../components/course/LectureGalleryCard";
import { LectureTableView } from "../components/course/LectureTableView";
import { ViewSkeletons } from "../components/course/ViewSkeletons";
import { LessonAttachmentsSheet } from "../components/lesson/LessonAttachmentsSheet";
import { toast } from "sonner";
import { Inbox } from "lucide-react";

interface Lesson {
  id: string;
  title: string;
  video_url: string;
  description: string | null;
  is_locked: boolean | null;
  lecture_type: string;
  position: number;
  youtube_id: string | null;
  duration: number | null;
  created_at: string | null;
  thumbnail_url: string | null;
  class_pdf_url: string | null;
}

interface Chapter {
  id: string;
  code: string;
  title: string;
  course_id: number;
  parent_id: string | null;
}

interface SubChapter {
  id: string;
  code: string;
  title: string;
  position: number;
  lessonCount: number;
}

interface Course {
  id: number;
  title: string;
  grade: string | null;
}

type TabType = "all" | "lectures" | "pdfs" | "dpps" | "notes" | "tests";

// ── In-memory cache so re-entering a chapter feels instant (SWR-style).
// Keyed by `${courseId}:${chapterId}`. Hydrates state on mount and the
// background fetch still refreshes the data.
type CachedChapter = {
  course: Course | null;
  chapter: Chapter | null;
  parentChapter: Chapter | null;
  subChapters: SubChapter[];
  lessons: Lesson[];
  showSubChapters: boolean;
};
const chapterCache = new Map<string, CachedChapter>();

const LectureListing = () => {
  const navigate = useNavigate();
  const { courseId, chapterId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, profile } = useAuth();
  const fromParam = resolveFromParam(searchParams, courseId);

  const cacheKey = `${courseId ?? ""}:${chapterId ?? ""}`;
  const cached = chapterCache.get(cacheKey);
  const [course, setCourse] = useState<Course | null>(cached?.course ?? null);
  const [chapter, setChapter] = useState<Chapter | null>(cached?.chapter ?? null);
  const [parentChapter, setParentChapter] = useState<Chapter | null>(cached?.parentChapter ?? null);
  const [subChapters, setSubChapters] = useState<SubChapter[]>(cached?.subChapters ?? []);
  const [lessons, setLessons] = useState<Lesson[]>(cached?.lessons ?? []);
  // Skip the skeleton entirely when we already have cached data — refresh silently.
  const [loading, setLoading] = useState(!cached);
  // Tracks whether the current mount's fetch has actually completed. Prevents
  // a "Course not found" flash on back-navigation when the module cache is
  // warm (loading=false) but the async course refetch hasn't landed yet.
  const [fetched, setFetched] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [hasPurchased, setHasPurchased] = useState(false);
  const [showSubChapters, setShowSubChapters] = useState(cached?.showSubChapters ?? false);
  const [lessonQuizMap, setLessonQuizMap] = useState<Record<string, string>>({});
  const [standaloneQuizzes, setStandaloneQuizzes] = useState<any[]>([]);
  // Inline notes-sheet state — opening the attachments Sheet on this page
  // (instead of navigating to LessonView with ?openPdf=1) removes the
  // full-screen route-transition flash that showed as "screen blink".
  const [notesSheet, setNotesSheet] = useState<{ lessonId: string; title: string; lessonType: string | null } | null>(null);

  const { isAdmin, isTeacher } = useAuth();
  const { peekPrevious } = useNavigationHistory();
  const isAdminOrTeacher = isAdmin || isTeacher;

  useEffect(() => {
    const fetchData = async () => {
      if (!courseId) return;
      try {
        const { data: courseData, error: courseError } = await supabase
          .from("courses").select("id, title, grade").eq("id", Number(courseId)).single();
        if (courseError) throw courseError;
        setCourse(courseData);

        if (user) {
          const { data: enrollment } = await supabase.from("enrollments").select("id")
            .eq("user_id", String(user.id)).eq("course_id", Number(courseId)).eq("status", "active").maybeSingle();
          if (enrollment) setHasPurchased(true);
        }

        if (chapterId && chapterId !== "__all__") {
          const { data: chapterData, error: chapterError } = await supabase
            .from("chapters").select("id, code, title, course_id, parent_id").eq("id", chapterId).single();
          if (!chapterError && chapterData) {
            setChapter(chapterData);

            // If this chapter has a parent, fetch parent for breadcrumbs
            if (chapterData.parent_id) {
              const { data: parentData } = await supabase
                .from("chapters").select("id, code, title, course_id, parent_id").eq("id", chapterData.parent_id).single();
              if (parentData) setParentChapter(parentData);
            }

            // Check for sub-chapters
            const { data: subChaptersData } = await supabase
              .from("chapters").select("id, code, title, position")
              .eq("parent_id", chapterId)
              .order("position", { ascending: true });

            if (subChaptersData && subChaptersData.length > 0) {
              // Fetch lesson counts AND full lesson data for sub-chapters
              const subIds = subChaptersData.map(sc => sc.id);
              const [{ data: subLessonsCountData }, { data: subLessonsFullData }] = await Promise.all([
                supabase.from("lessons").select("id, chapter_id").in("chapter_id", subIds),
                supabase.from("lessons").select("id,title,video_url,course_id,chapter_id,lecture_type,position,thumbnail_url,class_pdf_url,is_locked,duration,duration_seconds,youtube_id,created_at,overview,description,like_count,is_free,is_preview,file_path,category").in("chapter_id", subIds).order("position", { ascending: true }).limit(200),
              ]);

              const countMap: Record<string, number> = {};
              (subLessonsCountData || []).forEach(l => {
                if (l.chapter_id) countMap[l.chapter_id] = (countMap[l.chapter_id] || 0) + 1;
              });

              setSubChapters(subChaptersData.map(sc => ({
                ...sc,
                lessonCount: countMap[sc.id] || 0,
              })));
              setShowSubChapters(true);

              // Fetch direct lessons for this chapter AND combine with sub-chapter lessons
              const { data: directLessonsData } = await supabase
                .from("lessons").select("id,title,video_url,course_id,chapter_id,lecture_type,position,thumbnail_url,class_pdf_url,is_locked,duration,duration_seconds,youtube_id,created_at,overview,description,like_count,is_free,is_preview,file_path,category").eq("chapter_id", chapterId).order("position", { ascending: true }).limit(200);

              const combined = [
                ...(directLessonsData || []),
                ...(subLessonsFullData || []),
              ];
              setLessons(combined.map((l, idx: number) => ({
                ...l, lecture_type: l.lecture_type || "VIDEO", position: l.position || idx + 1,
              })));
            } else {
              setShowSubChapters(false);

              // Fetch lessons for this chapter (direct lessons only)
              const { data: lessonsData, error: lessonsError } = await supabase
                .from("lessons").select("id,title,video_url,course_id,chapter_id,lecture_type,position,thumbnail_url,class_pdf_url,is_locked,duration,duration_seconds,youtube_id,created_at,overview,description,like_count,is_free,is_preview,file_path,category").eq("chapter_id", chapterId).order("position", { ascending: true }).limit(200);
              if (!lessonsError) {
                setLessons((lessonsData || []).map((l, idx: number) => ({
                  ...l, lecture_type: l.lecture_type || "VIDEO", position: l.position || idx + 1,
                })));
              }
            }
          }
      } else {
          // No chapter or __all__ — fetch all chapters as folders first
          const { data: allChapters } = await supabase
            .from("chapters").select("id, code, title, position")
            .eq("course_id", Number(courseId))
            .is("parent_id", null)
            .order("position", { ascending: true });

          if (allChapters && allChapters.length > 0) {
            // Show chapters as sub-chapter folders — count includes nested sub-chapter lessons
            const chapterIds = allChapters.map(c => c.id);
            
            // Fetch sub-chapters for each top-level chapter
            const { data: nestedChapters } = await supabase
              .from("chapters").select("id, parent_id").in("parent_id", chapterIds);
            const nestedIds = (nestedChapters || []).map(nc => nc.id);
            const allChapterIds = [...chapterIds, ...nestedIds];
            
            const { data: chapterLessonsData } = await supabase
              .from("lessons").select("id, chapter_id").in("chapter_id", allChapterIds);
            
            // Build count map: attribute nested chapter lessons to their parent
            const parentMap: Record<string, string> = {};
            (nestedChapters || []).forEach((nc) => { if (nc.parent_id) parentMap[nc.id] = nc.parent_id; });
            
            const countMap: Record<string, number> = {};
            (chapterLessonsData || []).forEach((l) => {
              if (!l.chapter_id) return;
              const topParent = parentMap[l.chapter_id] || l.chapter_id;
              countMap[topParent] = (countMap[topParent] || 0) + 1;
            });
            setSubChapters(allChapters.map(c => ({
              ...c,
              lessonCount: countMap[c.id] || 0,
            })));
            setShowSubChapters(true);
          }

          // Also fetch all lessons for tab filtering
          const { data: lessonsData, error: lessonsError } = await supabase
            .from("lessons").select("id,title,video_url,course_id,chapter_id,lecture_type,position,thumbnail_url,class_pdf_url,is_locked,duration,duration_seconds,youtube_id,created_at,overview,description,like_count,is_free,is_preview,file_path,category").eq("course_id", Number(courseId)).order("created_at", { ascending: true }).limit(300);
          if (!lessonsError) {
            setLessons((lessonsData || []).map((l, idx: number) => ({
              ...l, lecture_type: l.lecture_type || "VIDEO", position: l.position || idx + 1,
            })));
          }
        }
      } catch (err) {
        reportError(err, { surface: "LectureListing.fetch" });
      } finally {
        setLoading(false);
        setFetched(true);
      }
    };
    fetchData();
  }, [courseId, chapterId, user]);

  // Persist to module cache so re-entering this chapter is instant next time.
  useEffect(() => {
    if (loading) return;
    chapterCache.set(cacheKey, {
      course, chapter, parentChapter, subChapters, lessons, showSubChapters,
    });
  }, [loading, cacheKey, course, chapter, parentChapter, subChapters, lessons, showSubChapters]);

  // Enrollment guard: redirect unenrolled non-admin users
  useEffect(() => {
    if (loading || !courseId || !user) return;
    if (!hasPurchased && !isAdminOrTeacher) {
      toast.error("Please purchase this course to access content.", { id: "course-locked" });
      navigate(`/buy-course?id=${courseId}`, { replace: true });
    }
  }, [loading, hasPurchased, isAdminOrTeacher, courseId, user, navigate]);

  useEffect(() => {
    if (!courseId) return;
    const fetchQuizzes = async () => {
      // 1. Quizzes linked to lessons
      const lessonIds = lessons
        .filter(l => l.lecture_type === "DPP" || l.lecture_type === "TEST")
        .map(l => l.id);
      
      const map: Record<string, string> = {};
      
      if (lessonIds.length > 0) {
        const { data } = await supabase
          .from("quizzes")
          .select("id, lesson_id")
          .in("lesson_id", lessonIds)
          .eq("is_published", true);
        if (data) {
          data.forEach((q) => { if (q.lesson_id) map[q.lesson_id] = q.id; });
        }
      }
      
      // 2. Standalone quizzes — filter by chapter_id when viewing a chapter
      let standaloneQuery = supabase
        .from("quizzes")
        .select("id, title, type, duration_minutes, created_at")
        .eq("course_id", Number(courseId))
        .is("lesson_id", null)
        .eq("is_published", true)
        .order("created_at", { ascending: false });
      
      if (chapterId && chapterId !== "__all__") {
        standaloneQuery = standaloneQuery.eq("chapter_id", chapterId);
      }
      
      const { data: standaloneQuizzes } = await standaloneQuery;
      
      setLessonQuizMap(map);
      setStandaloneQuizzes(standaloneQuizzes || []);
    };
    fetchQuizzes();
  }, [lessons, courseId]);

  const handleLectureClick = (lesson: Lesson, opts?: { openPdf?: boolean }) => {
    if (lesson.is_locked && !hasPurchased && !isAdminOrTeacher) {
      toast.error("This lecture is locked. Please purchase the course.");
      navigate(`/buy-course?id=${courseId}`);
      return;
    }
    // When tapping a PDF entry in the PDFs tab, deep-link straight into the
    // attachment view so the user lands on the PDF list (not the video player).
    const wantsPdf = opts?.openPdf ?? activeTab === "pdfs";
    const tabParam = wantsPdf ? "&tab=attachment&openPdf=1" : "";
    navigate(`/classes/${courseId}/lessons?lessonId=${lesson.id}${fromParam ? `&from=${fromParam}` : ''}${tabParam}`);
  };

  const handleMoveLesson = async (lessonId: string, direction: "up" | "down") => {
    const idx = lessons.findIndex(l => l.id === lessonId);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= lessons.length) return;
    const newLessons = [...lessons];
    [newLessons[idx], newLessons[swapIdx]] = [newLessons[swapIdx], newLessons[idx]];
    setLessons(newLessons);
    try {
      await Promise.all([
        supabase.from("lessons").update({ position: swapIdx + 1 }).eq("id", newLessons[swapIdx].id),
        supabase.from("lessons").update({ position: idx + 1 }).eq("id", newLessons[idx].id),
      ]);
    } catch {
      toast.error("Failed to reorder");
    }
  };

  const classPdfMap = useMemo(() => {
    const m: Record<string, boolean> = {};
    lessons.forEach(l => { if (l.class_pdf_url) m[l.id] = true; });
    return m;
  }, [lessons]);
  const allLessonIds = useMemo(() => lessons.map(l => l.id), [lessons]);
  const attachmentCounts = useLessonNotesCounts(allLessonIds, classPdfMap);

  const isPdfLike = (l: Lesson) =>
    l.lecture_type === "PDF" || !!l.class_pdf_url || (attachmentCounts[l.id] || 0) > 0;

  const filteredLessons = lessons.filter((l) => {
    if (activeTab === "all") return true;
    if (activeTab === "lectures") return l.lecture_type === "VIDEO";
    if (activeTab === "pdfs") return isPdfLike(l);
    if (activeTab === "dpps") return l.lecture_type === "DPP";
    if (activeTab === "notes") return l.lecture_type === "NOTES";
    if (activeTab === "tests") return l.lecture_type === "TEST";
    return true;
  });

  const tabCounts = {
    all: lessons.length + (standaloneQuizzes.length),
    lectures: lessons.filter(l => l.lecture_type === "VIDEO").length,
    pdfs: lessons.filter(isPdfLike).length,
    dpps: lessons.filter(l => l.lecture_type === "DPP").length + standaloneQuizzes.filter(q => q.type === "dpp").length,
    notes: lessons.filter(l => l.lecture_type === "NOTES").length,
    tests: lessons.filter(l => l.lecture_type === "TEST").length + standaloneQuizzes.filter(q => q.type !== "dpp").length,
  };

  // Only surface the empty state after the current mount's fetch has finished.
  // Using `fetched` (not `!loading`) closes the warm-cache window where
  // loading=false but the course row hasn't come back yet — that window was
  // the source of the "Course not found" blink on APK back-navigation.
  if (fetched && !course) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Course not found</p>
      </div>
    );
  }

  // Build breadcrumbs with sub-chapter support
  const root = resolveCourseRoot(fromParam);
  const breadcrumbSegments = course ? [
    { label: "Dashboard", href: "/dashboard" },
    { label: root.label, href: root.href },
    { label: course.title, href: `/classes/${courseId}/chapters${fromParam ? `?from=${fromParam}` : ""}` },
    ...(parentChapter ? [
      { label: parentChapter.title, href: `/classes/${courseId}/chapter/${parentChapter.id}${fromParam ? `?from=${fromParam}` : ""}` },
    ] : []),
    ...(chapter ? [
      { label: chapter.title },
    ] : []),
  ] : [];

  const pageTitle = chapter?.title || course?.title || "";

  const tabs: { id: TabType; label: string; count: number }[] = [
    { id: "all", label: "All", count: tabCounts.all },
    { id: "lectures", label: "Lectures", count: tabCounts.lectures },
    { id: "pdfs", label: "PDFs", count: tabCounts.pdfs },
    { id: "dpps", label: "DPPs", count: tabCounts.dpps },
    { id: "notes", label: "Notes", count: tabCounts.notes },
    { id: "tests", label: "Tests", count: tabCounts.tests },
  ];

  return (
    <main className="min-h-dvh bg-background nb-smooth-scroll">
      {/* Header */}
      <header
        className="px-4 pt-[max(1.5rem,calc(env(safe-area-inset-top)+0.5rem))] pb-3 sticky top-0 z-20 bg-background"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 1.5rem)" }}
      >

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              // Prefer real in-app trail so Back walks the breadcrumb the user took
              // (sub-folder → folder → chapter → course). Fall back to URL-derived
              // path on cold launch / deep link when the stack is empty.
              if (peekPrevious()) {
                window.history.back();
                return;
              }
              if (parentChapter) {
                navigate(`/classes/${courseId}/chapter/${parentChapter.id}${fromParam ? `?from=${fromParam}` : ""}`);
              } else if (chapter) {
                navigate(`/classes/${courseId}/chapters${fromParam ? `?from=${fromParam}` : ""}`);
              } else {
                navigate(root.href);
              }
            }}
            className="text-primary hover:opacity-80 transition-opacity inline-flex items-center justify-center min-h-[44px] min-w-[44px] -ml-2"
            aria-label="Go back"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <h1 className="text-lg font-semibold text-foreground line-clamp-1 flex-1">{pageTitle}</h1>
          <ContentViewSwitcher activeView={viewMode} onViewChange={setViewMode} />
        </div>
      </header>

      {/* Breadcrumbs */}
      <Breadcrumbs segments={breadcrumbSegments} showBack={false} className="sticky top-[60px] z-10" />


      {/* Sub-chapters section */}
      {showSubChapters && subChapters.length > 0 && (
        <div className="px-5 py-3">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Chapters</h3>
          <div className="space-y-2">
            {subChapters.map((sc) => (
              <button
                key={sc.id}
                onClick={() => navigate(`/classes/${courseId}/chapter/${sc.id}${fromParam ? `?from=${fromParam}` : ""}`)}
                className="w-full p-3 border rounded-xl bg-card hover:border-primary hover:shadow-sm transition-all text-left group flex items-center gap-3"
              >
                <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <FolderOpen className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{sc.code} : {sc.title}</p>
                  <p className="text-xs text-muted-foreground">{sc.lessonCount} lectures</p>
                </div>
              </button>
            ))}
          </div>
          {lessons.length > 0 && (
            <div className="mt-4 border-t pt-3" />
          )}
        </div>
      )}

      {/* Tab Bar (only show if viewing a specific chapter with direct lessons, NOT when showing sub-chapter folders) */}
      {!showSubChapters && (
        <div className="nb-snap-x flex gap-2 px-5 py-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap flex-shrink-0 snap-start border",
                activeTab === tab.id
                  ? "bg-foreground text-background border-foreground"
                  : "bg-card text-foreground border-border hover:bg-muted/40"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {!showSubChapters && (
        <div className="p-5">
          {loading ? (
            <ViewSkeletons view={viewMode} />
          ) : filteredLessons.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Inbox className="w-16 h-16 mb-4 text-muted-foreground/60" aria-hidden />
              <p className="text-muted-foreground font-medium">No content found</p>
              <p className="text-sm text-muted-foreground/70 mt-1">Try switching tabs or check back later.</p>
            </div>
          ) : (
            <div className={cn(
              "transition-opacity duration-200",
              "animate-in fade-in-0 duration-200"
            )}>
              {viewMode === "list" && (
                <div className="space-y-4">
                  {filteredLessons.map((lesson) => {
                    const linkedQuizId = lessonQuizMap[lesson.id];
                    const isDppOrTest = lesson.lecture_type === "DPP" || lesson.lecture_type === "TEST";
                    return (
                      <div key={lesson.id} className="relative">
                        <div className="flex items-start gap-1">
                          <div className="flex-1 min-w-0">
                            <LectureCard
                              id={lesson.id}
                              title={lesson.title}
                              lectureType={
                                // In the PDFs tab, render every entry as a PDF card so
                                // the badge/thumbnail/CTA match user expectation ("View"
                                // instead of "Watch") even when the underlying lesson is
                                // a video with attached class PDFs.
                                (activeTab === "pdfs"
                                  ? "PDF"
                                  : (lesson.lecture_type as "VIDEO" | "PDF" | "DPP" | "NOTES" | "TEST"))
                              }
                              position={lesson.position}
                              duration={lesson.duration}
                              createdAt={lesson.created_at}
                              youtubeId={lesson.youtube_id}
                              thumbnailUrl={lesson.thumbnail_url}
                              videoUrl={lesson.video_url}
                              classPdfUrl={lesson.class_pdf_url}
                              attachmentCount={attachmentCounts[lesson.id] || 0}
                              isLocked={!!lesson.is_locked && !hasPurchased && !isAdminOrTeacher}
                              onClick={() => handleLectureClick(lesson)}
                              onNotesClick={() => {
                                if (lesson.is_locked && !hasPurchased && !isAdminOrTeacher) {
                                  toast.error("This lecture is locked. Please purchase the course.");
                                  navigate(`/buy-course?id=${courseId}`);
                                  return;
                                }
                                setNotesSheet({ lessonId: lesson.id, title: lesson.title, lessonType: lesson.lecture_type });
                              }}
                            />
                          </div>
                          {isAdminOrTeacher && activeTab === "all" && (
                            <div className="flex flex-col gap-0.5 pt-2">
                              <button
                                onClick={() => handleMoveLesson(lesson.id, "up")}
                                disabled={filteredLessons.indexOf(lesson) === 0}
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-30"
                                title="Move up"
                              >
                                <ArrowUp className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleMoveLesson(lesson.id, "down")}
                                disabled={filteredLessons.indexOf(lesson) === filteredLessons.length - 1}
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-30"
                                title="Move down"
                              >
                                <ArrowDown className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                        </div>
                        {isDppOrTest && linkedQuizId && (
                          <div className="mt-1 px-1">
                            <button
                              onClick={() => navigate(`/quiz/${linkedQuizId}`)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-xs font-semibold transition-colors"
                            >
                              <ClipboardList className="h-3.5 w-3.5" />
                              {lesson.lecture_type === "TEST" ? "Take Test" : "Attempt DPP"}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Standalone course-level quizzes (DPP tab or All tab) */}
                  {(activeTab === "all" || activeTab === "dpps" || activeTab === "tests") &&
                    standaloneQuizzes
                      .filter(q => activeTab === "all" || (activeTab === "dpps" && q.type === "dpp") || (activeTab === "tests" && q.type !== "dpp"))
                      .map((quiz) => (
                        <div key={quiz.id} className="relative">
                          <button
                            onClick={() => navigate(`/quiz/${quiz.id}`)}
                            className="w-full p-3 border rounded-xl bg-card hover:border-primary hover:shadow-sm transition-all text-left group flex items-center gap-3"
                          >
                            <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                              <ClipboardList className="h-4 w-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{quiz.title}</p>
                              <p className="text-xs text-muted-foreground">
                                {quiz.type === "dpp" ? "Daily Practice Paper" : "Test"} · {quiz.duration_minutes} min
                              </p>
                            </div>
                          </button>
                        </div>
                      ))
                  }
                </div>
              )}

              {viewMode === "gallery" && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {filteredLessons.map((lesson) => (
                    <LectureGalleryCard
                      key={lesson.id}
                      id={lesson.id}
                      title={lesson.title}
                      lectureType={lesson.lecture_type as "VIDEO" | "PDF" | "DPP" | "NOTES" | "TEST"}
                      duration={lesson.duration}
                      createdAt={lesson.created_at}
                      youtubeId={lesson.youtube_id}
                      videoUrl={lesson.video_url}
                      isLocked={!!lesson.is_locked && !hasPurchased && !isAdminOrTeacher}
                      quizId={lessonQuizMap[lesson.id]}
                      onClick={() => handleLectureClick(lesson)}
                    />
                  ))}
                </div>
              )}

              {viewMode === "table" && (
                <LectureTableView
                  lessons={filteredLessons}
                  hasPurchased={hasPurchased}
                  isAdminOrTeacher={isAdminOrTeacher}
                  onLectureClick={handleLectureClick}
                  lessonQuizMap={lessonQuizMap}
                />
              )}
            </div>
          )}
        </div>
      )}
      <LessonAttachmentsSheet
        open={!!notesSheet}
        onOpenChange={(o) => { if (!o) setNotesSheet(null); }}
        lessonId={notesSheet?.lessonId}
        lessonTitle={notesSheet?.title}
        lessonType={notesSheet?.lessonType}
        courseId={courseId}
      />
    </main>
  );
};

export default LectureListing;
