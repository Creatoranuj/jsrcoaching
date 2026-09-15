import { useState, useEffect, Suspense } from "react";
import { lazyWithRetry } from "../lib/lazyWithRetry";
import { useNavigate } from "react-router-dom";
import { supabase } from "../integrations/supabase/client";
import Header from "../components/Layout/Header";
import Sidebar from "../components/Layout/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { useAuth } from "../contexts/AuthContext";
import {
  Users, TrendingUp, CheckCircle, XCircle, Trophy,
  BarChart3, RefreshCw, BookOpen
} from "lucide-react";
import { Button } from "../components/ui/button";
import { format, subDays } from "date-fns";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import RangePicker, { presetRange, type Range } from "../components/admin/analytics/RangePicker";
const UsersSection = lazyWithRetry(() => import("../components/admin/analytics/UsersSection"));
const PaymentsSection = lazyWithRetry(() => import("../components/admin/analytics/PaymentsSection"));

// Lazy-loaded recharts bundles — keeps the main admin bundle ~120 KB lighter
const DauLineChart = lazyWithRetry(() => import("../components/admin/analytics/DauLineChart"));
const CourseCompletionChart = lazyWithRetry(() => import("../components/admin/analytics/CourseCompletionChart"));
const QuizPassFailChart = lazyWithRetry(() => import("../components/admin/analytics/QuizPassFailChart"));

const ChartFallback = () => (
  <div className="h-[200px] flex items-center justify-center">
    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

// ── Types ─────────────────────────────────────────────────────────────────────
interface DauPoint { date: string; users: number }
interface CourseCompletion { course: string; completion: number; total: number; completed: number }
interface QuizRate { quiz: string; passed: number; failed: number; total: number }
interface TopStudent { name: string; progress: number; lessons: number }

// ── Stat card ─────────────────────────────────────────────────────────────────
const StatCard = ({ title, value, icon: Icon, sub, color }: {
  title: string; value: string | number; icon: React.ElementType;
  sub?: string; color: string;
}) => (
  <Card className="border-border">
    <CardContent className="pt-5 pb-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{title}</p>
          <p className="text-3xl font-bold text-foreground mt-1">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        </div>
        <div className={`p-2.5 rounded-lg ${color}`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
      </div>
    </CardContent>
  </Card>
);


const COLORS = ["hsl(142,71%,45%)", "hsl(0,72%,50%)", "hsl(216,19%,26%)", "hsl(38,92%,50%)"];

// ── Main Page ─────────────────────────────────────────────────────────────────
const AdminAnalytics = () => {
  const navigate = useNavigate();
  const { isAdmin, isLoading: authLoading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [tab, setTab] = useState<"learning" | "users" | "payments">("learning");
  const [range, setRange] = useState<Range>(() => presetRange(30));

  // Data states
  const [dauData, setDauData] = useState<DauPoint[]>([]);
  const [courseData, setCourseData] = useState<CourseCompletion[]>([]);
  const [quizData, setQuizData] = useState<QuizRate[]>([]);
  const [topStudents, setTopStudents] = useState<TopStudent[]>([]);
  const [summaryStats, setSummaryStats] = useState({
    totalAttempts: 0,
    avgPassRate: 0,
    totalCompletions: 0,
    activeStudents: 0,
  });

  useEffect(() => {
    if (!authLoading && !isAdmin) navigate("/login");
  }, [authLoading, isAdmin, navigate]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      await Promise.all([fetchDAU(), fetchCourseCompletion(), fetchQuizRates(), fetchTopStudents()]);
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  };

  useEffect(() => { if (isAdmin) fetchAll(); }, [isAdmin]);

  // ── 1. Daily Active Users (last 7 days via quiz_attempts) ──────────────────
  const fetchDAU = async () => {
    const days: DauPoint[] = [];
    const promises = Array.from({ length: 7 }, (_, i) => {
      const day = subDays(new Date(), 6 - i);
      const start = new Date(day); start.setHours(0, 0, 0, 0);
      const end = new Date(day); end.setHours(23, 59, 59, 999);
      return supabase
        .from("quiz_attempts")
        .select("user_id")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString())
        .then(({ data }) => ({
          date: format(day, "EEE dd"),
          users: new Set((data ?? []).map((r) => r.user_id)).size,
        }));
    });
    const results = await Promise.all(promises);
    setDauData(results);

    // Sum DAU across the period (was previously dead-code: flatMap(() => []) → 0)
    setSummaryStats(prev => ({
      ...prev,
      activeStudents: results.reduce((sum, r) => sum + r.users, 0),
    }));
  };

  // ── 2. Lesson completion rate per course ──────────────────────────────────
  const fetchCourseCompletion = async () => {
    const [{ data: courses }, { data: progress }] = await Promise.all([
      supabase.from("courses").select("id, title"),
      supabase.from("user_progress").select("course_id, completed").eq("completed", true),
    ]);

    const { data: lessonCounts } = await supabase
      .from("lessons")
      .select("course_id")
      .not("course_id", "is", null);

    if (!courses) return;

    const lessonMap: Record<number, number> = {};
    (lessonCounts ?? []).forEach((l) => {
      lessonMap[l.course_id] = (lessonMap[l.course_id] ?? 0) + 1;
    });

    const completionMap: Record<number, number> = {};
    (progress ?? []).forEach((p) => {
      completionMap[p.course_id] = (completionMap[p.course_id] ?? 0) + 1;
    });

    const result: CourseCompletion[] = courses
      .filter((c) => lessonMap[c.id] > 0)
      .map((c) => {
        const total = lessonMap[c.id] ?? 0;
        const completed = completionMap[c.id] ?? 0;
        return {
          course: c.title.length > 18 ? c.title.substring(0, 18) + "…" : c.title,
          completion: total > 0 ? Math.round((completed / total) * 100) : 0,
          total,
          completed,
        };
      })
      .sort((a, b) => b.completion - a.completion)
      .slice(0, 6);

    setCourseData(result);
    const totalCompletions = Object.values(completionMap).reduce((a, b) => a + b, 0);
    setSummaryStats(prev => ({ ...prev, totalCompletions }));
  };

  // ── 3. Quiz pass/fail rates ───────────────────────────────────────────────
  const fetchQuizRates = async () => {
    const [{ data: quizzes }, { data: attempts }] = await Promise.all([
      supabase.from("quizzes").select("id, title").eq("is_published", true),
      supabase.from("quiz_attempts").select("quiz_id, passed"),
    ]);

    if (!quizzes || !attempts) return;

    const rateMap: Record<string, { passed: number; failed: number }> = {};
    (attempts ?? []).forEach((a) => {
      if (!rateMap[a.quiz_id]) rateMap[a.quiz_id] = { passed: 0, failed: 0 };
      if (a.passed) {
        rateMap[a.quiz_id].passed++;
      } else {
        rateMap[a.quiz_id].failed++;
      }
    });

    const result: QuizRate[] = quizzes
      .filter((q) => rateMap[q.id]?.passed + rateMap[q.id]?.failed > 0)
      .map((q) => ({
        quiz: q.title.length > 16 ? q.title.substring(0, 16) + "…" : q.title,
        passed: rateMap[q.id]?.passed ?? 0,
        failed: rateMap[q.id]?.failed ?? 0,
        total: (rateMap[q.id]?.passed ?? 0) + (rateMap[q.id]?.failed ?? 0),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);

    setQuizData(result);

    const totalAttempts = attempts?.length ?? 0;
    const totalPassed = attempts?.filter((a) => a.passed).length ?? 0;
    const avgPassRate = totalAttempts > 0 ? Math.round((totalPassed / totalAttempts) * 100) : 0;
    setSummaryStats(prev => ({ ...prev, totalAttempts, avgPassRate }));
  };

  // ── 4. Top 5 students by total progress ───────────────────────────────────
  const fetchTopStudents = async () => {
    const { data: progress } = await supabase
      .from("user_progress")
      .select("user_id, completed");

    if (!progress) return;

    // Aggregate per user
    const userMap: Record<string, { lessons: number; completed: number }> = {};
    progress.forEach((p) => {
      if (!userMap[p.user_id]) userMap[p.user_id] = { lessons: 0, completed: 0 };
      userMap[p.user_id].lessons++;
      if (p.completed) userMap[p.user_id].completed++;
    });

    const topIds = Object.entries(userMap)
      .sort((a, b) => b[1].completed - a[1].completed)
      .slice(0, 5)
      .map(([id]) => id);

    if (topIds.length === 0) {
      setTopStudents([]);
      return;
    }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", topIds);

    const result: TopStudent[] = topIds.map((id, idx) => {
      const profile = profiles?.find((p) => p.id === id);
      const stats = userMap[id];
      return {
        name: profile?.full_name ?? `Student ${idx + 1}`,
        lessons: stats.lessons,
        progress: stats.lessons > 0 ? Math.round((stats.completed / stats.lessons) * 100) : 0,
      };
    });

    setTopStudents(result);
  };

  if (authLoading) return null;

  return (
    <div className="min-h-dvh bg-background flex">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-h-dvh">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 p-4 md:p-6 space-y-6">

          {/* ── Header row ── */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <BarChart3 className="h-6 w-6 text-primary" />
                Analytics Dashboard
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Last refreshed: {format(lastRefresh, "hh:mm a")}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {tab !== "learning" && <RangePicker value={range} onChange={setRange} />}
              <Button
                variant="outline"
                size="sm"
                onClick={fetchAll}
                disabled={loading}
                className="gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList>
              <TabsTrigger value="learning">Learning</TabsTrigger>
              <TabsTrigger value="users">Users & Sessions</TabsTrigger>
              <TabsTrigger value="payments">Payments & Downloads</TabsTrigger>
            </TabsList>

            <TabsContent value="users" className="mt-6">
              <Suspense fallback={<ChartFallback />}>
                <UsersSection range={range} />
              </Suspense>
            </TabsContent>

            <TabsContent value="payments" className="mt-6">
              <Suspense fallback={<ChartFallback />}>
                <PaymentsSection range={range} />
              </Suspense>
            </TabsContent>

            <TabsContent value="learning" className="mt-6 space-y-6">
          {/* ── Summary stats ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              title="7-Day Active Users"
              value={summaryStats.activeStudents}
              icon={Users}
              sub="unique sessions"
              color="bg-primary"
            />
            <StatCard
              title="Quiz Attempts"
              value={summaryStats.totalAttempts}
              icon={TrendingUp}
              sub="all time"
              color="bg-[hsl(216,60%,45%)]"
            />
            <StatCard
              title="Avg Pass Rate"
              value={`${summaryStats.avgPassRate}%`}
              icon={CheckCircle}
              sub="across all quizzes"
              color="bg-[hsl(142,71%,35%)]"
            />
            <StatCard
              title="Lessons Completed"
              value={summaryStats.totalCompletions}
              icon={BookOpen}
              sub="total completions"
              color="bg-[hsl(38,92%,45%)]"
            />
          </div>

          {/* ── Row 1: DAU + Course Completion ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* DAU Chart */}
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  Daily Active Users — Last 7 Days
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="h-48 flex items-center justify-center">
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : dauData.every(d => d.users === 0) ? (
                  <div className="h-48 flex flex-col items-center justify-center text-muted-foreground gap-2">
                    <Users className="h-8 w-8 opacity-30" />
                    <p className="text-sm">No quiz activity in last 7 days</p>
                  </div>
                ) : (
                  <Suspense fallback={<ChartFallback />}>
                    <DauLineChart data={dauData} />
                  </Suspense>
                )}
              </CardContent>
            </Card>

            {/* Course Completion */}
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-primary" />
                  Lesson Completion Rate per Course
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="h-48 flex items-center justify-center">
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : courseData.length === 0 ? (
                  <div className="h-48 flex flex-col items-center justify-center text-muted-foreground gap-2">
                    <BookOpen className="h-8 w-8 opacity-30" />
                    <p className="text-sm">No completion data yet</p>
                  </div>
                ) : (
                  <Suspense fallback={<ChartFallback />}>
                    <CourseCompletionChart data={courseData} />
                  </Suspense>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Row 2: Quiz Pass/Fail + Top Students ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Quiz Pass/Fail */}
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-primary" />
                  Quiz Pass / Fail Rates
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="h-48 flex items-center justify-center">
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : quizData.length === 0 ? (
                  <div className="h-48 flex flex-col items-center justify-center text-muted-foreground gap-2">
                    <XCircle className="h-8 w-8 opacity-30" />
                    <p className="text-sm">No quiz attempts yet</p>
                  </div>
                ) : (
                  <Suspense fallback={<ChartFallback />}>
                    <QuizPassFailChart data={quizData} />
                  </Suspense>
                )}
              </CardContent>
            </Card>

            {/* Top 5 Students */}
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-primary" />
                  Top 5 Students by Progress
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="h-48 flex items-center justify-center">
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : topStudents.length === 0 ? (
                  <div className="h-48 flex flex-col items-center justify-center text-muted-foreground gap-2">
                    <Trophy className="h-8 w-8 opacity-30" />
                    <p className="text-sm">No student progress data yet</p>
                  </div>
                ) : (
                  <div className="space-y-3 mt-1">
                    {topStudents.map((student, idx) => (
                      <div key={idx} className="flex items-center gap-3">
                        {/* Rank badge */}
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0
                          ${idx === 0 ? "bg-[hsl(38,92%,50%)]" : idx === 1 ? "bg-muted-foreground" : "bg-secondary"}`}>
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-sm font-medium text-foreground truncate">{student.name}</p>
                            <span className="text-xs font-bold text-primary ml-2 shrink-0">{student.progress}%</span>
                          </div>
                          {/* Progress bar */}
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all duration-500"
                              style={{ width: `${student.progress}%` }}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{student.lessons} lessons tracked</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Quiz Detail Table ── */}
          {quizData.length > 0 && (
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Quiz Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Quiz</th>
                        <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Total</th>
                        <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Passed</th>
                        <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Failed</th>
                        <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pass Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quizData.map((q, i) => (
                        <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3 font-medium text-foreground">{q.quiz}</td>
                          <td className="px-4 py-3 text-center text-muted-foreground">{q.total}</td>
                          <td className="px-4 py-3 text-center">
                            <Badge className="bg-[hsl(142,71%,45%)]/15 text-[hsl(142,71%,32%)] border-0 text-xs">
                              {q.passed}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge className="bg-destructive/10 text-destructive border-0 text-xs">
                              {q.failed}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-xs font-bold ${q.total > 0 && Math.round((q.passed / q.total) * 100) >= 50 ? "text-[hsl(142,71%,35%)]" : "text-destructive"}`}>
                              {q.total > 0 ? Math.round((q.passed / q.total) * 100) : 0}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  );
};

export default AdminAnalytics;
