import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { reportError } from "@/lib/sentry";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../contexts/AuthContext";
import Header from "../components/Layout/Header";
import Sidebar from "../components/Layout/Sidebar";
import { Button } from "../components/ui/button";
import { ScrollArea } from "../components/ui/scroll-area";
import {
  Play, BookOpen,
  PanelLeftOpen, PanelLeftClose, X, Search,
  LayoutList, LayoutGrid, Trophy, ChevronLeft
} from "lucide-react";
import { cn } from "../lib/utils";
import { toast } from "sonner";
import { Breadcrumbs } from "../components/course/Breadcrumbs";
import { ChapterCard } from "../components/course/ChapterCard";
import { LectureRow } from "../components/course";
import { useLessonNotesCounts } from "../hooks/useLessonNotesCounts";
import { LessonAttachmentsSheet } from "../components/lesson/LessonAttachmentsSheet";
import { downloadAllLessonNotes } from "../utils/downloadLessonNotes";
import { readBundleSync as readChapterBundleSync, writeBundle as writeChapterBundle } from "../lib/perf/chapterBundleCache";
import { isNative as isNativePlatform } from "../lib/platform";
import StudyMaterialsList from "../components/course/StudyMaterialsList";
import { prefetchIdle } from "../lib/idlePrefetch";
import { usePaymentSync } from "../hooks/usePaymentSync";

interface Lesson {
  id: string;
  title: string;
  videoUrl: string;
  description: string | null;
  overview: string | null;
  isLocked: boolean | null;
  lectureType: string | null;
  position: number | null;
  youtubeId: string | null;
  createdAt: string | null;
  duration: number | null;
  chapterId: string | null;
  classPdfUrl: string | null;
  thumbnailUrl: string | null;
}

interface Course {
  id: number;
  title: string;
  description: string | null;
  grade: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
}

interface Chapter {
  id: string;
  title: string;
  code: string;
  position: number;
  parent_id: string | null;
  lessonCount: number;
  completedLessons: number;
  thumbnailUrl: string | null;
}

type ContentType = "all" | "lectures" | "pdfs" | "dpp" | "notes";

// ── Static constants outside component — never recreated ──────────────────────
const typeMapping: Record<ContentType, string[]> = {
  all: [],
  lectures: ["VIDEO"],
  pdfs: ["PDF"],
  dpp: ["DPP"],
  notes: ["NOTES"],
};

const tabs: { id: ContentType; label: string }[] = [
  { id: "all", label: "All" },
  { id: "lectures", label: "Lectures" },
  { id: "pdfs", label: "PDFs" },
  { id: "dpp", label: "DPPs" },
  { id: "notes", label: "Notes" },
];

// ── Derives exact chapter completion counts from the source-of-truth sets ──────
// Prevents double-counting on re-entry, hot-reload, or concurrent updates.
const recomputeChapterCounts = (
  completedSet: Set<string>,
  allLessons: { id: string; chapterId: string | null }[],
  prevChapters: Chapter[]
): Chapter[] =>
  prevChapters.map(ch => {
    if (ch.id === "__all__") {
      return { ...ch, completedLessons: allLessons.filter(l => completedSet.has(l.id)).length };
    }
    const chLessons = allLessons.filter(l => l.chapterId === ch.id);
    return { ...ch, completedLessons: chLessons.filter(l => completedSet.has(l.id)).length };
  });

const MyCourseDetail = () => {
  const navigate = useNavigate();
  const { courseId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, profile, isAdmin, isTeacher } = useAuth();
  const isAdminOrTeacher = isAdmin || isTeacher;

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [courseSidebarOpen, setCourseSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [lessonSearch, setLessonSearch] = useState("");
  const progressMarkedRef = useRef<Set<string>>(new Set());
  const breadcrumbBarRef = useRef<HTMLDivElement | null>(null);

  // Publish actual breadcrumb-bar height to a CSS var so the secondary
  // sticky filter/search bar can offset itself without a hardcoded 44px.
  useEffect(() => {
    const el = breadcrumbBarRef.current;
    if (!el) return;
    const root = document.documentElement;
    const apply = () => {
      const h = Math.round(el.getBoundingClientRect().height);
      if (h > 0) root.style.setProperty("--app-breadcrumb-h", `${h}px`);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--app-breadcrumb-h");
    };
  }, []);




  // Prewarm heavy lesson/PDF chunks during idle — the user is one tap away
  // from opening a lesson or the attachments drawer.
  useEffect(() => {
    prefetchIdle(
      () => import("./LessonView"),
      () => import("../components/lesson/LessonAttachmentsSheet"),
      () => import("../components/video/FastPdfReader"),
    );
  }, []);
  const [course, setCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [allChapters, setAllChapters] = useState<Chapter[]>([]);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [parentChapterStack, setParentChapterStack] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<ContentType>("all");
  const [hasPurchased, setHasPurchased] = useState(false);
  const [chapterTab, setChapterTab] = useState<"chapters" | "material">("chapters");
  const [viewMode, setViewMode] = useState<"card" | "list">(() => {
    try { return (localStorage.getItem("nb_lesson_view") as "card" | "list") || "card"; } catch { return "card"; }
  });

  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [notesSheetLesson, setNotesSheetLesson] = useState<Lesson | null>(null);
  const [completedLessonIds, setCompletedLessonIds] = useState<Set<string>>(new Set());
  const [lastWatchedLessonId, setLastWatchedLessonId] = useState<string | null>(null);

  const handleViewModeChange = useCallback((mode: "card" | "list") => {
    setViewMode(mode);
    try { localStorage.setItem("nb_lesson_view", mode); } catch {}
  }, []);

  // ── React-Query fetch (cached + offline-first via queryPersister) ──────────
  // Replaces the prior manual useEffect+useState fetch chain. Caches the
  // course bundle for 2min stale / 10min gc so back-nav is instant. The
  // global queryPersister snapshots it to Preferences so a cold reopen
  // without network paints last-known content immediately.
  const courseQuery = useQuery({
    queryKey: ["my-course-detail", courseId, user?.id ?? null],
    enabled: !!courseId,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    // SWR-style instant paint from Preferences/localStorage snapshot. Keeps
    // cold WebView reopen flicker-free before the network refetch resolves.
    initialData: () => {
      const cached = readChapterBundleSync(courseId);
      if (!cached) return undefined;
      return {
        course: cached.course as Course,
        hasPurchased: cached.hasPurchased,
        lessons: cached.lessons as Lesson[],
        allChapters: cached.allChapters as Chapter[],
        chapters: cached.chapters as Chapter[],
        completedSet: new Set<string>(cached.completedSet),
        lastWatched: cached.lastWatched,
      };
    },
    initialDataUpdatedAt: () => {
      const cached = readChapterBundleSync(courseId);
      return cached?.cachedAt ?? 0;
    },
    queryFn: async () => {
      const cid = Number(courseId);

      const [courseRes, enrollmentRes, allChaptersRes, lessonsRes, progressRes] = await Promise.all([
        supabase.from("courses").select("id,title,description,grade,image_url,thumbnail_url,price,created_at").eq("id", cid).single(),
        user?.id
          ? supabase.from("enrollments").select("id")
              .eq("user_id", user.id).eq("course_id", cid).eq("status", "active").maybeSingle()
          : Promise.resolve({ data: null as { id: string } | null }),
        supabase.from("chapters").select("id,title,code,course_id,parent_id,position,created_at,thumbnail_url").eq("course_id", cid).order("position", { ascending: true }),
        supabase.from("lessons").select("id,title,video_url,course_id,chapter_id,lecture_type,position,thumbnail_url,class_pdf_url,is_locked,duration,duration_seconds,youtube_id,created_at,overview,description,like_count,is_free,is_preview,file_path,category").eq("course_id", cid).order("position", { ascending: true }),
        user?.id
          ? supabase.from("user_progress")
              .select("lesson_id, last_watched_at")
              .eq("user_id", user.id).eq("course_id", cid).eq("completed", true)
              .order("last_watched_at", { ascending: false })
          : Promise.resolve({ data: null as { lesson_id: string; last_watched_at: string }[] | null }),
      ]);

      if (courseRes.error) throw courseRes.error;
      if (lessonsRes.error) throw lessonsRes.error;

      const cd: any = courseRes.data;
      const courseObj: Course = {
        id: cd.id, title: cd.title, description: cd.description,
        grade: cd.grade, imageUrl: cd.image_url, thumbnailUrl: cd.thumbnail_url,
      };

      const mappedLessons: Lesson[] = (lessonsRes.data || []).map((l, idx: number) => ({
        id: l.id, title: l.title, videoUrl: l.video_url, description: l.description,
        overview: l.overview, isLocked: l.is_locked, lectureType: l.lecture_type || "VIDEO",
        position: l.position || idx + 1, youtubeId: l.youtube_id, createdAt: l.created_at,
        duration: l.duration, chapterId: l.chapter_id,
        classPdfUrl: l.class_pdf_url ?? null,
        thumbnailUrl: l.thumbnail_url ?? null,
      }));

      const completedRows = progressRes.data;
      const completedSet = new Set<string>(completedRows?.map(p => p.lesson_id) ?? []);
      const lastWatched = completedRows?.[0]?.lesson_id ?? null;

      const allChaptersList = allChaptersRes.data || [];
      const childrenMap: Record<string, string[]> = {};
      allChaptersList.forEach((ch) => {
        if (ch.parent_id) {
          (childrenMap[ch.parent_id] ||= []).push(ch.id);
        }
      });
      const getDescendantIds = (parentId: string): string[] => {
        const children = childrenMap[parentId] || [];
        return children.flatMap(c => [c, ...getDescendantIds(c)]);
      };

      const lessonCountMap: Record<string, number> = {};
      const completedCountMap: Record<string, number> = {};
      mappedLessons.forEach(l => {
        if (l.chapterId) {
          lessonCountMap[l.chapterId] = (lessonCountMap[l.chapterId] || 0) + 1;
          if (completedSet.has(l.id)) {
            completedCountMap[l.chapterId] = (completedCountMap[l.chapterId] || 0) + 1;
          }
        }
      });

      const totalLessons = mappedLessons.length;
      const totalCompleted = mappedLessons.filter(l => completedSet.has(l.id)).length;

      const allContentChapter: Chapter = {
        id: "__all__", code: "ALL", title: "All Content", position: -1, parent_id: null,
        lessonCount: totalLessons, completedLessons: totalCompleted, thumbnailUrl: null,
      };

      const mappedChapters: Chapter[] = allChaptersList.map((ch) => {
        const ids = [ch.id, ...getDescendantIds(ch.id)];
        return {
          id: ch.id, code: ch.code, title: ch.title, position: ch.position, parent_id: ch.parent_id,
          lessonCount: ids.reduce((s, cid) => s + (lessonCountMap[cid] || 0), 0),
          completedLessons: ids.reduce((s, cid) => s + (completedCountMap[cid] || 0), 0),
          thumbnailUrl: ch.thumbnail_url ?? null,
        };
      });

      const topLevel = mappedChapters.filter(ch => !ch.parent_id);

      const result = {
        course: courseObj,
        hasPurchased: !!enrollmentRes.data,
        lessons: mappedLessons,
        allChapters: mappedChapters,
        chapters: [allContentChapter, ...topLevel],
        completedSet,
        lastWatched,
      };

      // Fire-and-forget SWR snapshot for next cold start. Set serialized as
      // plain array — rehydration coerces it back via `new Set(...)`.
      if (courseId) {
        void writeChapterBundle(courseId, {
          course: result.course,
          hasPurchased: result.hasPurchased,
          lessons: result.lessons,
          allChapters: result.allChapters,
          chapters: result.chapters,
          completedSet: Array.from(result.completedSet),
          lastWatched: result.lastWatched,
        });
      }

      return result;
    },
  });

  // Bridge react-query data into existing useState so the rest of the
  // component (optimistic toggles, recomputeChapterCounts) keeps working
  // without invasive refactors. Setters are no-op when values are identical.
  useEffect(() => {
    const d = courseQuery.data;
    if (!d) return;
    setCourse(d.course);
    setHasPurchased(d.hasPurchased);
    setLessons(d.lessons);
    setAllChapters(d.allChapters);
    setChapters(d.chapters);
    // Guard: react-query persister serializes Set → plain object on rehydrate,
    // which would crash `.has()` calls downstream. Always coerce back to Set.
    setCompletedLessonIds(
      d.completedSet instanceof Set
        ? d.completedSet
        : new Set<string>(Array.isArray(d.completedSet) ? d.completedSet : Object.keys(d.completedSet ?? {}))
    );
    setLastWatchedLessonId(d.lastWatched);
  }, [courseQuery.data]);

  useEffect(() => {
    if (courseQuery.error) {
      reportError(courseQuery.error, { surface: "MyCourseDetail.fetch" });
      toast.error("Could not load course content");
    }
  }, [courseQuery.error]);

  const loading = courseQuery.isPending;

  // Post-checkout gate: never trust the frontend success callback — wait for the
  // server-confirmed enrollment before revealing course content.
  const { syncing: paymentSyncing } = usePaymentSync({
    courseId: courseId ? Number(courseId) : undefined,
    hasPurchased,
    loading,
    refetch: courseQuery.refetch,
  });

  // Deep-link: redirect lesson param to LessonView
  useEffect(() => {
    const lessonId = searchParams.get("lesson");
    if (lessonId && lessons.length > 0 && courseId) {
      navigate(`/classes/${courseId}/lessons?lessonId=${lessonId}&from=my-courses`, { replace: true });
    }
  }, [searchParams, lessons, courseId, navigate]);

  // Deep-link / breadcrumb-back: restore drill-down stack from ?chapter=&path=
  // so returning from LessonView lands exactly where the user came from.
  const restoredFromUrlRef = useRef(false);
  useEffect(() => {
    if (restoredFromUrlRef.current) return;
    if (allChapters.length === 0) return;
    const chapterParam = searchParams.get("chapter");
    if (!chapterParam) { restoredFromUrlRef.current = true; return; }
    const pathParam = searchParams.get("path");
    const stack = pathParam ? pathParam.split(",").filter(Boolean) : [];
    setParentChapterStack(stack);
    setSelectedChapterId(chapterParam);
    restoredFromUrlRef.current = true;
  }, [allChapters, searchParams]);

  // ── Memoised derived values — computed once per dependency change ──────────
  const selectedChapter = useMemo(
    () => allChapters.find(ch => ch.id === selectedChapterId) || chapters.find(ch => ch.id === selectedChapterId),
    [allChapters, chapters, selectedChapterId]
  );

  // Sub-chapters of the currently selected chapter
  const subChaptersOfSelected = useMemo(
    () => selectedChapterId && selectedChapterId !== "__all__"
      ? allChapters.filter(ch => ch.parent_id === selectedChapterId).sort((a, b) => a.position - b.position)
      : [],
    [allChapters, selectedChapterId]
  );

  const hasSubChapters = subChaptersOfSelected.length > 0;

  const chapterLessons = useMemo(
    () =>
      !selectedChapterId || selectedChapterId === "__all__"
        ? lessons
        : lessons.filter(l => l.chapterId === selectedChapterId),
    [lessons, selectedChapterId]
  );

  // Map of which lessons have a class PDF (used by counts hook + PDF filter)
  const classPdfMap = useMemo(() => {
    const m: Record<string, boolean> = {};
    chapterLessons.forEach(l => { if (l.classPdfUrl) m[l.id] = true; });
    return m;
  }, [chapterLessons]);

  const chapterLessonIds = useMemo(() => chapterLessons.map(l => l.id), [chapterLessons]);
  const attachmentCounts = useLessonNotesCounts(chapterLessonIds, classPdfMap);

  const filteredLessons = useMemo(() => {
    const isPdfLike = (l: typeof chapterLessons[number]) =>
      (l.lectureType || "VIDEO") === "PDF" ||
      !!l.classPdfUrl ||
      (attachmentCounts[l.id] || 0) > 0;

    let typeMatch: typeof chapterLessons;
    if (activeTab === "all") {
      typeMatch = chapterLessons;
    } else if (activeTab === "pdfs") {
      typeMatch = chapterLessons.filter(isPdfLike);
    } else {
      typeMatch = chapterLessons.filter(l => typeMapping[activeTab].includes(l.lectureType || "VIDEO"));
    }
    if (!lessonSearch.trim()) return typeMatch;
    const q = lessonSearch.toLowerCase();
    return typeMatch.filter(l => l.title.toLowerCase().includes(q));
  }, [chapterLessons, activeTab, lessonSearch, attachmentCounts]);

  const tabCounts = useMemo(() => ({
    all: chapterLessons.length,
    lectures: chapterLessons.filter(l => l.lectureType === "VIDEO").length,
    pdfs: chapterLessons.filter(l =>
      (l.lectureType || "VIDEO") === "PDF" ||
      !!l.classPdfUrl ||
      (attachmentCounts[l.id] || 0) > 0
    ).length,
    dpp: chapterLessons.filter(l => l.lectureType === "DPP").length,
    notes: chapterLessons.filter(l => l.lectureType === "NOTES").length,
  }), [chapterLessons, attachmentCounts]);

  const filteredSidebarChapters = useMemo(() => {
    if (!sidebarSearch.trim()) return chapters;
    const q = sidebarSearch.toLowerCase();
    return chapters.filter(
      ch => ch.title.toLowerCase().includes(q) || ch.code.toLowerCase().includes(q)
    );
  }, [chapters, sidebarSearch]);

  // ── Memoised breadcrumbs with stack ─────────────────────────────────────
  const stackBreadcrumbs = useMemo(() => {
    const segs: { label: string; href?: string; onClick?: () => void }[] = [
      { label: "Dashboard", href: "/dashboard" },
      { label: "My Courses", href: "/my-courses" },
    ];
    if (course) segs.push({ label: course.title, href: `/my-courses/${courseId}` });
    parentChapterStack.forEach((parentId, idx) => {
      const ch = allChapters.find(c => c.id === parentId);
      if (!ch) return;
      // Click pops the stack to this level so the breadcrumb is consistent
      // with the in-page drill-down history (matches Android back behaviour).
      segs.push({
        label: ch.title,
        onClick: () => {
          setParentChapterStack(prev => prev.slice(0, idx));
          setSelectedChapterId(parentId);
          setLessonSearch("");
        },
      });
    });
    if (selectedChapter && selectedChapter.id !== "__all__") {
      segs.push({ label: selectedChapter.title });
    }
    return segs;
  }, [course, courseId, parentChapterStack, allChapters, selectedChapter]);

  const chapterBreadcrumbs = useMemo(() => [
    { label: "Dashboard", href: "/dashboard" },
    { label: "My Courses", href: "/my-courses" },
    ...(course ? [{ label: course.title }] : []),
  ], [course]);

  const playerBreadcrumbs = useMemo(() => [
    { label: "Dashboard", href: "/dashboard" },
    { label: "My Courses", href: "/my-courses" },
    ...(course ? [{ label: course.title, href: `/my-courses/${courseId}` }] : []),
    ...(selectedLesson ? [{ label: selectedLesson.title }] : []),
  ], [course, courseId, selectedLesson]);

  // ── Memoised handlers — stable references across renders ──────────────────
  const handleContentClick = useCallback((lesson: Lesson) => {
    if (lesson.isLocked && !hasPurchased && !isAdminOrTeacher) {
      toast.error("This content is locked. Please purchase the course.");
      navigate(`/buy-course?id=${courseId}`);
      return;
    }
    // Carry the drill-down stack so back from LessonView restores this view.
    const path = parentChapterStack.filter(Boolean).join(",");
    const params = new URLSearchParams({ lessonId: lesson.id, from: "my-courses" });
    if (selectedChapterId && selectedChapterId !== "__all__") params.set("chapter", selectedChapterId);
    if (path) params.set("path", path);
    // For PDF / NOTES lessons, ask LessonView to auto-open the in-app PDF
    // reader instead of just landing the user on the lesson chrome — the
    // "Open" CTA on a PDF card should actually open the PDF.
    const lt = (lesson.lectureType || "").toUpperCase();
    if (lt === "PDF" || lt === "NOTES" || lt === "DPP") params.set("openPdf", "1");
    // Navigate to premium LessonView for ALL content types
    navigate(`/classes/${courseId}/lessons?${params.toString()}`);
  }, [hasPurchased, isAdminOrTeacher, courseId, navigate, parentChapterStack, selectedChapterId]);

  // ── id-keyed lesson lookup + stable row handlers ───────────────────────
  // Audit fix #7: `LectureRow` is memo'd by props; we therefore must pass
  // stable callback identities. Each handler accepts a lesson id, looks the
  // lesson up via `lessonsByIdRef`, and delegates. Both refs and useCallback
  // deps are intentionally minimal so the rows skip reconciliation on
  // unrelated state changes (search keystrokes, tab switches).
  const lessonsByIdRef = useRef<Map<string, Lesson>>(new Map());
  useEffect(() => {
    const m = new Map<string, Lesson>();
    for (const l of lessons) m.set(l.id, l);
    lessonsByIdRef.current = m;
  }, [lessons]);

  const handleRowSelect = useCallback((id: string) => {
    const lesson = lessonsByIdRef.current.get(id);
    if (!lesson) return;
    // For PDF / NOTES / DPP cards, open the in-page attachments drawer
    // directly instead of navigating away to LessonView. The drawer is a
    // faster, less disorienting affordance for pure-document content.
    const lt = (lesson.lectureType || "").toUpperCase();
    if (lt === "PDF" || lt === "NOTES" || lt === "DPP") {
      if (lesson.isLocked && !hasPurchased && !isAdminOrTeacher) {
        toast.error("This content is locked. Please purchase the course.");
        navigate(`/buy-course?id=${courseId}`);
        return;
      }
      setNotesSheetLesson(lesson);
      return;
    }
    handleContentClick(lesson);
  }, [handleContentClick, hasPurchased, isAdminOrTeacher, courseId, navigate]);

  const handleRowNotes = useCallback((id: string) => {
    const lesson = lessonsByIdRef.current.get(id);
    if (lesson) setNotesSheetLesson(lesson);
  }, []);

  const handleRowDownload = useCallback(async (id: string) => {
    const lesson = lessonsByIdRef.current.get(id);
    if (!lesson) return;
    const isNative = isNativePlatform();
    const toastId = toast.loading(`Saving "${lesson.title}" notes…`);
    try {
      const r = await downloadAllLessonNotes(lesson.id);
      if (r.total === 0) {
        toast.info("No notes attached to this lesson", { id: toastId });
      } else if (r.saved === 0) {
        toast.error("Download failed", { id: toastId });
      } else {
        toast.success(
          isNative
            ? `Saved ${r.saved}/${r.total} to Downloads`
            : `Downloaded ${r.saved}/${r.total} file(s)`,
          { id: toastId },
        );
      }
    } catch {
      toast.error("Download failed", { id: toastId });
    }
  }, []);


  const handleClosePlayer = useCallback(() => {
    setSelectedLesson(null);
    setSearchParams({});
    setLessonSearch("");
  }, [setSearchParams]);

  // ── Step back one in-page level: lesson → chapter → parent → root.
  // Used by Breadcrumb back AND hardware-back popstate.
  const closeOneLevel = useCallback((): boolean => {
    if (selectedLesson) {
      handleClosePlayer();
      return true;
    }
    if (selectedChapterId) {
      if (parentChapterStack.length) {
        const stack = [...parentChapterStack];
        const prev = stack.pop()!;
        setParentChapterStack(stack);
        setSelectedChapterId(prev);
      } else {
        setSelectedChapterId(null);
      }
      setLessonSearch("");
      return true;
    }
    return false;
  }, [selectedLesson, selectedChapterId, parentChapterStack, handleClosePlayer]);

  // Overlay sentinel: while the user is drilled into a lesson or chapter,
  // push ONE history entry so the Android hardware back button pops one
  // in-page level instead of leaving the route entirely.
  //
  // CRITICAL: we must not re-push / re-pop on every internal drill change
  // (e.g. Tense → Tense/Present). Doing so causes `history.back()` in the
  // cleanup to fire a popstate that the freshly-mounted listener catches,
  // which then runs `closeOneLevel` and kicks the user back out of the
  // folder they just entered. So: track the sentinel via refs and only
  // mutate history on the drilled ↔ not-drilled transition.
  const isDrilled = Boolean(selectedLesson || selectedChapterId);
  const sentinelActiveRef = useRef(false);
  const closeOneLevelRef = useRef(closeOneLevel);
  useEffect(() => { closeOneLevelRef.current = closeOneLevel; }, [closeOneLevel]);

  useEffect(() => {
    if (!isDrilled) return;
    if (sentinelActiveRef.current) return; // already mounted, keep one sentinel
    sentinelActiveRef.current = true;
    window.history.pushState({ overlay: true }, "");
    const onPop = () => {
      // Ignore pops caused by a NESTED overlay closing (DocReaderShell,
      // player fullscreen, dialogs). Our drill sentinel is still on top,
      // so history.state is still {overlay:true} — user did not intend to
      // leave the drill.
      if (window.history.state?.overlay) return;
      closeOneLevelRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      sentinelActiveRef.current = false;
      if (window.history.state?.overlay) {
        // Pop the sentinel we pushed so the back stack is balanced.
        window.history.back();
      }
    };
  }, [isDrilled]);


  // ── Toggle complete (works for VIDEO/PDF/DPP/NOTES/TEST) ─────────────────
  // Reads completed-set + lessons through refs so the callback identity stays
  // stable across renders. Without this, every toggle would recreate the
  // function and bust `React.memo(LectureRow)` for every row — making the
  // course detail list jank on long chapters. (Audit fix #7.)
  const completedRef = useRef(completedLessonIds);
  const lessonsRef = useRef(lessons);
  useEffect(() => { completedRef.current = completedLessonIds; }, [completedLessonIds]);
  useEffect(() => { lessonsRef.current = lessons; }, [lessons]);

  const handleToggleCompleteById = useCallback(async (lessonId: string) => {
    if (!user || !courseId) return;
    const wasCompleted = completedRef.current.has(lessonId);

    // Optimistic UI
    setCompletedLessonIds(prev => {
      const next = new Set(prev);
      if (wasCompleted) next.delete(lessonId); else next.add(lessonId);
      setChapters(chs => recomputeChapterCounts(next, lessonsRef.current, chs));
      return next;
    });

    try {
      if (wasCompleted) {
        const { error } = await supabase
          .from("user_progress")
          .update({ completed: false, last_watched_at: new Date().toISOString() })
          .eq("user_id", user.id)
          .eq("lesson_id", lessonId);
        if (error) throw error;
        progressMarkedRef.current.delete(lessonId);
        toast.success("Marked as not done");
      } else {
        const { error } = await supabase.from("user_progress").upsert({
          user_id: user.id,
          lesson_id: lessonId,
          course_id: Number(courseId),
          completed: true,
          watched_seconds: 0,
          last_watched_at: new Date().toISOString(),
        }, { onConflict: "user_id,lesson_id" });
        if (error) throw error;
        progressMarkedRef.current.add(lessonId);
        toast.success("Marked as complete! 🎉");
      }
    } catch (err) {
      console.warn("[progress] toggle failed", { lessonId, wasCompleted, err });
      // Rollback
      setCompletedLessonIds(prev => {
        const next = new Set(prev);
        if (wasCompleted) next.add(lessonId); else next.delete(lessonId);
        setChapters(chs => recomputeChapterCounts(next, lessonsRef.current, chs));
        return next;
      });
      toast.error(wasCompleted ? "Failed to update" : "Failed to mark complete");
    }
  }, [user, courseId]);

  // Lesson-object overload — preserved for the few legacy callers that still
  // pass a full Lesson (LessonView resume callback, etc.).
  const handleToggleComplete = useCallback((lesson: Lesson) => {
    void handleToggleCompleteById(lesson.id);
  }, [handleToggleCompleteById]);

  // Back-compat alias for any callers still using the old name
  const handleManualComplete = handleToggleComplete;





  // ── LOADING STATE ──────────────────────────────────────────
  if (loading || paymentSyncing) {
    return (
      <div className="min-h-dvh bg-background flex flex-col">
        <Header onMenuClick={() => setSidebarOpen(true)} userName={profile?.fullName || "User"} />
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="flex-1 p-5 space-y-3 max-w-2xl mx-auto w-full">
          {paymentSyncing && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-center">
              <p className="text-sm font-semibold text-foreground">Syncing your course…</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Payment received. We're confirming it with our server — this takes a few seconds.
              </p>
            </div>
          )}
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!course) {
    // Guard against the 1-frame race when returning from LessonView:
    // react-query has cached data (isPending=false) but local `course` state
    // hasn't been synced yet by the useEffect above. Show the skeleton until
    // the query has actually resolved with no data.
    // Only surface "Course not found" when the query has actually succeeded
    // AND confirmed no course row. Any other state (pending, fetching, error,
    // or success-with-data-that-hasn't-synced-to-local-state yet) must show
    // the skeleton — otherwise APK users see a "Course not found" flash on
    // back-navigation while local state catches up to the cached query.
    if (
      courseQuery.isFetching ||
      !courseQuery.isSuccess ||
      !!(courseQuery.data as any)?.course
    ) {
      return (
        <div className="min-h-dvh bg-background flex flex-col">
          <Header onMenuClick={() => setSidebarOpen(true)} userName={profile?.fullName || "User"} />
          <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
          <div className="flex-1 p-5 space-y-3 max-w-2xl mx-auto w-full">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-dvh bg-background flex flex-col">
        <Header onMenuClick={() => setSidebarOpen(true)} userName={profile?.fullName || "User"} />
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">Course not found</p>
        </div>
      </div>
    );
  }

  // ── MAIN VIEW ──────────────────────────────────────────────
  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <Header onMenuClick={() => setSidebarOpen(true)} userName={profile?.fullName || "User"} />



      {/* Mobile course sidebar backdrop */}
      {courseSidebarOpen && (
        <div aria-hidden="true" className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setCourseSidebarOpen(false)} />
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Chapter Sidebar */}
        <aside className={cn(
          "fixed md:sticky top-0 md:top-auto z-40 h-full md:h-auto flex-shrink-0 bg-card border-r flex flex-col transition-all duration-300",
          courseSidebarOpen ? "translate-x-0 w-64" : "-translate-x-full md:translate-x-0",
          sidebarCollapsed ? "md:w-0 md:overflow-hidden md:border-r-0" : "w-64 md:w-64"
        )}>
          <div className="flex items-center justify-between px-3 py-3 border-b shrink-0">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Subjects</span>
            <button onClick={() => setCourseSidebarOpen(false)} className="md:hidden p-1 rounded hover:bg-muted text-muted-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Search box */}
          <div className="px-3 py-2 border-b shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="Search chapters..."
                value={sidebarSearch}
                onChange={(e) => setSidebarSearch(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-muted rounded-md border-0 outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
              />
              {sidebarSearch && (
                <button
                  onClick={() => setSidebarSearch("")}
                  className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {filteredSidebarChapters.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4 px-2">
                  No chapters found
                </p>
              ) : filteredSidebarChapters.map((chapter) => {
                const isActive = selectedChapterId === chapter.id || (!selectedChapterId && chapter.id === "__all__");
                const pct = chapter.lessonCount > 0
                  ? Math.round((chapter.completedLessons / chapter.lessonCount) * 100)
                  : 0;
                return (
                  <button
                    key={chapter.id}
                    onClick={() => {
                      setSelectedChapterId(chapter.id);
                      setSelectedLesson(null);
                      setSearchParams({});
                      setLessonSearch("");
                      setCourseSidebarOpen(false);
                    }}
                    className={cn(
                      "w-full flex flex-col px-3 py-2 rounded-lg text-sm text-left transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary font-medium border-l-2 border-primary pl-2.5"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    {/* Top row */}
                    <div className="flex items-center gap-2 w-full">
                      <span className={cn(
                        "text-xs font-bold px-1.5 py-0.5 rounded shrink-0",
                        isActive ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                      )}>
                        {chapter.code}
                      </span>
                      <span className="flex-1 truncate leading-snug">{chapter.title}</span>
                      {chapter.lessonCount > 0 && (
                        <span className={cn(
                          "text-xs px-1 py-0.5 rounded-full shrink-0",
                          isActive ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                        )}>
                          {chapter.lessonCount}
                        </span>
                      )}
                    </div>
                    {/* Progress bar row */}
                    {chapter.lessonCount > 0 && (
                      <div className="mt-1.5 w-full space-y-0.5 pl-7">
                        <div className="h-1 bg-muted rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all duration-500",
                              pct === 100 ? "bg-green-500" : "bg-primary"
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {chapter.completedLessons}/{chapter.lessonCount} done
                        </p>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto min-w-0 bg-background pb-[calc(env(safe-area-inset-bottom)+88px)] md:pb-0">
          {/* Breadcrumbs with sidebar toggles. Height is published to
              CSS var --app-breadcrumb-h so the secondary sticky bar
              below can offset itself without a hardcoded 44px. */}
          <div
            ref={breadcrumbBarRef}
            className="sticky top-0 z-20 bg-background md:border-b"
          >
            {/* Desktop/tablet: full breadcrumb bar with toggles */}
            <div className="hidden md:flex items-center gap-2 px-4 py-2">
              <div className="flex-1 min-w-0">
                <Breadcrumbs
                  segments={selectedLesson ? playerBreadcrumbs : selectedChapterId ? stackBreadcrumbs : chapterBreadcrumbs}
                  onBack={() => {
                    if (!closeOneLevel()) navigate("/my-courses");
                  }}
                />
              </div>
              {!selectedLesson && lastWatchedLessonId && (() => {
                const resumeLesson = lessons.find(l => l.id === lastWatchedLessonId);
                if (!resumeLesson) return null;
                return (
                  <Button
                    size="sm"
                    className="shrink-0 gap-1.5 h-7 text-xs font-medium"
                    onClick={() => {
                      setSelectedLesson(resumeLesson);
                      setSearchParams({ lesson: resumeLesson.id });
                    }}
                  >
                    <Play className="h-3 w-3" />
                    Resume
                  </Button>
                );
              })()}
              <button
                onClick={() => setSidebarCollapsed(prev => !prev)}
                className="p-1.5 rounded-lg border bg-card text-muted-foreground hover:bg-muted transition-colors"
                title={sidebarCollapsed ? "Show chapters" : "Hide chapters"}
              >
                {sidebarCollapsed
                  ? <PanelLeftOpen className="h-4 w-4" />
                  : <PanelLeftClose className="h-4 w-4" />
                }
              </button>
            </div>
            {/* Mobile: ultra-compact control strip (back + resume + chapters) */}
            <div className="md:hidden flex items-center gap-1 px-2 h-9 border-b">
              <button
                onClick={() => { if (!closeOneLevel()) navigate("/my-courses"); }}
                className="inline-flex items-center justify-center h-8 w-8 -ml-1 rounded-lg text-foreground hover:bg-muted transition-colors active:scale-95"
                aria-label="Go back"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="flex-1 min-w-0" />
              {!selectedLesson && lastWatchedLessonId && (() => {
                const resumeLesson = lessons.find(l => l.id === lastWatchedLessonId);
                if (!resumeLesson) return null;
                return (
                  <Button
                    size="sm"
                    className="shrink-0 gap-1 h-7 text-xs font-medium px-2"
                    onClick={() => {
                      setSelectedLesson(resumeLesson);
                      setSearchParams({ lesson: resumeLesson.id });
                    }}
                  >
                    <Play className="h-3 w-3" />
                    Resume
                  </Button>
                );
              })()}
              <button
                onClick={() => setCourseSidebarOpen(true)}
                className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground hover:bg-muted transition-colors active:scale-95"
                aria-label="Open chapters"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* ── STATE 1: Chapter grid ── */}
          {!selectedChapterId && !selectedLesson && (
            <>
              <div className="sticky top-0 z-20 flex gap-6 px-5 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
                <button
                  onClick={() => setChapterTab("chapters")}
                  className={cn(
                    "pb-3 text-base font-medium relative transition-colors",
                    chapterTab === "chapters" ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  Subjects
                  {chapterTab === "chapters" && (
                    <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-primary rounded-full" />
                  )}
                </button>
                <button
                  onClick={() => setChapterTab("material")}
                  className={cn(
                    "pb-3 text-base font-medium relative transition-colors",
                    chapterTab === "material" ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  Study Material
                  {chapterTab === "material" && (
                    <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-primary rounded-full" />
                  )}
                </button>
              </div>

              <div className="p-5 space-y-3">
                {chapterTab === "chapters" &&
                  chapters.map((chapter) => (
                    <ChapterCard
                      key={chapter.id}
                      code={chapter.code}
                      title={chapter.title}
                      lectureCount={chapter.lessonCount}
                      completedLectures={chapter.completedLessons}
                      thumbnailUrl={chapter.thumbnailUrl}
                      showCode={false}
                      onClick={() => { setSelectedChapterId(chapter.id); setLessonSearch(""); }}
                    />
                  ))
                }
                {chapterTab === "material" && course && (
                  <StudyMaterialsList
                    courseId={course.id}
                    chapters={chapters.map((c) => ({ id: c.id, title: c.title }))}
                  />
                )}
              </div>
            </>
          )}

          {/* ── STATE 2: Lesson list ── */}
          {selectedChapterId && !selectedLesson && (() => {
            // Compute chapter-level completion (all types, not tab-filtered)
            const chapterLessons = selectedChapterId === "__all__"
              ? lessons
              : lessons.filter(l => l.chapterId === selectedChapterId);
            const totalInChapter = chapterLessons.length;
            const completedInChapter = chapterLessons.filter(l => completedLessonIds.has(l.id)).length;
            const pct = totalInChapter > 0 ? Math.round((completedInChapter / totalInChapter) * 100) : 0;
            const circumference = 2 * Math.PI * 14; // r=14 → ~88
            const strokeDashoffset = circumference - (pct / 100) * circumference;
            const isAllDone = totalInChapter > 0 && completedInChapter === totalInChapter;

            return (
              <>
                {/* ── Completion banner ── */}
                {totalInChapter > 0 && (
                  <div className={cn(
                    "mx-5 mt-3 px-4 py-3 rounded-xl border flex items-center gap-3 transition-all",
                    isAllDone
                      ? "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800/40"
                      : "bg-primary/5 border-primary/10"
                  )}>
                    {/* Circular progress ring */}
                    <div className="shrink-0">
                      <svg width="36" height="36" viewBox="0 0 36 36" className="-rotate-90">
                        <circle
                          cx="18" cy="18" r="14"
                          fill="none"
                          strokeWidth="3"
                          className="stroke-muted"
                        />
                        <circle
                          cx="18" cy="18" r="14"
                          fill="none"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeDasharray={circumference}
                          strokeDashoffset={strokeDashoffset}
                          className={isAllDone ? "stroke-green-500" : "stroke-primary"}
                          style={{ transition: "stroke-dashoffset 0.4s ease" }}
                        />
                        <text
                          x="18" y="18"
                          textAnchor="middle"
                          dominantBaseline="middle"
                          className="rotate-90"
                          style={{ transform: "rotate(90deg) translate(0px, -36px)", fontSize: "8px", fontWeight: 700, fill: "currentColor" }}
                        />
                      </svg>
                      {/* Percentage label in center */}
                      <div className="relative -mt-[34px] flex items-center justify-center h-[36px]">
                        <span className={cn(
                          "text-[10px] font-bold tabular-nums",
                          isAllDone ? "text-green-600 dark:text-green-400" : "text-primary"
                        )}>
                          {pct}%
                        </span>
                      </div>
                    </div>

                    {/* Text */}
                    <div className="flex-1 min-w-0">
                      {isAllDone ? (
                        <p className="text-sm font-semibold text-green-700 dark:text-green-400">
                          Chapter complete! 🎉
                        </p>
                      ) : (
                        <p className="text-sm font-medium text-foreground">
                          {completedInChapter} of {totalInChapter} lessons
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {isAllDone ? "All lessons completed" : `${totalInChapter - completedInChapter} remaining`}
                      </p>
                    </div>

                    {/* Trophy / checkmark badge */}
                    {isAllDone ? (
                      <Trophy className="h-5 w-5 text-green-500 shrink-0" />
                    ) : (
                      <div className="shrink-0 text-right">
                        <span className="text-xs text-muted-foreground tabular-nums font-medium">
                          {completedInChapter}/{totalInChapter}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Sub-chapters (folder drill-down) — primary view when they exist */}
                {hasSubChapters && (
                  <div className="p-5 space-y-3">
                    {subChaptersOfSelected.map((subCh) => (
                      <ChapterCard
                        key={subCh.id}
                        code={subCh.code}
                        title={subCh.title}
                        lectureCount={subCh.lessonCount}
                        completedLectures={subCh.completedLessons}
                        thumbnailUrl={subCh.thumbnailUrl}
                        onClick={() => {
                          setParentChapterStack(prev => [...prev, selectedChapterId!]);
                          setSelectedChapterId(subCh.id);
                          setLessonSearch("");
                        }}
                      />
                    ))}
                  </div>
                )}

                {/* Tab bar + view toggle + search + lessons.
                    Render whenever the chapter has direct lessons, even if it
                    also has sub-chapters — otherwise lessons attached directly
                    to the parent chapter (e.g. a docx under "Inbox") become
                    invisible and the "1/3" count never reconciles. */}
                {chapterLessons.length > 0 && (
                  <>
                    {/* Sticky filter + search header — freezes under the
                        breadcrumb bar (top-0 = ~44px). Mirrors the bottom
                        nav freeze pattern (Udemy/Khan-Academy/Vedantu): tabs
                        and search stay reachable while the lesson list
                        scrolls underneath. */}
                    <div className="sticky top-[var(--app-breadcrumb-h,44px)] z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75 border-b border-border/40">
                    <div className="flex items-center gap-2 px-4 py-2 min-w-0">

                      <div
                        role="tablist"
                        aria-label="Filter lessons by type"
                        className="flex gap-2 overflow-x-auto scrollbar-none flex-1 min-w-0 -mx-1 px-1"
                      >
                        {tabs.map((tab) => {
                          const count = tabCounts[tab.id];
                          const isActive = activeTab === tab.id;
                          return (
                            <button
                              key={tab.id}
                              role="tab"
                              aria-selected={isActive}
                              aria-label={`${tab.label} (${count})`}
                              onClick={() => setActiveTab(tab.id)}
                              className={cn(
                                "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap",
                                isActive
                                  ? "bg-primary text-primary-foreground shadow-sm"
                                  : "bg-muted/60 text-muted-foreground hover:bg-muted"
                              )}
                            >
                              {tab.label}
                              <span className={cn(
                                "shrink-0 text-[10px] px-1.5 py-0 rounded-full min-w-[18px] text-center leading-tight",
                                isActive ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                              )}>
                                {count}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      <div className="flex items-center gap-0.5 shrink-0 bg-muted/50 rounded-lg p-0.5">
                        <button
                          onClick={() => handleViewModeChange("card")}
                          title="Card view"
                          className={cn(
                            "p-1.5 rounded-md transition-all",
                            viewMode === "card"
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted"
                          )}
                        >
                          <LayoutGrid className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleViewModeChange("list")}
                          title="List view"
                          className={cn(
                            "p-1.5 rounded-md transition-all",
                            viewMode === "list"
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted"
                          )}
                        >
                          <LayoutList className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="px-5 pb-1 pt-2">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                        <input
                          type="text"
                          placeholder="Search lessons…"
                          value={lessonSearch}
                          onChange={(e) => setLessonSearch(e.target.value)}
                          className="w-full pl-9 pr-8 py-2 text-sm bg-muted rounded-xl border-0 outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground"
                        />
                        {lessonSearch && (
                          <button
                            onClick={() => setLessonSearch("")}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    </div>

                    <div className={cn("p-5", viewMode === "list" ? "space-y-2" : "space-y-4")}>

                      {filteredLessons.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                          <BookOpen className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                          <p className="text-muted-foreground font-medium">
                            {lessonSearch ? `No lessons match "${lessonSearch}"` : "No content found"}
                          </p>
                          <p className="text-sm text-muted-foreground/70 mt-1">
                            {lessonSearch ? "Try a different search term." : "Try switching tabs or check back later."}
                          </p>
                        </div>
                      ) : (
                        <div className={viewMode === "list" ? "space-y-1.5" : "space-y-4"}>
                          {filteredLessons.map((lesson) => (
                            <LectureRow
                              key={lesson.id}
                              id={lesson.id}
                              title={lesson.title}
                              lectureType={(lesson.lectureType || "VIDEO") as "VIDEO" | "PDF" | "DPP" | "NOTES" | "TEST"}
                              position={lesson.position ?? undefined}
                              duration={lesson.duration}
                              createdAt={lesson.createdAt}
                              youtubeId={lesson.youtubeId}
                              thumbnailUrl={lesson.thumbnailUrl}
                              isLocked={!!lesson.isLocked && !hasPurchased && !isAdminOrTeacher}
                              isCompleted={completedLessonIds.has(lesson.id)}
                              attachmentCount={attachmentCounts[lesson.id] || 0}
                              classPdfUrl={lesson.classPdfUrl}
                              videoUrl={lesson.videoUrl}
                              compact={viewMode === "list"}
                              onSelect={handleRowSelect}
                              onNotes={handleRowNotes}
                              onDownload={handleRowDownload}
                              onMarkComplete={handleToggleCompleteById}
                            />


                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            );
          })()}



        </main>
      </div>

      <LessonAttachmentsSheet
        open={!!notesSheetLesson}
        onOpenChange={(o) => { if (!o) setNotesSheetLesson(null); }}
        lessonId={notesSheetLesson?.id}
        lessonTitle={notesSheetLesson?.title}
        lessonType={notesSheetLesson?.lectureType}
        courseId={courseId}
      />
    </div>
  );
};

export default MyCourseDetail;
