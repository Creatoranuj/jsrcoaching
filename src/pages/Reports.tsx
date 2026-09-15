/**
 * Reports.tsx — Student analytics & quiz performance
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../integrations/supabase/client";
import Header from "../components/Layout/Header";
import Sidebar from "../components/Layout/Sidebar";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import RouteSkeleton from "../components/RouteSkeleton";
import { Badge } from "../components/ui/badge";
import { Progress } from "../components/ui/progress";
import { useAuth } from "../contexts/AuthContext";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { List, type RowComponentProps } from "react-window";
import {
  ArrowLeft, BarChart3, BookOpen, Trophy, TrendingUp,
  CheckCircle2, XCircle, Loader2, Target, Flame, GraduationCap, ClipboardCheck,
} from "lucide-react";
import { useEnrollments } from "../hooks/useEnrollments";

interface QuizAttempt {
  id: string;
  score: number | null;
  percentage: number | null;
  passed: boolean | null;
  submitted_at: string | null;
  quizzes: { title: string; total_marks: number | null; type: string | null; course_id: number | null } | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function computeStreak(dates: string[]): number {
  if (dates.length === 0) return 0;
  const unique = [...new Set(dates.map((d) => d.slice(0, 10)))].sort().reverse();
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (unique[0] !== today && unique[0] !== yesterday) return 0;
  let streak = 1;
  for (let i = 1; i < unique.length; i++) {
    const prev = new Date(unique[i - 1]);
    const curr = new Date(unique[i]);
    const diff = (prev.getTime() - curr.getTime()) / 86400000;
    if (diff === 1) streak++;
    else break;
  }
  return streak;
}

const Reports = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const { user, profile, isAuthenticated, isLoading: authLoading } = useAuth();
  const { enrollments, loading: enrollLoading } = useEnrollments();

  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [loadingAttempts, setLoadingAttempts] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) { navigate("/login"); return; }
    if (!user) return;

    const fetchAttempts = async () => {
      setLoadingAttempts(true);
      const { data } = await supabase
        .from("quiz_attempts")
        .select("id, score, percentage, passed, submitted_at, quizzes(title, total_marks, type, course_id)")
        .eq("user_id", user.id)
        .not("submitted_at", "is", null)
        .order("submitted_at", { ascending: false })
        .limit(50);
      setAttempts((data ?? []) as QuizAttempt[]);
      setLoadingAttempts(false);
    };

    fetchAttempts();
  }, [user, isAuthenticated, authLoading, navigate]);

  if (authLoading) {
    return <RouteSkeleton label="Loading reports" />;
  }

  // ── Computed stats ──────────────────────────────────────────────────────────
  const total = attempts.length;
  const passed = attempts.filter((a) => a.passed === true).length;
  const failed = attempts.filter((a) => a.passed === false).length;
  const avgPct =
    total > 0
      ? Math.round(attempts.reduce((s, a) => s + (Number(a.percentage) || 0), 0) / total)
      : 0;
  const bestPct =
    total > 0 ? Math.max(...attempts.map((a) => Number(a.percentage) || 0)) : 0;

  const streak = computeStreak(
    attempts.filter((a) => a.submitted_at).map((a) => a.submitted_at!)
  );

  const enrolledCount = enrollments.filter((e: any) => e.status === "active" || !e.status).length;

  // Last 5 for bar chart (chronological order)
  const chartData = [...attempts]
    .slice(0, 5)
    .reverse()
    .map((a) => ({
      name: (a.quizzes?.title ?? "Quiz").slice(0, 14) + ((a.quizzes?.title?.length ?? 0) > 14 ? "…" : ""),
      pct: Math.round(Number(a.percentage) || 0),
      passed: a.passed,
    }));

  // Subject-wise performance (group by quiz type)
  const subjectData = (() => {
    const map: Record<string, { total: number; sum: number }> = {};
    attempts.forEach((a) => {
      const type = a.quizzes?.type?.toUpperCase() || "OTHER";
      if (!map[type]) map[type] = { total: 0, sum: 0 };
      map[type].total++;
      map[type].sum += Number(a.percentage) || 0;
    });
    return Object.entries(map).map(([name, { total: count, sum }]) => ({
      name,
      avg: Math.round(sum / count),
      count,
    }));
  })();

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <Header onMenuClick={() => setSidebarOpen(true)} />

      {/* Page header */}
      <div className="bg-primary px-4 py-4 flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/dashboard")}
          className="text-primary-foreground hover:bg-primary-foreground/10"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold text-primary-foreground">My Reports</h1>
      </div>

      <main className="flex-1 p-4 space-y-4 max-w-2xl mx-auto w-full pb-8">

        {/* Practice Tests card removed — awaiting production URL wiring. */}


        {/* Profile card */}
        <Card className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-primary-foreground/20 flex items-center justify-center text-2xl font-bold shrink-0">
              {(profile?.fullName || "U").charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-lg font-bold">{profile?.fullName || "Student"}</h2>
              <p className="text-primary-foreground/80 text-sm">Performance Analytics</p>
            </div>
          </CardContent>
        </Card>

        {/* Quiz stats */}
        {loadingAttempts ? (
          <div className="py-8 text-center">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Row 1: 3 stat cards */}
            <div className="grid grid-cols-3 gap-3">
              <Card>
                <CardContent className="p-4 text-center">
                  <BarChart3 className="h-7 w-7 mx-auto text-primary mb-1.5" />
                  <p className="text-2xl font-bold">{total}</p>
                  <p className="text-xs text-muted-foreground">Tests</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <TrendingUp className="h-7 w-7 mx-auto text-blue-500 mb-1.5" />
                  <p className="text-2xl font-bold">{avgPct}%</p>
                  <p className="text-xs text-muted-foreground">Avg Score</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <Trophy className="h-7 w-7 mx-auto text-yellow-500 mb-1.5" />
                  <p className="text-2xl font-bold">{bestPct}%</p>
                  <p className="text-xs text-muted-foreground">Best</p>
                </CardContent>
              </Card>
            </div>

            {/* Row 2: 3 stat cards */}
            <div className="grid grid-cols-3 gap-3">
              <Card>
                <CardContent className="p-4 text-center">
                  <Target className="h-7 w-7 mx-auto text-green-500 mb-1.5" />
                  <p className="text-2xl font-bold">{total > 0 ? Math.round((passed / total) * 100) : 0}%</p>
                  <p className="text-xs text-muted-foreground">Pass Rate</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <Flame className="h-7 w-7 mx-auto text-orange-500 mb-1.5" />
                  <p className="text-2xl font-bold">{streak}</p>
                  <p className="text-xs text-muted-foreground">Day Streak</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <GraduationCap className="h-7 w-7 mx-auto text-purple-500 mb-1.5" />
                  <p className="text-2xl font-bold">{enrolledCount}</p>
                  <p className="text-xs text-muted-foreground">Courses</p>
                </CardContent>
              </Card>
            </div>

            {/* Bar chart — Last 5 scores */}
            {chartData.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                    <Flame className="h-4 w-4 text-primary" />
                    Last {chartData.length} Quiz Scores
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} className="text-muted-foreground" />
                      <Tooltip formatter={(v: number) => [`${v}%`, "Score"]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Bar dataKey="pct" radius={[4, 4, 0, 0]}>
                        {chartData.map((entry, idx) => (
                          <Cell key={idx} fill={entry.passed === false ? "hsl(var(--destructive))" : "hsl(var(--primary))"} fillOpacity={0.85} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="flex items-center gap-4 mt-2 justify-end text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <span className="inline-block w-3 h-3 rounded-sm bg-primary/85" /> Pass
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block w-3 h-3 rounded-sm bg-destructive/85" /> Fail
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Subject-wise Performance */}
            {subjectData.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    Performance by Type
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={subjectData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} className="text-muted-foreground" />
                      <Tooltip
                        formatter={(v: number, _name: string, props: any) => [`${v}% avg (${props.payload.count} attempts)`, "Score"]}
                        contentStyle={{ fontSize: 12, borderRadius: 8 }}
                      />
                      <Bar dataKey="avg" radius={[4, 4, 0, 0]} fill="hsl(var(--primary))" fillOpacity={0.8} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* All attempts list */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <Trophy className="h-4 w-4 text-primary" />
                  All Attempts
                  {total > 0 && (
                    <span className="ml-auto text-xs text-muted-foreground font-normal">
                      {passed} passed · {failed} failed
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {total === 0 ? (
                  <div className="py-10 text-center text-muted-foreground">
                    <BookOpen className="h-10 w-10 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">No quiz attempts yet.</p>
                    <p className="text-xs mt-1">Attempt a DPP or Test to see your scores here.</p>
                  </div>
                ) : (
                  // perf-exam-ready Lane 3 #3: virtualize — heavy quiz users
                  // easily cross 100+ attempts before exam week.
                  <div style={{ height: Math.min(attempts.length, 8) * 68 }}>
                    <List
                      rowCount={attempts.length}
                      rowHeight={68}
                      rowComponent={AttemptRow}
                      rowProps={{ attempts }}
                      style={{ height: "100%" }}
                      overscanCount={4}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* Course progress */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <BookOpen className="h-4 w-4 text-primary" />
              Course Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            {enrollLoading ? (
              <div className="py-6 text-center">
                <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
              </div>
            ) : enrollments.length === 0 ? (
              <div className="py-6 text-center text-muted-foreground">
                <p className="text-sm">No courses enrolled yet.</p>
                <Button variant="outline" className="mt-3" onClick={() => navigate("/courses")}>
                  Browse Courses
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {enrollments.map((e: any) => (
                  <div key={e.id} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium truncate">{e.course?.title ?? "Course"}</span>
                      <span className="text-primary font-semibold shrink-0 ml-2">
                        {e.progress_percentage ?? 0}%
                      </span>
                    </div>
                    <Progress value={e.progress_percentage ?? 0} className="h-2" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

type AttemptRowProps = { attempts: QuizAttempt[] };

const AttemptRow = ({ index, style, attempts }: RowComponentProps<AttemptRowProps>) => {
  const a = attempts[index];
  if (!a) return null;
  const title = a.quizzes?.title ?? "Quiz";
  const totalMarks = a.quizzes?.total_marks ?? 0;
  const score = a.score ?? 0;
  const pct = a.percentage != null ? Number(a.percentage).toFixed(0) : "—";
  const date = a.submitted_at
    ? new Date(a.submitted_at).toLocaleDateString("en-IN", {
        day: "numeric", month: "short", year: "numeric",
      })
    : "—";
  return (
    <div style={style} className="flex items-center gap-3 px-4 py-3 border-b border-border">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-foreground truncate">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {a.quizzes?.type?.toUpperCase() ?? "DPP"} · {date}
        </p>
      </div>
      <div className="text-right shrink-0 space-y-1">
        <p className="text-sm font-semibold">
          {score} / {totalMarks}
          <span className="text-muted-foreground font-normal text-xs"> marks</span>
        </p>
        <div className="flex items-center justify-end gap-1.5">
          <span className="text-xs text-muted-foreground">{pct}%</span>
          {a.passed === true && (
            <Badge className="bg-green-500/10 text-green-600 border-green-200 text-xs gap-1 px-1.5">
              <CheckCircle2 className="h-3 w-3" /> Pass
            </Badge>
          )}
          {a.passed === false && (
            <Badge className="bg-destructive/10 text-destructive border-destructive/20 text-xs gap-1 px-1.5">
              <XCircle className="h-3 w-3" /> Fail
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
};

export default Reports;
