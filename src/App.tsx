import { memo, useState, useEffect, Suspense } from "react";
import { lazyWithRetry } from "./lib/lazyWithRetry";
import ErrorBoundary from "./components/ErrorBoundary";
import { Toaster } from "./components/ui/toaster";
import { Toaster as Sonner } from "./components/ui/sonner";
import { ExitHint } from "./components/ExitHint";
import { LazyTooltipProvider as TooltipProvider } from "./components/LazyTooltipProvider";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { HelmetProvider } from "react-helmet-async";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { hasStoredSupabaseSession } from "@/lib/authStorage";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ThemeProvider, useTheme } from "./contexts/ThemeContext";
import { BatchProvider } from "./contexts/BatchContext";
import { ConfirmDialogProvider } from "./components/admin/ConfirmDialog";
import { NavigationHistoryProvider } from "./contexts/NavigationHistoryContext";
import { useAndroidBackButton } from "./hooks/useAndroidBackButton";
import { useSwipeBack } from "./hooks/useSwipeBack";
import { useEdgeSwipeToOpenSidebar } from "./hooks/useEdgeSwipeSidebar";
import { useResumeRecovery } from "./hooks/useResumeRecovery";
import { useEnrollmentRecovery } from "./hooks/useEnrollmentRecovery";
import { SafeAreaDebugOverlay } from "./components/debug/SafeAreaDebugOverlay";
import { useDeepLinks } from "./hooks/useDeepLinks";
import { usePushNav } from "./hooks/usePushNav";
import useHashScroll from "./hooks/useHashScroll";
import ScrollToTop from "./components/ScrollToTop";
import ForceUpdateGate from "./components/ForceUpdateGate";
import SplashHider from "./components/SplashHider";
import OfflineBanner from "./components/common/OfflineBanner";
import AdminEruda from "./components/AdminEruda";
import RouteTransitions from "./components/RouteTransitions";
import GlobalBottomNav from "./components/Layout/GlobalBottomNav";
import EdgeSwipeIndicator from "./components/Layout/EdgeSwipeIndicator";
import { applyStatusBarForTheme, initNativeChrome } from "./lib/nativeChrome";
import { hydrateQueryCache, startQueryPersister } from "./lib/perf/queryPersister";

// Dev perf overlay — strictly opt-in via localStorage.nb_perf="1".
// It is NOT auto-enabled on dev builds: the Lovable preview is a dev build,
// and the fixed panel used to sit on top of the mobile bottom navigation.
const perfOverlayEnabled = (() => {
  try {
    return localStorage.getItem("nb_perf") === "1";
  } catch {
    return false;
  }
})();

const PerfOverlay = perfOverlayEnabled
  ? lazyWithRetry(() => import("./components/dev/PerfOverlay"))
  : null;

// Eager imports — only truly public critical path pages
import Index from "./pages/Index";
import Login from "./pages/Login";
import PhoneLogin from "./pages/PhoneLogin";
// Profile was previously eager-loaded, but it pulls Header/Sidebar/BottomNav
// + AvatarUploadModal (radix-dialog) into the initial entry. Lazy-load with
// retry; users hit it via tab nav so the chunk is warm by the time they tap.
const Profile = lazyWithRetry(() => import("./pages/Profile"));
// Downloads pulls in the PDF reader (react-pdf + pdfjs ≈ 130 KB gzipped).
// Lazy-loaded with retry so it doesn't bloat the initial entry — `lazyWithRetry`
// already handles stale-chunk recovery, so users won't see "Failed to load".
const Downloads = lazyWithRetry(() => import("./pages/Downloads"));
const BackButtonDebug = lazyWithRetry(() => import("./pages/BackButtonDebug"));

// Auth-gated pages: lazy so they don't bloat the public/login first paint
const Dashboard = lazyWithRetry(() => import("./pages/Dashboard"));
const Courses = lazyWithRetry(() => import("./pages/Courses"));
const MyCourses = lazyWithRetry(() => import("./pages/MyCourses"));

// Lazy imports — all other pages
const Signup = lazyWithRetry(() => import("./pages/Signup"));
const ForgotPassword = lazyWithRetry(() => import("./pages/ForgotPassword"));
const ResetPassword = lazyWithRetry(() => import("./pages/ResetPassword"));
const Course = lazyWithRetry(() => import("./pages/Course"));
const NotFound = lazyWithRetry(() => import("./pages/NotFound"));
const AdminLogin = lazyWithRetry(() => import("./pages/AdminLogin"));
const AdminRegister = lazyWithRetry(() => import("./pages/AdminRegister"));
const AdminSecurity = lazyWithRetry(() => import("./pages/AdminSecurity"));
const Attendance = lazyWithRetry(() => import("./pages/Attendance"));
const Reports = lazyWithRetry(() => import("./pages/Reports"));
const Students = lazyWithRetry(() => import("./pages/Students"));
const Messages = lazyWithRetry(() => import("./pages/Messages"));
const Settings = lazyWithRetry(() => import("./pages/Settings"));
const Timetable = lazyWithRetry(() => import("./pages/Timetable"));
const Books = lazyWithRetry(() => import("./pages/Books"));
const Notices = lazyWithRetry(() => import("./pages/Notices"));
const Community = lazyWithRetry(() => import("./pages/Community"));
const Materials = lazyWithRetry(() => import("./pages/Materials"));
const Syllabus = lazyWithRetry(() => import("./pages/Syllabus"));
const BuyCourse = lazyWithRetry(() => import("./pages/BuyCourse"));
const Subscription = lazyWithRetry(() => import("./pages/Subscription"));
const AllClasses = lazyWithRetry(() => import("./pages/AllClasses"));
const AllLive = lazyWithRetry(() => import("./pages/AllLive"));
const LessonView = lazyWithRetry(() => import("./pages/LessonView"));
const ChapterView = lazyWithRetry(() => import("./pages/ChapterView"));
const LectureListing = lazyWithRetry(() => import("./pages/LectureListing"));
const MyCourseDetail = lazyWithRetry(() => import("./pages/MyCourseDetail"));
const AllTests = lazyWithRetry(() => import("./pages/AllTests"));
const Install = lazyWithRetry(() => import("./pages/Install"));
const QuizAttempt = lazyWithRetry(() => import("./pages/QuizAttempt"));
const QuizResult = lazyWithRetry(() => import("./pages/QuizResult"));
const LiveClass = lazyWithRetry(() => import("./pages/LiveClass"));
const TeacherLiveView = lazyWithRetry(() => import("./pages/TeacherLiveView"));
const Library = lazyWithRetry(() => import("./pages/Library"));
const PaymentCallback = lazyWithRetry(() => import("./pages/PaymentCallback"));
// Public, session-less checkout page opened in the phone's real browser by
// the native app (Custom Tab) — the only place Razorpay shows UPI app tiles.
const PayBrowser = lazyWithRetry(() => import("./pages/PayBrowser"));
const Doubts = lazyWithRetry(() => import("./pages/Doubts"));
const Privacy = lazyWithRetry(() => import("./pages/Privacy"));
const DeleteAccountPublic = lazyWithRetry(() => import("./pages/DeleteAccountPublic"));
const AppUpdate = lazyWithRetry(() => import("./pages/AppUpdate"));
const Releases = lazyWithRetry(() => import("./pages/Releases"));
const ExamLanding = lazyWithRetry(() => import("./pages/ExamLanding"));

const Admin = lazyWithRetry(() => import("./pages/Admin"));
const AdminUpload = lazyWithRetry(() => import("./pages/AdminUpload"));
const AdminStudyMaterials = lazyWithRetry(() => import("./pages/AdminStudyMaterials"));
const AdminCMS = lazyWithRetry(() => import("./pages/AdminCMS"));
const AdminSchedule = lazyWithRetry(() => import("./pages/AdminSchedule"));
const AdminQuizManager = lazyWithRetry(() => import("./pages/AdminQuizManager"));
const AdminLiveManager = lazyWithRetry(() => import("./pages/AdminLiveManager"));
const AdminChatbotSettings = lazyWithRetry(() => import("./pages/AdminChatbotSettings"));
const AdminAnalytics = lazyWithRetry(() => import("./pages/AdminAnalytics"));
const AdminTrustedHosts = lazyWithRetry(() => import("./pages/AdminTrustedHosts"));
const AdminAppUpdate = lazyWithRetry(() => import("./pages/AdminAppUpdate"));
const AdminReleases = lazyWithRetry(() => import("./pages/AdminReleases"));
const AdminPdfHealth = lazyWithRetry(() => import("./pages/AdminPdfHealth"));
const AdminAiHealth = lazyWithRetry(() => import("./pages/AdminAiHealth"));
const AdminUsers = lazyWithRetry(() => import("./pages/AdminUsers"));
const AdminStudentDetail = lazyWithRetry(() => import("./pages/AdminStudentDetail"));
const AdminModeration = lazyWithRetry(() => import("./pages/AdminModeration"));
const AdminFraudWatch = lazyWithRetry(() => import("./pages/AdminFraudWatch"));
const AdminBatchMonitor = lazyWithRetry(() => import("./pages/AdminBatchMonitor"));

// Lazy-load ChatWidget (not needed at first paint)
const ChatWidget = lazyWithRetry(() => import("./components/chat/ChatWidget"));
import { isPathAllowed as isChatWidgetPathAllowed } from "./components/chat/chatWidgetRoutes";
import { useLessonFeatureFlag } from "./hooks/useLessonFeatureFlags";
import MenuFeatureGate from "./components/common/MenuFeatureGate";

// Back button handler for Android/Capacitor
const BackButtonHandler = () => {
  useAndroidBackButton();
  useSwipeBack();
  useEdgeSwipeToOpenSidebar();
  useDeepLinks();
  usePushNav();
  useResumeRecovery();
  useEnrollmentRecovery();
  useHashScroll();
  return null;
};
// Persist + hydrate the TanStack Query cache so cold-start UI can render
// meaningful content before the network responds. Web + native parity.
// Also installs the offline mutation queue runner so writes queued while
// offline drain automatically on the next `online` event (was never wired
// before — queue filled but never auto-drained).
const QueryCacheBoot = () => {
  useEffect(() => {
    let stop: (() => void) | undefined;
    let stopMQ: (() => void) | undefined;
    void hydrateQueryCache(queryClient).finally(() => {
      stop = startQueryPersister(queryClient);
      // Lazy-load to keep the mutation queue out of the critical boot path.
      void import("./lib/offline/mutationQueue").then((m) => {
        stopMQ = m.installMutationQueueRunner();
      }).catch(() => { /* offline queue is best-effort */ });
    });
    // When useResumeRecovery fires `app:resumed`, invalidate all queries so
    // every visible screen refetches fresh data after returning from another
    // app. Prevents the "UI looks alive but data is frozen" symptom.
    // Single-flight + hard timeout: a slow/offline network used to leave the
    // refetch pending forever, so every screen kept showing its "Refreshing"
    // spinner. We refetch only the ACTIVE queries, ignore overlapping resume
    // events while one pass is still running, and give up after 8s so the UI
    // falls back to cached data instead of spinning.
    let refreshing = false;
    const RESUME_REFRESH_TIMEOUT_MS = 8000;
    const onResumed = () => {
      if (refreshing) return;
      refreshing = true;
      const done = () => { refreshing = false; };
      const timer = window.setTimeout(done, RESUME_REFRESH_TIMEOUT_MS);
      void queryClient
        .invalidateQueries({ type: "active" })
        .catch(() => { /* stale cache is fine — never block the UI */ })
        .finally(() => { window.clearTimeout(timer); done(); });
    };
    window.addEventListener("app:resumed", onResumed);
    return () => {
      stop?.();
      stopMQ?.();
      window.removeEventListener("app:resumed", onResumed);
    };
  }, []);
  return null;
};


// Initialize native status bar / keyboard plugins on app boot and react to
// theme changes. No-op on web.
const NativeChromeInit = () => {
  const { isDarkMode } = useTheme();
  // Init once on mount only — uses the theme at first paint. Subsequent
  // theme changes are picked up by the second effect via applyStatusBarForTheme.
  // Eslint deps disabled intentionally: re-initialising the native plugins on
  // every theme flip would re-register Keyboard/StatusBar listeners and is a
  // real source of native-side memory growth.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void initNativeChrome(isDarkMode ? "dark" : "light"); }, []);
  useEffect(() => {
    void applyStatusBarForTheme(isDarkMode ? "dark" : "light");
  }, [isDarkMode]);
  // Offline mutation queue — register handlers + drain runner once.
  // Wires the queue defined in src/lib/offline/mutationQueue.ts so writes
  // performed while offline (smart notes, progress, bookmarks) are replayed
  // when connectivity returns. Closes the HIGH-severity gap from
  // CAPACITOR_AUDIT.md ("No mutation queue when offline").
  useEffect(() => {
    let teardown: (() => void) | undefined;
    import("./lib/offline/registerHandlers")
      .then((m) => { teardown = m.installOfflineMutationHandlers(); })
      .catch(() => { /* noop */ });
    return () => { try { teardown?.(); } catch { /* noop */ } };
  }, []);
  return null;
};

const DeferredChatWidget = () => {
  const location = useLocation();
  const [ready, setReady] = useState(false);
  // Admin switch (Admin Panel → Lesson Features → JSR Agent). Defaults ON.
  const agentEnabled = useLessonFeatureFlag("sadguruAgent");

  useEffect(() => {
    if (!isChatWidgetPathAllowed(location.pathname)) return;
    const run = () => setReady(true);
    const idle = (window as typeof window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
    if (idle) {
      const id = idle(run, { timeout: 2500 });
      return () => (window as typeof window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(id);
    }
    const timer = window.setTimeout(run, 1800);
    return () => window.clearTimeout(timer);
  }, [location.pathname]);

  if (!agentEnabled) return null;
  if (!ready || !isChatWidgetPathAllowed(location.pathname)) return null;
  return (
    <Suspense fallback={<div aria-hidden className="h-0 w-0" />}>

      <ChatWidget />
    </Suspense>
  );
};

import RouteSkeleton from "./components/RouteSkeleton";
import HomeSkeleton from "./components/skeletons/HomeSkeleton";
import { startIdlePrefetch } from "./lib/prefetch";
import PaymentResume from "./hooks/usePaymentResume";


// Auth-gate placeholder. A spinner made the landing page feel stuck, so we
// show the shape of the page that is about to appear instead: the home layout
// on "/", the generic route skeleton everywhere else.
const PageLoader = memo(() => {
  const { pathname } = useLocation();
  return pathname === "/" ? <HomeSkeleton /> : <RouteSkeleton />;
});

// Fire warm-route prefetch once after the App component mounts (idle-gated).
// Gated by auth state so anonymous visitors on the landing page don't pay
// for ~150–250 KB of authed-only chunks they may never use.
const IdlePrefetcher = () => {
  const { isAuthenticated } = useAuth();
  useEffect(() => {
    if (isAuthenticated) startIdlePrefetch(true);
  }, [isAuthenticated]);
  return null;
};

PageLoader.displayName = "PageLoader";

const PublicRoute = ({ element }: { element: React.ReactElement }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return <PageLoader />;
  // A student pushed here by ProtectedRoute carries the page they actually
  // wanted in `location.state.from` (payment return, a lesson deep link...).
  // This guard used to unmount Login the instant the session appeared and
  // send everyone to /dashboard, so the payment return URL was silently
  // thrown away and a paying student never reached their course.
  if (isAuthenticated) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from.startsWith("/") ? from : "/dashboard"} replace />;
  }
  return element;
};

const ProtectedRoute = ({ element }: { element: React.ReactElement }) => {
  const { isAuthenticated, isLoading, sessionSettled } = useAuth();
  const location = useLocation();
  // Deep links (payment return, shared lesson link, cold start) hit this guard
  // before Supabase has restored the session from storage. `isLoading` gives up
  // after 6s by design, so without the stored-session hint a signed-in student
  // got bounced to /login on /classes/:id/lessons. Keep waiting while a token
  // is on disk but the session has not settled yet — bounded by a ceiling so a
  // genuinely broken restore still lands on the login page instead of a
  // forever spinner.
  const [restoreTimedOut, setRestoreTimedOut] = useState(false);
  useEffect(() => {
    if (sessionSettled || isAuthenticated) return;
    const t = window.setTimeout(() => setRestoreTimedOut(true), 12000);
    return () => window.clearTimeout(t);
  }, [sessionSettled, isAuthenticated]);

  if (isLoading) return <PageLoader />;
  if (!isAuthenticated && !sessionSettled && !restoreTimedOut && hasStoredSupabaseSession()) {
    return <PageLoader />;
  }
  // Carry the blocked URL so Login can send the student back where they meant
  // to go (Login already reads `location.state.from`).
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }
  return element;
};

const AdminRoute = ({ element }: { element: React.ReactElement }) => {
  const { isAdmin, isLoading, isAuthenticated, roleLoaded } = useAuth();
  // Escape hatch: if the role RPC is paused offline (`networkMode: offlineFirst`
  // pauses fetches without resolving/rejecting), roleLoaded never flips and the
  // admin sees an infinite spinner. After 6s give up waiting and let the
  // isAdmin check (which reflects cached role) decide.
  const [roleTimedOut, setRoleTimedOut] = useState(false);
  useEffect(() => {
    if (!isAuthenticated || roleLoaded) return;
    const t = window.setTimeout(() => setRoleTimedOut(true), 6000);
    return () => window.clearTimeout(t);
  }, [isAuthenticated, roleLoaded]);
  if (isLoading || (isAuthenticated && !roleLoaded && !roleTimedOut)) return <PageLoader />;
  if (!isAdmin) return <Navigate to="/login" replace />;
  return element;
};

const App = () => (
  <ErrorBoundary>
    <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <BatchProvider>
            <AdminEruda />
            <TooltipProvider>
              <ConfirmDialogProvider>
              <Toaster />
              <Sonner />
              <ExitHint />
              <SplashHider />
              <NativeChromeInit />
              <QueryCacheBoot />
              <IdlePrefetcher />
              {PerfOverlay && (
                <Suspense fallback={null}>
                  <PerfOverlay />
                </Suspense>
              )}
              <OfflineBanner />
              <BrowserRouter>
                <NavigationHistoryProvider>
                  <ScrollToTop />
                  {/* Finishes an interrupted purchase on ANY page, after ANY sign-in. */}
                  <PaymentResume />
                  <ForceUpdateGate>
                  <Suspense fallback={<PageLoader />}>
                  <RouteTransitions>
                  <Routes>
                    {/* Public Routes */}
                    <Route path="/" element={<PublicRoute element={<Index />} />} />
                    <Route path="/index" element={<Navigate to="/" replace />} />
                    {/* Legacy/scaffold path — some older links and templates point
                        at /auth, which 404'd. The real sign-in page is /login. */}
                    <Route path="/auth" element={<Navigate to="/login" replace />} />
                    <Route path="/login" element={<PublicRoute element={<Login />} />} />
                    <Route path="/login-otp" element={<PublicRoute element={<PhoneLogin />} />} />
                    <Route path="/signup" element={<PublicRoute element={<Signup />} />} />
                    <Route path="/forgot-password" element={<ForgotPassword />} />
                    <Route path="/reset-password" element={<ResetPassword />} />
                    <Route path="/install" element={<Install />} />
                    <Route path="/pay" element={<PayBrowser />} />
                    <Route path="/privacy" element={<Privacy />} />
                    <Route path="/delete-account" element={<DeleteAccountPublic />} />
                    {/* Public update page — opened in the phone's real browser so the APK can download. */}
                    <Route path="/update" element={<AppUpdate />} />
                    {/* Public release history — purane versions, notes, current supported version. */}
                    <Route path="/releases" element={<Releases />} />

                    {/* SEO Exam Landing Routes */}
                    <Route path="/up-board-english" element={<ExamLanding />} />
                    <Route path="/cbse-english" element={<ExamLanding />} />
                    <Route path="/cg-lecturer-english" element={<ExamLanding />} />
                    

                    {/* Admin Login/Register */}
                    <Route path="/admin/login" element={<AdminLogin />} />
                    <Route path="/admin/register" element={<AdminRegister />} />

                    {/* Admin Routes */}
                    <Route path="/admin" element={<AdminRoute element={<Admin />} />} />
                    <Route path="/admin/upload" element={<AdminRoute element={<AdminUpload />} />} />
                    <Route path="/admin/study-materials" element={<AdminRoute element={<AdminStudyMaterials />} />} />
                    <Route path="/admin/cms" element={<AdminRoute element={<AdminCMS />} />} />
                    <Route path="/admin/schedule" element={<AdminRoute element={<AdminSchedule />} />} />
                    <Route path="/admin/quiz" element={<AdminRoute element={<AdminQuizManager />} />} />
                    <Route path="/admin/live" element={<AdminRoute element={<AdminLiveManager />} />} />
                    <Route path="/admin/chatbot" element={<AdminRoute element={<AdminChatbotSettings />} />} />
                    <Route path="/admin/analytics" element={<AdminRoute element={<AdminAnalytics />} />} />
                    <Route path="/admin/trusted-hosts" element={<AdminRoute element={<AdminTrustedHosts />} />} />
                    <Route path="/admin/app-update" element={<AdminRoute element={<AdminAppUpdate />} />} />
                    <Route path="/admin/releases" element={<AdminRoute element={<AdminReleases />} />} />
                    <Route path="/admin/pdf-health" element={<AdminRoute element={<AdminPdfHealth />} />} />
                    <Route path="/admin/ai-health" element={<AdminRoute element={<AdminAiHealth />} />} />
                    <Route path="/admin/security" element={<AdminRoute element={<AdminSecurity />} />} />
                    <Route path="/admin/users" element={<AdminRoute element={<AdminUsers />} />} />
                    <Route path="/admin/users/:userId" element={<AdminRoute element={<AdminStudentDetail />} />} />
                    <Route path="/admin/moderation" element={<AdminRoute element={<AdminModeration />} />} />
                    <Route path="/admin/fraud-watch" element={<AdminRoute element={<AdminFraudWatch />} />} />
                    <Route path="/admin/batch-monitor" element={<AdminRoute element={<AdminBatchMonitor />} />} />

                    {/* Protected Routes */}
                    <Route path="/dashboard" element={<ProtectedRoute element={<ErrorBoundary fallbackTitle="Dashboard failed to load"><Dashboard /></ErrorBoundary>} />} />
                    <Route path="/dashboard/my-courses" element={<ProtectedRoute element={<MyCourses />} />} />
                    <Route path="/subscription" element={<ProtectedRoute element={<Subscription />} />} />
                    <Route path="/my-courses" element={<ProtectedRoute element={<MyCourses />} />} />
                    <Route path="/my-courses/:courseId" element={<ProtectedRoute element={<ErrorBoundary fallbackTitle="Course failed to load"><MyCourseDetail /></ErrorBoundary>} />} />
                    <Route path="/courses" element={<ProtectedRoute element={<Courses />} />} />
                    <Route path="/course/:id" element={<ProtectedRoute element={<Course />} />} />
                    <Route path="/lesson/:id" element={<Navigate to="/dashboard" replace />} />

                    {/* Course Purchase & Learning */}
                    <Route path="/buy-course" element={<ProtectedRoute element={<BuyCourse />} />} />
                    <Route path="/buy-course/:id" element={<ProtectedRoute element={<BuyCourse />} />} />
                    {/* PUBLIC ON PURPOSE. The browser-tab (UPI) return has no Supabase
                        session; gating this route dropped a paid student onto a bare
                        login form. The page itself shows a calm "sign in to unlock"
                        state and resumes automatically after login. */}
                    <Route path="/payment-callback" element={<PaymentCallback />} />
                    <Route path="/all-classes" element={<ProtectedRoute element={<AllClasses />} />} />
                    <Route path="/classes/:courseId/lessons" element={<ProtectedRoute element={<ErrorBoundary fallbackTitle="Lesson failed to load"><LessonView /></ErrorBoundary>} />} />
                    <Route path="/classes/:courseId/chapters" element={<ProtectedRoute element={<ChapterView />} />} />
                    <Route path="/classes/:courseId/chapter/:chapterId" element={<ProtectedRoute element={<LectureListing />} />} />

                    {/* Quiz Routes */}
                    <Route path="/quiz/:quizId" element={<ProtectedRoute element={<ErrorBoundary fallbackTitle="Quiz failed to load"><QuizAttempt /></ErrorBoundary>} />} />
                    <Route path="/quiz/:quizId/result/:attemptId" element={<ProtectedRoute element={<QuizResult />} />} />

                    {/* Feature Pages */}
                    <Route path="/all-tests" element={<ProtectedRoute element={<AllTests />} />} />
                    <Route path="/live" element={<ProtectedRoute element={<AllLive />} />} />
                    <Route path="/live/:sessionId" element={<ProtectedRoute element={<ErrorBoundary fallbackTitle="Live class failed to load"><LiveClass /></ErrorBoundary>} />} />
                    <Route path="/teacher/live/:sessionId" element={<ProtectedRoute element={<TeacherLiveView />} />} />
                    <Route path="/attendance" element={<ProtectedRoute element={<Attendance />} />} />
                    <Route path="/reports" element={<ProtectedRoute element={<MenuFeatureGate flag="reports" label="Reports"><Reports /></MenuFeatureGate>} />} />
                    <Route path="/students" element={<ProtectedRoute element={<Students />} />} />
                    <Route path="/messages" element={<ProtectedRoute element={<MenuFeatureGate flag="messages" label="Messages"><Messages /></MenuFeatureGate>} />} />
                    <Route path="/profile" element={<ProtectedRoute element={<Profile />} />} />
                    <Route path="/settings" element={<ProtectedRoute element={<Settings />} />} />
                    <Route path="/timetable" element={<ProtectedRoute element={<Timetable />} />} />
                    <Route path="/books" element={<ProtectedRoute element={<Books />} />} />
                    <Route path="/notices" element={<ProtectedRoute element={<Notices />} />} />
                    <Route path="/community" element={<ProtectedRoute element={<MenuFeatureGate flag="community" label="Community"><Community /></MenuFeatureGate>} />} />
                    <Route path="/materials" element={<ProtectedRoute element={<Materials />} />} />
                    <Route path="/syllabus" element={<ProtectedRoute element={<Syllabus />} />} />
                    <Route path="/downloads" element={<ProtectedRoute element={<Downloads />} />} />
                    <Route path="/library" element={<ProtectedRoute element={<Library />} />} />
                    <Route path="/doubts" element={<ProtectedRoute element={<MenuFeatureGate flag="doubts" label="Doubt Sessions"><Doubts /></MenuFeatureGate>} />} />
                    <Route path="/debug/back-button" element={<BackButtonDebug />} />
                    
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                  </RouteTransitions>
                  </Suspense>
                  </ForceUpdateGate>
                  <BackButtonHandler />
                  <SafeAreaDebugOverlay />
                  <DeferredChatWidget />
                  <GlobalBottomNav />
                  <EdgeSwipeIndicator />

                </NavigationHistoryProvider>
              </BrowserRouter>
              </ConfirmDialogProvider>
            </TooltipProvider>
          </BatchProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
    </HelmetProvider>
  </ErrorBoundary>
);

export default App;
