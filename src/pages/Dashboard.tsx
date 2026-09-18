import { useState, useEffect, useMemo } from "react";
import { mark, measure } from "@/lib/perf/marks";
import { safeGet, safeSet } from "@/lib/storage";
import { useNavigate } from "react-router-dom";
import { supabase } from "../integrations/supabase/client";
import { logger } from "@/lib/logger";
import { useAuth } from "../contexts/AuthContext";
import Header from "../components/Layout/Header";
import Sidebar from "../components/Layout/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Progress } from "../components/ui/progress";
import { Badge } from "../components/ui/badge";
import { 
  PlayCircle, Zap, 
  ClipboardCheck, FileText, Users, Calendar, Trophy, CheckCircle2, XCircle,
  Download, X, WifiOff,
  BookOpen, ClipboardList, MessageCircleQuestion, Library, Bell, BarChart3,
} from "lucide-react";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import appLogo from "../assets/branding/jsr-mark.webp";
import BatchSelector from "../components/dashboard/BatchSelector";
import { useBatch } from "../contexts/BatchContext";
import HeroCarousel from "../components/dashboard/HeroCarousel";
import UpcomingSchedule from "../components/dashboard/UpcomingSchedule";
import LiveBadge from "../components/live/LiveBadge";
import { SmartImage } from "../components/common/SmartImage";
import coursePlaceholder from "../assets/thumbnails/course-default.svg";

import UpcomingLiveSessions from "../components/live/UpcomingLiveSessions";
import { Video } from "lucide-react";
import { formatGrade } from "../lib/formatGrade";

// Quick actions use bundled lucide icons (no remote CDN pointers) so they can
// never render as broken images in the APK / preview.
const studentQuickActions = [
  { Icon: BookOpen, label: "All Classes", path: "/all-classes", bg: "bg-blue-50 dark:bg-blue-950/30", fg: "text-blue-600 dark:text-blue-300" },
  { Icon: ClipboardList, label: "All Tests", path: "/all-tests", bg: "bg-purple-50 dark:bg-purple-950/30", fg: "text-purple-600 dark:text-purple-300" },
  { Icon: MessageCircleQuestion, label: "My Doubts", path: "/doubts", bg: "bg-teal-50 dark:bg-teal-950/30", fg: "text-teal-600 dark:text-teal-300" },
  { Icon: Library, label: "Library", path: "/materials", bg: "bg-pink-50 dark:bg-pink-950/30", fg: "text-pink-600 dark:text-pink-300" },
  { Icon: Bell, label: "Notices", path: "/notices", bg: "bg-orange-50 dark:bg-orange-950/30", fg: "text-orange-600 dark:text-orange-300" },
  { Icon: BarChart3, label: "Performance", path: "/reports", bg: "bg-green-50 dark:bg-green-950/30", fg: "text-green-600 dark:text-green-300" },
];

// Cold-start cache for the dashboard snapshot. Keyed per user so switching
// accounts never shows the previous student's courses.
const SNAPSHOT_CACHE_PREFIX = "nb_dash_snap_v1_";
const SNAPSHOT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// ── Static outside component — recreated on every render otherwise ─────────
const teacherFeatures = [
  { icon: ClipboardCheck, label: "Attendance", color: "text-blue-600 bg-blue-100", path: "/attendance" },
  { icon: FileText, label: "Report Card", color: "text-purple-600 bg-purple-100", path: "/reports" },
  { icon: Users, label: "Students", color: "text-green-600 bg-green-100", path: "/students" },
  { icon: Calendar, label: "Timetable", color: "text-orange-600 bg-orange-100", path: "/timetable" },
];

interface QuizAttemptRow {
  id: string;
  quiz_id: string;
  score: number | null;
  percentage: number | null;
  passed: boolean | null;
  created_at: string | null;
  quizzes: {
    title: string;
    type: string | null;
    total_marks: number | null;
  } | null;
}

interface SnapshotEnrollmentCourse {
  id: number;
  title: string | null;
  description: string | null;
  grade: string | null;
  image_url: string | null;
  thumbnail_url: string | null;
}

interface SnapshotEnrollment {
  course?: SnapshotEnrollmentCourse | null;
}

interface SnapshotUpcomingDoubt {
  id: string;
  subject: string | null;
  scheduled_at: string | null;
  zoom_join_url: string | null;
  status: string;
}

interface DashboardSnapshot {
  enrollments?: SnapshotEnrollment[];
  course_lessons?: { id: string; course_id: number }[];
  user_progress?: { lesson_id: string; course_id: number | null; completed: boolean }[];
  recent_quiz_attempts?: QuizAttemptRow[];
  upcoming_doubts?: SnapshotUpcomingDoubt[];
}

const isPermissionDenied = (error: { code?: string; message?: string } | null | undefined) =>
  error?.code === "42501" ||
  String(error?.message ?? "").toLowerCase().includes("permission denied");

const waitForRetry = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });

const fetchDashboardSnapshot = async (signal: AbortSignal): Promise<DashboardSnapshot> => {
  // JWT-race backoff: PostgREST occasionally returns 42501 immediately after
  // sign-in / route change while the Authorization header is still catching up.
  // Try up to 3 times with 250 / 750 / 1500ms gaps before treating it as a
  // real permission error worth reporting.
  const delays = [0, 250, 750, 1500];
  let lastError: unknown = null;
  for (const wait of delays) {
    if (wait > 0) await waitForRetry(wait, signal);
    const res = await supabase.rpc("get_dashboard_snapshot").abortSignal(signal);
    if (!res.error) return (res.data ?? {}) as DashboardSnapshot;
    lastError = res.error;
    if (!isPermissionDenied(res.error)) break;
  }
  throw lastError;
};

const Dashboard = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const { user, profile, role, isAuthenticated, isLoading: authLoading } = useAuth();
  const isOnline = useOnlineStatus();
  const { selectedBatch } = useBatch();

  interface MyCourse {
    id?: number;
    title: string | null | undefined;
    description: string | null | undefined;
    grade: string | null | undefined;
    imageUrl: string | null | undefined;
    thumbnailUrl: string | null | undefined;
    progressPercent: number;
  }

  const [myCourses, setMyCourses] = useState<MyCourse[]>([]);
  const [progressPercent, setProgressPercent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [quizAttempts, setQuizAttempts] = useState<QuizAttemptRow[]>([]);
  const [upcomingDoubts, setUpcomingDoubts] = useState<{ id: string; subject: string | null; scheduled_at: string | null; zoom_join_url: string | null; status: string }[]>([]);
  // The dashboard "Continue where you left" card follows the course picked in
  // the BatchSelector, so switching course also swaps the thumbnail, title,
  // description and progress. Falls back to the first enrolled course.
  const activeCourse = useMemo(() => {
    if (myCourses.length === 0) return null;
    const match = selectedBatch
      ? myCourses.find((c) => String(c.id) === String(selectedBatch.id))
      : undefined;
    return match ?? myCourses[0];
  }, [myCourses, selectedBatch]);

  const activeProgress = activeCourse?.progressPercent ?? progressPercent;

  const [showInstallBanner, setShowInstallBanner] = useState<boolean>(() => {
    const dismissed = safeGet('install-banner-dismissed') === 'true';
    const nav = window.navigator as Navigator & { standalone?: boolean };
    const standalone = window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
    return !dismissed && !standalone;
  });

  const handleDismissBanner = () => {
    safeSet('install-banner-dismissed', 'true');
    setShowInstallBanner(false);
  };

  // Prefetch likely next-routes once the Dashboard mounts. Browsers will
  // download these chunks at low priority while the user reads the dashboard,
  // so navigation feels instant. Errors are swallowed — this is purely a hint.
  useEffect(() => {
    mark("dashboard:mount");
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    const idle = (cb: () => void) =>
      typeof w.requestIdleCallback === "function"
        ? w.requestIdleCallback(cb)
        : setTimeout(cb, 1200);
    idle(() => {
      measure("dashboard:idle", "dashboard:mount");
      import("./MyCourses").catch(() => {});
      import("./LessonView").catch(() => {});
      import("./AllClasses").catch(() => {});
    });
  }, []);

  useEffect(() => {
    if (authLoading || !isAuthenticated || !user) return;

    let alive = true;
    const ac = new AbortController();

    // Snapshot → view-model. Shared by the cached (instant) render and the
    // fresh network render so both paths can never drift apart.
    const applySnapshot = (snap: DashboardSnapshot) => {
      const enrollments = snap.enrollments ?? [];
      const allLessons = snap.course_lessons ?? [];
      const progressData = snap.user_progress ?? [];

      if (enrollments.length > 0) {
        const seenIds = new Set<number>();
        const enrolled = enrollments
          .filter((e) => {
            const cid = e.course?.id;
            if (!cid || seenIds.has(cid)) return false;
            seenIds.add(cid);
            return true;
          })
          .map((e) => {
            const courseId = e.course?.id;
            const courseLessons = allLessons.filter((l) => l.course_id === courseId);
            const courseLessonIds = new Set(courseLessons.map((l) => l.id));
            const completedCount = progressData.filter(
              (p) => p.completed && (p.course_id === courseId || courseLessonIds.has(p.lesson_id))
            ).length;
            const total = courseLessons.length;
            const pct = total > 0 ? Math.round((completedCount / total) * 100) : 0;
            return {
              id: courseId,
              title: e.course?.title,
              description: e.course?.description,
              grade: e.course?.grade,
              imageUrl: e.course?.image_url,
              thumbnailUrl: e.course?.thumbnail_url,
              progressPercent: pct,
            };
          });
        setMyCourses(enrolled);
        setProgressPercent(enrolled[0]?.progressPercent || 0);
      }

      if (snap.recent_quiz_attempts) {
        setQuizAttempts(snap.recent_quiz_attempts as QuizAttemptRow[]);
      }
      if (snap.upcoming_doubts) {
        setUpcomingDoubts(snap.upcoming_doubts);
      }
    };

    // Last session's snapshot renders the dashboard immediately on a cold
    // start; the network copy then refreshes it in the background. Without
    // this the whole screen stays on the loader for as long as the RPC takes.
    const cacheKey = `${SNAPSHOT_CACHE_PREFIX}${user.id}`;
    let servedFromCache = false;
    try {
      const raw = safeGet(cacheKey);
      if (raw) {
        const cached = JSON.parse(raw) as { at: number; snap: DashboardSnapshot };
        if (cached?.snap && Date.now() - cached.at < SNAPSHOT_CACHE_TTL_MS) {
          applySnapshot(cached.snap);
          setLoading(false);
          servedFromCache = true;
        }
      }
    } catch {
      // Corrupt or unavailable storage — just fall through to the network.
    }

    const fetchDashboardData = async () => {
      try {
        if (!servedFromCache) setLoading(true);

        const snap = await fetchDashboardSnapshot(ac.signal);
        if (!alive) return;

        applySnapshot(snap);
        try {
          safeSet(cacheKey, JSON.stringify({ at: Date.now(), snap }));
        } catch {
          // Quota or private mode — caching is best-effort only.
        }
      } catch (error: unknown) {
        if ((error instanceof DOMException && error.name === "AbortError") || !alive) return;
        // `TypeError: Failed to fetch` is what Chromium raises when the
        // underlying fetch is torn down by an unmount / route change /
        // HMR reload — treat it as an abort, not a real failure, so we
        // don't spam Sentry via the console-error forwarder on every
        // cold session.
        const msg = error instanceof Error ? error.message : "";
        if (msg.includes("Failed to fetch")) {
          // Genuine network unavailability (or a tear-down that raised
          // TypeError instead of AbortError). Log as warn — visible in
          // dev, not forwarded to Sentry as an error.
          logger.warn("Dashboard: network unavailable while loading snapshot");
          return;
        }
        logger.error("Dashboard: failed to load dashboard data", error);
      } finally {
        if (alive) setLoading(false);
      }
    };


    fetchDashboardData();

    return () => {
      alive = false;
      ac.abort();
    };
  }, [navigate, isAuthenticated, authLoading, user]);


  

  if (loading || authLoading) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-background">
        <div className="relative">
          <img src={appLogo} alt="Loading" className="h-16 w-16 rounded-2xl sadhguru-loader-logo" />
          <div className="absolute inset-0 rounded-2xl border-2 border-primary/40 sadhguru-loader-ring" />
        </div>
        <p className="mt-4 text-muted-foreground font-medium">Please wait &amp; take a deep breath</p>
      </div>
    );
  }

  const isTeacher = role === 'teacher' || role === 'admin';

  return (
    <div className="min-h-dvh bg-muted/30 flex flex-col font-sans">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      
      <Header 
        onMenuClick={() => setSidebarOpen(true)} 
        userName={profile?.fullName || "User"} 
      />

      <main className="flex-1 overflow-y-auto px-4 md:px-6 pb-20 md:pb-6 space-y-4 md:space-y-6 max-w-7xl mx-auto w-full pt-3 md:pt-4">

        {!isOnline && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-2 rounded-lg border border-amber-300/60 bg-amber-50 text-amber-900 dark:border-amber-400/30 dark:bg-amber-950/40 dark:text-amber-100 px-3 py-2 text-sm"
          >
            <WifiOff className="h-4 w-4 shrink-0" />
            <span>You're offline. Downloaded lessons will still work; live data may be outdated.</span>
          </div>
        )}



        {isTeacher && (
          <div className="space-y-3">
            <h2 className="text-xl font-bold text-foreground">Quick Actions</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {teacherFeatures.map((feature, idx) => (
                <div 
                  key={idx} 
                  onClick={() => navigate(feature.path)}
                  className="bg-card p-4 rounded-xl border border-border hover:shadow-md transition-all cursor-pointer flex flex-col items-center justify-center gap-2 text-center group"
                >
                  <div className={`p-2.5 rounded-full ${feature.color} group-hover:scale-110 transition-transform`}>
                    <feature.icon className="h-5 w-5" />
                  </div>
                  <span className="font-semibold text-sm text-foreground">{feature.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {(
          <div className="space-y-6">
            {showInstallBanner && (
              <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-primary to-accent rounded-xl px-4 py-3 shadow-md">
                <div className="flex items-center gap-3 min-w-0">
                  <Download className="h-5 w-5 flex-shrink-0 text-primary-foreground" />
                  <span className="text-sm font-medium truncate text-primary-foreground">
                    Install the JSR COACHING app for a better experience
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="text-xs h-8"
                    onClick={() => navigate('/install')}
                  >
                    Install Now →
                  </Button>
                  <button
                    onClick={handleDismissBanner}
                    className="p-1 rounded-full hover:bg-primary-foreground/20 transition-colors text-primary-foreground"
                    aria-label="Dismiss"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          <BatchSelector />
          <HeroCarousel />
          <LiveBadge />
            <UpcomingLiveSessions />
            <UpcomingSchedule />
            {activeCourse ? (
              <Card
                className="overflow-hidden shadow-sm cursor-pointer group hover:shadow-md transition-shadow"
                onClick={() => navigate(`/my-courses/${activeCourse.id}`)}
              >
                <div className="flex flex-col sm:flex-row">
                  <div className="sm:w-48 h-36 sm:h-auto bg-muted relative overflow-hidden flex-shrink-0">
                    <SmartImage 
                      src={activeCourse.thumbnailUrl || activeCourse.imageUrl || selectedBatch?.image_url || "/placeholder.svg"} 
                      alt={activeCourse.title}
                      width={600}
                      height={320}
                      fallbackSrc={coursePlaceholder}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <PlayCircle className="h-10 w-10 text-white" />
                    </div>
                  </div>
                  <div className="p-4 flex-1 flex flex-col justify-center gap-2">
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary" className="text-xs">
                        {formatGrade(activeCourse.grade) || "General"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">Continue where you left</span>
                    </div>
                    <h3 className="text-lg font-bold text-foreground line-clamp-1">{activeCourse.title}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-1">
                      {activeCourse.description || "Keep pushing your limits!"}
                    </p>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs font-medium text-muted-foreground">
                        <span>Progress</span>
                        <span>{activeProgress}%</span>
                      </div>
                      <Progress value={activeProgress} className="h-2" />
                    </div>
                    <Button size="sm" className="mt-1 w-fit bg-accent text-accent-foreground hover:bg-accent/90">
                      <Zap className="h-4 w-4 mr-1" /> Resume
                    </Button>
                  </div>
                </div>
              </Card>
            ) : (
              <Card className="border-2 border-dashed p-10 text-center">
                <BookOpen className="w-12 h-12 mx-auto mb-3 text-muted-foreground" aria-hidden />
                <h3 className="font-bold text-lg text-foreground">No active courses</h3>
                <p className="text-muted-foreground mb-4">Enroll in a course to start learning.</p>
                <Button onClick={() => navigate('/courses')}>Browse Courses</Button>
              </Card>
            )}

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
              {studentQuickActions.map((action) => {
                const badgeCount =
                  action.path === "/doubts" ? upcomingDoubts.length : 0;
                return (
                  <button
                    key={action.label}
                    onClick={() => navigate(action.path)}
                    className="flex flex-col items-center gap-2 group"
                  >
                    <div className={`relative w-14 h-14 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 ${action.bg}`}>
                      <action.Icon className={`w-7 h-7 ${action.fg}`} strokeWidth={1.75} aria-hidden />
                      {badgeCount > 0 && (
                        <span
                          aria-label={`${badgeCount} upcoming`}
                          className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shadow-sm"
                        >
                          {badgeCount > 9 ? "9+" : badgeCount}
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-medium text-muted-foreground">{action.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Practice Tests & Quiz Attempts moved to Performance (/reports) */}

            {/* My Batches section removed — same courses already shown in Continue Learning hero card above */}

            {/* Upcoming Doubt Sessions card */}
            {upcomingDoubts.length > 0 && (
              <Card
                className="border border-primary/20 bg-primary/5 cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate("/doubts")}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-primary/10 shrink-0">
                    <Video className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {upcomingDoubts.length} Upcoming Zoom Session{upcomingDoubts.length > 1 ? "s" : ""}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {upcomingDoubts[0].subject || "Doubt Session"} —{" "}
                      {upcomingDoubts[0].scheduled_at
                        ? new Date(upcomingDoubts[0].scheduled_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
                        : "Scheduled"}
                    </p>
                  </div>
                  <Badge className="bg-primary/10 text-primary border-primary/20 shrink-0">Join</Badge>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </main>


    </div>
  );
};

export default Dashboard;
