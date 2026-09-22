import { useState, useEffect, useRef, useCallback } from "react";
import { reportError } from "@/lib/sentry";
import { useNavigate, useLocation } from "react-router-dom";
import { parseQuizDeepLink, findQuizForLesson } from "@/features/admin-quiz/lib/quizDeepLink";

import { supabase } from "../integrations/supabase/client";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import { ScrollArea } from "../components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../components/ui/sheet";
import { toast } from "sonner";
import {
  Plus, Trash2, ChevronLeft, Eye, EyeOff, Save, Loader2,
  ClipboardList, FlaskConical, Edit2, ArrowLeft, Check, X, Link2,
  Users, ImagePlus, XCircle, Search,
} from "lucide-react";
import { cn } from "../lib/utils";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { SortableQuestion } from "../components/admin/quiz/SortableQuestion";
import { defaultQuestion, type Quiz, type QuestionForm } from "../components/admin/quiz/types";
import { getErrorMessage } from "@/lib/errorMessage";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

type CourseOption = Pick<Tables<"courses">, "id" | "title">;
type LessonOption = Pick<Tables<"lessons">, "id" | "title" | "lecture_type">;
type ChapterOption = Pick<Tables<"chapters">, "id" | "title" | "position">;
type QuestionRow = Tables<"questions">;
/** The columns `openAttempts` selects, plus the joined student name. */
type QuizAttemptRow = Pick<
  Tables<"quiz_attempts">,
  "id" | "score" | "percentage" | "passed" | "submitted_at" | "time_taken_seconds" | "user_id"
> & { student_name?: string };

const AdminQuizManager = () => {
  const confirmAction = useConfirm();
  const navigate = useNavigate();
  const location = useLocation();
  const appliedDeepLinkRef = useRef<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [lessons, setLessons] = useState<LessonOption[]>([]);
  const [chapters, setChapters] = useState<ChapterOption[]>([]);

  // UI state
  const [view, setView] = useState<"list" | "create" | "edit-questions">("list");
  // When set, the create form is editing this existing quiz instead of inserting.
  const [editingDetailsId, setEditingDetailsId] = useState<string | null>(null);
  const [editingQuizId, setEditingQuizId] = useState<string | null>(null);
  const [savingQuiz, setSavingQuiz] = useState(false);

  // Attempts sheet
  const [attemptsQuizId, setAttemptsQuizId] = useState<string | null>(null);
  const [attemptsQuizTitle, setAttemptsQuizTitle] = useState("");
  const [attempts, setAttempts] = useState<QuizAttemptRow[]>([]);
  const [loadingAttempts, setLoadingAttempts] = useState(false);

  // Collapsible questions
  const [expandedQuestions, setExpandedQuestions] = useState<Record<string, boolean>>({});

  // List search/filter + per-quiz stats
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "dpp" | "test" | "published" | "draft">("all");
  const [questionCounts, setQuestionCounts] = useState<Record<string, number>>({});
  const [attemptCounts, setAttemptCounts] = useState<Record<string, number>>({});

  // Quiz form
  const [quizForm, setQuizForm] = useState({
    title: "",
    type: "dpp",
    course_id: "",
    lesson_id: "",
    chapter_id: "",
    duration_minutes: 30,
    total_marks: 0,
    pass_percentage: 40,
    description: "",
  });

  // Questions for current quiz
  const [questionForms, setQuestionForms] = useState<QuestionForm[]>([defaultQuestion()]);
  const [savingQuestions, setSavingQuestions] = useState(false);
  const [questionImagePreviews, setQuestionImagePreviews] = useState<Record<string, string>>({});
  const questionImagePreviewsRef = useRef<Record<string, string>>({});

  // Bulk image import
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkImageUrls, setBulkImageUrls] = useState("");

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => () => {
    Object.values(questionImagePreviewsRef.current).forEach((url) => {
      try { URL.revokeObjectURL(url); } catch { /* noop */ }
    });
    questionImagePreviewsRef.current = {};
  }, []);

  const fetchQuizzes = useCallback(async () => {
    const { data, error } = await supabase.from("quizzes").select("*, lessons(title)").order("created_at", { ascending: false });
    if (error) { toast.error(error.message); }
    setQuizzes((data || []) as Quiz[]);
    fetchCounts();
  }, []);

  // Per-quiz question & attempt tallies for the list cards
  const fetchCounts = async () => {
    const [{ data: qs }, { data: as }] = await Promise.all([
      supabase.from("questions").select("quiz_id"),
      supabase.from("quiz_attempts").select("quiz_id").not("submitted_at", "is", null),
    ]);
    const qCount: Record<string, number> = {};
    (qs || []).forEach((r: { quiz_id: string }) => { qCount[r.quiz_id] = (qCount[r.quiz_id] || 0) + 1; });
    const aCount: Record<string, number> = {};
    (as || []).forEach((r: { quiz_id: string }) => { aCount[r.quiz_id] = (aCount[r.quiz_id] || 0) + 1; });
    setQuestionCounts(qCount);
    setAttemptCounts(aCount);
  };

  const fetchCourses = useCallback(async () => {
    const { data } = await supabase.from("courses").select("id, title").order("title");
    setCourses(data || []);
  }, []);

  // Placed AFTER fetchQuizzes/fetchCourses on purpose: the deps array reads
  // both during render, and a `const` declared lower in the same body is in
  // its temporal dead zone at that point (same crash class as LessonView,
  // Sentry SAFAR-ENGLISH-APP-18; enforced by no-use-before-define).
  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/admin/login"); return; }
      const { data: isAdmin } = await supabase.rpc('has_role', { _user_id: session.user.id, _role: 'admin' });
      if (!isAdmin) { navigate("/admin"); return; }
      await Promise.all([fetchQuizzes(), fetchCourses()]);
      setLoading(false);
    };
    init();
  }, [fetchQuizzes, fetchCourses, navigate]);

  const fetchLessons = async (courseId: number) => {
    try {
      const { data } = await supabase.from("lessons").select("id, title, lecture_type")
        .eq("course_id", courseId).order("title");
      setLessons(data || []);
    } catch (err) {
      reportError(err, { surface: "AdminQuizManager.fetchLessons" });
      setLessons([]);
    }
  };

  const fetchChapters = async (courseId: number) => {
    try {
      const { data } = await supabase.from("chapters").select("id, title, position")
        .eq("course_id", courseId).is("parent_id", null).order("position");
      setChapters(data || []);
    } catch (err) {
      reportError(err, { surface: "AdminQuizManager.fetchChapters" });
      setChapters([]);
    }
  };

  const openCreate = () => {
    setEditingDetailsId(null);
    setChapters([]);
    setLessons([]);
    setQuizForm({ title: "", type: "dpp", course_id: "", lesson_id: "", chapter_id: "", duration_minutes: 30, total_marks: 0, pass_percentage: 40, description: "" });
    setView("create");
  };

  const openEditDetails = (quiz: Quiz) => {
    setEditingDetailsId(quiz.id);
    setQuizForm({
      title: quiz.title || "",
      type: quiz.type || "dpp",
      course_id: quiz.course_id ? String(quiz.course_id) : "",
      lesson_id: quiz.lesson_id || "",
      chapter_id: quiz.chapter_id || "",
      duration_minutes: quiz.duration_minutes ?? 30,
      total_marks: quiz.total_marks ?? 0,
      pass_percentage: quiz.pass_percentage ?? 40,
      description: quiz.description || "",
    });
    if (quiz.course_id) { fetchLessons(Number(quiz.course_id)); fetchChapters(Number(quiz.course_id)); }
    setView("create");
  };

  // Deep link from the content manager: /admin/quiz?lessonId=…&courseId=…
  // Existing quiz for that lesson opens for editing; otherwise the create
  // form opens pre-filled. Runs once per link so admin edits aren't reset.
  useEffect(() => {
    if (loading) return;
    const link = parseQuizDeepLink(location.search);
    if (!link) return;
    if (appliedDeepLinkRef.current === location.search) return;
    appliedDeepLinkRef.current = location.search;

    const existing = findQuizForLesson(quizzes, link.lessonId);
    if (existing) {
      openEditDetails(existing);
      toast.info("Is lesson ka quiz pehle se hai — wahi khul gaya");
      return;
    }
    setEditingDetailsId(null);
    setQuizForm((prev) => ({
      ...prev,
      title: link.lessonTitle || prev.title,
      type: link.type,
      course_id: link.courseId,
      lesson_id: link.lessonId,
      chapter_id: link.chapterId,
    }));
    if (link.courseId) {
      fetchLessons(Number(link.courseId));
      fetchChapters(Number(link.courseId));
    }
    setView("create");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, quizzes, location.search]);



  const handleCreateQuiz = async () => {
    if (!quizForm.title.trim()) { toast.error("Title is required"); return; }
    if (!quizForm.course_id) {
      toast.error("Course choose karein — bina course ke quiz kisi bhi course me nahi dikhega");
      return;
    }
    setSavingQuiz(true);
    try {
      const payload: TablesInsert<"quizzes"> = {
        title: quizForm.title.trim(),
        type: quizForm.type,
        duration_minutes: quizForm.duration_minutes,
        total_marks: quizForm.total_marks,
        pass_percentage: quizForm.pass_percentage,
        description: quizForm.description || null,
        course_id: Number(quizForm.course_id),
        lesson_id: quizForm.lesson_id || null,
        chapter_id: quizForm.chapter_id || null,
      };

      if (editingDetailsId) {
        const { error } = await supabase.from("quizzes").update(payload).eq("id", editingDetailsId);
        if (error) throw error;
        toast.success("Quiz details updated");
        await fetchQuizzes();
        setEditingDetailsId(null);
        setView("list");
        return;
      }

      payload.is_published = false;
      const { data, error } = await supabase.from("quizzes").insert(payload).select().single();
      if (error) throw error;
      toast.success("Quiz created! Now add questions.");
      await fetchQuizzes();
      setEditingQuizId(data.id);
      const firstQ = defaultQuestion();
      setQuestionForms([firstQ]);
      setExpandedQuestions({ [firstQ._uid]: true });
      setView("edit-questions");
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    } finally {
      setSavingQuiz(false);
    }
  };

  const handleSaveQuestions = async () => {
    if (!editingQuizId) return;
    const valid = questionForms.every(q => q.question_text.trim() && q.correct_answer);
    if (!valid) { toast.error("Each question must have text and a correct answer"); return; }

    setSavingQuestions(true);
    try {
      // Upload any pending image files first
      const formsWithUrls = await Promise.all(questionForms.map(async (q) => {
        if (q._imageFile) {
          const fileExt = q._imageFile.name.split('.').pop();
          // NOTE: stored under `thumbnails/questions/...` so the storage read
          // policy for authenticated users covers question images (students
          // must be able to sign these; the bare `questions/` prefix is
          // staff-only after the 2026-09-17 storage hardening).
          const fileName = `thumbnails/questions/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
          const { error: uploadErr } = await supabase.storage.from('content').upload(fileName, q._imageFile);
          if (uploadErr) throw uploadErr;
          // Store bucket-agnostic URI — resolver signs on read.
          return { ...q, image_url: `storage://content/${fileName}`, _imageFile: null };
        }
        return q;
      }));

      // Insert first, delete old rows after — an insert failure must never
      // wipe the existing question set.
      const { data: existing, error: existingErr } = await supabase
        .from("questions").select("id").eq("quiz_id", editingQuizId);
      if (existingErr) throw existingErr;
      const rows = formsWithUrls.map((q, idx) => ({
        quiz_id: editingQuizId,
        question_text: q.question_text.trim(),
        question_type: q.question_type,
        options: q.question_type === "mcq" ? q.options : null,
        correct_answer: q.correct_answer,
        explanation: q.explanation || null,
        marks: q.marks,
        negative_marks: q.negative_marks,
        image_url: q.image_url || null,
        order_index: idx,
      }));
      const { error } = await supabase.from("questions").insert(rows);
      if (error) throw error;
      const oldIds = (existing || []).map((r: { id: string }) => r.id);
      if (oldIds.length > 0) {
        const { error: delErr } = await supabase.from("questions").delete().in("id", oldIds);
        if (delErr) throw delErr;
      }
      const totalMarks = formsWithUrls.reduce((s, q) => s + q.marks, 0);
      await supabase.from("quizzes").update({ total_marks: totalMarks }).eq("id", editingQuizId);
      revokeAllQuestionPreviews();
      setQuestionForms(formsWithUrls);
      toast.success("Questions saved!");
      await fetchQuizzes();
      return true;
    } catch (err: unknown) {
      reportError(err, { surface: "AdminQuizManager.handleSaveQuestions" });
      toast.error(getErrorMessage(err));
      return false;
    } finally {
      setSavingQuestions(false);
    }
  };

  // Save questions and publish in one tap — a draft quiz is invisible to students.
  const handleSaveAndPublish = async () => {
    const ok = await handleSaveQuestions();
    if (!ok || !editingQuizId) return;
    const { error } = await supabase.from("quizzes").update({ is_published: true }).eq("id", editingQuizId);
    if (error) { toast.error(getErrorMessage(error)); return; }
    toast.success("Published — students ko course me dikhega");
    await fetchQuizzes();
  };

  const loadQuizForEdit = async (quiz: Quiz) => {
    revokeAllQuestionPreviews();
    setEditingQuizId(quiz.id);
    const { data } = await supabase.from("questions").select("*")
      .eq("quiz_id", quiz.id).order("order_index");
    if (data && data.length > 0) {
      setQuestionForms(data.map((q: QuestionRow) => ({
        _uid: crypto.randomUUID(),
        question_text: q.question_text,
        question_type: q.question_type as QuestionForm["question_type"],
        options: Array.isArray(q.options) ? (q.options as string[]) : ["", "", "", ""],
        correct_answer: q.correct_answer,
        explanation: q.explanation || "",
        marks: q.marks,
        negative_marks: q.negative_marks,
        image_url: q.image_url || "",
        _imageFile: null,
      })));
      setExpandedQuestions({});
    } else {
      const newQ = defaultQuestion();
      setQuestionForms([newQ]);
      setExpandedQuestions({ [newQ._uid]: true });
    }
    setView("edit-questions");
  };

  const handleBulkImport = () => {
    const urls = bulkImageUrls.split("\n").map(u => u.trim()).filter(Boolean);
    if (!urls.length) return toast.error("Paste at least one image URL");
    const startIdx = questionForms.length;
    const newQs = urls.map(url => ({ ...defaultQuestion(), image_url: url }));
    setQuestionForms(prev => [...prev, ...newQs]);
    setExpandedQuestions(prev => {
      const next = { ...prev };
      newQs.forEach((q) => { next[q._uid] = true; });
      return next;
    });
    setBulkImageUrls("");
    setShowBulkImport(false);
    toast.success(`${urls.length} question${urls.length > 1 ? "s" : ""} added from image URLs`);
  };

  const togglePublish = async (quiz: Quiz) => {
    const { error } = await supabase.from("quizzes")
      .update({ is_published: !quiz.is_published }).eq("id", quiz.id);
    if (error) { toast.error(error.message); return; }
    toast.success(quiz.is_published ? "Quiz unpublished" : "Quiz published!");
    fetchQuizzes();
  };

  const deleteQuiz = async (id: string) => {
    if (!(await confirmAction({ title: "Delete this quiz and all its questions?", variant: "destructive" }))) return;
    const { error } = await supabase.from("quizzes").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Quiz deleted");
    fetchQuizzes();
  };

  const openAttempts = async (quiz: Quiz) => {
    setAttemptsQuizId(quiz.id);
    setAttemptsQuizTitle(quiz.title);
    setAttempts([]);
    setLoadingAttempts(true);
    const { data, error } = await supabase
      .from("quiz_attempts")
      .select("id, score, percentage, passed, submitted_at, time_taken_seconds, user_id")
      .eq("quiz_id", quiz.id)
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false });
    if (error) { toast.error(error.message); setLoadingAttempts(false); return; }

    // Fetch profile names for each unique user
    const userIds = [...new Set((data || []).map((a: { user_id: string }) => a.user_id))];
    const profileMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);
      (profiles || []).forEach((p: { id: string; full_name: string | null; email: string | null }) => {
        profileMap[p.id] = p.full_name || p.email || "Unknown";
      });
    }

    const enriched = (data || []).map((a: typeof data[number]) => ({
      ...a,
      student_name: profileMap[a.user_id] || "Unknown",
    }));
    setAttempts(enriched);
    setLoadingAttempts(false);
  };

  const updateQuestionForm = (idx: number, field: keyof QuestionForm, value: QuestionForm[keyof QuestionForm]) => {
    setQuestionForms(prev => prev.map((q, i) => i === idx ? { ...q, [field]: value } : q));
  };

  const revokeQuestionPreview = (uid: string) => {
    const existing = questionImagePreviewsRef.current[uid];
    if (existing) {
      try { URL.revokeObjectURL(existing); } catch { /* noop */ }
      delete questionImagePreviewsRef.current[uid];
      setQuestionImagePreviews(prev => {
        const next = { ...prev };
        delete next[uid];
        return next;
      });
    }
  };

  const revokeAllQuestionPreviews = () => {
    Object.values(questionImagePreviewsRef.current).forEach((url) => {
      try { URL.revokeObjectURL(url); } catch { /* noop */ }
    });
    questionImagePreviewsRef.current = {};
    setQuestionImagePreviews({});
  };

  const setQuestionImageFile = (idx: number, file: File | null) => {
    const uid = questionForms[idx]?._uid;
    if (!uid) return;
    revokeQuestionPreview(uid);
    if (file) {
      const url = URL.createObjectURL(file);
      questionImagePreviewsRef.current[uid] = url;
      setQuestionImagePreviews(prev => ({ ...prev, [uid]: url }));
    }
    updateQuestionForm(idx, "_imageFile", file);
  };

  const updateOption = (qIdx: number, optIdx: number, value: string) => {
    setQuestionForms(prev => prev.map((q, i) => {
      if (i !== qIdx) return q;
      const opts = [...q.options];
      opts[optIdx] = value;
      return { ...q, options: opts };
    }));
  };

  const addQuestion = () => {
    const newQ = defaultQuestion();
    setQuestionForms(f => [...f, newQ]);
    setExpandedQuestions(prev => ({ ...prev, [newQ._uid]: true }));
    setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 100);
  };

  const deleteQuestion = (idx: number) => {
    if (questionForms.length === 1) { toast.error("At least one question required"); return; }
    const uid = questionForms[idx]._uid;
    revokeQuestionPreview(uid);
    setQuestionForms(prev => prev.filter((_, i) => i !== idx));
    setExpandedQuestions(prev => {
      const next = { ...prev };
      delete next[uid];
      return next;
    });
  };

  const handleQuestionDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = questionForms.findIndex(q => q._uid === active.id);
    const newIndex = questionForms.findIndex(q => q._uid === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    setQuestionForms(prev => arrayMove(prev, oldIndex, newIndex));
  };

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // ─── LIST VIEW ────────────────────────────────────────────────────────────
  if (view === "list") {
    const filteredQuizzes = quizzes.filter((q) => {
      if (searchQuery && !q.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (typeFilter === "dpp" && q.type !== "dpp") return false;
      if (typeFilter === "test" && q.type !== "test") return false;
      if (typeFilter === "published" && !q.is_published) return false;
      if (typeFilter === "draft" && q.is_published) return false;
      return true;
    });
    return (
      <div className="min-h-dvh bg-background">
        <header className="bg-card border-b px-4 py-4 sticky top-0 z-10 pt-[calc(env(safe-area-inset-top)+1rem)]">
          <div className="flex items-center gap-3 max-w-4xl mx-auto">
            <button onClick={() => navigate("/admin")} className="text-muted-foreground hover:text-foreground p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <h1 className="text-lg font-bold flex-1">Quiz Manager</h1>
            <Button
              size="sm"
              className="gap-1.5 min-h-[44px]"
              onClick={openCreate}
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New Quiz</span>
              <span className="sm:hidden">New</span>
            </Button>
          </div>
        </header>

        <main className="max-w-4xl mx-auto p-4 space-y-3">
          <div className="space-y-2.5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search quizzes…"
                className="pl-9 h-11 rounded-xl"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {([["all", "All"], ["dpp", "DPP"], ["test", "Test"], ["published", "Published"], ["draft", "Draft"]] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setTypeFilter(val)}
                  className={cn(
                    "px-3.5 h-9 rounded-full border text-xs font-medium whitespace-nowrap transition-colors",
                    typeFilter === val
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-muted-foreground border-border hover:bg-accent",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {quizzes.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No quizzes yet</p>
              <p className="text-sm">Create your first DPP or Test quiz</p>
            </div>
          ) : filteredQuizzes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Search className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium text-sm">No quizzes match</p>
              <p className="text-sm">Try a different search or filter</p>
            </div>
          ) : (
            filteredQuizzes.map((quiz) => (
              <div key={quiz.id} className="bg-card border rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className={cn(
                    "p-2.5 rounded-lg shrink-0",
                    quiz.type === "dpp" ? "bg-blue-500/10 text-blue-600" : "bg-purple-500/10 text-purple-600"
                  )}>
                    {quiz.type === "dpp" ? <ClipboardList className="h-5 w-5" /> : <FlaskConical className="h-5 w-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-sm">{quiz.title}</h3>
                      <Badge variant={quiz.is_published ? "default" : "secondary"} className="text-[10px]">
                        {quiz.is_published ? "Published" : "Draft"}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] uppercase">{quiz.type === "dpp-attempt" ? "DPP ATTEMPT" : quiz.type}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {questionCounts[quiz.id] ?? 0} questions · {quiz.total_marks} marks · {quiz.duration_minutes > 0 ? `${quiz.duration_minutes} min` : "No limit"} · Pass: {quiz.pass_percentage}%{attemptCounts[quiz.id] ? ` · ${attemptCounts[quiz.id]} attempts` : ""}
                    </p>
                    {!quiz.is_published && (
                      <p className="text-xs text-amber-600 mt-0.5 font-medium">
                        Draft — students ko nahi dikhega. Publish karein.
                      </p>
                    )}
                    {!quiz.course_id && (
                      <p className="text-xs text-destructive mt-0.5 font-medium">
                        Koi course link nahi — course choose karein warna kahin nahi dikhega.
                      </p>
                    )}
                    {quiz.lessons?.title && (
                      <p className="text-xs text-primary/70 mt-0.5 flex items-center gap-1">
                        <Link2 className="h-3 w-3" /> {quiz.lessons.title}
                      </p>
                    )}
                  </div>
                  {/* Action buttons - stack on mobile */}
                  <div className="flex flex-col sm:flex-row items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => openAttempts(quiz)} title={`View Attempts (${attemptCounts[quiz.id] ?? 0})`}>
                      <Users className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => loadQuizForEdit(quiz)} title="Edit questions">
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => openEditDetails(quiz)} title="Edit quiz details (course, chapter, time)">
                      <ClipboardList className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => togglePublish(quiz)} title={quiz.is_published ? "Unpublish" : "Publish"}>
                      {quiz.is_published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-10 w-10 text-destructive hover:text-destructive" onClick={() => deleteQuiz(quiz.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </main>

        {/* ─── Attempts Sheet ─────────────────────────────────────── */}
        <Sheet open={!!attemptsQuizId} onOpenChange={(open) => { if (!open) setAttemptsQuizId(null); }}>
          <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col">
            <SheetHeader className="px-4 py-4 border-b shrink-0">
              <SheetTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Attempts — {attemptsQuizTitle}
              </SheetTitle>
            </SheetHeader>

            <ScrollArea className="flex-1">
              {loadingAttempts ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : attempts.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground px-4">
                  <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="font-medium text-sm">No attempts yet</p>
                  <p className="text-xs mt-1">Students haven't submitted this quiz yet.</p>
                </div>
              ) : (
                <div className="divide-y">
                  {attempts.map((attempt) => {
                    const submittedDate = attempt.submitted_at
                      ? new Date(attempt.submitted_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                      : "—";
                    const submittedTime = attempt.submitted_at
                      ? new Date(attempt.submitted_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
                      : "";
                    const pct = attempt.percentage != null ? Math.round(attempt.percentage) : null;

                    return (
                      <div key={attempt.id} className="px-4 py-3 flex items-center gap-3">
                        {/* Avatar placeholder */}
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary font-bold text-sm">
                          {attempt.student_name.charAt(0).toUpperCase()}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{attempt.student_name}</p>
                          <p className="text-xs text-muted-foreground">{submittedDate} · {submittedTime}</p>
                        </div>

                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-semibold">{attempt.score ?? "—"}</span>
                            {pct != null && (
                              <span className="text-xs text-muted-foreground">({pct}%)</span>
                            )}
                          </div>
                          {attempt.passed != null && (
                            <Badge
                              variant={attempt.passed ? "default" : "destructive"}
                              className="text-[10px] px-1.5 py-0"
                            >
                              {attempt.passed ? (
                                <><Check className="h-2.5 w-2.5 mr-0.5" />Pass</>
                              ) : (
                                <><X className="h-2.5 w-2.5 mr-0.5" />Fail</>
                              )}
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>

            {/* Summary footer */}
            {!loadingAttempts && attempts.length > 0 && (
              <div className="px-4 py-3 border-t bg-muted/30 shrink-0">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Total: <strong className="text-foreground">{attempts.length}</strong></span>
                  <span>Passed: <strong className="text-foreground">{attempts.filter(a => a.passed).length}</strong></span>
                  <span>Avg: <strong className="text-foreground">
                    {attempts.filter(a => a.percentage != null).length > 0
                      ? Math.round(attempts.filter(a => a.percentage != null).reduce((s, a) => s + a.percentage, 0) / attempts.filter(a => a.percentage != null).length)
                      : "—"}%
                  </strong></span>
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>
      </div>
    );
  }

  // ─── CREATE QUIZ VIEW ────────────────────────────────────────────────────
  if (view === "create") {
    return (
      <div className="min-h-dvh bg-background">
        <header className="bg-card border-b px-4 py-4 sticky top-0 z-10 pt-[calc(env(safe-area-inset-top)+1rem)]">
          <div className="flex items-center gap-3 max-w-2xl mx-auto">
            <button onClick={() => setView("list")} className="text-muted-foreground hover:text-foreground p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="text-base font-bold flex-1">{editingDetailsId ? "Edit Quiz Details" : "Create New Quiz"}</h1>
          </div>
        </header>
        <main className="max-w-2xl mx-auto p-4 space-y-5">
          <div className="space-y-1.5">
            <Label>Quiz Title *</Label>
            <Input
              placeholder="e.g., Chapter 3 DPP"
              value={quizForm.title}
              onChange={e => setQuizForm(f => ({ ...f, title: e.target.value }))}
              className="h-12 text-base"
            />
          </div>

          {/* Type + Duration — stack on mobile */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={quizForm.type} onValueChange={v => setQuizForm(f => ({ ...f, type: v }))}>
                <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dpp">DPP (Daily Practice)</SelectItem>
                  <SelectItem value="test">Test / Exam</SelectItem>
                  <SelectItem value="dpp-attempt">DPP Attempt</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Duration (minutes, 0 = no limit)</Label>
              <Input
                type="number" min={0}
                value={quizForm.duration_minutes}
                onChange={e => setQuizForm(f => ({ ...f, duration_minutes: Number(e.target.value) }))}
                className="h-12"
              />
            </div>
          </div>

          <div className="space-y-1.5 max-w-[200px]">
            <Label>Pass Percentage (%)</Label>
            <Input
              type="number" min={0} max={100}
              value={quizForm.pass_percentage}
              onChange={e => setQuizForm(f => ({ ...f, pass_percentage: Number(e.target.value) }))}
              className="h-12"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Link to Course *</Label>
            <Select
              value={quizForm.course_id}
              onValueChange={v => {
                setQuizForm(f => ({ ...f, course_id: v, lesson_id: "", chapter_id: "" }));
                if (v) { fetchLessons(Number(v)); fetchChapters(Number(v)); }
              }}
            >
              <SelectTrigger className="h-12"><SelectValue placeholder="Select course..." /></SelectTrigger>
              <SelectContent>
                {courses.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {quizForm.course_id && (
            <div className="space-y-1.5">
              <Label>Chapter (optional — blank = poore course me dikhega)</Label>
              <Select value={quizForm.chapter_id || "__none__"} onValueChange={v => setQuizForm(f => ({ ...f, chapter_id: v === "__none__" ? "" : v }))}>
                <SelectTrigger className="h-12"><SelectValue placeholder="Whole course" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Whole course (no chapter)</SelectItem>
                  {chapters.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {quizForm.course_id && (
            <div className="space-y-1.5">
              <Label>Link to Lesson (DPP/TEST lessons only)</Label>
              <Select value={quizForm.lesson_id} onValueChange={v => setQuizForm(f => ({ ...f, lesson_id: v }))}>
                <SelectTrigger className="h-12"><SelectValue placeholder="Select lesson..." /></SelectTrigger>
                <SelectContent>
                  {lessons.length === 0 ? (
                    <SelectItem value="__none__" disabled>No DPP/TEST lessons found</SelectItem>
                  ) : (
                    lessons.map(l => <SelectItem key={l.id} value={l.id}>{l.title}</SelectItem>)
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Description (optional)</Label>
            <textarea
              rows={3}
              value={quizForm.description}
              onChange={e => setQuizForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Brief description..."
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <Button onClick={handleCreateQuiz} disabled={savingQuiz} className="w-full gap-2 h-12 text-base">
            {savingQuiz ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {editingDetailsId ? "Save Details" : "Create & Add Questions"}
          </Button>
        </main>
      </div>
    );
  }

  // ─── EDIT QUESTIONS VIEW ─────────────────────────────────────────────────
  return (
    <div className="min-h-dvh bg-background pb-24">
      <header className="bg-card border-b px-4 py-4 sticky top-0 z-10 pt-[calc(env(safe-area-inset-top)+1rem)]">
        <div className="flex items-center gap-2 max-w-3xl mx-auto">
          <button
            onClick={() => { setView("list"); setEditingQuizId(null); }}
            className="text-muted-foreground hover:text-foreground p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-base font-bold flex-1 truncate">Edit Questions</h1>
          <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">{questionForms.length} questions</span>
          <Button
            size="sm"
            variant="outline"
            className="gap-1 min-h-[44px] shrink-0"
            onClick={addQuestion}
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Add</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1 min-h-[44px] shrink-0"
            onClick={() => setShowBulkImport(v => !v)}
            title="Bulk import from image URLs"
          >
            <ImagePlus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Bulk</span>
          </Button>
          <Button
            size="sm"
            className="gap-1 min-h-[44px] shrink-0"
            onClick={handleSaveQuestions}
            disabled={savingQuestions}
          >
            {savingQuestions ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="gap-1 min-h-[44px] shrink-0"
            onClick={handleSaveAndPublish}
            disabled={savingQuestions}
            title="Save and publish so students can see it"
          >
            <Eye className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Publish</span>
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-4">
        {/* Bulk Import Panel */}
        {showBulkImport && (
          <div className="border rounded-xl p-4 bg-card space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold flex items-center gap-2">
                <ImagePlus className="h-4 w-4 text-primary" />
                Bulk Import from Image URLs
              </p>
              <button onClick={() => setShowBulkImport(false)} className="text-muted-foreground hover:text-foreground">
                <XCircle className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">Paste one image URL per line. A new question will be created for each URL with the image pre-filled.</p>
            <textarea
              rows={6}
              value={bulkImageUrls}
              onChange={e => setBulkImageUrls(e.target.value)}
              placeholder={"https://example.com/q1.jpg\nhttps://example.com/q2.jpg\n..."}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring font-mono"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleBulkImport} className="gap-1">
                <Plus className="h-3.5 w-3.5" />
                Import {bulkImageUrls.split("\n").filter(u => u.trim()).length || 0} Questions
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setBulkImageUrls(""); setShowBulkImport(false); }}>Cancel</Button>
            </div>
          </div>
        )}

        {/* Collapse/Expand all */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{questionForms.length} questions</span>
          <div className="flex gap-2">
            <button
              onClick={() => {
                const all: Record<string, boolean> = {};
                questionForms.forEach((q) => { all[q._uid] = true; });
                setExpandedQuestions(all);
              }}
              className="hover:text-foreground underline-offset-2 underline"
            >
              Expand all
            </button>
            <button
              onClick={() => setExpandedQuestions({})}
              className="hover:text-foreground underline-offset-2 underline"
            >
              Collapse all
            </button>
          </div>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleQuestionDragEnd}
        >
          <SortableContext
            items={questionForms.map(q => q._uid)}
            strategy={verticalListSortingStrategy}
          >
            {questionForms.map((q, qIdx) => (
              <SortableQuestion
                key={q._uid}
                id={q._uid}
                index={qIdx}
                q={q}
                isExpanded={!!expandedQuestions[q._uid]}
                onToggle={() => setExpandedQuestions(prev => ({ ...prev, [q._uid]: !prev[q._uid] }))}
                onDelete={() => deleteQuestion(qIdx)}
              >
                {/* ── Question form fields ── */}
                <div>
                  <Label className="text-xs">Question Text *</Label>
                  <textarea
                    rows={3}
                    value={q.question_text}
                    onChange={e => updateQuestionForm(qIdx, "question_text", e.target.value)}
                    placeholder="Enter the question..."
                    className="mt-1 flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>

                {/* Type + Marks — responsive grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Type</Label>
                    <Select value={q.question_type} onValueChange={v => updateQuestionForm(qIdx, "question_type", v as QuestionForm["question_type"])}>
                      <SelectTrigger className="mt-1 h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mcq">MCQ</SelectItem>
                        <SelectItem value="true_false">True/False</SelectItem>
                        <SelectItem value="numerical">Numerical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Marks (+)</Label>
                    <Input type="number" min={0} value={q.marks} onChange={e => updateQuestionForm(qIdx, "marks", Number(e.target.value))} className="mt-1 h-11" />
                  </div>
                  <div>
                    <Label className="text-xs">Negative Marks</Label>
                    <Input type="number" min={0} value={q.negative_marks} onChange={e => updateQuestionForm(qIdx, "negative_marks", Number(e.target.value))} className="mt-1 h-11" />
                  </div>
                </div>

                {q.question_type === "mcq" && (
                  <div className="space-y-2">
                    <Label className="text-xs">Options (tap circle to mark correct)</Label>
                    {q.options.map((opt, oIdx) => (
                      <div key={oIdx} className="flex items-center gap-2">
                        <button
                          onClick={() => updateQuestionForm(qIdx, "correct_answer", String(oIdx))}
                          className={cn(
                            "w-8 h-8 rounded-full border-2 shrink-0 flex items-center justify-center text-xs font-bold transition-colors",
                            q.correct_answer === String(oIdx)
                              ? "border-success bg-success text-success-foreground"
                              : "border-muted-foreground/30 text-muted-foreground hover:border-success/60"
                          )}
                        >
                          {String.fromCharCode(65 + oIdx)}
                        </button>
                        <Input
                          placeholder={`Option ${String.fromCharCode(65 + oIdx)}`}
                          value={opt}
                          onChange={e => updateOption(qIdx, oIdx, e.target.value)}
                          className="h-11 flex-1"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {q.question_type === "true_false" && (
                  <div>
                    <Label className="text-xs">Correct Answer</Label>
                    <div className="flex gap-3 mt-1">
                      {["true", "false"].map(v => (
                        <button
                          key={v}
                          onClick={() => updateQuestionForm(qIdx, "correct_answer", v)}
                          className={cn(
                            "flex-1 py-3 rounded-lg border-2 text-sm font-medium transition-colors capitalize min-h-[44px]",
                            q.correct_answer === v ? "border-success bg-success/10 text-success" : "border-border"
                          )}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {q.question_type === "numerical" && (
                  <div>
                    <Label className="text-xs">Correct Answer (numerical)</Label>
                    <Input
                      type="number"
                      value={q.correct_answer}
                      onChange={e => updateQuestionForm(qIdx, "correct_answer", e.target.value)}
                      placeholder="e.g. 42"
                      className="mt-1 h-11 max-w-[200px]"
                    />
                  </div>
                )}

                <div>
                  <Label className="text-xs">Explanation (shown after submit)</Label>
                  <Input
                    value={q.explanation}
                    onChange={e => updateQuestionForm(qIdx, "explanation", e.target.value)}
                    placeholder="Why is this the correct answer?"
                    className="mt-1 h-11"
                  />
                </div>

                {/* Image upload for question */}
                <div>
                  <Label className="text-xs">Question Image (optional)</Label>
                  <div className="mt-1 space-y-2">
                    {(q.image_url || q._imageFile) ? (
                      <div className="relative rounded-lg overflow-hidden border bg-muted/30">
                        <img
                          src={q._imageFile ? questionImagePreviews[q._uid] : q.image_url}
                          alt="Question"
                          className="max-h-40 w-full object-contain"
                        />
                        <button
                          onClick={() => {
                            updateQuestionForm(qIdx, "image_url", "");
                            setQuestionImageFile(qIdx, null);
                          }}
                          className="absolute top-2 right-2 bg-destructive text-destructive-foreground rounded-full p-1"
                        >
                          <XCircle className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex items-center gap-2 cursor-pointer border-2 border-dashed border-border rounded-lg p-3 hover:border-primary/50 transition-colors">
                        <ImagePlus className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Upload image for this question</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (file) setQuestionImageFile(qIdx, file);
                          }}
                        />
                      </label>
                    )}
                    {!q._imageFile && !q.image_url && (
                      <Input
                        value={q.image_url || ""}
                        onChange={e => updateQuestionForm(qIdx, "image_url", e.target.value)}
                        placeholder="Or paste image URL..."
                        className="h-9 text-xs"
                      />
                    )}
                  </div>
                </div>
              </SortableQuestion>
            ))}
          </SortableContext>
        </DndContext>

        {/* Bottom action buttons */}
        <Button
          variant="outline"
          className="w-full gap-2 h-12"
          onClick={addQuestion}
        >
          <Plus className="h-4 w-4" />
          Add Another Question
        </Button>

        <Button
          className="w-full gap-2 h-12 text-base"
          onClick={handleSaveQuestions}
          disabled={savingQuestions}
        >
          {savingQuestions ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save All Questions
        </Button>

        <Button
          variant="secondary"
          className="w-full gap-2 h-12 text-base"
          onClick={handleSaveAndPublish}
          disabled={savingQuestions}
        >
          <Eye className="h-4 w-4" />
          Save & Publish (students ko dikhega)
        </Button>
      </main>
    </div>
  );
};

export default AdminQuizManager;
