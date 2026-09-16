import { useState, useEffect } from "react";
import { reportError } from "@/lib/sentry";
import { useNavigate } from "react-router-dom";
import { supabase } from "../integrations/supabase/client";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { ScrollArea } from "../components/ui/scroll-area";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import { toast } from "sonner";
import {
  Upload, Video, FileText, LogOut, Trash2,
  BookOpen, Shield, Loader2, FileUp, Link as LinkIcon,
  ChevronRight, ClipboardCheck, Plus, FolderPlus, FolderOpen, GripVertical, Camera,
  Pencil, X, Save, Paperclip, ImageIcon,
} from "lucide-react";
import logo from "../assets/branding/jsr-mark.webp";
import MediaPreview from "../components/admin/MediaPreview";

import { useLessonPdfs, type LessonPdf } from "../hooks/useLessonPdfs";
import { AdminLessonAttachments } from "../components/admin/AdminLessonAttachments";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { UploadTypeTabs } from "@/features/admin-upload/components/UploadTypeTabs";
import { UploadBreadcrumb } from "@/features/admin-upload/components/UploadBreadcrumb";
import { uploadTypeIcon, uploadTypeColor } from "@/features/admin-upload/lib/uploadRules";
import { cn } from "../lib/utils";
import { nextPosition, randomObjectName, storageUri } from "../features/admin-upload/lib/uploadRules";
import { useAdminUploadForm } from "../features/admin-upload/hooks/useAdminUploadForm";
import { ThumbnailUploadBlock } from "../features/admin-upload/components/ThumbnailUploadBlock";
import { VideoUploadBlock } from "../features/admin-upload/components/VideoUploadBlock";
import { ContentSourceBlock } from "../features/admin-upload/components/ContentSourceBlock";
import { getErrorMessage } from "@/lib/errorMessage";

type UploadType = "VIDEO" | "PDF" | "DPP" | "DPP_ATTEMPT" | "NOTES" | "TEST" | "LIVE";

// ─── Sortable Item wrapper ──────────────────────────────────────────
const SortableItem = ({ id, children }: { id: string; children: (handle: React.ReactNode) => React.ReactNode }) => {
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
      className="touch-none cursor-grab active:cursor-grabbing p-2 text-muted-foreground hover:text-foreground rounded"
      aria-label="Drag to reorder"
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );
  return (
    <div ref={setNodeRef} style={style}>
      {children(handle)}
    </div>
  );
};

const AdminUpload = () => {
  const confirmAction = useConfirm();
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Breadcrumb drill-down state
  const [courses, setCourses] = useState<any[]>([]);
  const [chapters, setChapters] = useState<any[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [chaptersLoading, setChaptersLoading] = useState(false);
  const [reorderingChapters, setReorderingChapters] = useState(false);
  const [reorderingLessons, setReorderingLessons] = useState(false);

  // Chapter creation state
  const [showCreateChapter, setShowCreateChapter] = useState(false);
  const [newChapterTitle, setNewChapterTitle] = useState("");
  const [newChapterCode, setNewChapterCode] = useState("");
  const [newChapterPosition, setNewChapterPosition] = useState(0);
  const [creatingChapter, setCreatingChapter] = useState(false);

  // Chapter (sub-chapter) creation state
  const [showCreateSubfolder, setShowCreateSubfolder] = useState(false);
  const [newSubfolderTitle, setNewSubfolderTitle] = useState("");
  const [newSubfolderCode, setNewSubfolderCode] = useState("");
  const [newSubfolderPosition, setNewSubfolderPosition] = useState(0);
  const [creatingSubfolder, setCreatingSubfolder] = useState(false);

  // Chapter edit state
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null);
  const [editChapterTitle, setEditChapterTitle] = useState("");
  const [editChapterCode, setEditChapterCode] = useState("");
  const [editChapterThumbnailUrl, setEditChapterThumbnailUrl] = useState("");
  const [savingChapterEdit, setSavingChapterEdit] = useState(false);

  // Sub-chapters for current chapter
  const [subChapters, setSubChapters] = useState<any[]>([]);

  // Upload form states
  const [uploadType, setUploadType] = useState<UploadType>("VIDEO");
  const [title, setTitle] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  
  const [isUploading, setIsUploading] = useState(false);
  const [pdfInputMode, setPdfInputMode] = useState<"file" | "url">("file");
  const [pdfUrl, setPdfUrl] = useState("");
  const [description, setDescription] = useState("");
  const [overviewText, setOverviewText] = useState("");
  const [transcriptMd, setTranscriptMd] = useState("");
  const [classPdfFile, setClassPdfFile] = useState<File | null>(null);
  const [classPdfUrl, setClassPdfUrl] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");

  // Self-storage media (video + thumbnail) state & uploads
  const {
    videoInputMode, setVideoInputMode,
    videoFile, videoFileUploading, videoUploadProgress,
    videoDragActive, setVideoDragActive,
    thumbnailInputMode, setThumbnailInputMode,
    thumbnailFile, thumbnailFileUploading,
    thumbDragActive, setThumbDragActive,
    validateFile,
    handleVideoFileUpload,
    handleThumbnailFileUpload,
    handleDrag,
    handleVideoDrop,
    handleThumbDrop,
    resetMedia,
  } = useAdminUploadForm({
    selectedCourseId,
    onVideoUrl: setVideoUrl,
    onThumbnailUrl: setThumbnailUrl,
  });

  // Multi-PDF attachments for new lesson
  const [pdfAttachments, setPdfAttachments] = useState<File[]>([]);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);

  // Edit lesson state
  const [editingLesson, setEditingLesson] = useState<any | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editVideoUrl, setEditVideoUrl] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editOverview, setEditOverview] = useState("");
  const [editTranscriptMd, setEditTranscriptMd] = useState("");
  const [editClassPdfUrl, setEditClassPdfUrl] = useState("");
  const [editThumbnailUrl, setEditThumbnailUrl] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Lesson PDFs hook for editing
  const { pdfs: editLessonPdfs, fetchPdfs: fetchEditPdfs, addPdf: addEditPdf, addPdfByUrl: addEditPdfByUrl, deletePdf: deleteEditPdf } = useLessonPdfs(editingLesson?.id);
  const [editNewPdfFiles, setEditNewPdfFiles] = useState<File[]>([]);
  const [editUploadingPdfs, setEditUploadingPdfs] = useState(false);

  // Recent lessons for selected chapter
  const [lessons, setLessons] = useState<any[]>([]);

  const selectedCourse = courses.find(c => c.id === selectedCourseId);
  const selectedChapter = chapters.find(c => c.id === selectedChapterId) ||
    subChapters.find(c => c.id === selectedChapterId);

  // DnD sensors — supports mouse, touch and keyboard
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Auth check
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { navigate('/admin/login'); return; }
      const { data: roleData } = await supabase
        .from('user_roles').select('role')
        .eq('user_id', session.user.id).eq('role', 'admin').maybeSingle();
      if (!roleData) {
        toast.error("Access denied. Admin role not found.");
        await supabase.auth.signOut();
        navigate('/admin/login');
        return;
      }
      // Self-lookup removed — use the cached name from user_metadata to avoid
      // the redundant `profiles` query (audit fix: profile self-reads).
      const fullName =
        (session.user.user_metadata?.full_name as string | undefined) || 'Admin';
      setUser({ ...session.user, full_name: fullName });
      setIsLoading(false);
    };
    checkAuth();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') navigate('/admin/login');
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  // ─── YouTube thumbnail auto-generation ──────────────────────────────
  const extractYouTubeId = (url: string): string | null => {
    const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|live\/|shorts\/))([a-zA-Z0-9_-]{11})/);
    return m?.[1] || null;
  };

  // Auto-set thumbnail when videoUrl changes and contains a YouTube link
  useEffect(() => {
    if (!videoUrl) return;
    const ytId = extractYouTubeId(videoUrl);
    if (ytId && !thumbnailUrl) {
      setThumbnailUrl(`https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`);
      setThumbnailInputMode("url");
    }
  }, [videoUrl]);

  // Auto-set thumbnail when editVideoUrl changes
  useEffect(() => {
    if (!editVideoUrl) return;
    const ytId = extractYouTubeId(editVideoUrl);
    if (ytId && !editThumbnailUrl) {
      setEditThumbnailUrl(`https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`);
    }
  }, [editVideoUrl]);

  // Fetch courses on mount
  useEffect(() => {
    if (isLoading || !user) return;
    let cancelled = false;
    supabase.from('courses').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { if (!cancelled && data) setCourses(data); });
    return () => { cancelled = true; };
  }, [isLoading, user]);

  // Fetch chapters when course selected (top-level only)
  useEffect(() => {
    if (!selectedCourseId) { setChapters([]); return; }
    let cancelled = false;
    setChaptersLoading(true);
    supabase.from('chapters').select('*')
      .eq('course_id', selectedCourseId)
      .is('parent_id', null)
      .order('position', { ascending: true })
      .then(({ data }) => {
        if (cancelled) return;
        setChapters(data || []);
        setChaptersLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedCourseId]);

  // Fetch sub-chapters + lessons when chapter selected
  useEffect(() => {
    if (!selectedChapterId) { setLessons([]); setSubChapters([]); return; }
    let cancelled = false;
    supabase.from('chapters').select('*')
      .eq('parent_id', selectedChapterId)
      .order('position', { ascending: true })
      .then(({ data }) => { if (!cancelled) setSubChapters(data || []); });
    supabase.from('lessons').select('*')
      .eq('chapter_id', selectedChapterId)
      .order('position', { ascending: true })
      .then(({ data }) => { if (!cancelled) setLessons(data || []); });
    return () => { cancelled = true; };
  }, [selectedChapterId]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/admin/login');
  };

  // ─── Drag end handlers ──────────────────────────────────────────────────
  const handleChapterDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = chapters.findIndex(c => c.id === active.id);
    const newIndex = chapters.findIndex(c => c.id === over.id);
    const reordered = arrayMove(chapters, oldIndex, newIndex);
    setChapters(reordered);
    setReorderingChapters(true);
    try {
      await Promise.all(reordered.map((ch, idx) =>
        supabase.from('chapters').update({ position: idx + 1 }).eq('id', ch.id)
      ));
      toast.success("Chapter order saved");
    } catch {
      toast.error("Failed to save order");
    } finally {
      setReorderingChapters(false);
    }
  };

  const handleLessonDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = lessons.findIndex(l => l.id === active.id);
    const newIndex = lessons.findIndex(l => l.id === over.id);
    const reordered = arrayMove(lessons, oldIndex, newIndex);
    setLessons(reordered);
    setReorderingLessons(true);
    try {
      await Promise.all(reordered.map((l, idx) =>
        supabase.from('lessons').update({ position: idx + 1 }).eq('id', l.id)
      ));
      toast.success("Lesson order saved");
    } catch {
      toast.error("Failed to save order");
    } finally {
      setReorderingLessons(false);
    }
  };

  // ─── Chapter / Sub-chapter creation ────────────────────────────────────
  const handleCreateChapter = async () => {
    if (!newChapterTitle.trim() || !newChapterCode.trim() || !selectedCourseId) {
      toast.error("Please fill title and code");
      return;
    }
    setCreatingChapter(true);
    try {
      const { error } = await supabase.from('chapters').insert({
        course_id: selectedCourseId,
        title: newChapterTitle.trim(),
        code: newChapterCode.trim(),
        position: nextPosition(newChapterPosition, chapters.length),
      });
      if (error) throw error;
      toast.success("Chapter created!");
      setNewChapterTitle(""); setNewChapterCode(""); setNewChapterPosition(0);
      setShowCreateChapter(false);
      const { data } = await supabase.from('chapters').select('*')
        .eq('course_id', selectedCourseId).is('parent_id', null).order('position', { ascending: true });
      setChapters(data || []);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    } finally {
      setCreatingChapter(false);
    }
  };

  const handleCreateSubfolder = async () => {
    if (!newSubfolderTitle.trim() || !newSubfolderCode.trim() || !selectedCourseId || !selectedChapterId) {
      toast.error("Please fill title and code");
      return;
    }
    setCreatingSubfolder(true);
    try {
      const { error } = await supabase.from('chapters').insert({
        course_id: selectedCourseId,
        parent_id: selectedChapterId,
        title: newSubfolderTitle.trim(),
        code: newSubfolderCode.trim(),
        position: nextPosition(newSubfolderPosition, subChapters.length),
      });
      if (error) throw error;
      toast.success("Sub-folder created!");
      setNewSubfolderTitle(""); setNewSubfolderCode(""); setNewSubfolderPosition(0);
      setShowCreateSubfolder(false);
      const { data } = await supabase.from('chapters').select('*')
        .eq('parent_id', selectedChapterId).order('position', { ascending: true });
      setSubChapters(data || []);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    } finally {
      setCreatingSubfolder(false);
    }
  };


  // ─── Upload ─────────────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!title || !selectedCourseId || !selectedChapterId) {
      toast.error("Please fill title and select course & chapter via breadcrumbs");
      return;
    }
    if ((uploadType === "VIDEO" || uploadType === "LIVE") && !videoUrl) { toast.error("Please enter video URL"); return; }
    if (uploadType !== "VIDEO" && uploadType !== "LIVE" && pdfInputMode === "file" && !pdfFile) { toast.error("Please select a file"); return; }
    if (uploadType !== "VIDEO" && uploadType !== "LIVE" && pdfInputMode === "url" && !pdfUrl) { toast.error("Please enter a URL"); return; }
    if (pdfFile && !validateFile(pdfFile)) return;
    if (classPdfFile && !validateFile(classPdfFile)) return;

    setIsUploading(true);
    try {
      let contentUrl = "";
      if (uploadType !== "VIDEO" && uploadType !== "LIVE" && pdfInputMode === "url") {
        contentUrl = pdfUrl;
      } else if (uploadType !== "VIDEO" && uploadType !== "LIVE" && pdfFile) {
        const path = `lessons/${randomObjectName(pdfFile.name)}`;
        const { error: uploadError } = await supabase.storage.from('content').upload(path, pdfFile);
        if (uploadError) throw uploadError;
        // Store bucket-agnostic URI; resolver signs on read once bucket is private.
        contentUrl = storageUri('content', path);
      } else {
        contentUrl = videoUrl;
      }

      let classPdfFinalUrl: string | null = null;
      if (classPdfFile) {
        const fileExt = classPdfFile.name.split('.').pop();
        const path = `class-pdf/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const { error: pdfUploadError } = await supabase.storage.from('content').upload(path, classPdfFile);
        if (pdfUploadError) throw pdfUploadError;
        classPdfFinalUrl = `storage://content/${path}`;
      } else if (classPdfUrl.trim()) {
        classPdfFinalUrl = classPdfUrl.trim();
      }

      const { data: insertedLesson, error } = await supabase.from('lessons').insert({
        course_id: selectedCourseId,
        chapter_id: selectedChapterId,
        title,
        video_url: contentUrl,
        description: description || null,
        overview: overviewText || null,
        ...(transcriptMd ? { transcript_md: transcriptMd } : {}),
        is_locked: true,
        lecture_type: uploadType,
        class_pdf_url: classPdfFinalUrl,
        thumbnail_url: thumbnailUrl.trim() || null,
        position: nextPosition(null, lessons.length),
      }).select('id').single();

      if (error) throw error;

      // Auto-link class_pdf_url into lesson_pdfs table
      if (insertedLesson?.id && classPdfFinalUrl && (uploadType === "VIDEO" || uploadType === "LIVE")) {
        const pdfFileName = classPdfFinalUrl.split('/').pop()?.split('?')[0] || 'Class PDF';
        await supabase.from('lesson_pdfs').insert({
          lesson_id: insertedLesson.id,
          file_name: pdfFileName,
          file_url: classPdfFinalUrl,
          position: 0,
        });
      }
      
      // Upload PDF attachments using the directly returned lesson ID
      if (pdfAttachments.length > 0 && insertedLesson?.id) {
        setUploadingAttachments(true);
        const lessonId = insertedLesson.id;

        for (let i = 0; i < pdfAttachments.length; i++) {
          const file = pdfAttachments[i];
          const ext = file.name.split('.').pop();
          const path = `${lessonId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
          const { error: upErr } = await supabase.storage.from('lecture-pdfs').upload(path, file);
          if (upErr) { reportError(upErr, { surface: "AdminUpload.pdfAttachment" }); continue; }
          // Private bucket — store storage:// URI, not a permanent public URL.
          const storageUri = `storage://lecture-pdfs/${path}`;
          await supabase.from('lesson_pdfs').insert({
            lesson_id: lessonId,
            file_name: file.name,
            file_url: storageUri,
            file_size: file.size,
            position: i,
          });
        }
        setUploadingAttachments(false);
      }

      toast.success("Content uploaded");
      setTitle(""); setVideoUrl(""); setPdfFile(null); setPdfUrl(""); setDescription(""); setOverviewText(""); setTranscriptMd(""); setClassPdfFile(null); setClassPdfUrl(""); setPdfAttachments([]); setThumbnailUrl(""); resetMedia();
      const { data } = await supabase.from('lessons').select('*')
        .eq('chapter_id', selectedChapterId).order('position', { ascending: true });
      setLessons(data || []);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsUploading(false);
      setUploadingAttachments(false);
    }
  };

  const handleDeleteLesson = async (id: string) => {
    if (!(await confirmAction({ title: "Delete this lesson?", variant: "destructive" }))) return;
    const { error } = await supabase.from('lessons').delete().eq('id', id);
    if (error) { toast.error(error.message); }
    else {
      toast.success("Lesson deleted");
      setLessons(prev => prev.filter(l => l.id !== id));
      if (editingLesson?.id === id) setEditingLesson(null);
    }
  };

  const handleOpenEdit = (lesson) => {
    setEditingLesson(lesson);
    setEditTitle(lesson.title || "");
    setEditVideoUrl(lesson.video_url || "");
    setEditDescription(lesson.description || "");
    setEditOverview(lesson.overview || "");
    setEditTranscriptMd(lesson.transcript_md || "");
    setEditClassPdfUrl(lesson.class_pdf_url || "");
    setEditThumbnailUrl(lesson.thumbnail_url || "");
  };

  const handleSaveEdit = async () => {
    if (!editingLesson) return;
    setIsSavingEdit(true);
    try {
      const { error } = await supabase.from('lessons').update({
        title: editTitle.trim(),
        video_url: editVideoUrl.trim(),
        description: editDescription.trim() || null,
        overview: editOverview.trim() || null,
        transcript_md: editTranscriptMd.trim() || null,
        class_pdf_url: editClassPdfUrl.trim() || null,
        thumbnail_url: editThumbnailUrl.trim() || null,
      }).eq('id', editingLesson.id);
      if (error) throw error;
      toast.success("Lesson updated!");
      setLessons(prev => prev.map(l => l.id === editingLesson.id
        ? { ...l, title: editTitle, video_url: editVideoUrl, description: editDescription, overview: editOverview, class_pdf_url: editClassPdfUrl, thumbnail_url: editThumbnailUrl }
        : l
      ));
      setEditingLesson(null);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsSavingEdit(false);
    }
  };


  const handleDeleteChapter = async (chapterId: string, chapterTitle: string) => {
    if (!(await confirmAction({ title: `Delete folder "${chapterTitle}" and ALL its content? This cannot be undone.`, variant: "destructive" }))) return;
    try {
      const { data: subChs } = await supabase.from('chapters').select('id').eq('parent_id', chapterId);
      if (subChs && subChs.length > 0) {
        for (const sc of subChs) {
          await supabase.from('lessons').delete().eq('chapter_id', sc.id);
        }
        await supabase.from('chapters').delete().eq('parent_id', chapterId);
      }
      await supabase.from('lessons').delete().eq('chapter_id', chapterId);
      const { error } = await supabase.from('chapters').delete().eq('id', chapterId);
      if (error) throw error;
      toast.success(`"${chapterTitle}" deleted`);
      if (selectedChapterId === chapterId) {
        setSelectedChapterId(null);
        setSubChapters([]);
        setLessons([]);
      }
      const { data: refreshedChapters } = await supabase.from('chapters').select('*')
        .eq('course_id', selectedCourseId!).is('parent_id', null).order('position', { ascending: true });
      setChapters(refreshedChapters || []);
      if (selectedChapterId && selectedChapterId !== chapterId) {
        const { data: refreshedSubs } = await supabase.from('chapters').select('*')
          .eq('parent_id', selectedChapterId).order('position', { ascending: true });
        setSubChapters(refreshedSubs || []);
      }
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    }
  };

  // ─── Chapter edit/rename handler ─────────────────────────────────────────
  const handleOpenChapterEdit = (ch) => {
    setEditingChapterId(ch.id);
    setEditChapterTitle(ch.title || "");
    setEditChapterCode(ch.code || "");
    setEditChapterThumbnailUrl(ch.thumbnail_url || "");
  };

  const handleSaveChapterEdit = async () => {
    if (!editingChapterId) return;
    setSavingChapterEdit(true);
    try {
      const { error } = await supabase.from('chapters').update({
        title: editChapterTitle.trim(),
        code: editChapterCode.trim(),
        thumbnail_url: editChapterThumbnailUrl.trim() || null,
      }).eq('id', editingChapterId);
      if (error) throw error;
      toast.success("Chapter updated!");
      // Refresh chapters
      const updateList = (list: any[]) => list.map(c => c.id === editingChapterId
        ? { ...c, title: editChapterTitle.trim(), code: editChapterCode.trim(), thumbnail_url: editChapterThumbnailUrl.trim() || null }
        : c
      );
      setChapters(updateList(chapters));
      setSubChapters(updateList(subChapters));
      setEditingChapterId(null);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    } finally {
      setSavingChapterEdit(false);
    }
  };

  const typeIcon = (type: string) => {
    const kind = uploadTypeIcon(type);
    if (kind === "video") return <Video className="h-4 w-4" />;
    if (kind === "test") return <ClipboardCheck className="h-4 w-4" />;
    return <FileText className="h-4 w-4" />;
  };

  const typeColor = (type: string) => uploadTypeColor(type);

  if (isLoading) {
    return (
      <div className="min-h-dvh bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-purple-400" />
      </div>
    );
  }

  // ─── BREADCRUMB NAV ──────────────────────────────────────────────────────
  const renderBreadcrumb = () => (
    <UploadBreadcrumb
      courseTitle={selectedCourse?.title}
      chapterTitle={selectedChapter?.title}
      onGoToRoot={() => { setSelectedCourseId(null); setSelectedChapterId(null); }}
      onGoToCourse={() => setSelectedChapterId(null)}
    />
  );

  // ─── UPLOAD FORM ─────────────────────────────────────────────────────────
  const renderUploadForm = () => (
    <div className="space-y-5">
      {/* Type tabs */}
      <UploadTypeTabs value={uploadType} onChange={setUploadType} />

      <div className="space-y-1.5">
        <Label>Title *</Label>
        <Input placeholder="Content Title" value={title} onChange={e => setTitle(e.target.value)} className="h-12 text-base" />
      </div>

      <div className="space-y-1.5">
        <Label>Description (Optional)</Label>
        <textarea
          placeholder="Brief description of this content..."
          value={description}
          onChange={e => setDescription(e.target.value)}
          className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          rows={3}
        />
      </div>

      {/* Thumbnail — drag-and-drop + URL toggle */}
      <ThumbnailUploadBlock
        mode={thumbnailInputMode}
        onModeChange={setThumbnailInputMode}
        thumbnailUrl={thumbnailUrl}
        onThumbnailUrlChange={setThumbnailUrl}
        thumbnailFile={thumbnailFile}
        uploading={thumbnailFileUploading}
        dragActive={thumbDragActive}
        onDrag={handleDrag}
        setDragActive={setThumbDragActive}
        onDrop={handleThumbDrop}
        onFilePicked={handleThumbnailFileUpload}
      />

      {(uploadType === "VIDEO" || uploadType === "LIVE") ? (
        <VideoUploadBlock
          isLive={uploadType === "LIVE"}
          mode={videoInputMode}
          onModeChange={setVideoInputMode}
          videoUrl={videoUrl}
          onVideoUrlChange={setVideoUrl}
          videoFile={videoFile}
          uploading={videoFileUploading}
          progress={videoUploadProgress}
          dragActive={videoDragActive}
          onDrag={handleDrag}
          setDragActive={setVideoDragActive}
          onDrop={handleVideoDrop}
          onFilePicked={handleVideoFileUpload}
        />
      ) : (
        <ContentSourceBlock
          uploadType={uploadType}
          mode={pdfInputMode}
          onModeChange={setPdfInputMode}
          file={pdfFile}
          onFileChange={setPdfFile}
          url={pdfUrl}
          onUrlChange={setPdfUrl}
        />
      )}

      {/* ── Overview tab content ── */}
      <div className="space-y-1.5 rounded-lg border border-border p-3 bg-muted/20">
        <Label className="flex items-center gap-1.5 text-sm font-semibold">
          <BookOpen className="h-4 w-4 text-primary" />
          Overview <span className="text-xs font-normal text-muted-foreground">(shown in Overview tab)</span>
        </Label>
        <textarea
          placeholder="About this lesson — what will students learn? (shown in Overview tab)"
          value={overviewText}
          onChange={e => setOverviewText(e.target.value)}
          className="flex min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          rows={4}
        />
      </div>

      {/* ── Transcript (Markdown) ── */}
      <div className="space-y-1.5 rounded-lg border border-border p-3 bg-muted/20">
        <Label className="flex items-center gap-1.5 text-sm font-semibold">
          <BookOpen className="h-4 w-4 text-emerald-500" />
          Transcript (Markdown) <span className="text-xs font-normal text-muted-foreground">(auto-opens in Timeline)</span>
        </Label>
        <textarea
          placeholder={"# Topic\n\nPaste your lecture transcript in Markdown..."}
          value={transcriptMd}
          onChange={e => setTranscriptMd(e.target.value)}
          className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          rows={6}
        />
      </div>

      {/* ── Class PDF / Resources ── */}
      <div className="space-y-1.5 rounded-lg border border-border p-3 bg-muted/20">
        <Label className="flex items-center gap-1.5 text-sm font-semibold">
          <FileText className="h-4 w-4 text-orange-500" />
          Class PDF / Resource <span className="text-xs font-normal text-muted-foreground">(shown in Resources tab)</span>
        </Label>
        <div className="border-2 border-dashed border-muted-foreground/20 rounded-lg p-4 text-center hover:border-primary/40 transition-colors">
          <input id="classPdfFile" type="file" accept=".pdf" onChange={e => setClassPdfFile(e.target.files?.[0] || null)} className="hidden" />
          <label htmlFor="classPdfFile" className="cursor-pointer block">
            <FileText className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
            {classPdfFile
              ? <p className="text-primary font-medium text-sm">{classPdfFile.name}</p>
              : <p className="text-muted-foreground text-sm">Tap to upload PDF</p>}
          </label>
        </div>
        <p className="text-xs text-muted-foreground">Or paste a URL:</p>
        <Input placeholder="https://... class PDF URL" value={classPdfUrl} onChange={e => setClassPdfUrl(e.target.value)} className="h-11" />
      </div>

      {/* ── Additional PDF Attachments ── */}
      <div className="space-y-1.5 rounded-lg border border-border p-3 bg-muted/20">
        <Label className="flex items-center gap-1.5 text-sm font-semibold">
          <Paperclip className="h-4 w-4 text-primary" />
          PDF Attachments <span className="text-xs font-normal text-muted-foreground">(multiple PDFs for View PDF popup)</span>
        </Label>
        <input
          id="pdfAttachments"
          type="file"
          accept=".pdf"
          multiple
          onChange={e => {
            const files = Array.from(e.target.files || []);
            setPdfAttachments(prev => [...prev, ...files]);
            e.target.value = '';
          }}
          className="hidden"
        />
        <label htmlFor="pdfAttachments" className="cursor-pointer block border-2 border-dashed border-muted-foreground/20 rounded-lg p-3 text-center hover:border-primary/40 transition-colors">
          <Paperclip className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
          <p className="text-muted-foreground text-sm">Tap to add PDFs</p>
        </label>
        {pdfAttachments.length > 0 && (
          <div className="space-y-1.5 mt-2">
            {pdfAttachments.map((f, i) => (
              <div key={`${f.name}-${f.size}-${f.lastModified}`} className="flex items-center gap-2 p-2 bg-background rounded-md border">
                <FileText className="h-4 w-4 text-orange-500 shrink-0" />
                <span className="text-xs font-medium flex-1 truncate">{f.name}</span>
                <span className="text-[10px] text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</span>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setPdfAttachments(prev => prev.filter((_, idx) => idx !== i))}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
      <Button
        onClick={handleUpload}
        disabled={isUploading}
        className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold h-12 text-base"
      >
        {isUploading
          ? <><Loader2 className="h-5 w-5 mr-2 animate-spin" />Uploading...</>
          : <><Upload className="h-5 w-5 mr-2" />Publish Content</>}
      </Button>
    </div>
  );

  return (
    <div className="min-h-dvh bg-background">
      {/* Header */}
      <header className="bg-gradient-to-r from-slate-900 via-purple-900 to-slate-900 text-white shadow-lg">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logo} alt="JSR COACHING" className="h-10 w-10 rounded-xl" />
            <div>
              <h1 className="text-lg font-bold flex items-center gap-2">
                <Shield className="h-5 w-5 text-purple-400" />
                Upload Center
              </h1>
              <p className="text-xs text-purple-300">Welcome, {user?.full_name || 'Admin'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/admin')} className="text-white border-white/30 hover:bg-white/10 text-xs hidden sm:flex">
              Dashboard
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="text-white hover:bg-white/10" aria-label="Log out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {renderBreadcrumb()}

        {/* LEVEL 1: Course Grid */}
        {!selectedCourseId && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Select a Course</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {courses.map(course => (
                <button
                  key={course.id}
                  onClick={() => setSelectedCourseId(course.id)}
                  className="p-4 border rounded-xl bg-card hover:border-primary hover:shadow-md transition-all text-left group min-h-[80px]"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                      <BookOpen className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{course.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Grade {course.grade}</p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* LEVEL 2: Chapter List (Sortable) + Create Chapter */}
        {selectedCourseId && !selectedChapterId && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                Select a Chapter
                {reorderingChapters && <Loader2 className="h-4 w-4 inline ml-2 animate-spin text-muted-foreground" />}
              </h2>
              <Button size="sm" variant="outline" className="gap-1.5 min-h-[44px]" onClick={() => setShowCreateChapter(!showCreateChapter)}>
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Create Chapter</span>
                <span className="sm:hidden">New</span>
              </Button>
            </div>

            {/* Create Chapter Form */}
            {showCreateChapter && (
              <Card className="mb-4 border-primary/20">
                <CardContent className="p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Title *</Label>
                      <Input placeholder="Chapter title" value={newChapterTitle} onChange={e => setNewChapterTitle(e.target.value)} className="h-11" />
                    </div>
                    <div>
                      <Label className="text-xs">Code *</Label>
                      <Input placeholder="CH01" value={newChapterCode} onChange={e => setNewChapterCode(e.target.value)} className="h-11" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleCreateChapter} disabled={creatingChapter} className="min-h-[44px]">
                      {creatingChapter ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
                      Create
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowCreateChapter(false)} className="min-h-[44px]">Cancel</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {chaptersLoading ? (
              <div role="status" aria-busy="true" aria-live="polite" aria-label="Loading chapters" className="space-y-3 py-2">
                <span className="sr-only">Loading chapters</span>
                {[0,1,2].map((i) => (
                  <div key={i} className="skeleton-shimmer h-16 w-full rounded-xl border border-border/40" />
                ))}
              </div>
            ) : chapters.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No chapters found. Create one above!</p>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleChapterDragEnd}>
                <SortableContext items={chapters.map(c => c.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-3">
                    {chapters.map(ch => (
                      <SortableItem key={ch.id} id={ch.id}>
                        {(handle) => (
                          <div className="w-full border rounded-xl bg-card hover:border-primary hover:shadow-sm transition-all group">
                            {editingChapterId === ch.id ? (
                              <div className="p-4 space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <Label className="text-xs">Title</Label>
                                    <Input value={editChapterTitle} onChange={e => setEditChapterTitle(e.target.value)} className="h-10 text-base" />
                                  </div>
                                  <div>
                                    <Label className="text-xs">Code</Label>
                                    <Input value={editChapterCode} onChange={e => setEditChapterCode(e.target.value)} className="h-10 text-base" />
                                  </div>
                                </div>
                                <div>
                                  <Label className="text-xs">Thumbnail URL</Label>
                                  <Input placeholder="https://... thumbnail image" value={editChapterThumbnailUrl} onChange={e => setEditChapterThumbnailUrl(e.target.value)} className="h-10 text-base" />
                                  {editChapterThumbnailUrl && (
                                    <img src={editChapterThumbnailUrl} alt="Preview" className="w-16 h-12 object-cover rounded-md border mt-1.5" />
                                  )}
                                </div>
                                <div className="flex gap-2">
                                  <Button size="sm" className="h-9 text-xs gap-1" onClick={handleSaveChapterEdit} disabled={savingChapterEdit}>
                                    {savingChapterEdit ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                                    Save
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-9 text-xs" onClick={() => setEditingChapterId(null)}>Cancel</Button>
                                </div>
                              </div>
                            ) : (
                              <div className="p-4 flex items-center gap-2">
                                {handle}
                                <button
                                  className="flex items-center gap-3 flex-1 text-left min-h-[44px]"
                                  onClick={() => setSelectedChapterId(ch.id)}
                                >
                                  {ch.thumbnail_url ? (
                                    <img src={ch.thumbnail_url} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
                                  ) : (
                                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                                      {ch.position || "—"}
                                    </div>
                                  )}
                                  <p className="font-medium text-sm">{ch.title}</p>
                                </button>
                                <div className="flex items-center gap-1 ml-auto">
                                  <Button
                                    variant="ghost" size="icon"
                                    className="h-10 w-10 text-primary hover:bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={(e) => { e.stopPropagation(); handleOpenChapterEdit(ch); }}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost" size="icon"
                                    className="h-10 w-10 text-destructive hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={(e) => { e.stopPropagation(); handleDeleteChapter(ch.id, ch.title); }}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                  <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </SortableItem>
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        )}

        {/* LEVEL 3: Upload Form + Sub-folders + Sortable Lessons */}
        {selectedCourseId && selectedChapterId && (
          <div className="space-y-6">
            {/* Sub-folders section */}
            <Card>
              <CardHeader className="bg-muted/30 border-b py-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <FolderOpen className="h-4 w-4" />
                    Sub-folders ({subChapters.length})
                  </CardTitle>
                  <Button size="sm" variant="outline" className="gap-1 h-10 text-xs" onClick={() => setShowCreateSubfolder(!showCreateSubfolder)}>
                    <FolderPlus className="h-3.5 w-3.5" />
                    Add Sub-folder
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-3">
                {showCreateSubfolder && (
                  <div className="mb-3 p-3 border rounded-lg space-y-2 bg-muted/10">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Title *</Label>
                        <Input placeholder="Sub-folder title" value={newSubfolderTitle} onChange={e => setNewSubfolderTitle(e.target.value)} className="h-11 text-base" />
                      </div>
                      <div>
                        <Label className="text-xs">Code *</Label>
                        <Input placeholder="SF01" value={newSubfolderCode} onChange={e => setNewSubfolderCode(e.target.value)} className="h-11 text-base" />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="h-10 text-xs" onClick={handleCreateSubfolder} disabled={creatingSubfolder}>
                        {creatingSubfolder ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
                        Create
                      </Button>
                      <Button size="sm" variant="ghost" className="h-10 text-xs" onClick={() => setShowCreateSubfolder(false)}>Cancel</Button>
                    </div>
                  </div>
                )}
                {subChapters.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-3">No sub-folders. Create one above.</p>
                ) : (
                  <div className="space-y-1.5">
                    {subChapters.map(sc => (
                      <div key={sc.id} className="w-full border rounded-lg bg-card hover:border-primary transition-all group">
                        {editingChapterId === sc.id ? (
                          <div className="p-3 space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label className="text-xs">Title</Label>
                                <Input value={editChapterTitle} onChange={e => setEditChapterTitle(e.target.value)} className="h-9 text-base" />
                              </div>
                              <div>
                                <Label className="text-xs">Code</Label>
                                <Input value={editChapterCode} onChange={e => setEditChapterCode(e.target.value)} className="h-9 text-base" />
                              </div>
                            </div>
                            <div>
                              <Label className="text-xs">Thumbnail URL</Label>
                              <Input placeholder="https://..." value={editChapterThumbnailUrl} onChange={e => setEditChapterThumbnailUrl(e.target.value)} className="h-9 text-base" />
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" className="h-8 text-xs gap-1" onClick={handleSaveChapterEdit} disabled={savingChapterEdit}>
                                {savingChapterEdit ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                                Save
                              </Button>
                              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setEditingChapterId(null)}>Cancel</Button>
                            </div>
                          </div>
                        ) : (
                          <div className="p-3 flex items-center gap-2 min-h-[52px]">
                            <button className="flex items-center gap-2 flex-1 text-left" onClick={() => setSelectedChapterId(sc.id)}>
                              <FolderOpen className="h-4 w-4 text-primary/60" />
                              <span className="text-sm font-medium flex-1 truncate">{sc.code} : {sc.title}</span>
                            </button>
                            <div className="flex items-center gap-0.5 ml-auto">
                              <Button variant="ghost" size="icon" className="h-9 w-9 text-primary hover:bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => { e.stopPropagation(); handleOpenChapterEdit(sc); }}>
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => { e.stopPropagation(); handleDeleteChapter(sc.id, sc.title); }}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid lg:grid-cols-2 gap-6">
              {/* Upload Form */}
              <Card className="border-2 border-primary/20 shadow-lg">
                <CardHeader className="bg-primary/5 border-b">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Upload className="h-5 w-5" />
                    Upload New Material
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Uploading to: {selectedCourse?.title} → {selectedChapter?.title}
                  </p>
                </CardHeader>
                <CardContent className="p-5">
                  {renderUploadForm()}
                </CardContent>
              </Card>

              {/* Existing Lessons */}
              <Card className="shadow-lg">
                <CardHeader className="bg-muted/30 border-b">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <BookOpen className="h-5 w-5" />
                    Chapter Content ({lessons.length})
                    {reorderingLessons && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground ml-auto" />}
                  </CardTitle>
                  {lessons.length > 1 && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <GripVertical className="h-3 w-3" /> Drag to reorder
                    </p>
                  )}
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-[500px] max-h-[calc(100dvh-260px)]">
                    {lessons.length === 0 ? (
                      <div className="p-8 text-center text-muted-foreground">
                        <FileText className="h-10 w-10 mx-auto mb-2 opacity-20" />
                        <p className="text-sm">No content yet. Upload the first item!</p>
                      </div>
                    ) : (
                      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleLessonDragEnd}>
                        <SortableContext items={lessons.map(l => l.id)} strategy={verticalListSortingStrategy}>
                          <div className="divide-y">
                            {lessons.map(lesson => (
                              <SortableItem key={lesson.id} id={lesson.id}>
                                {(handle) => (
                                  <div className="transition-colors">
                                    <div className={cn("p-3 hover:bg-muted/20 flex items-center gap-2", editingLesson?.id === lesson.id && "bg-primary/5")}>
                                      {handle}
                                      <div className="flex items-center gap-2.5 flex-1 min-w-0">
                                        <div className={cn("p-1.5 rounded-md shrink-0", typeColor(lesson.lecture_type))}>
                                          {typeIcon(lesson.lecture_type)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <p className="font-medium text-sm truncate">{lesson.title}</p>
                                          <div className="flex items-center gap-1.5 mt-0.5">
                                            <Badge variant="secondary" className="text-[10px]">
                                              {lesson.lecture_type || "VIDEO"}
                                            </Badge>
                                            {lesson.class_pdf_url && (
                                              <Badge variant="outline" className="text-[10px] gap-0.5">
                                                <FileText className="h-2.5 w-2.5" />
                                                PDF
                                              </Badge>
                                            )}
                                            {lesson.overview && (
                                              <Badge variant="outline" className="text-[10px] gap-0.5 border-primary/30 text-primary">
                                                Overview ✓
                                              </Badge>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                      <Button
                                        variant="ghost" size="icon"
                                        onClick={() => editingLesson?.id === lesson.id ? setEditingLesson(null) : handleOpenEdit(lesson)}
                                        className={cn("h-9 w-9 shrink-0", editingLesson?.id === lesson.id ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-primary hover:bg-primary/10")}
                                      >
                                        {editingLesson?.id === lesson.id ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                                      </Button>
                                      <Button
                                        variant="ghost" size="icon"
                                        onClick={() => handleDeleteLesson(lesson.id)}
                                        className="text-destructive hover:text-destructive hover:bg-destructive/10 h-9 w-9 shrink-0"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>

                                    {/* Inline Edit Panel */}
                                    {editingLesson?.id === lesson.id && (
                                      <div className="mx-3 mb-3 p-4 rounded-lg border border-primary/30 bg-card space-y-3">
                                        <p className="text-xs font-semibold text-primary uppercase tracking-wide flex items-center gap-1.5">
                                          <Pencil className="h-3 w-3" /> Edit Lesson
                                        </p>
                                        <div className="space-y-1.5">
                                          <Label className="text-xs">Title *</Label>
                                          <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="h-10 text-base" />
                                        </div>
                                        <div className="space-y-1.5">
                                          <Label className="text-xs">Video URL / File URL</Label>
                                          <Input value={editVideoUrl} onChange={e => setEditVideoUrl(e.target.value)} className="h-10 text-base" placeholder="https://..." />
                                        </div>
                                        <div className="space-y-1.5">
                                          <Label className="text-xs">Description</Label>
                                          <textarea
                                            value={editDescription}
                                            onChange={e => setEditDescription(e.target.value)}
                                            rows={2}
                                            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                          />
                                        </div>
                                        <div className="space-y-1.5">
                                          <Label className="text-xs flex items-center gap-1"><BookOpen className="h-3 w-3 text-primary" /> Overview (Overview tab)</Label>
                                          <textarea
                                            value={editOverview}
                                            onChange={e => setEditOverview(e.target.value)}
                                            rows={3}
                                            placeholder="What will students learn in this lesson?"
                                            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                          />
                                        </div>
                                        <div className="space-y-1.5">
                                          <Label className="text-xs flex items-center gap-1"><BookOpen className="h-3 w-3 text-emerald-500" /> Transcript (Markdown, auto-opens in Timeline)</Label>
                                          <textarea
                                            value={editTranscriptMd}
                                            onChange={e => setEditTranscriptMd(e.target.value)}
                                            rows={5}
                                            placeholder="# Topic&#10;&#10;Paste transcript in Markdown..."
                                            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                          />
                                        </div>
                                        <div className="space-y-1.5">
                                          <Label className="text-xs flex items-center gap-1"><ImageIcon className="h-3 w-3 text-primary" /> Thumbnail</Label>
                                          <Input value={editThumbnailUrl} onChange={e => setEditThumbnailUrl(e.target.value)} className="h-10 text-base" placeholder="https://... thumbnail image URL" />
                                          {editThumbnailUrl && (
                                            <img src={editThumbnailUrl} alt="Thumbnail preview" className="w-24 h-16 object-cover rounded-lg border mt-1" />
                                          )}
                                        </div>
                                        <div className="space-y-1.5">
                                          <Label className="text-xs flex items-center gap-1"><FileText className="h-3 w-3 text-orange-500" /> Class PDF URL (Resources tab)</Label>
                                          <Input value={editClassPdfUrl} onChange={e => setEditClassPdfUrl(e.target.value)} className="h-10 text-base" placeholder="https://... or leave blank" />
                                        </div>
                                        {/* PDF Attachments (Edit) */}
                                        <div className="space-y-1.5">
                                          <Label className="text-xs flex items-center gap-1">
                                            <Paperclip className="h-3 w-3 text-primary" /> PDF Attachments
                                          </Label>
                                          {editLessonPdfs.length > 0 && (
                                            <div className="space-y-1">
                                              {editLessonPdfs.map(pdf => (
                                                <div key={pdf.id} className="flex items-center gap-2 p-1.5 bg-muted/30 rounded-md">
                                                  <FileText className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                                                  <span className="text-xs flex-1 truncate">{pdf.file_name}</span>
                                                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => deleteEditPdf(pdf.id)}>
                                                    <Trash2 className="h-3 w-3" />
                                                  </Button>
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                          <input
                                            id={`editPdfAttach-${editingLesson?.id}`}
                                            type="file"
                                            accept=".pdf"
                                            multiple
                                            onChange={e => {
                                              const files = Array.from(e.target.files || []);
                                              setEditNewPdfFiles(prev => [...prev, ...files]);
                                              e.target.value = '';
                                            }}
                                            className="hidden"
                                          />
                                          <label htmlFor={`editPdfAttach-${editingLesson?.id}`} className="cursor-pointer block border border-dashed border-muted-foreground/20 rounded p-2 text-center hover:border-primary/40 transition-colors">
                                            <p className="text-muted-foreground text-xs">+ Add PDFs</p>
                                          </label>
                                          {editNewPdfFiles.length > 0 && (
                                            <div className="space-y-1">
                                              {editNewPdfFiles.map((f, i) => (
                                                <div key={`${f.name}-${f.size}-${f.lastModified}`} className="flex items-center gap-2 p-1.5 bg-background rounded-md border">
                                                  <FileText className="h-3 w-3 text-orange-500 shrink-0" />
                                                  <span className="text-xs flex-1 truncate">{f.name}</span>
                                                  <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive" onClick={() => setEditNewPdfFiles(prev => prev.filter((_, idx) => idx !== i))}>
                                                    <X className="h-2.5 w-2.5" />
                                                  </Button>
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                         </div>
                                         <p className="text-[10px] text-muted-foreground -mt-1">PDF Attachments is legacy. Prefer "Attachments (Any File)" below for new uploads.</p>
                                         {/* New: generic attachments (any file kind) */}
                                         {editingLesson?.id && (
                                           <AdminLessonAttachments lessonId={editingLesson.id} />
                                         )}
                                        <div className="flex gap-2 pt-1">
                                          <Button size="sm" onClick={async () => {
                                            // Upload new PDF files first
                                            if (editNewPdfFiles.length > 0 && editingLesson?.id) {
                                              setEditUploadingPdfs(true);
                                              for (const file of editNewPdfFiles) {
                                                await addEditPdf(editingLesson.id, file);
                                              }
                                              setEditNewPdfFiles([]);
                                              setEditUploadingPdfs(false);
                                            }
                                            handleSaveEdit();
                                          }} disabled={isSavingEdit || editUploadingPdfs} className="gap-1.5 h-9">
                                            {(isSavingEdit || editUploadingPdfs) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                            Save
                                          </Button>
                                          <Button size="sm" variant="ghost" onClick={() => { setEditingLesson(null); setEditNewPdfFiles([]); }} className="h-9">Cancel</Button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </SortableItem>
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminUpload;
