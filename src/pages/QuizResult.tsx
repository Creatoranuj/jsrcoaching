import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../integrations/supabase/client";
import RouteSkeleton from "../components/RouteSkeleton";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Progress } from "../components/ui/progress";
import { toast } from "sonner";
import {
  CheckCircle2, XCircle, ChevronLeft, Trophy, Clock,
  RotateCcw, ChevronDown, ChevronUp, Lightbulb,
  Bell, BookOpen, BarChart3, Target, TrendingUp,
  Award, Minus, Zap, Timer, Sparkles, GraduationCap,
  AlertTriangle, Gauge, Flame, ShieldCheck,
} from "lucide-react";
import { cn } from "../lib/utils";
import { QuizQuestionThumb } from "../components/quiz/QuizQuestionImage";
import { isAnswerCorrect, normalizeMcqIndex } from "../lib/quizAnswer";
import { getErrorMessage } from "@/lib/errorMessage";

interface Question {
  id: string;
  question_text: string;
  question_type: string;
  options: string[] | null;
  correct_answer: string;
  explanation: string | null;
  marks: number;
  negative_marks: number;
  order_index: number;
  image_url?: string | null;
}

interface Attempt {
  id: string;
  score: number;
  percentage: number;
  passed: boolean;
  answers: Record<string, string>;
  time_taken_seconds: number;
  submitted_at: string;
  quiz_id: string;
  user_id: string;
}

interface Quiz {
  id: string;
  title: string;
  total_marks: number;
  pass_percentage: number;
  type: string;
  duration_minutes: number;
}

interface SectionStats {
  name: string;
  questions: Question[];
  correct: number;
  incorrect: number;
  skipped: number;
  marksObtained: number;
  marksLost: number;
  totalMarks: number;
  accuracy: number;
  timeSeconds: number;
}

// Derive section labels based on quiz type and question count
const getSectionLabels = (quizType: string, count: number): string[] => {
  const type = quizType?.toLowerCase() || "";
  if (count <= 20) return ["All Questions"];
  if (count <= 44) {
    if (type.includes("bio") || type.includes("neet")) return ["Physics", "Biology"];
    return ["Section A", "Section B"];
  }
  // 45+
  if (type.includes("neet") || type.includes("bio") || type.includes("medical"))
    return ["Physics", "Chemistry", "Biology"];
  if (type.includes("jee") || type.includes("math") || type.includes("eng"))
    return ["Physics", "Chemistry", "Mathematics"];
  return ["Section A", "Section B", "Section C"];
};

const QuizResult = () => {
  const { quizId, attemptId } = useParams();
  const navigate = useNavigate();
  const reviewRef = useRef<HTMLDivElement>(null);

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [attemptNumber, setAttemptNumber] = useState(1);
  const [rank, setRank] = useState<number | null>(null);
  const [totalParticipants, setTotalParticipants] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"summary" | "expert" | "leaderboard">("summary");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchData = async () => {
      if (!quizId || !attemptId) return;
      try {
        // Phase-2: fetch review via secure RPC. `get_quiz_review` verifies
        // caller owns a SUBMITTED attempt and only then returns
        // correct_answer + explanation. Direct SELECT on `questions` is
        // blocked by RLS for students.
        const [quizRes, questionsRes, attemptRes] = await Promise.all([
          supabase.from("quizzes").select("*").eq("id", quizId).single(),
          supabase.rpc("get_quiz_review", { _attempt_id: attemptId }),
          supabase.from("quiz_attempts").select("*").eq("id", attemptId).single(),
        ]);
        if (quizRes.error) throw quizRes.error;
        if (questionsRes.error) throw questionsRes.error;
        if (attemptRes.error) throw attemptRes.error;

        const attemptData = {
          ...attemptRes.data,
          answers: (attemptRes.data.answers as Record<string, string>) || {},
        } as Attempt;

        setQuiz(quizRes.data as Quiz);
        setQuestions(
          (questionsRes.data || []).map((q) => ({
            ...q,
            options: Array.isArray(q.options) ? q.options : (q.options ? Object.values(q.options) : null),
          }))
        );
        setAttempt(attemptData);

        // Fetch attempt count for badge
        const { count } = await supabase
          .from("quiz_attempts")
          .select("id", { count: "exact", head: true })
          .eq("quiz_id", quizId)
          .eq("user_id", attemptData.user_id)
          .lte("submitted_at", attemptData.submitted_at);
        setAttemptNumber(count || 1);

      } catch (err: unknown) {
        toast.error(getErrorMessage(err));
        navigate("/all-tests");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [quizId, attemptId]);

  // Compute live rank against all other students' best attempts on this quiz
  useEffect(() => {
    if (!quizId || !attempt) return;
    (async () => {
      const { data, error } = await supabase
        .from("quiz_attempts")
        .select("user_id, score")
        .eq("quiz_id", quizId);
      if (error || !data) return;
      const bestByUser = new Map<string, number>();
      for (const row of data) {
        const prev = bestByUser.get(row.user_id) ?? -Infinity;
        if ((row.score ?? 0) > prev) bestByUser.set(row.user_id, row.score ?? 0);
      }
      const myBest = bestByUser.get(attempt.user_id) ?? attempt.score;
      let higher = 0;
      bestByUser.forEach((s) => { if (s > myBest) higher += 1; });
      setRank(higher + 1);
      setTotalParticipants(bestByUser.size);
    })();
  }, [quizId, attempt?.id]);

  const formatTime = (seconds: number) => {
    if (!seconds) return "—";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m ${s}s`;
  };

  const toggleExpand = (id: string) => {
    const updated = new Set(expandedIds);
    if (updated.has(id)) updated.delete(id); else updated.add(id);
    setExpandedIds(updated);
  };

  const toggleSection = (name: string) => {
    const updated = new Set(expandedSections);
    if (updated.has(name)) updated.delete(name); else updated.add(name);
    setExpandedSections(updated);
  };

  if (loading) return <RouteSkeleton label="Loading results" />;
  if (!quiz || !attempt) return null;

  // ── Core Stats ──────────────────────────────────────────────────────────────
  const totalMarks = quiz.total_marks || questions.reduce((s, q) => s + q.marks, 0);
  const totalQ = questions.length;

  const isCorrectQ = (q: Question) =>
    isAnswerCorrect(attempt.answers[q.id], q.correct_answer, q.question_type, q.options);
  const hasAns = (q: Question) => {
    const a = attempt.answers[q.id];
    return a !== undefined && a !== null && String(a).trim() !== "";
  };

  const correctCount = questions.filter(isCorrectQ).length;
  const incorrectCount = questions.filter((q) => hasAns(q) && !isCorrectQ(q)).length;
  const skippedCount = totalQ - correctCount - incorrectCount;

  const marksObtained = questions.filter(isCorrectQ).reduce((s, q) => s + q.marks, 0);
  const marksLost = questions
    .filter((q) => hasAns(q) && !isCorrectQ(q))
    .reduce((s, q) => s + (q.negative_marks || 0), 0);
  const marksSkipped = questions.filter((q) => !hasAns(q)).reduce((s, q) => s + q.marks, 0);

  const accuracy =
    correctCount + incorrectCount > 0
      ? Math.round((correctCount / (correctCount + incorrectCount)) * 100)
      : 0;

  // ── Sectional Breakdown ──────────────────────────────────────────────────────
  const sectionLabels = getSectionLabels(quiz.type, totalQ);
  const chunkSize = Math.ceil(totalQ / sectionLabels.length);
  const totalTime = attempt.time_taken_seconds || 0;

  const sections: SectionStats[] = sectionLabels.map((name, idx) => {
    const secQs = questions.slice(idx * chunkSize, (idx + 1) * chunkSize);
    const sc = secQs.filter(isCorrectQ).length;
    const si = secQs.filter((q) => hasAns(q) && !isCorrectQ(q)).length;
    const ss = secQs.length - sc - si;
    const sm = secQs.filter(isCorrectQ).reduce((s, q) => s + q.marks, 0);
    const sl = secQs.filter((q) => hasAns(q) && !isCorrectQ(q)).reduce((s, q) => s + (q.negative_marks || 0), 0);
    const stm = secQs.reduce((s, q) => s + q.marks, 0);
    const secTime = Math.round((secQs.length / (totalQ || 1)) * totalTime);
    return {
      name,
      questions: secQs,
      correct: sc,
      incorrect: si,
      skipped: ss,
      marksObtained: sm,
      marksLost: sl,
      totalMarks: stm,
      accuracy: sc + si > 0 ? Math.round((sc / (sc + si)) * 100) : 0,
      timeSeconds: secTime,
    };
  });

  const scoreDisplay = `${marksObtained}/${totalMarks}`;

  // Colour helpers
  const scoreColor = marksObtained >= totalMarks * 0.6 ? "text-green-400" : marksObtained >= totalMarks * 0.35 ? "text-yellow-400" : "text-red-400";

  // ── Expert Report derived stats ─────────────────────────────────────────────
  const netScore = marksObtained - marksLost;
  const attemptedCount = correctCount + incorrectCount;
  const attemptRate = totalQ > 0 ? Math.round((attemptedCount / totalQ) * 100) : 0;
  const totalTimeSec = attempt.time_taken_seconds || 0;
  const avgTimePerQSec = attemptedCount > 0 ? Math.round(totalTimeSec / attemptedCount) : 0;
  const idealTimePerQSec = quiz.duration_minutes > 0 && totalQ > 0
    ? Math.round((quiz.duration_minutes * 60) / totalQ)
    : 0;
  const timeEfficiency = idealTimePerQSec > 0 && avgTimePerQSec > 0
    ? Math.round((idealTimePerQSec / avgTimePerQSec) * 100)
    : 100;

  // Difficulty buckets — infer from marks
  const bucketOf = (q: Question): "easy" | "medium" | "hard" =>
    q.marks >= 4 ? "hard" : q.marks >= 2 ? "medium" : "easy";
  const buckets = (["easy", "medium", "hard"] as const).map((key) => {
    const bq = questions.filter((q) => bucketOf(q) === key);
    const bc = bq.filter(isCorrectQ).length;
    const bi = bq.filter((q) => hasAns(q) && !isCorrectQ(q)).length;
    const bs = bq.length - bc - bi;
    const bm = bq.filter(isCorrectQ).reduce((s, q) => s + q.marks, 0);
    const bt = bq.reduce((s, q) => s + q.marks, 0);
    return {
      key,
      label: key === "easy" ? "Easy" : key === "medium" ? "Medium" : "Hard",
      total: bq.length,
      correct: bc,
      incorrect: bi,
      skipped: bs,
      marksEarned: bm,
      marksTotal: bt,
      accuracy: bc + bi > 0 ? Math.round((bc / (bc + bi)) * 100) : 0,
    };
  }).filter((b) => b.total > 0);

  // Strengths & weaknesses (only when we have real multi-section split)
  const rankedSections = [...sections].sort((a, b) => b.accuracy - a.accuracy);
  const strengths = rankedSections.filter((s) => s.correct + s.incorrect >= 2 && s.accuracy >= 70);
  const weaknesses = rankedSections.filter((s) => s.correct + s.incorrect >= 2 && s.accuracy < 40);

  // Time verdict
  const isFast = idealTimePerQSec > 0 && avgTimePerQSec < idealTimePerQSec * 0.7;
  const isSlow = idealTimePerQSec > 0 && avgTimePerQSec > idealTimePerQSec * 1.2;
  const isAccurate = accuracy >= 70;
  const timeVerdict = idealTimePerQSec === 0
    ? { label: "Untimed", tone: "text-muted-foreground", icon: Timer }
    : isFast && isAccurate
      ? { label: "Fast & Accurate", tone: "text-green-500", icon: Zap }
      : isFast && !isAccurate
        ? { label: "Rushed", tone: "text-destructive", icon: AlertTriangle }
        : isSlow && isAccurate
          ? { label: "Slow & Steady", tone: "text-yellow-500", icon: Timer }
          : isSlow && !isAccurate
            ? { label: "Slow & Struggling", tone: "text-destructive", icon: AlertTriangle }
            : { label: "Balanced Pace", tone: "text-primary", icon: Gauge };

  // Strategy tips (rule-based, max 4)
  const tips: { icon: any; text: string; tone: string }[] = [];
  if (totalQ > 0 && skippedCount / totalQ > 0.3) {
    tips.push({
      icon: Sparkles,
      text: `Aap ne ${skippedCount} sawaal skip kiye. Next time thoda risk lo — accuracy achhi hai to attempts badhao.`,
      tone: "text-yellow-500",
    });
  }
  if (incorrectCount > correctCount && marksLost > 0) {
    tips.push({
      icon: ShieldCheck,
      text: `Negative marks ne ${marksLost} points kate. Low-confidence sawaal skip karo — guessing costly hai.`,
      tone: "text-destructive",
    });
  }
  if (accuracy >= 80 && attemptRate < 60) {
    tips.push({
      icon: Flame,
      text: `Accuracy ${accuracy}% hai lekin sirf ${attemptRate}% attempt kiya. Speed pe kaam karo — full potential unlock hoga.`,
      tone: "text-green-500",
    });
  }
  if (quiz.duration_minutes > 0 && totalTimeSec < quiz.duration_minutes * 60 * 0.5) {
    tips.push({
      icon: Clock,
      text: `Aap ne aadha time bhi use nahi kiya. Bacha hua time review me lagao — silly mistakes pakde jaate hain.`,
      tone: "text-primary",
    });
  }
  const zeroSections = rankedSections.filter((s) => s.correct + s.incorrect >= 2 && s.accuracy === 0);
  if (zeroSections.length > 0 && tips.length < 4) {
    tips.push({
      icon: AlertTriangle,
      text: `${zeroSections.map((s) => s.name).join(", ")} me 0% accuracy — is section ki basics dohrao pehle.`,
      tone: "text-destructive",
    });
  }
  if (tips.length === 0) {
    tips.push({
      icon: Sparkles,
      text: `Solid attempt! Consistency banaye rakho — har hafte 2-3 mock lagao.`,
      tone: "text-primary",
    });
  }

  // Marks distribution slices for the bar
  const totalMarksSafe = totalMarks || 1;
  const distSlices = [
    { label: "Earned", value: marksObtained, color: "bg-green-500" },
    { label: "Lost (neg)", value: marksLost, color: "bg-destructive" },
    { label: "Skipped", value: marksSkipped, color: "bg-muted-foreground/40" },
  ];
  const distTotal = distSlices.reduce((s, x) => s + x.value, 0);
  const distRemainder = Math.max(0, totalMarksSafe - distTotal);
  if (distRemainder > 0) {
    distSlices.push({ label: "Unattempted", value: distRemainder, color: "bg-muted" });
  }


  return (
    <main className="min-h-dvh bg-background pb-12">
      {/* ── Sticky Header ── */}
      <header
        className="sticky top-0 z-20 bg-card/95 backdrop-blur border-b shadow-sm pt-[env(safe-area-inset-top)]"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="flex items-center gap-3 max-w-3xl mx-auto px-4 py-3">
          <button onClick={() => navigate("/all-tests")} className="text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{quiz.type?.toUpperCase() || "QUIZ"}</p>
            <h1 className="text-sm font-semibold text-foreground truncate">{quiz.title}</h1>
          </div>
          <Badge variant="outline" className="shrink-0 text-xs border-primary/40 text-primary">
            Attempt {attemptNumber}
          </Badge>
        </div>
      </header>

      {/* ── Live Rank Banner ── */}
      {rank !== null && totalParticipants !== null && (
        <div className="bg-primary/10 border-b border-primary/20">
          <div className="max-w-3xl mx-auto px-4 py-2.5 flex items-center gap-2.5">
            <Trophy className="h-4 w-4 text-primary shrink-0" />
            <p className="text-xs text-foreground/80">
              Your rank: <span className="font-semibold text-primary">#{rank}</span> of {totalParticipants}{" "}
              participant{totalParticipants === 1 ? "" : "s"}
              {totalParticipants > 1 && (
                <> · Top <span className="font-semibold">{Math.max(1, Math.round((rank / totalParticipants) * 100))}%</span></>
              )}
            </p>
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto px-4 pt-5 space-y-5">

        {/* ── Hero Score Card ── */}
        <div className="rounded-2xl overflow-hidden shadow-lg bg-gradient-to-br from-primary/90 to-primary text-primary-foreground">
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-primary-foreground/70 text-xs font-medium uppercase tracking-wider">Overall Score</p>
                <h2 className={cn("text-4xl font-black mt-1", scoreColor)}>{scoreDisplay}</h2>
              </div>
              <div className="text-right">
                <p className="text-primary-foreground/70 text-xs font-medium uppercase tracking-wider">Accuracy</p>
                <p className="text-2xl font-bold mt-1 text-primary-foreground">{accuracy}%</p>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs text-primary-foreground/70 mb-5">
              <span className="flex items-center gap-1"><BookOpen className="h-3.5 w-3.5" />{totalQ} Questions</span>
              <span className="flex items-center gap-1"><Target className="h-3.5 w-3.5" />{totalMarks} Marks</span>
              {quiz.duration_minutes > 0 && (
                <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{quiz.duration_minutes} min</span>
              )}
            </div>

            {/* Rank/Percentile placeholders */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="bg-white/10 rounded-xl p-3 text-center">
                <p className="text-xs text-primary-foreground/60 mb-1">Percentile</p>
                <p className="text-xl font-bold text-primary-foreground">--</p>
                <p className="text-[10px] text-primary-foreground/50 mt-0.5">Result Awaited</p>
              </div>
              <div className="bg-white/10 rounded-xl p-3 text-center">
                <p className="text-xs text-primary-foreground/60 mb-1">Rank</p>
                <p className="text-xl font-bold text-primary-foreground">—</p>
                <p className="text-[10px] text-primary-foreground/50 mt-0.5">Result Awaited</p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 bg-white/10 border-white/20 text-primary-foreground hover:bg-white/20 gap-1.5"
                onClick={() => navigate(`/quiz/${quizId}`)}
              >
                <RotateCcw className="h-4 w-4" />
                Reattempt
              </Button>
              <Button
                size="sm"
                className="flex-1 bg-white text-primary hover:bg-white/90 gap-1.5 font-semibold"
                onClick={() => reviewRef.current?.scrollIntoView({ behavior: "smooth" })}
              >
                <BookOpen className="h-4 w-4" />
                View Solution ↓
              </Button>
            </div>
          </div>

          {/* Time bar at bottom of hero */}
          <div className="bg-black/20 px-5 py-2.5 flex items-center justify-between text-xs text-primary-foreground/70">
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Time Taken: <strong className="text-primary-foreground">{formatTime(attempt.time_taken_seconds)}</strong>
            </span>
            <span className="flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" />
              {attempt.passed ? "✓ Passed" : "✗ Not Passed"} ({quiz.pass_percentage}% required)
            </span>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="bg-card border rounded-2xl overflow-hidden shadow-sm">
          {/* Tab bar */}
          <div className="flex border-b">
            {(["summary", "expert", "leaderboard"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "flex-1 py-3 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap",
                  activeTab === tab
                    ? "text-primary border-b-2 border-primary bg-primary/5"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab === "summary" ? "📊 Summary" : tab === "expert" ? "🎯 Expert Report" : "🏆 Leaderboard"}
              </button>
            ))}
          </div>

          {/* ── Result Summary ── */}
          {activeTab === "summary" && (
            <div className="p-4 space-y-5">

              {/* Correct / Incorrect / Skipped progress rows */}
              <div className="space-y-3">
                {/* Correct */}
                <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span className="text-sm font-semibold text-foreground">Correct</span>
                      <span className="text-xs text-muted-foreground">{correctCount}/{totalQ}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold text-green-600">+{marksObtained}</span>
                      <span className="text-xs text-muted-foreground ml-1">marks</span>
                    </div>
                  </div>
                  <Progress
                    value={totalQ > 0 ? (correctCount / totalQ) * 100 : 0}
                    className="h-2 bg-green-100 dark:bg-green-900/30"
                  />
                </div>

                {/* Incorrect */}
                <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-destructive" />
                      <span className="text-sm font-semibold text-foreground">Incorrect</span>
                      <span className="text-xs text-muted-foreground">{incorrectCount}/{totalQ}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold text-destructive">-{marksLost}</span>
                      <span className="text-xs text-muted-foreground ml-1">marks lost</span>
                    </div>
                  </div>
                  <Progress
                    value={totalQ > 0 ? (incorrectCount / totalQ) * 100 : 0}
                    className="h-2 bg-red-100 dark:bg-red-900/30"
                  />
                </div>

                {/* Skipped */}
                <div className="bg-muted/30 border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Minus className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-semibold text-foreground">Skipped</span>
                      <span className="text-xs text-muted-foreground">{skippedCount}/{totalQ}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold text-muted-foreground">{marksSkipped}</span>
                      <span className="text-xs text-muted-foreground ml-1">marks skipped</span>
                    </div>
                  </div>
                  <Progress
                    value={totalQ > 0 ? (skippedCount / totalQ) * 100 : 0}
                    className="h-2"
                  />
                </div>
              </div>

              {/* Quick stats row */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-card border rounded-xl p-3 text-center">
                  <BarChart3 className="h-4 w-4 mx-auto mb-1 text-primary" />
                  <p className="text-base font-bold text-foreground">{accuracy}%</p>
                  <p className="text-[11px] text-muted-foreground">Accuracy</p>
                </div>
                <div className="bg-card border rounded-xl p-3 text-center">
                  <Clock className="h-4 w-4 mx-auto mb-1 text-primary" />
                  <p className="text-base font-bold text-foreground">{formatTime(attempt.time_taken_seconds)}</p>
                  <p className="text-[11px] text-muted-foreground">Time Taken</p>
                </div>
                <div className="bg-card border rounded-xl p-3 text-center">
                  <Award className="h-4 w-4 mx-auto mb-1 text-primary" />
                  <p className="text-base font-bold text-foreground">{marksObtained - marksLost}</p>
                  <p className="text-[11px] text-muted-foreground">Net Score</p>
                </div>
              </div>

              {/* Sectional Performance */}
              {sections.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    Sectional Performance
                  </h3>
                  <div className="space-y-2">
                    {sections.map((sec) => {
                      const isOpen = expandedSections.has(sec.name);
                      return (
                        <div key={sec.name} className="border rounded-xl overflow-hidden bg-card">
                          <button
                            className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
                            onClick={() => toggleSection(sec.name)}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                <span className="text-xs font-bold text-primary">{sec.name[0]}</span>
                              </div>
                              <div className="text-left">
                                <p className="text-sm font-semibold text-foreground">{sec.name}</p>
                                <p className="text-xs text-muted-foreground">{sec.questions.length} questions · {sec.totalMarks} marks</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <p className="text-sm font-bold text-foreground">{sec.marksObtained}/{sec.totalMarks}</p>
                                <p className="text-[11px] text-muted-foreground">{sec.accuracy}% accuracy</p>
                              </div>
                              {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                            </div>
                          </button>

                          {isOpen && (
                            <div className="border-t bg-muted/10 px-4 py-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
                              {[
                                { label: "Score", value: `${sec.marksObtained - sec.marksLost}/${sec.totalMarks}`, icon: Target, color: "text-primary" },
                                { label: "Correct", value: String(sec.correct), icon: CheckCircle2, color: "text-green-500" },
                                { label: "Incorrect", value: String(sec.incorrect), icon: XCircle, color: "text-destructive" },
                                { label: "Skipped", value: String(sec.skipped), icon: Minus, color: "text-muted-foreground" },
                                { label: "Accuracy", value: `${sec.accuracy}%`, icon: BarChart3, color: "text-primary" },
                                { label: "Time", value: formatTime(sec.timeSeconds), icon: Clock, color: "text-muted-foreground" },
                              ].map(({ label, value, icon: Icon, color }) => (
                                <div key={label} className="flex items-center gap-2 bg-card rounded-lg px-3 py-2 border">
                                  <Icon className={cn("h-3.5 w-3.5 shrink-0", color)} />
                                  <div>
                                    <p className="text-[11px] text-muted-foreground">{label}</p>
                                    <p className="text-sm font-bold text-foreground">{value}</p>
                                  </div>
                                </div>
                              ))}

                              {/* Percentile / Rank placeholders */}
                              <div className="col-span-2 sm:col-span-3 grid grid-cols-2 gap-2 mt-1">
                                <div className="bg-card border rounded-lg px-3 py-2 text-center">
                                  <p className="text-[11px] text-muted-foreground">Percentile</p>
                                  <p className="text-sm font-bold text-muted-foreground">Result Awaited</p>
                                </div>
                                <div className="bg-card border rounded-lg px-3 py-2 text-center">
                                  <p className="text-[11px] text-muted-foreground">Rank</p>
                                  <p className="text-sm font-bold text-muted-foreground">Result Awaited</p>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* View Detailed Analysis CTA */}
              <Button
                variant="outline"
                className="w-full gap-2 border-primary/30 text-primary hover:bg-primary/5"
                onClick={() => reviewRef.current?.scrollIntoView({ behavior: "smooth" })}
              >
                <BookOpen className="h-4 w-4" />
                View Detailed Answer Analysis ↓
              </Button>
            </div>
          )}

          {/* ── Expert Report Tab ── */}
          {activeTab === "expert" && (
            <div className="p-4 space-y-5">
              {/* Header strip */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <GraduationCap className="h-4 w-4 text-primary" />
                <span>Senior-mentor grade breakdown of your attempt</span>
              </div>

              {/* Quick chips row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: "Net Score", value: `${netScore}`, sub: `of ${totalMarks}`, icon: Award, tone: "text-primary" },
                  { label: "Accuracy", value: `${accuracy}%`, sub: `${correctCount}/${attemptedCount || 0} correct`, icon: Target, tone: "text-green-500" },
                  { label: "Attempt", value: `${attemptRate}%`, sub: `${attemptedCount}/${totalQ} qs`, icon: BarChart3, tone: "text-primary" },
                  { label: "Avg / Q", value: avgTimePerQSec > 0 ? `${avgTimePerQSec}s` : "—", sub: idealTimePerQSec > 0 ? `ideal ${idealTimePerQSec}s` : "untimed", icon: Timer, tone: "text-yellow-500" },
                ].map((chip) => (
                  <div key={chip.label} className="rounded-xl border bg-card p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <chip.icon className={cn("h-3.5 w-3.5", chip.tone)} />
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{chip.label}</p>
                    </div>
                    <p className="text-lg font-black text-foreground leading-tight tabular-nums">{chip.value}</p>
                    <p className="text-[11px] text-muted-foreground">{chip.sub}</p>
                  </div>
                ))}
              </div>

              {/* Marks distribution bar */}
              <div className="rounded-2xl border bg-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    Marks Distribution
                  </h4>
                  <span className="text-xs text-muted-foreground tabular-nums">Total {totalMarks}</span>
                </div>
                <div className="h-3 w-full rounded-full overflow-hidden flex bg-muted">
                  {distSlices.map((s) => s.value > 0 && (
                    <div
                      key={s.label}
                      className={cn("h-full", s.color)}
                      style={{ width: `${(s.value / totalMarksSafe) * 100}%` }}
                      title={`${s.label}: ${s.value}`}
                    />
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  {distSlices.map((s) => (
                    <div key={s.label} className="flex items-center gap-2">
                      <span className={cn("h-2.5 w-2.5 rounded-sm shrink-0", s.color)} />
                      <span className="text-muted-foreground">{s.label}</span>
                      <span className="ml-auto font-semibold text-foreground tabular-nums">{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Difficulty breakdown */}
              {buckets.length > 0 && (
                <div className="rounded-2xl border bg-card p-4">
                  <h4 className="text-sm font-bold text-foreground flex items-center gap-2 mb-3">
                    <Flame className="h-4 w-4 text-primary" />
                    Difficulty Breakdown
                  </h4>
                  <div className="space-y-3">
                    {buckets.map((b) => {
                      const tone = b.key === "easy" ? "bg-green-500" : b.key === "medium" ? "bg-yellow-500" : "bg-destructive";
                      const chipTone = b.key === "easy" ? "text-green-600 bg-green-500/10 border-green-500/20"
                        : b.key === "medium" ? "text-yellow-600 bg-yellow-500/10 border-yellow-500/20"
                        : "text-destructive bg-destructive/10 border-destructive/20";
                      return (
                        <div key={b.key}>
                          <div className="flex items-center justify-between text-xs mb-1.5">
                            <div className="flex items-center gap-2">
                              <span className={cn("px-2 py-0.5 rounded-full border font-semibold", chipTone)}>{b.label}</span>
                              <span className="text-muted-foreground tabular-nums">{b.correct}/{b.total} correct · {b.accuracy}%</span>
                            </div>
                            <span className="text-foreground font-semibold tabular-nums">{b.marksEarned}/{b.marksTotal} mk</span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                            <div
                              className={cn("h-full transition-all", tone)}
                              style={{ width: `${b.total > 0 ? (b.correct / b.total) * 100 : 0}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-3">
                    Difficulty inferred from marks (1 = Easy · 2-3 = Medium · 4+ = Hard).
                  </p>
                </div>
              )}

              {/* Time management */}
              <div className="rounded-2xl border bg-card p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Timer className="h-4 w-4 text-primary" />
                    Time Management
                  </h4>
                  <span className={cn(
                    "flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border",
                    "bg-muted/30 border-border",
                    timeVerdict.tone,
                  )}>
                    <timeVerdict.icon className="h-3.5 w-3.5" />
                    {timeVerdict.label}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-muted/20 p-2.5">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Total Time</p>
                    <p className="text-sm font-bold text-foreground tabular-nums">{formatTime(totalTimeSec)}</p>
                  </div>
                  <div className="rounded-xl bg-muted/20 p-2.5">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Avg / Q</p>
                    <p className="text-sm font-bold text-foreground tabular-nums">{avgTimePerQSec > 0 ? `${avgTimePerQSec}s` : "—"}</p>
                  </div>
                  <div className="rounded-xl bg-muted/20 p-2.5">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Efficiency</p>
                    <p className={cn("text-sm font-bold tabular-nums", timeEfficiency >= 90 ? "text-green-500" : timeEfficiency >= 70 ? "text-yellow-500" : "text-destructive")}>
                      {idealTimePerQSec > 0 ? `${timeEfficiency}%` : "—"}
                    </p>
                  </div>
                </div>
                {idealTimePerQSec > 0 && (
                  <p className="text-[11px] text-muted-foreground mt-3">
                    Ideal pace: ~{idealTimePerQSec}s per question ({quiz.duration_minutes} min ÷ {totalQ} qs).
                  </p>
                )}
              </div>

              {/* Strengths / Weaknesses */}
              {(strengths.length > 0 || weaknesses.length > 0) && (
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-green-500/20 bg-green-500/5 p-4">
                    <h4 className="text-sm font-bold text-foreground flex items-center gap-2 mb-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      Strengths
                    </h4>
                    {strengths.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Aur mock lagao — trend banega tabhi strengths pakke honge.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {strengths.map((s) => (
                          <li key={s.name} className="flex items-center justify-between text-sm">
                            <span className="text-foreground font-medium">{s.name}</span>
                            <span className="text-green-600 font-bold tabular-nums">{s.accuracy}%</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4">
                    <h4 className="text-sm font-bold text-foreground flex items-center gap-2 mb-2">
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                      Needs Focus
                    </h4>
                    {weaknesses.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Kahin bhi 40% se neeche nahi — solid coverage!</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {weaknesses.map((s) => (
                          <li key={s.name} className="flex items-center justify-between text-sm">
                            <span className="text-foreground font-medium">{s.name}</span>
                            <span className="text-destructive font-bold tabular-nums">{s.accuracy}%</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              {/* Coach tips */}
              <div className="rounded-2xl border bg-card p-4">
                <h4 className="text-sm font-bold text-foreground flex items-center gap-2 mb-3">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Mentor's Tips
                </h4>
                <ul className="space-y-2.5">
                  {tips.map((t, i) => (
                    <li key={i} className="flex gap-2.5 text-sm text-foreground/90">
                      <t.icon className={cn("h-4 w-4 shrink-0 mt-0.5", t.tone)} />
                      <span>{t.text}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Next steps */}
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => navigate(`/quiz/${quizId}`)}
                >
                  <RotateCcw className="h-4 w-4" />
                  Reattempt
                </Button>
                <Button
                  className="w-full gap-2"
                  onClick={() => reviewRef.current?.scrollIntoView({ behavior: "smooth" })}
                >
                  <BookOpen className="h-4 w-4" />
                  Review Solutions
                </Button>
              </div>
            </div>
          )}

          {/* ── Leaderboard Tab ── */}
          {activeTab === "leaderboard" && (
            <div className="p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mx-auto mb-4">
                <Trophy className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-base font-bold text-foreground mb-2">Leaderboard Coming Soon</h3>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                The leaderboard and ranking will be published once the result window closes and all students have attempted this test.
              </p>
              <div className="mt-6 p-4 bg-muted/20 rounded-xl border border-dashed space-y-2">
                {[1, 2, 3].map((rank) => (
                  <div key={rank} className="flex items-center gap-3 animate-pulse">
                    <div className="w-7 h-7 rounded-full bg-muted" />
                    <div className="flex-1 h-3 bg-muted rounded" />
                    <div className="w-12 h-3 bg-muted rounded" />
                  </div>
                ))}
                <p className="text-xs text-muted-foreground text-center pt-2">Result Awaited…</p>
              </div>
            </div>
          )}
        </div>

        {/* ── Answer Review ── */}
        <div ref={reviewRef} id="answer-review">
          <h3 className="text-base font-bold text-foreground mb-3 flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            Detailed Answer Review
            <span className="text-xs text-muted-foreground font-normal ml-1">({totalQ} questions)</span>
          </h3>
          <div className="space-y-3">
            {questions.map((q, idx) => {
              const userAns = attempt.answers[q.id];
              const isSkipped = !hasAns(q);
              const isCorrect = !isSkipped && isCorrectQ(q);
              const isExpanded = expandedIds.has(q.id);
              const correctIdx = normalizeMcqIndex(q.correct_answer, q.options);
              const userIdx = normalizeMcqIndex(userAns, q.options);

              return (
                <div
                  key={q.id}
                  className={cn(
                    "border-2 rounded-xl overflow-hidden",
                    isCorrect
                      ? "border-green-500/30 bg-green-500/5"
                      : isSkipped
                      ? "border-border bg-card"
                      : "border-destructive/30 bg-destructive/5"
                  )}
                >
                  <button
                    className="w-full flex items-start gap-3 p-4 text-left"
                    onClick={() => toggleExpand(q.id)}
                  >
                    <div className="shrink-0 mt-0.5">
                      {isCorrect ? (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      ) : isSkipped ? (
                        <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
                      ) : (
                        <XCircle className="h-5 w-5 text-destructive" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground mb-1">Q{idx + 1}</p>
                      {(q as any).image_url && (
                        <QuizQuestionThumb src={(q as any).image_url} />
                      )}
                      <p className="text-sm font-medium text-foreground line-clamp-2">{q.question_text}</p>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <span className={cn(
                        "text-xs font-semibold",
                        isCorrect ? "text-green-600" : isSkipped ? "text-muted-foreground" : "text-destructive"
                      )}>
                        {isCorrect
                          ? `+${q.marks}`
                          : isSkipped || !q.negative_marks
                          ? "0"
                          : `-${q.negative_marks}`}
                      </span>
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-3 border-t border-border/50">
                      {q.options && (
                        <div className="space-y-2 mt-3">
                          {q.options.map((opt, i) => {
                            const isUserChoice = userIdx === i;
                            const isCorrectOpt = correctIdx === i;
                            return (
                              <div
                                key={`${q.id ?? 'q'}-opt-${i}`}
                                className={cn(
                                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm",
                                  isCorrectOpt
                                    ? "bg-green-500/15 border border-green-500/30 text-green-700 dark:text-green-400"
                                    : isUserChoice && !isCorrectOpt
                                    ? "bg-destructive/15 border border-destructive/30 text-destructive"
                                    : "bg-muted/30"
                                )}
                              >
                                <span className="font-semibold text-xs w-5">{String.fromCharCode(65 + i)}.</span>
                                <span className="flex-1">{opt}</span>
                                {isCorrectOpt && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                                {isUserChoice && !isCorrectOpt && <XCircle className="h-4 w-4 text-destructive" />}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {q.question_type === "true_false" && (
                        <div className="text-sm mt-2">
                          <span className="text-muted-foreground">Correct: </span>
                          <span className="font-semibold text-green-600 capitalize">{q.correct_answer}</span>
                          {userAns && (
                            <>
                              <span className="text-muted-foreground ml-3">Your answer: </span>
                              <span className={cn("font-semibold capitalize", isCorrect ? "text-green-600" : "text-destructive")}>{userAns}</span>
                            </>
                          )}
                        </div>
                      )}

                      {q.explanation && (
                        <div className="flex gap-2 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                          <Lightbulb className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                          <p className="text-sm text-foreground">{q.explanation}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
};

export default QuizResult;
