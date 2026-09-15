import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import Header from "../components/Layout/Header";
import Sidebar from "../components/Layout/Sidebar";
import CourseCard, { CourseProps } from "../components/courses/CourseCard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { useNavigate } from "react-router-dom";
import { supabase } from "../integrations/supabase/client";
import { resolveContentUrls } from "../lib/resolveContentUrl";
import { useAdminEnrollment } from "../hooks/useAdminEnrollment";
import { useEnrollments } from "../hooks/useEnrollments";
import { useAuth } from "../contexts/AuthContext";
import Breadcrumbs from "../components/course/Breadcrumbs";
import { Skeleton } from "../components/ui/skeleton";

import coursePlaceholder from "../assets/thumbnails/course-default.svg";
import { logger } from "@/lib/logger";
import { selectionHaptic } from "@/lib/native/haptics";
import { prefetchIdle } from "@/lib/idlePrefetch";
import { formatGrade } from "../lib/formatGrade";


const Courses = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedGrade, setSelectedGrade] = useState<string>("all");
  const [priceFilter, setPriceFilter] = useState<"all" | "paid" | "free">("all");
  const navigate = useNavigate();
  const { adminEnroll, isAdmin, isEnrolling } = useAdminEnrollment();
  const { enrollInCourse } = useEnrollments();
  const { user } = useAuth();

  // Cached course lesson stats — was the #1 slow query (20.5s total across 636 calls).
  // 5min staleTime dedupes across every Courses mount / tab return.
  const { data: lessonCounts = {} } = useQuery({
    queryKey: ["course-lesson-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_course_lesson_stats");
      if (error) throw error;
      const counts: Record<number, { count: number; duration: number }> = {};
      (data as Array<{ course_id: number; lesson_count: number; total_duration: number }> | null)?.forEach((row) => {
        if (!row.course_id) return;
        counts[row.course_id] = {
          count: Number(row.lesson_count) || 0,
          duration: Number(row.total_duration) || 0,
        };
      });
      return counts;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  // ── Courses list ──────────────────────────────────────────────────────────
  // PERF (audit 2026-07-31): this used to be a useState + useEffect fetch that
  // (a) re-ran on every mount, (b) pulled `select("*")` (teacher bio, dates,
  // long descriptions) and (c) issued ONE createSignedUrl round-trip PER course
  // before painting — 20+ sequential-ish storage calls on a 20-course list.
  // Now: react-query cache + narrow column list + a single batched
  // createSignedUrls call.
  const { data: courseList = [], isLoading: loading } = useQuery({
    queryKey: ["courses-catalog"],
    queryFn: async (): Promise<CourseProps[]> => {
      const { data, error } = await supabase
        .from("courses")
        .select("id, title, grade, description, price, image_url, thumbnail_url")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = data ?? [];

      // Storage objects that didn't survive the Supabase project migration
      // resolve to null — fall back to the branded placeholder.
      const signed = await resolveContentUrls(
        rows.map((item) => item.image_url || item.thumbnail_url || null),
      );

      return rows.map((item, i: number) => ({
        id: item.id,
        title: item.title,
        grade: Number(item.grade) || 0,
        image_url: signed[i] ?? coursePlaceholder,
        description: item.description || "No description available",
        price: Number(item.price) || 0,
        rating: 4.8,
        duration: "0m",
        lessons_count: 0,
      }));
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const [enrolledCourseIds, setEnrolledCourseIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetchEnrollments();
    // Warm the two heaviest lazy chunks a user is likely to open next
    // (course detail + lesson view). Fire-and-forget during idle time.
    prefetchIdle(
      () => import("./MyCourseDetail"),
      () => import("./LessonView"),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const fetchEnrollments = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from("enrollments")
        .select("course_id, status")
        .eq("user_id", user.id)
        .eq("status", "active");

      if (!error && data) {
        setEnrolledCourseIds(new Set(data.map((e) => e.course_id)));
      }
    } catch (error) {
      logger.error("Error fetching enrollments:", error);
    }
  };

  const formatDuration = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };


  const gradeOptions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  const filteredCourses = courseList.filter((c) => {
    if (selectedGrade !== "all" && String(c.grade) !== String(selectedGrade)) return false;
    const price = Number(c.price) || 0;
    if (priceFilter === "paid" && price <= 0) return false;
    if (priceFilter === "free" && price > 0) return false;
    return true;
  });

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <Header onMenuClick={() => setSidebarOpen(true)} />

      <Breadcrumbs segments={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "All Courses" },
      ]} />

      <main className="flex-1 p-4 space-y-4 pb-20 md:pb-4">
        <div className="flex justify-center gap-2 overflow-x-auto scrollbar-none">
          {([
            { id: "paid", label: "Paid" },
            { id: "free", label: "Free" },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                void selectionHaptic();
                setPriceFilter((prev) => (prev === tab.id ? "all" : tab.id));
              }}
              className={
                "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all active:scale-[0.97] " +
                (priceFilter === tab.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted")
              }
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between">
          {loading ? (
            <Skeleton className="h-4 w-32 rounded-full" />
          ) : (
            <p className="text-sm text-muted-foreground">
              {filteredCourses.length} courses available
            </p>
          )}
          <Select value={selectedGrade} onValueChange={setSelectedGrade}>
            <SelectTrigger className="w-32 h-11 bg-card border-border">
              <SelectValue placeholder="All Grades" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Grades</SelectItem>
              {gradeOptions.map((grade) => (
                <SelectItem key={grade} value={String(grade)}>
                  {formatGrade(grade, "Grade")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div
            role="status"
            aria-busy="true"
            aria-label="Loading courses"
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-border bg-card overflow-hidden"
              >
                <Skeleton className="aspect-video w-full rounded-none" />
                <div className="p-4 space-y-3">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                  <div className="flex items-center justify-between pt-2">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-9 w-24 rounded-md" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredCourses.map((course) => {
              const stats = lessonCounts[course.id];
              const enriched = {
                ...course,
                lessons_count: stats?.count || 0,
                duration: stats && stats.duration > 0 ? formatDuration(stats.duration) : "",
              };
              const isEnrolled = enrolledCourseIds.has(course.id);
              return (
                <CourseCard 
                  key={course.id} 
                  course={enriched}
                  isAdmin={isAdmin}
                  onAdminEnroll={adminEnroll}
                  isEnrolling={isEnrolling}
                  isEnrolled={isEnrolled}
                  onEnrollFree={course.price === 0 && !isEnrolled ? async () => {
                    // Delegate to the single canonical enroll path (useEnrollments hook).
                    // Handles auth check, duplicate detection, RLS errors, and toasts.
                    const ok = await enrollInCourse(course.id);
                    if (ok) {
                      setEnrolledCourseIds(prev => new Set([...prev, course.id]));
                    }
                  } : undefined}
                  onClick={() => {
                    void selectionHaptic();
                    if (course.price === 0 || isEnrolled) {
                      navigate(`/classes/${course.id}/chapters?from=courses`);
                    } else {
                      navigate(`/buy-course?id=${course.id}`);
                    }
                  }}
                />
              );
            })}
          </div>
        )}

        {!loading && filteredCourses.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No courses found for this grade.</p>
          </div>
        )}
      </main>
      

    </div>
  );
};

export default Courses;
