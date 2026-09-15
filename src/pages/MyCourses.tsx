import { useState, useEffect, useCallback, useMemo, memo } from "react";
import { reportError } from "@/lib/sentry";
import { useNavigate } from "react-router-dom";
import { tapHaptic, selectionHaptic } from "@/lib/native/haptics";
import { BackButton } from "../components/ui/BackButton";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import Breadcrumbs from "../components/course/Breadcrumbs";
import { Badge } from "../components/ui/badge";
import { Progress } from "../components/ui/progress";
import { Skeleton } from "../components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import { 
  Search, PlayCircle, BookOpen, Clock, Calendar,
  GraduationCap, ChevronRight, Trash2, AlertTriangle, RefreshCw
} from "lucide-react";
import { cn } from "../lib/utils";
import { Link } from "react-router-dom";
import { useToast } from "../hooks/use-toast";
import WhatsAppButton from "../components/common/WhatsAppButton";
import { SmartImage } from "../components/common/SmartImage";
import coursePlaceholder from "../assets/thumbnails/course-default.svg";
import { resolveContentUrls } from "../lib/resolveContentUrl";
import { useEnrollmentArrival } from "../hooks/useEnrollmentArrival";
import { formatGrade } from "../lib/formatGrade";



interface EnrolledCourse {
  enrollmentId: number;
  id: number;
  title: string;
  description: string | null;
  grade: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  price: number | null;
  startDate: string | null;
  endDate: string | null;
  purchased_at: string;
  totalLessons: number;
  completedLessons: number;
  progressPercent: number;
  isDuplicate: boolean;
}

type PriceFilter = "all" | "paid" | "free";

// ── Static outside component ───────────────────────────────────────────────
// "All" removed — user can toggle Paid/Free off (click again) to see all.
const priceTabs: { id: Exclude<PriceFilter, "all">; label: string }[] = [
  { id: "paid", label: "Paid" },
  { id: "free", label: "Free" },
];

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

const formatShortDate = (dateString: string) => {
  const d = new Date(dateString);
  return {
    day: d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    year: d.getFullYear().toString(),
  };
};

// ── Route chunk prefetch ───────────────────────────────────────────────────
// Warms the MyCourseDetail JS chunk when a card is visible / hovered / pressed,
// so the transition to `/my-courses/:id` is near-instant. Runs at most once
// per session because dynamic imports are cached by the module graph.
let _detailChunkWarmed = false;
const prefetchDetailChunk = () => {
  if (_detailChunkWarmed) return;
  _detailChunkWarmed = true;
  import("./MyCourseDetail").catch(() => {
    _detailChunkWarmed = false; // allow a retry if it fails
  });
};

const CourseCard = memo(({ course, onNavigate, onDelete }: {
  course: EnrolledCourse;
  onNavigate: (id: number) => void;
  onDelete: (enrollmentId: number, title: string) => void;
}) => {
  // Warm the detail chunk when the card first scrolls into view.
  const cardRef = (node: HTMLDivElement | null) => {
    if (!node || _detailChunkWarmed || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        prefetchDetailChunk();
        io.disconnect();
      }
    }, { rootMargin: "200px" });
    io.observe(node);
  };

  const startLabel = course.startDate ? `Starts ${formatDate(course.startDate)}` : "";
  const endLabel = course.endDate ? `Ends ${formatDate(course.endDate)}` : "";
  const ctaLabel = course.progressPercent >= 100 ? "Review" : course.progressPercent > 0 ? "Continue" : "Start Learning";

  return (
  <Card
    ref={cardRef}
    className={cn(
      "overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm hover:shadow-xl active:scale-[0.99] transition-all duration-300 cursor-pointer group relative",
      course.isDuplicate && "border-destructive/40 bg-destructive/5"
    )}
    onPointerDown={prefetchDetailChunk}
    onMouseEnter={prefetchDetailChunk}
    onFocus={prefetchDetailChunk}
  >
    {course.isDuplicate && (
      <div className="absolute top-2 right-2 z-20 flex items-center gap-1 bg-destructive/90 text-destructive-foreground text-[10px] font-semibold px-2 py-0.5 rounded-full shadow">
        <AlertTriangle className="h-3 w-3" />
        Duplicate
      </div>
    )}

    <button
      type="button"
      onClick={() => { void selectionHaptic(); onNavigate(course.id); }}
      aria-label={`Open ${course.title} — ${course.progressPercent}% complete`}
      className="relative aspect-[16/9] w-full bg-muted overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <SmartImage
        src={course.thumbnailUrl || course.imageUrl || coursePlaceholder}
        alt={course.title}
        width={600}
        height={338}
        fallbackSrc={coursePlaceholder}
            className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform [transition-duration:600ms]"
      />
      {/* Gradient veil for legibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent pointer-events-none" />
      {/* Grade chip */}
      <Badge
        aria-label={`Class ${course.grade || 'General'}`}
        className="absolute top-3 left-3 bg-primary text-primary-foreground text-[11px] font-semibold px-2.5 py-1 rounded-full shadow-sm"
      >
        {formatGrade(course.grade) || 'General'}
      </Badge>
      {/* Progress chip — WCAG AA contrast (solid card bg, not translucent) */}
      {course.totalLessons > 0 && (
        <div
          role="progressbar"
          aria-valuenow={course.progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${course.progressPercent}% complete`}
          className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-card rounded-full px-2.5 py-1 shadow-md border border-border/50"
        >
          <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" aria-hidden="true" />
          <span className="text-[11px] font-semibold text-foreground tabular-nums">{course.progressPercent}%</span>
        </div>
      )}
      {/* Play affordance */}
      <div aria-hidden="true" className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
        <div className="h-14 w-14 rounded-full bg-background/95 backdrop-blur-sm flex items-center justify-center shadow-lg">
          <PlayCircle className="h-8 w-8 text-primary" />
        </div>
      </div>
    </button>

    <CardContent className="p-4 space-y-3">
      {/* Title + WhatsApp */}
      <div className="flex items-start justify-between gap-2">
        <h3
          className="font-bold text-[15px] leading-snug text-foreground line-clamp-2 group-hover:text-primary transition-colors cursor-pointer flex-1"
          onClick={() => onNavigate(course.id)}
        >
          {course.title}
        </h3>
        <WhatsAppButton
          message={`Hi, I need help with my course: ${course.title}`}
          title={`Ask about ${course.title} on WhatsApp`}
        />
      </div>
      {course.description && (
        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{course.description}</p>
      )}

      {/* Start / End date pills — foreground token for AA contrast */}
      {(course.startDate || course.endDate) && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {course.startDate && (
            <div
              aria-label={startLabel}
              className="inline-flex items-center gap-1 bg-primary/10 text-foreground rounded-full px-2 py-0.5 border border-primary/20"
            >
              <Calendar className="h-3 w-3 text-primary" aria-hidden="true" />
              <span className="font-medium">Start {formatShortDate(course.startDate).day}</span>
            </div>
          )}
          {course.endDate && (
            <div
              aria-label={endLabel}
              className="inline-flex items-center gap-1 bg-muted text-foreground rounded-full px-2 py-0.5 border border-border"
            >
              <Clock className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
              <span className="font-medium">End {formatShortDate(course.endDate).day}</span>
            </div>
          )}
        </div>
      )}

      {/* Progress */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-[11px]">
          <span className="text-muted-foreground font-medium">
            {course.totalLessons === 0
              ? "No lessons yet"
              : `${course.completedLessons}/${course.totalLessons} lessons`}
          </span>
          <span className="text-primary font-semibold">
            {course.totalLessons === 0 ? "—" : `${course.progressPercent}%`}
          </span>
        </div>
        <Progress value={course.progressPercent} className="h-1.5 rounded-full" />
      </div>

      {/* CTA row — 44px tap targets (iOS HIG / Android 48dp) */}
      <div className="flex items-center gap-2 pt-1">
        <Button
          size="sm"
          onClick={() => { void tapHaptic("light"); onNavigate(course.id); }}
          aria-label={`${ctaLabel}: ${course.title}`}
          className="flex-1 h-11 rounded-xl font-semibold shadow-sm active:scale-[0.98] transition-transform duration-150 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          {ctaLabel}
          <ChevronRight className="h-4 w-4 ml-0.5" aria-hidden="true" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          className={cn(
            "h-11 w-11 p-0 rounded-xl border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 hover:bg-destructive/5 active:scale-[0.95] transition-all duration-150 focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2",
            course.isDuplicate && "text-destructive border-destructive/40"
          )}
          onClick={(e) => {
            e.stopPropagation();
            void tapHaptic("medium");
            onDelete(course.enrollmentId, course.title);
          }}
          title="Remove enrollment"
          aria-label={`Remove ${course.title} from your courses`}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      {/* Enrolled meta */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5">
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/80">
          <Clock className="h-3 w-3" />
          Enrolled {formatDate(course.purchased_at)}
        </span>
      </div>

    </CardContent>
  </Card>
  );
});
CourseCard.displayName = "CourseCard";

const MyCourses = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [courses, setCourses] = useState<EnrolledCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("all");

  const [deleteTarget, setDeleteTarget] = useState<{ enrollmentId: number; title: string } | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  // Reset the typed-confirmation input whenever the dialog opens/closes or target changes.
  useEffect(() => { setConfirmText(""); }, [deleteTarget]);

  // ── useCallback so useEffect dep array is stable ──────────────────────────
  const fetchEnrolledCourses = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    try {
      setFetchError(null);
      // ── 3 queries → 2 parallel groups (enrollments → then progress+lessons) ─
      // Bandwidth: trim enrollments + courses(*) — this was ~5.7k calls/day,
      // #3 offender in slow_queries. Only fields the card renders below.
      const { data: enrollments, error } = await supabase
        .from('enrollments')
        .select('id, course_id, purchased_at, status, courses(id, title, grade, image_url, thumbnail_url, price, start_date, end_date, description)')
        .eq('user_id', user.id)
        .eq('status', 'active');

      if (error) throw error;

      const courseIds = (enrollments || []).map((e) => e.course_id);

      // Fetch progress and lessons in parallel
      const [progressRes, lessonsRes] = await Promise.all([
        supabase
          .from('user_progress')
          .select('lesson_id, completed, course_id')
          .eq('user_id', user.id),
        supabase
          .from('lessons')
          .select('id, course_id')
          .in('course_id', courseIds.length > 0 ? courseIds : [-1]),
      ]);

      const progressData = progressRes.data || [];
      const allLessons = lessonsRes.data || [];

      const courseIdCounts: Record<number, number> = {};
      (enrollments || []).forEach((e) => {
        courseIdCounts[e.course_id] = (courseIdCounts[e.course_id] || 0) + 1;
      });

      const seenCourseIds: Record<number, number> = {};

      const enrolledCoursesRaw = (enrollments || []).map((enrollment) => {
        const course = enrollment.courses;
        if (!course) return null;

        const courseLessons = allLessons.filter((l) => l.course_id === course.id);
        const courseLessonIds = new Set(courseLessons.map((l) => l.id));
        // Use lesson_id fallback in case course_id is null in user_progress records
        const completedLessons = progressData.filter(
          (p) => p.completed && (p.course_id === course.id || courseLessonIds.has(p.lesson_id))
        );
        const totalLessons = courseLessons.length;
        const progressPercent = totalLessons > 0
          ? Math.round((completedLessons.length / totalLessons) * 100)
          : 0;

        seenCourseIds[course.id] = (seenCourseIds[course.id] || 0) + 1;
        const isDuplicate = courseIdCounts[course.id] > 1 && seenCourseIds[course.id] > 1;

        return {
          enrollmentId: enrollment.id,
          id: course.id,
          title: course.title,
          description: course.description,
          grade: course.grade,
          imageUrl: course.image_url,
          thumbnailUrl: course.thumbnail_url,
          price: course.price,
          startDate: course.start_date ?? null,
          endDate: course.end_date ?? null,
          purchased_at: enrollment.purchased_at || new Date().toISOString(),
          totalLessons,
          completedLessons: completedLessons.length,
          progressPercent,
          isDuplicate,
        };
      }).filter(Boolean) as EnrolledCourse[];

      // Sign legacy `/object/public/content/...` URLs so private-bucket thumbnails load.
      // PERF: one batched createSignedUrls call instead of 2 storage round-trips
      // per enrolled course (was 2N requests before first paint).
      const signed = await resolveContentUrls(
        enrolledCoursesRaw.flatMap((c) => [c.imageUrl, c.thumbnailUrl]),
      );
      const enrolledCourses: EnrolledCourse[] = enrolledCoursesRaw.map((c, i) => ({
        ...c,
        imageUrl: signed[i * 2],
        thumbnailUrl: signed[i * 2 + 1],
      }));

      setCourses(enrolledCourses);

    } catch (error) {
      reportError(error, { surface: "MyCourses.fetch" });
      setFetchError(error instanceof Error ? error.message : "Could not load your courses.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchEnrolledCourses();
  }, [fetchEnrolledCourses]);

  // Refetch when window regains focus (e.g., returning from MyCourseDetail)
  useEffect(() => {
    const handleFocus = () => fetchEnrolledCourses();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [fetchEnrolledCourses]);

  // ── Post-purchase arrival reconciliation ──────────────────────────────────
  // A paid course can land here before its enrollment row exists (verify
  // returned 503 and the webhook is still in flight). This reconciles, polls
  // briefly, and subscribes to realtime as a backstop. No-op on normal visits.
  const enrolledCourseIds = useMemo(() => courses.map((c) => c.id), [courses]);
  const { reconciling, recoverNow } = useEnrollmentArrival({
    userId: user?.id,
    enrolledCourseIds,
    loading,
    refetch: fetchEnrolledCourses,
    onRecovered: () => {
      toast({ title: "Enrollment confirmed ✓", description: "Your course is ready." });
    },
  });

  const [recovering, setRecovering] = useState(false);
  const handleManualRecover = async () => {
    void tapHaptic("light");
    setRecovering(true);
    try {
      const result = await recoverNow();
      if (result === "recovered") {
        toast({ title: "Enrollment recovered ✓", description: "Your course should appear now." });
      } else if (result === "nothing") {
        toast({ title: "No pending payment found", description: "Nothing to recover on this device." });
      } else {
        toast({
          title: "Couldn't confirm yet",
          description: "If your payment was captured, enrollment will happen automatically via webhook. Please check again in a few minutes.",
          variant: "destructive",
        });
      }
    } finally {
      setRecovering(false);
    }
  };



  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('enrollments')
        .delete()
        .eq('id', deleteTarget.enrollmentId)
        .eq('user_id', user?.id);

      if (error) throw error;

      setCourses(prev => prev.filter(c => c.enrollmentId !== deleteTarget.enrollmentId));
      toast({ title: "Enrollment removed ✓", description: `"${deleteTarget.title}" हटा दिया गया।` });
    } catch (err) {
      toast({ title: "Error", description: "Could not remove enrollment. Try again.", variant: "destructive" });
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  // ── Memoised derived list ─────────────────────────────────────────────────
  const filteredCourses = useMemo(() =>
    courses
      .filter(c => {
        if (searchQuery.trim() && !c.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        const price = Number(c.price) || 0;
        if (priceFilter === "paid" && price <= 0) return false;
        if (priceFilter === "free" && price > 0) return false;
        return true;
      })
      .sort((a, b) => new Date(b.purchased_at).getTime() - new Date(a.purchased_at).getTime()),
    [courses, searchQuery, priceFilter]
  );

  const duplicateCount = useMemo(
    () => courses.filter(c => c.isDuplicate).length,
    [courses]
  );

  const handleNavigate = useCallback((id: number) => navigate(`/my-courses/${id}`), [navigate]);
  const handleDelete = useCallback((enrollmentId: number, title: string) => setDeleteTarget({ enrollmentId, title }), []);

  if (!user) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <Card className="w-full max-w-md mx-4">
          <CardHeader className="text-center">
            <CardTitle>Login Required</CardTitle>
            <CardDescription>Please login to view your purchased courses</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button onClick={() => navigate('/login')}>Go to Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background nb-smooth-scroll">
      <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur-md supports-[backdrop-filter]:bg-card/80 safe-area-top will-change-transform">
        <div className="container mx-auto px-4 py-2 min-h-[52px] flex items-center gap-3">
          <BackButton />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-foreground truncate">My Courses</h1>
            <p className="text-sm text-muted-foreground truncate">
              {courses.length} {courses.length === 1 ? 'course' : 'courses'} enrolled
              {duplicateCount > 0 && (
                <span className="ml-2 text-destructive font-medium">• {duplicateCount} duplicate{duplicateCount > 1 ? 's' : ''} found</span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              void selectionHaptic();
              setSearchOpen((v) => {
                if (v) setSearchQuery("");
                return !v;
              });
            }}
            aria-label={searchOpen ? "Close search" : "Search courses"}
            aria-pressed={searchOpen}
            className="nb-tap shrink-0 inline-flex items-center justify-center h-10 w-10 rounded-full text-foreground/70 hover:text-foreground hover:bg-muted/60 transition-colors duration-150 min-h-[44px] min-w-[44px]"
          >
            <Search className="h-4 w-4" />
          </button>
        </div>
      </header>




      {duplicateCount > 0 && (
        <div className="container mx-auto px-4 pt-4">
          <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Duplicate Enrollments Detected!</p>
              <p className="text-destructive/80 text-xs mt-0.5">
                {duplicateCount} duplicate enrollment{duplicateCount > 1 ? 's' : ''} found. Orange-bordered cards are duplicates — click 🗑️ to remove them.
              </p>
            </div>
          </div>
        </div>
      )}

      <main className="container mx-auto px-4 py-6 pb-20 md:pb-6">
        <div className="flex justify-center gap-2 mb-4 overflow-x-auto scrollbar-none">
          {priceTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                void selectionHaptic();
                setPriceFilter((prev) => (prev === tab.id ? "all" : tab.id));
              }}
              className={cn(
                "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all active:scale-[0.97]",
                priceFilter === tab.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {searchOpen && (
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="Search your courses..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        )}
        {!searchOpen && <div className="mb-2" />}

        {loading && (
          <div
            role="status"
            aria-busy="true"
            aria-label="Loading your courses"
            className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="overflow-hidden rounded-2xl border border-border/70">
                <Skeleton className="aspect-[16/9] w-full rounded-none" />
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-5 w-5 rounded-full" />
                  </div>
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-5/6" />
                  <div className="flex gap-1.5">
                    <Skeleton className="h-5 w-20 rounded-full" />
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </div>
                  <Skeleton className="h-1.5 w-full rounded-full" />
                  <div className="flex gap-2 pt-1">
                    <Skeleton className="h-11 flex-1 rounded-xl" />
                    <Skeleton className="h-11 w-11 rounded-xl" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {!loading && fetchError && (
          <Card className="border-destructive/40 bg-destructive/5" role="alert">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <AlertTriangle className="h-12 w-12 text-destructive mb-4" aria-hidden="true" />
              <h3 className="text-lg font-semibold text-foreground mb-2">Couldn't load your courses</h3>
              <p className="text-sm text-muted-foreground mb-6 max-w-md">{fetchError}</p>
              <Button
                variant="outline"
                onClick={() => { void tapHaptic("light"); setLoading(true); fetchEnrolledCourses(); }}
                className="h-11 rounded-xl active:scale-[0.98] transition-transform duration-150"
              >
                <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" /> Try Again
              </Button>
            </CardContent>
          </Card>
        )}

        {!loading && !fetchError && courses.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <GraduationCap className="h-16 w-16 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">
                {reconciling ? "Confirming your purchase…" : "No Courses Yet"}
              </h3>
              <p className="text-muted-foreground text-center mb-6 max-w-md">
                {reconciling
                  ? "We're finalising your enrollment. This usually takes a few seconds."
                  : "Browse our catalog to find the perfect course."}
              </p>
              <div className="flex flex-col sm:flex-row items-center gap-2">
                <Button onClick={() => navigate('/courses')}>
                  <BookOpen className="h-4 w-4 mr-2" /> Browse Courses
                </Button>
                <Button
                  variant="outline"
                  onClick={handleManualRecover}
                  disabled={recovering || reconciling}
                  className="h-10 rounded-xl"
                >
                  <RefreshCw className={cn("h-4 w-4 mr-2", (recovering || reconciling) && "animate-spin")} />
                  {recovering || reconciling ? "Checking…" : "Recently paid? Recover enrollment"}
                </Button>
              </div>

            </CardContent>
          </Card>
        )}

        {!loading && !fetchError && courses.length > 0 && filteredCourses.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Search className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No Results</h3>
              <Button variant="outline" onClick={() => { setSearchQuery(""); setPriceFilter("all"); }}>
                Clear Filters
              </Button>
            </CardContent>
          </Card>
        )}

        {!loading && !fetchError && filteredCourses.length > 0 && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCourses.map((course) => (
              <CourseCard
                key={course.enrollmentId}
                course={course}
                onNavigate={handleNavigate}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </main>



      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Enrollment?</AlertDialogTitle>
            <AlertDialogDescription>
              To confirm, type the course name exactly as shown below. This prevents
              accidental removal — pasting is disabled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-1">
            <div className="rounded-md bg-muted px-3 py-2 text-sm font-semibold text-foreground break-words select-none">
              {deleteTarget?.title}
            </div>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              onPaste={(e) => e.preventDefault()}
              onDrop={(e) => e.preventDefault()}
              onContextMenu={(e) => e.preventDefault()}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              autoCapitalize="off"
              inputMode="text"
              placeholder="Type the course name to confirm"
              disabled={isDeleting}
              className="text-base"
              aria-label="Type the course name to confirm removal"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={
                isDeleting ||
                confirmText.trim().toLowerCase() !==
                  (deleteTarget?.title ?? "").trim().toLowerCase()
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default MyCourses;
