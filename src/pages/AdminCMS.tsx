import { useState, useEffect } from "react";
import { reportError } from "@/lib/sentry";
import { useNavigate } from "react-router-dom";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Badge } from "../components/ui/badge";
import { ScrollArea } from "../components/ui/scroll-area";
import { toast } from "sonner";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import { 
  BookOpen, Layers, Video, FileText, Trash2, Plus, Loader2, 
  LogOut, ChevronLeft, Upload, GripVertical
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { getErrorMessage } from "@/lib/errorMessage";

// ─── Sortable row wrapper ───────────────────────────────────────────
const SortableRow = ({ id, children }: { id: string; children: (handle: React.ReactNode) => React.ReactNode }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };
  const handle = (
    <button
      {...attributes}
      {...listeners}
      className="touch-none cursor-grab active:cursor-grabbing p-2 text-muted-foreground hover:text-foreground rounded shrink-0"
      aria-label="Drag to reorder"
      type="button"
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );
  return <div ref={setNodeRef} style={style}>{children(handle)}</div>;
};


// ====== TYPES ======
interface Course {
  id: number;
  title: string;
  grade: string | null;
}

interface Chapter {
  id: string;
  code: string;
  title: string;
  course_id: number;
  position: number;
}

interface Lesson {
  id: string;
  title: string;
  video_url: string;
  lecture_type: string;
  chapter_id: string | null;
  course_id: number | null;
  position: number;
}

// ====== MAIN COMPONENT ======
const AdminCMS = () => {
  const confirmAction = useConfirm();
  const navigate = useNavigate();
  const { user, isAdmin, isLoading: authLoading, logout } = useAuth();

  const [courses, setCourses] = useState<Course[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleChapterDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = chapters.findIndex(c => c.id === active.id);
    const newIndex = chapters.findIndex(c => c.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(chapters, oldIndex, newIndex);
    setChapters(reordered);
    try {
      await Promise.all(reordered.map((ch, idx) =>
        supabase.from("chapters").update({ position: idx + 1 }).eq("id", ch.id)
      ));
      toast.success("Chapter order saved");
    } catch {
      toast.error("Failed to save order");
    }
  };

  const handleLessonDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = lessons.findIndex(l => l.id === active.id);
    const newIndex = lessons.findIndex(l => l.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(lessons, oldIndex, newIndex);
    setLessons(reordered);
    try {
      await Promise.all(reordered.map((l, idx) =>
        supabase.from("lessons").update({ position: idx + 1 }).eq("id", l.id)
      ));
      toast.success("Lecture order saved");
    } catch {
      toast.error("Failed to save order");
    }
  };

  // Form states
  const [newCourse, setNewCourse] = useState({ title: "", grade: "", description: "", price: "", startDate: "", endDate: "", teacherName: "", teacherTitle: "", teacherBio: "", teacherAvatarUrl: "", teacherVerified: false });
  const [newChapter, setNewChapter] = useState({ courseId: "", code: "", title: "" });
  const [newLecture, setNewLecture] = useState({ 
    chapterId: "", title: "", youtubeUrl: "", lectureType: "VIDEO" as "VIDEO" | "PDF" | "DPP" | "NOTES"
  });

  // ====== AUTH CHECK ======
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/admin/login");
    } else if (!authLoading && user && !isAdmin) {
      toast.error("Admin privileges required.");
      navigate("/dashboard");
    }
  }, [user, isAdmin, authLoading, navigate]);

  // ====== FETCH DATA ======
  useEffect(() => {
    if (user && isAdmin) fetchAllData();
  }, [user, isAdmin]);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [coursesRes, chaptersRes, lessonsRes] = await Promise.all([
        supabase.from("courses").select("id, title, grade").order("title"),
        supabase.from("chapters").select("*").order("position"),
        supabase.from("lessons").select("id, title, video_url, lecture_type, chapter_id, course_id, position").order("position")
      ]);

      setCourses(coursesRes.data || []);
      setChapters(chaptersRes.data || []);
      setLessons((lessonsRes.data || []).map(l => ({
        ...l,
        lecture_type: l.lecture_type || "VIDEO",
        position: l.position || 0
      })));
    } catch (err) {
      reportError(err, { surface: "AdminCMS.fetch" });
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  // ====== COURSE CRUD ======
  const handleAddCourse = async () => {
    if (!newCourse.title || !newCourse.grade) {
      toast.error("Title and Grade are required");
      return;
    }

    try {
      const { error } = await supabase.from("courses").insert({
        title: newCourse.title,
        grade: newCourse.grade,
        description: newCourse.description || null,
        price: newCourse.price ? parseFloat(newCourse.price) : 0,
        start_date: newCourse.startDate || null,
        end_date: newCourse.endDate || null,
        image_url: "https://placehold.co/600x400/png",
        teacher_name: newCourse.teacherName || null,
        teacher_title: newCourse.teacherTitle || null,
        teacher_bio: newCourse.teacherBio || null,
        teacher_avatar_url: newCourse.teacherAvatarUrl || null,
        teacher_verified: newCourse.teacherVerified,
      });

      if (error) throw error;
      toast.success("Course created!");
      setNewCourse({ title: "", grade: "", description: "", price: "", startDate: "", endDate: "", teacherName: "", teacherTitle: "", teacherBio: "", teacherAvatarUrl: "", teacherVerified: false });
      fetchAllData();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    }
  };

  const handleDeleteCourse = async (id: number) => {
    if (!(await confirmAction({ title: "Delete this course and all its content?", variant: "destructive" }))) return;
    const { error } = await supabase.from("courses").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); fetchAllData(); }
  };

  // ====== CHAPTER CRUD ======
  const handleAddChapter = async () => {
    if (!newChapter.courseId || !newChapter.code || !newChapter.title) {
      toast.error("All fields are required");
      return;
    }

    const courseChapters = chapters.filter(c => c.course_id === Number(newChapter.courseId));
    const position = courseChapters.length;

    try {
      const { error } = await supabase.from("chapters").insert({
        course_id: Number(newChapter.courseId),
        code: newChapter.code,
        title: newChapter.title,
        position
      });

      if (error) throw error;
      toast.success("Subject created!");
      setNewChapter({ courseId: newChapter.courseId, code: "", title: "" });
      fetchAllData();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    }
  };

  const handleDeleteChapter = async (id: string) => {
    if (!(await confirmAction({ title: "Delete this chapter?", variant: "destructive" }))) return;
    const { error } = await supabase.from("chapters").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); fetchAllData(); }
  };

  // ====== LECTURE CRUD ======
  const handleAddLecture = async () => {
    if (!newLecture.chapterId || !newLecture.title) {
      toast.error("Chapter and Title are required");
      return;
    }

    const chapter = chapters.find(c => c.id === newLecture.chapterId);
    if (!chapter) {
      toast.error("Chapter not found");
      return;
    }

    // Extract YouTube ID
    let youtubeId = "";
    if (newLecture.youtubeUrl) {
      const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
        /^([a-zA-Z0-9_-]{11})$/,
      ];
      for (const pattern of patterns) {
        const match = newLecture.youtubeUrl.match(pattern);
        if (match) { youtubeId = match[1]; break; }
      }
    }

    const chapterLessons = lessons.filter(l => l.chapter_id === newLecture.chapterId);
    const position = chapterLessons.length + 1;

    try {
      const { error } = await supabase.from("lessons").insert({
        chapter_id: newLecture.chapterId,
        course_id: chapter.course_id,
        title: newLecture.title,
        video_url: newLecture.youtubeUrl || "",
        youtube_id: youtubeId || null,
        lecture_type: newLecture.lectureType,
        position,
        is_locked: true
      });

      if (error) throw error;
      toast.success("Lecture added!");
      setNewLecture({ ...newLecture, title: "", youtubeUrl: "" });
      fetchAllData();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    }
  };

  const handleDeleteLecture = async (id: string) => {
    if (!(await confirmAction({ title: "Delete this lecture?", variant: "destructive" }))) return;
    const { error } = await supabase.from("lessons").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); fetchAllData(); }
  };

  // ====== RENDER ======
  if (authLoading || loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !isAdmin) {
    return null;
  }

  return (
    <div className="min-h-dvh bg-background">
      {/* Header */}
      <header
        className="sticky top-0 z-20 bg-background border-b px-4 pb-3 pt-[max(0px,env(safe-area-inset-top))]"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
      >
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/dashboard")} className="text-primary">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <h1 className="text-lg font-bold text-primary">Admin CMS</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:inline">
              {user.email}
            </span>
            <Button variant="outline" size="sm" onClick={logout}>
              <LogOut className="h-4 w-4 mr-1" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto p-4">
        <Tabs defaultValue="courses" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="courses" className="gap-2">
              <BookOpen className="h-4 w-4" />
              Subjects
            </TabsTrigger>
            <TabsTrigger value="chapters" className="gap-2">
              <Layers className="h-4 w-4" />
              Chapters
            </TabsTrigger>
            <TabsTrigger value="lectures" className="gap-2">
              <Video className="h-4 w-4" />
              Lectures
            </TabsTrigger>
          </TabsList>

          {/* ====== COURSES/SUBJECTS TAB ====== */}
          <TabsContent value="courses">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Add Form */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Plus className="h-4 w-4" /> Add Subject
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Code (e.g., Phy, Chem)</Label>
                    <Input
                      placeholder="e.g., Psychology"
                      value={newCourse.title}
                      onChange={(e) => setNewCourse({ ...newCourse, title: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Grade/Class</Label>
                    <Input
                      placeholder="e.g., 11"
                      value={newCourse.grade}
                      onChange={(e) => setNewCourse({ ...newCourse, grade: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Description (optional)</Label>
                    <Textarea
                      placeholder="Course description..."
                      value={newCourse.description}
                      onChange={(e) => setNewCourse({ ...newCourse, description: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Price (₹)</Label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={newCourse.price}
                      onChange={(e) => setNewCourse({ ...newCourse, price: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Batch Starts On</Label>
                      <Input
                        type="date"
                        value={newCourse.startDate}
                        onChange={(e) => setNewCourse({ ...newCourse, startDate: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Batch Ends On</Label>
                      <Input
                        type="date"
                        value={newCourse.endDate}
                        onChange={(e) => setNewCourse({ ...newCourse, endDate: e.target.value })}
                      />
                    </div>
                  </div>
                  {/* Teacher Details */}
                  <div className="border-t pt-3 space-y-3">
                    <p className="text-sm font-semibold text-foreground">Teacher Details</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Teacher Name</Label>
                        <Input
                          placeholder="e.g., Anuj Sir"
                          value={newCourse.teacherName}
                          onChange={(e) => setNewCourse({ ...newCourse, teacherName: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Title</Label>
                        <Input
                          placeholder="e.g., NEET Mentor"
                          value={newCourse.teacherTitle}
                          onChange={(e) => setNewCourse({ ...newCourse, teacherTitle: e.target.value })}
                        />
                      </div>
                    </div>
                    <div>
                      <Label>Avatar URL</Label>
                      <Input
                        placeholder="https://..."
                        value={newCourse.teacherAvatarUrl}
                        onChange={(e) => setNewCourse({ ...newCourse, teacherAvatarUrl: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Teacher Bio</Label>
                      <Textarea
                        placeholder="Short bio about the teacher..."
                        value={newCourse.teacherBio}
                        onChange={(e) => setNewCourse({ ...newCourse, teacherBio: e.target.value })}
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={newCourse.teacherVerified}
                        onChange={(e) => setNewCourse({ ...newCourse, teacherVerified: e.target.checked })}
                      />
                      Verified teacher (shows ✓ badge)
                    </label>
                  </div>
                  <Button onClick={handleAddCourse} className="w-full">
                    Add Subject
                  </Button>
                </CardContent>
              </Card>

              {/* List */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Existing Subjects</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px] max-h-[60vh]">
                    <div className="space-y-3">
                      {courses.map((course) => (
                        <div
                          key={course.id}
                          className="flex items-center justify-between p-3 border rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <Badge variant="secondary" className="bg-primary/10 text-primary">
                              {course.title.substring(0, 3).toUpperCase()}
                            </Badge>
                            <div>
                              <p className="font-medium">{course.title}</p>
                              {course.grade && (
                                <p className="text-xs text-muted-foreground">Class {course.grade}</p>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteCourse(course.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      {courses.length === 0 && (
                        <p className="text-muted-foreground text-center py-8">No subjects yet</p>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ====== CHAPTERS TAB ====== */}
          <TabsContent value="chapters">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Add Form */}
              <Card>
                <CardHeader>
                   <CardTitle className="flex items-center gap-2 text-base">
                    <Plus className="h-4 w-4" /> Add Subject
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Select Subject</Label>
                    <Select
                      value={newChapter.courseId}
                      onValueChange={(v) => setNewChapter({ ...newChapter, courseId: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose subject..." />
                      </SelectTrigger>
                      <SelectContent>
                        {courses.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Subject Code (e.g., SB-01)</Label>
                    <Input
                      placeholder="CH-01"
                      value={newChapter.code}
                      onChange={(e) => setNewChapter({ ...newChapter, code: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Subject Title</Label>
                    <Input
                      placeholder="e.g., Introduction to Mind"
                      value={newChapter.title}
                      onChange={(e) => setNewChapter({ ...newChapter, title: e.target.value })}
                    />
                  </div>
                  <Button onClick={handleAddChapter} className="w-full">
                     Add Subject
                  </Button>
                </CardContent>
              </Card>

              {/* List */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Existing Subjects</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px] max-h-[60vh]">
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleChapterDragEnd}>
                      <SortableContext items={chapters.map(c => c.id)} strategy={verticalListSortingStrategy}>
                        <div className="space-y-3">
                          {chapters.map((chapter) => {
                            const course = courses.find((c) => c.id === chapter.course_id);
                            return (
                              <SortableRow key={chapter.id} id={chapter.id}>
                                {(handle) => (
                                  <div className="flex items-center justify-between p-3 border rounded-lg bg-card">
                                    <div className="flex items-center gap-2 min-w-0">
                                      {handle}
                                      <Badge variant="secondary" className="bg-primary/10 text-primary shrink-0">
                                        {chapter.code}
                                      </Badge>
                                      <div className="min-w-0">
                                        <p className="font-medium truncate">{chapter.title}</p>
                                        <p className="text-xs text-muted-foreground truncate">
                                          {course?.title || "Unknown course"}
                                        </p>
                                      </div>
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleDeleteChapter(chapter.id)}
                                      className="text-destructive hover:text-destructive shrink-0"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                )}
                              </SortableRow>
                            );
                          })}
                          {chapters.length === 0 && (
                            <p className="text-muted-foreground text-center py-8">No subjects yet</p>
                          )}
                        </div>
                      </SortableContext>
                    </DndContext>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ====== LECTURES TAB ====== */}
          <TabsContent value="lectures">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Add Form */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Plus className="h-4 w-4" /> Add Lecture
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Select Chapter</Label>
                    <Select
                      value={newLecture.chapterId}
                      onValueChange={(v) => setNewLecture({ ...newLecture, chapterId: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose chapter..." />
                      </SelectTrigger>
                      <SelectContent>
                        {chapters.map((c) => {
                          const course = courses.find((co) => co.id === c.course_id);
                          return (
                            <SelectItem key={c.id} value={c.id}>
                              {c.code} - {c.title} ({course?.title})
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Lecture Title</Label>
                    <Input
                      placeholder="e.g., What is Mind"
                      value={newLecture.title}
                      onChange={(e) => setNewLecture({ ...newLecture, title: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>YouTube URL or ID</Label>
                    <Input
                      placeholder="https://youtube.com/watch?v=... or video ID"
                      value={newLecture.youtubeUrl}
                      onChange={(e) => setNewLecture({ ...newLecture, youtubeUrl: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Type</Label>
                    <Select
                      value={newLecture.lectureType}
                      onValueChange={(v: "VIDEO" | "PDF" | "DPP" | "NOTES") =>
                        setNewLecture({ ...newLecture, lectureType: v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="VIDEO">
                          <span className="flex items-center gap-2">
                            <Video className="h-4 w-4" /> Video
                          </span>
                        </SelectItem>
                        <SelectItem value="PDF">
                          <span className="flex items-center gap-2">
                            <FileText className="h-4 w-4" /> PDF
                          </span>
                        </SelectItem>
                        <SelectItem value="DPP">
                          <span className="flex items-center gap-2">
                            <BookOpen className="h-4 w-4" /> DPP (Practice)
                          </span>
                        </SelectItem>
                        <SelectItem value="NOTES">
                          <span className="flex items-center gap-2">
                            <FileText className="h-4 w-4" /> Notes
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleAddLecture} className="w-full gap-2">
                    <Upload className="h-4 w-4" />
                    Add Lecture
                  </Button>
                </CardContent>
              </Card>

              {/* List */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Existing Lectures</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px] max-h-[60vh]">
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleLessonDragEnd}>
                      <SortableContext items={lessons.map(l => l.id)} strategy={verticalListSortingStrategy}>
                        <div className="space-y-3">
                          {lessons.map((lesson) => {
                            const chapter = chapters.find((c) => c.id === lesson.chapter_id);
                            return (
                              <SortableRow key={lesson.id} id={lesson.id}>
                                {(handle) => (
                                  <div className="flex items-center justify-between p-3 border rounded-lg bg-card">
                                    <div className="flex items-center gap-2 min-w-0">
                                      {handle}
                                      <Badge
                                        variant="secondary"
                                        className={
                                          lesson.lecture_type === "VIDEO" ? "bg-primary/10 text-primary shrink-0" :
                                          lesson.lecture_type === "PDF" ? "bg-orange-100 text-orange-600 shrink-0" :
                                          lesson.lecture_type === "DPP" ? "bg-green-100 text-green-600 shrink-0" :
                                          "bg-purple-100 text-purple-600 shrink-0"
                                        }
                                      >
                                        {lesson.lecture_type}
                                      </Badge>
                                      <div className="min-w-0">
                                        <p className="font-medium line-clamp-1">{lesson.title}</p>
                                        <p className="text-xs text-muted-foreground truncate">
                                          {chapter?.code || "No chapter"}
                                        </p>
                                      </div>
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleDeleteLecture(lesson.id)}
                                      className="text-destructive hover:text-destructive shrink-0"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                )}
                              </SortableRow>
                            );
                          })}
                          {lessons.length === 0 && (
                            <p className="text-muted-foreground text-center py-8">No lectures yet</p>
                          )}
                        </div>
                      </SortableContext>
                    </DndContext>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default AdminCMS;
