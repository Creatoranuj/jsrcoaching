import { useState, useEffect, useCallback, useRef, useMemo, Suspense } from "react";
import { mark, measure } from "@/lib/perf/marks";
import { useSearchParams, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../integrations/supabase/client";
import { Button } from "../components/ui/button";
import { ScrollArea } from "../components/ui/scroll-area";
import { Badge } from "../components/ui/badge";
import { Progress } from "../components/ui/progress";
import UnifiedVideoPlayer from "../components/video/UnifiedVideoPlayer";

import { LoadingSpinner } from "../components/ui/loading-spinner";
import { SmartImage } from "../components/common/SmartImage";

import { formatDuration } from "../lib/videoUtils";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "../components/ui/accordion";
import {
  ArrowLeft, Play, Lock, Clock,
  FileText, MessageCircle, CheckCircle, Send, Library, ImageIcon, X,
  HelpCircle, ChevronRight, ChevronDown, ChevronUp, Edit2, Save, Sparkles, ListVideo, Loader2, Target, Paperclip, MessageSquare, Star, ThumbsUp, Download, Bookmark as BookmarkIcon, Users, Phone, Mail, Bot, ExternalLink, Share2,
  Upload as UploadIcon, Link as LinkIcon, Trash2, BookOpen, Maximize2
} from "lucide-react";
import { Markdown } from "../components/Markdown";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";


import { extractArchiveId } from "../utils/fileUtils";
import { safeGet, safeSet } from "../lib/storage";
import { cn } from "../lib/utils";
import { toast } from "sonner";
import { openResource } from "../lib/openResource";
import { openExternal } from "../lib/native/browser";
import { isKnownNonPdfWebUrl, isLikelyPdfUrl } from "../lib/detectFileType";
import { isGoogleDocs, isNotion, isGoogleDrive, googleDrivePdfProxyUrl } from "../lib/pdfViewerUrl";
// openNativeDocument intentionally not imported — PDFs render in-app only.
import { useComments } from "../hooks/useComments";
import { useAuth } from "../contexts/AuthContext";
import { useNavigationHistory } from "../contexts/NavigationHistoryContext";
import { resolveFromParam } from "../config/backNavigation";
import { type ArchiveBook } from "../components/archive";
import { Textarea } from "../components/ui/textarea";
import PdfViewer from "../components/video/LazyPdfViewer";
import { lazyWithRetry } from "../lib/lazyWithRetry";
import type { Lesson, Chapter } from "../features/lesson/types";
import { canAccessLesson as canAccessLessonRule, checkCommentImage, normalizeLessons } from "../features/lesson/lib/access";
import {
  SARTHI_SUGGESTIONS,
  formatChatTs,
  formatRelativeTime,
  redactPdfDebugUrl,
} from "../features/lesson/lib/format";

const DocumentReader = lazyWithRetry(() => import("../components/course/DocumentReader"));
const PdfSelectPopup = lazyWithRetry(() => import("../components/video/PdfSelectPopup"));
const BookmarksPanel = lazyWithRetry(() => import("../components/video/BookmarksPanel"));
import type { PdfItem } from "../components/video/PdfSelectPopup";
import PdfIcon from "../components/common/PdfIcon";

import { useLessonLikes } from "../hooks/useLessonLikes";
import { useLessonPdfs } from "../hooks/useLessonPdfs";
import { useLessonAttachments } from "../hooks/useLessonAttachments";
import { useLessonProgress } from "../hooks/useLessonProgress";
import { LessonAttachmentsPanel } from "@/features/lesson/components/LessonAttachmentsPanel";
import { LessonNotesPanel } from "@/features/lesson/components/LessonNotesPanel";
import { PersonalMentorsPanel } from "../features/lesson/components/PersonalMentorsPanel";
import { MyDoubtsPanel } from "../features/lesson/components/MyDoubtsPanel";
import { LessonRatingPanel } from "../features/lesson/components/LessonRatingPanel";
import { CommentsPanel } from "../features/lesson/components/CommentsPanel";
import { DppCard } from "../features/lesson/components/DppCard";
import { useDownloads } from "../hooks/useDownloads";
import { SafeBoundary, useProtectedSurface } from "@/lib/safety";
import { pushPlayerBusy } from "../lib/playerBusy";
import { resolveDeepLinkPdf } from "../lib/resolveDeepLinkPdf";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "../components/ui/collapsible";
import { notifySuccess } from "../lib/nativeChrome";
import { selectionHaptic } from "../lib/native/haptics";
import { readBundleSync, readBundle, writeBundle, rememberLastLesson, recallLastLesson, isOffline } from "../lib/perf/lessonViewCache";
import { AskDoubtSheet } from "../components/lesson/AskDoubtSheet";
const SmartNotesReader = lazyWithRetry(() => import("../components/notes/SmartNotesReader"));
const ObsidianMarkdown = lazyWithRetry(() => import("../components/notes/ObsidianMarkdown"));
const SmartNotesLinkDialog = lazyWithRetry(() => import("../components/notes/SmartNotesLinkDialog"));
const SmartNotesListSheet = lazyWithRetry(() => import("../components/notes/SmartNotesListSheet"));
import AutoScrollFab from "../components/viewer/AutoScrollFab";
import { useLessonFeatureFlags } from "../hooks/useLessonFeatureFlags";
import { CollapsiblePdfSection } from "@/features/lesson/components/CollapsiblePdfSection";
import { LessonChipStrip } from "@/features/lesson/components/LessonChipStrip";
import { LessonDesktopHeader } from "@/features/lesson/components/LessonDesktopHeader";
import { LessonLockedOverlay } from "@/features/lesson/components/LessonLockedOverlay";
import { buildLessonChips, lessonProgressPercent, isPanelChipEnabled, firstPanelChipId } from "@/features/lesson/lib/lessonChips";
import { useLessonChipConfig } from "../hooks/useLessonChipConfig";
import { resolveLessonChipScope } from "@/features/lesson/lib/lessonChipConfig";
import notesFireIcon from "../assets/icons/notes-fire.svg";
import { logger } from "@/lib/logger";
import { useSmartNotesImport } from "@/features/lesson/hooks/useSmartNotesImport";
import { useLessonChat } from "@/hooks/useLessonChat";
import { isSyntheticPop } from "../lib/reader/overlayHistory";
// NOTE: `ChapterGroupedSidebar`, `LessonDescription`, `TopicsCovered` were
// previously nested inside this file but never rendered (dead code).
// They now live under `src/components/lesson/` for future reuse.

// Type definitions
// CollapsiblePdfSection extracted to src/features/lesson/components/CollapsiblePdfSection.tsx

const LessonView = () => {
  const { isMountedRef } = useProtectedSurface();
  // Pause personal-library disk writes while the lesson player is mounted.
  useEffect(() => pushPlayerBusy(), []);


  // Support both URL params and query params
  const { courseId: paramCourseId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryCourseId = searchParams.get("courseId");
  const lessonIdParam = searchParams.get("lessonId") || searchParams.get("lesson");
  const tokenParam = searchParams.get("token");
  const courseId = paramCourseId || queryCourseId;
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const navHistory = useNavigationHistory();

  // Safety net: if anything (player, PDF viewer) ever leaves the page locked,
  // always release on unmount / route change so scroll is never dead.
  useEffect(() => {
    return () => {
      document.body.classList.remove("nb-scroll-lock");
    };
  }, []);


  // State
  const [loading, setLoading] = useState(true);
  const [course, setCourse] = useState<any>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [currentLesson, setCurrentLesson] = useState<Lesson | null>(null);
  
  // Video duration state - actual duration from player
  const [videoDuration, setVideoDuration] = useState(0);
  
  // Access Control
  const [hasPurchased, setHasPurchased] = useState(false);
  
  // Notes state (local storage based for persistence)
  const [noteContent, setNoteContent] = useState("");

  // Admin: Smart Notes (transcript_md) upload state
  const [smartNotesDraft, setSmartNotesDraft] = useState("");
  const [smartNotesEditing, setSmartNotesEditing] = useState(false);
  const [smartNotesSaving, setSmartNotesSaving] = useState(false);
  // Fullscreen Smart Notes reader (mirrors the PDF attachment reader UX).
  const [smartNotesOpen, setSmartNotesOpen] = useState(false);
  /** Selected user note id when opened via the multi-note picker. */
  const [smartNotesActiveId, setSmartNotesActiveId] = useState<string | null>(null);
  /** Multi-note picker sheet (add / rename / delete / open). */
  const [smartNotesSheetOpen, setSmartNotesSheetOpen] = useState(false);
  /** When opening from the inline "Reading mode" shortcut, the reader boots
   *  directly into sepia/theme mode for a distraction-light experience. */
  const [smartNotesReadingMode, setSmartNotesReadingMode] = useState<"off" | "theme">("off");
  /** Inline sepia reading toggle — applies to the in-page Smart Notes block
   *  WITHOUT opening the fullscreen reader. */
  const [inlineReadingMode, setInlineReadingMode] = useState(false);
  
  // Comment state
  const [newComment, setNewComment] = useState("");
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [commentImage, setCommentImage] = useState<File | null>(null);
  const [commentImagePreview, setCommentImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  
  // Archive.org books state (stored per lesson in localStorage for now)
  const [archiveBooks, setArchiveBooks] = useState<ArchiveBook[]>([]);
  
  // Lesson overview override map (avoids page reload after admin saves topics)
  const [lessonOverviewMap, setLessonOverviewMap] = useState<Record<string, string>>({});
  
  // YouTube-style collapsible sections (controlled accordion)
  const [openSections, setOpenSections] = useState<string[]>(["overview"]);
  // Active pill-chip tab for lesson sections (Timeline / Attachment / Doubts / Resources).
  const [activeChip, setActiveChip] = useState<string>(() => searchParams.get("tab") || "comments");
  const tabsRef = useRef<HTMLDivElement>(null);
  const smartNotesEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const inlineNotesScrollRef = useRef<HTMLDivElement | null>(null);
  const [smartNotesDragOver, setSmartNotesDragOver] = useState(false);
  const [smartNotesLinkDialogOpen, setSmartNotesLinkDialogOpen] = useState(false);

  // Smart Notes importers (URL + file) live in a dedicated hook.
  const { smartNotesImportProgress, importUrlToDraft, importFileToDraft } = useSmartNotesImport({
    isMountedRef,
    editorRef: smartNotesEditorRef,
    setSmartNotesDraft,
    setSmartNotesEditing,
  });

  // Auto-hide chrome (title row + chip strip) while reading a PDF for distraction-free view.
  const [chromeVisible, setChromeVisible] = useState<boolean>(true);
  const chromeHideTimer = useRef<number | null>(null);
  const scheduleHideChrome = useCallback(() => {
    if (chromeHideTimer.current) window.clearTimeout(chromeHideTimer.current);
    chromeHideTimer.current = window.setTimeout(() => setChromeVisible(false), 2500);
  }, []);
  const revealChrome = useCallback(() => {
    setChromeVisible(true);
    scheduleHideChrome();
  }, [scheduleHideChrome]);

  // Rating state (local-only UI for now)
  const [ratingValue, setRatingValue] = useState<number>(0);
  const [ratingHover, setRatingHover] = useState<number>(0);
  const [ratingComment, setRatingComment] = useState<string>("");
  const [ratingSubmitted, setRatingSubmitted] = useState<boolean>(false);
  const [ratingSaving, setRatingSaving] = useState<boolean>(false);
  const [ratingAvg, setRatingAvg] = useState<number>(0);
  const [ratingCount, setRatingCount] = useState<number>(0);

  // Ask-Doubt AI state — extracted to `useLessonChat` (Phase 2 split).
  // Hook is instantiated below after `course` state is defined; declared here
  // via a forward `let` binding would trip TDZ, so the hook call lives after
  // `submitRating` alongside the other lesson-scoped hooks.

  // Ask Doubt full-screen sheet
  const [doubtSheetOpen, setDoubtSheetOpen] = useState(false);
  const videoCurrentTimeRef = useRef<number>(0);
  // Audit Tier-2 #1: wire `useLessonProgress` — writes to `lesson_progress`
  // with debounced upsert, 90% unique-watch completion gate, and last-position
  // resume. The existing `user_progress` 80%-total-progress write in
  // `handleVideoTimeUpdate` stays as-is (different table, coarser signal).
  // Resume seek is dispatched via the already-wired `nb:lesson-seek`
  // window event that MahimaGhostPlayer listens for. A ref buffers the
  // pending position until the player reports ready, so we don't drop the
  // seek if the DB fetch resolves before the iframe mounts.
  const pendingResumeRef = useRef<number | null>(null);
  const playerReadyRef = useRef(false);
  const dispatchResumeSeek = useCallback((pos: number) => {
    try {
      window.dispatchEvent(new CustomEvent("nb:lesson-seek", { detail: pos }));
    } catch { /* noop */ }
  }, []);
  // Tracks whether this component is still mounted, and the last lesson the
  // user actually requested. Used by handleLessonClick to drop stale async
  // fetchSecureLessonUrl results that would otherwise corrupt the viewer.
  const currentLessonIdRef = useRef<string | null>(null);
  const getVideoTime = useCallback(() => videoCurrentTimeRef.current || 0, []);

  // Compat helper: existing callsites that say "switch to tab X" now expand that section.
  const setActiveTab = useCallback((id: string) => {
    // Map legacy accordion section ids to pill-chip ids.
    const chipMap: Record<string, string> = {
      overview: "timeline",
      pdf: "attachment",
      resources: "attachment",
      notes: "notes",
      doubts: "ask-doubt",
    };
    setActiveChip(chipMap[id] ?? id);
    setOpenSections((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  // Reset to only "overview" open when lesson changes
  useEffect(() => {
    setOpenSections(["overview"]);
  }, [currentLesson?.id]);

  // Chat reset + auto-scroll effects now live inside `useLessonChat`.

  // Strictly disable page scrolling whenever the device is in landscape.
  // This complements the existing fullscreen lock and covers landscape outside
  // the player's pseudo-fullscreen too.
  useEffect(() => {
    const mql = window.matchMedia("(orientation: landscape)");
    const apply = () => {
      const allow = document.body.classList.contains("nb-allow-landscape-scroll");
      const lock = mql.matches && !allow;
      document.body.style.overflow = lock ? "hidden" : "";
      document.documentElement.style.overflow = lock ? "hidden" : "";
      // Belt-and-suspenders for WebView (Capacitor APK) where body overflow alone
      // sometimes still allows rubber-band scrolling of the page behind the player.
      document.body.style.position = lock ? "fixed" : "";
      document.body.style.width = lock ? "100%" : "";
      document.body.style.touchAction = lock ? "none" : "";
    };
    apply();
    mql.addEventListener("change", apply);
    return () => {
      mql.removeEventListener("change", apply);
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
      document.body.style.position = "";
      document.body.style.width = "";
      document.body.style.touchAction = "";
    };
  }, []);


  // Load this lesson's saved rating (mine + aggregate)
  useEffect(() => {
    if (!currentLesson?.id) return;
    let cancelled = false;
    (async () => {
      const { data: all } = await supabase
        .from("lesson_ratings")
        .select("rating, user_id, comment")
        .eq("lesson_id", currentLesson.id);
      if (cancelled || !all) return;
      const count = all.length;
      const avg = count > 0 ? all.reduce((s: number, r: any) => s + r.rating, 0) / count : 0;
      setRatingCount(count);
      setRatingAvg(avg);
      if (user) {
        const mine = all.find((r) => r.user_id === user.id);
        if (mine) {
          setRatingValue(mine.rating);
          setRatingComment(mine.comment || "");
          setRatingSubmitted(true);
        } else {
          setRatingValue(0); setRatingComment(""); setRatingSubmitted(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [currentLesson?.id, user]);

  const submitRating = useCallback(async () => {
    if (!user || !currentLesson?.id || ratingValue === 0) return;
    setRatingSaving(true);
    try {
      const { error } = await supabase
        .from("lesson_ratings")
        .upsert(
          { lesson_id: currentLesson.id, user_id: user.id, rating: ratingValue, comment: ratingComment.trim() || null },
          { onConflict: "lesson_id,user_id" }
        );
      if (error) throw error;
      setRatingSubmitted(true);
      toast.success(`Thanks! Aapne ${ratingValue} star diye.`);
      // refresh aggregate
      const { data: all } = await supabase
        .from("lesson_ratings").select("rating").eq("lesson_id", currentLesson.id);
      if (all) {
        setRatingCount(all.length);
        setRatingAvg(all.length ? all.reduce((s: number, r: any) => s + r.rating, 0) / all.length : 0);
      }
    } catch (e: unknown) {
      toast.error(getErrorMessage(e) || "Could not save rating");
    } finally {
      setRatingSaving(false);
    }
  }, [user, currentLesson?.id, ratingValue, ratingComment]);

  // Ask-Doubt AI chat — extracted to `useLessonChat` (Phase 2 split).
  const {
    chatInput,
    setChatInput,
    chatBusy,
    chatMessages,
    askingName,
    chatScrollRef,
    sendChat,
    regenerateLast,
    copyChatText,
  } = useLessonChat(currentLesson, chapters, course?.title);

  // Comments hook
  // Comments hook
  const { comments, loading: commentsLoading, createComment, fetchComments } = useComments(currentLesson?.id || undefined);
  
  // Likes hook
  const { likeCount, hasLiked, toggleLike, loading: likesLoading } = useLessonLikes(currentLesson?.id || undefined);

  // Lesson PDFs hook
  const { pdfs: lessonPdfs, loading: pdfsLoading } = useLessonPdfs(currentLesson?.id || undefined);

  // Lesson attachments (new, richer than lesson_pdfs — supports any file kind)
  const { attachments: lessonAttachments, loading: attachmentsLoading, getSignedUrl: getAttachmentUrl } = useLessonAttachments(currentLesson?.id || undefined);

   // PDF viewer state
  const [showPdfPopup, setShowPdfPopup] = useState(false);
  // Separate picker used only for "PDF Download" flow. Sharing state with
  // showPdfPopup would conflate open-vs-download intents on select.
  const [showPdfDownloadPopup, setShowPdfDownloadPopup] = useState(false);
  const [selectedPdf, setSelectedPdf] = useState<PdfItem | null>(null);
  // Immersive full-page reader for deep-link PDF opens (e.g. Notes sheet →
  // ?openPdf=<id>). Distinct from `selectedPdf` (inline reader below the
  // player) so that in-lesson attachment chips remain inline.
  const [immersivePdf, setImmersivePdf] = useState<{ id?: string; url: string; title: string; badge?: string } | null>(null);
  const [notesOpen, setNotesOpen] = useState<boolean>(true);
  const [isPiPMode, setIsPiPMode] = useState(false);
  const [pdfToolbarOpen, setPdfToolbarOpen] = useState(false);
  // Downloads hook
  const { addDownload } = useDownloads();

  const shouldUsePdfReader = useCallback(async (url: string, fileName: string): Promise<boolean> => {
    if (isLikelyPdfUrl(url)) return true;
    // Google Drive file shares render in-app via pdf-proxy + pdf.js (see
    // resolveEmbedUrl). Always route them through the reader.
    if (/drive\.google\.com\/(file\/d\/|open\?[^#]*id=|uc\?[^#]*id=)/i.test(url)) return true;
    // Notion + Google Docs are handled by in-app renderers upstream.
    if (isNotion(url) || /docs\.google\.com\/document/i.test(url)) return true;
    if (isKnownNonPdfWebUrl(url)) return false;
    // Default: trust the reader. pdf.js gracefully errors out for true HTML
    // and we'd rather show that than bounce the user to the browser with a
    // confusing toast for every signed/extensionless PDF URL.
    return true;
  }, []);

  /** Open a PDF from Notes / DPP / Attachment inside the lesson page.
   *
   * Product rule (see src/lib/openPdfHybrid.ts): PDFs must ALWAYS render in
   * the in-app reader. We used to call openNativeDocument() for `lessonPdfs`,
   * which on Capacitor handed the file off to the OS document surface and
   * pushed users out of the lesson view. Removed — every PDF now mounts
   * inline via <PdfViewer> → <FastPdfReader> on web and APK.
   */
  const openPdfItem = useCallback(async (
    pdf: PdfItem,
    options?: { immersive?: boolean },
  ): Promise<"reader" | "browser" | "error"> => {
    void selectionHaptic();
    let url = pdf.file_url || "";
    // `storage://bucket/path` cannot be loaded by the WebView directly.
    // Resolve it to a signed https URL via the secure edge function before
    // handing it to <PdfViewer>, otherwise the reader shows a blank screen
    // inside the Capacitor APK (and a fetch error on web).
    if (/^storage:\/\//i.test(url) && currentLesson?.id) {
      const t = toast.loading("Opening PDF…");
      try {
        const resolved = await fetchSecureLessonUrl(currentLesson.id);
        const next =
          (pdf.id === "class-pdf" ? resolved?.class_pdf_url : null) ||
          (pdf.id === "lesson-file" ? (resolved?.video_url || resolved?.class_pdf_url) : null) ||
          resolved?.class_pdf_url ||
          resolved?.video_url ||
          "";
        if (next && !/^storage:\/\//i.test(next)) {
          url = next;
          // Refresh currentLesson so subsequent opens skip the round-trip.
          setCurrentLesson((prev) => prev ? {
            ...prev,
            video_url: resolved?.video_url || prev.video_url,
            class_pdf_url: resolved?.class_pdf_url || prev.class_pdf_url,
          } : prev);
        }
        toast.dismiss(t);
      } catch {
        toast.error("Couldn't open PDF", { id: t });
        return "error";
      }
    }
    if (!url || /^storage:\/\//i.test(url)) {
      toast.error("PDF link is not ready yet. Please try again.");
      return "error";
    }
    if (isNotion(url)) {
      if (options?.immersive) {
        setImmersivePdf({ id: pdf.id, url, title: pdf.file_name, badge: "PDF" });
      } else {
        setActiveChip("attachment");
        setSelectedPdf({ ...pdf, file_url: url });
      }
      return "reader";
    }

    // Guard: not every "attachment" is actually a PDF. Google Docs/Drive share
    // links, plain web articles, etc. used to be handed straight to pdf.js,
    // which exploded with InvalidPDF / WorkerFailed errors and a blank screen
    // on the APK. Notion is excluded above because it has its own in-app native
    // renderer via <NotionPageRenderer>.
    if (!(await shouldUsePdfReader(url, pdf.file_name))) {
      setSelectedPdf(null);
      setImmersivePdf(null);
      // Silently hand off to the browser — no toast. Users tapping a link
      // already know they're opening it; the old "non-PDF" toast was noisy
      // and triggered for legitimate Drive PDFs.
      try {
        await openExternal(url, { preferWebView: false });
      } catch (err) {
        console.warn("[openPdfItem] openExternal failed", err);
        toast.error("Couldn't open this attachment");
        return "error";
      }
      return "browser";
    }
    // G1 fix: run the non-PDF safety net ONE more time on the resolved URL
    // BEFORE we mount the reader, so a mis-classified Drive/Docs link cannot
    // flash the reader for a frame and immediately unmount from the
    // post-mount effect below.
    if (isKnownNonPdfWebUrl(url) && !isNotion(url) && !isGoogleDocs(url)) {
      try { await openExternal(url, { preferWebView: false }); }
      catch (err) {
        console.warn("[openPdfItem] non-PDF openExternal failed", err);
        toast.error("Couldn't open this attachment");
        return "error";
      }
      return "browser";
    }
    // Immersive path (deep-link from Notes sheet): full-page DocumentReader.
    // Inline path (in-lesson attachment chip): inline PdfViewer below player.
    if (options?.immersive) {
      setImmersivePdf({ id: pdf.id, url, title: pdf.file_name, badge: "PDF" });
      return "reader";
    }
    setActiveChip("attachment");
    setSelectedPdf({ ...pdf, file_url: url });
    return "reader";
  }, [currentLesson?.id, redactPdfDebugUrl, shouldUsePdfReader]);

  const pdfHistorySentinelActiveRef = useRef(false);
  const closeSelectedPdf = useCallback(() => {
    if (pdfHistorySentinelActiveRef.current && window.history.state?.pdfFullscreen) {
      try {
        // G2 fix: drop the 350ms setTimeout — it leaked the sentinel ref when
        // the component unmounted mid-close. popstate handler flips
        // pdfHistorySentinelActiveRef synchronously and clears selectedPdf, so
        // an eager local clear is safe (and idempotent).
        pdfHistorySentinelActiveRef.current = false;
        window.history.back();
        setSelectedPdf(null);
        setPdfToolbarOpen(false);
        return;
      } catch {
        pdfHistorySentinelActiveRef.current = false;
      }
    }
    setSelectedPdf(null);
    setPdfToolbarOpen(false);
  }, []);

  /**
   * Save a lesson PDF to the device via the shared download pipeline. Google
   * Drive URLs are streamed through pdf-proxy so the file lands as raw PDF
   * bytes — never a redirect to Drive's HTML wrapper / account-picker.
   */
  const downloadPdfItem = useCallback(async (pdf: PdfItem) => {
    let url = pdf.file_url;
    let filename = pdf.file_name || "document.pdf";
    if (isGoogleDrive(url)) {
      const proxied = googleDrivePdfProxyUrl(url);
      if (proxied) url = proxied;
      if (!/\.[a-z0-9]{2,5}$/i.test(filename)) filename = `${filename}.pdf`;
    }
    await addDownload(pdf.file_name || filename, url, filename, "PDF");
  }, [addDownload]);

  const saveSelectedPdf = useCallback(async () => {
    if (!selectedPdf) return;
    // Route through downloadPdfItem so Google Drive URLs get proxied to
    // raw PDF bytes (never Drive's HTML wrapper / account-picker) and the
    // filename always lands with a `.pdf` extension.
    await downloadPdfItem(selectedPdf);
  }, [downloadPdfItem, selectedPdf]);

  const exportSelectedPdf = useCallback(async () => {
    if (!selectedPdf) return;
    const share = typeof navigator !== "undefined" ? navigator.share : undefined;
    if (share) {
      try {
        await share({ title: selectedPdf.file_name, url: selectedPdf.file_url });
        return;
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
      }
    }
    await saveSelectedPdf();
  }, [saveSelectedPdf, selectedPdf]);

  /** Re-open the currently inline PDF as a full-page immersive reader. */
  const openSelectedPdfFullPage = useCallback(() => {
    if (!selectedPdf) return;
    const next = { id: selectedPdf.id, url: selectedPdf.file_url, title: selectedPdf.file_name, badge: "PDF" };
    closeSelectedPdf();
    setImmersivePdf(next);
  }, [closeSelectedPdf, selectedPdf]);

  const pdfToolbarActions = selectedPdf ? [
    { label: "Full page", icon: Maximize2, action: openSelectedPdfFullPage },
    { label: "Export", icon: Share2, action: exportSelectedPdf },
    { label: "Download", icon: Download, action: saveSelectedPdf },
    { label: "Open In Web", icon: ExternalLink, action: () => openExternal(selectedPdf.file_url, { preferWebView: false }) },
    { label: "Close", icon: X, action: closeSelectedPdf },
  ] : [];

  // Derived: when an inline reader (PDF attachment OR Smart Notes) is open,
  // the lesson page collapses title/chips and treats the panel area as an
  // edge-to-edge reader (auto-hide chrome, landscape scroll, back-to-close).
  const hasNotes = !!currentLesson?.transcript_md;
  const isReader =
    (activeChip === "attachment" && !!selectedPdf) ||
    (activeChip === "notes" && hasNotes);
  // Notes panel always renders edge-to-edge (no card/box) — even the empty
  // state should sit full-width below the player, never inside a rounded card.
  const isNotesPanel = activeChip === "notes";

  // Landscape-scroll rule: allow vertical scrolling in fake-fullscreen ONLY while
  // the user has an inline PDF *open* (so they can scroll the PDF below the
  // player). Tying to `selectedPdf` instead of just "has PDFs" prevents the lock
  // from leaking after the user closes the PDF without rotating.
  useEffect(() => {
    const allow = isReader;
    document.body.classList.toggle("nb-allow-landscape-scroll", allow);
    return () => document.body.classList.remove("nb-allow-landscape-scroll");
  }, [isReader]);

  // In-app PDF debug — show resolved attachment id + URL whenever a PDF opens.
  // Enable: `?debug=1` in URL, or `localStorage.setItem('nb_pdf_debug','1')`
  // (persists across reloads — perfect for on-device APK QA).
  // Disable: `localStorage.removeItem('nb_pdf_debug')`.
  //
  // Hardening (v2, 5/5):
  // 1. Console + toast both GATED on debug flag — zero noise in production.
  // 2. URL is redacted (origin + path only) before display/clipboard so
  //    short-lived signed tokens never leak into logcat, screenshots, or
  //    a user's clipboard. Full URL stays in-memory for the viewer only.
  // 3. Source detection mirrors resolveDeepLinkPdf's priority — paired
  //    with the resolver's own [pdf-debug] trace, you can see WHY an id
  //    was picked, not just WHAT.
  useEffect(() => {
    if (!selectedPdf) return;
    // Always-on lightweight open log (URL is redacted below). The toast/clipboard
    // affordance stays behind nb_pdf_debug — but the console line is unconditional
    // so blank-PDF reports can be triaged from session logs without on-device opt-in.
    const debugOn =
      new URLSearchParams(window.location.search).has("debug") ||
      safeGet("nb_pdf_debug") === "1";


    const safeUrl = redactPdfDebugUrl(selectedPdf.file_url);
    // Safety net: if any code path (deep-link resolver, attachment row, etc.)
    // pushed a known HTML page into the viewer, only bounce generic web pages.
    // Notion pages are allowed here because PdfViewer renders them natively
    // through NotionPageRenderer; sending them to pdf.js was the old blank bug.
    if (isKnownNonPdfWebUrl(selectedPdf.file_url) && !isNotion(selectedPdf.file_url) && !isGoogleDocs(selectedPdf.file_url)) {
       
      console.warn("[pdf-debug] non-PDF URL routed to browser", { id: selectedPdf.id, host: safeUrl });
      const url = selectedPdf.file_url;
      setSelectedPdf(null);
      // Silent hand-off — toast removed (false-positives on Drive PDFs).
      void openExternal(url, { preferWebView: false }).catch((err) => {
        console.warn("[pdf-debug] openExternal failed", err);
        toast.error("Couldn't open this attachment");
      });
      return;
    }
    const info = {
      id: selectedPdf.id,
      file_name: selectedPdf.file_name,
      file_url_redacted: safeUrl,
      source:
        selectedPdf.id === "class-pdf"
          ? "class_pdf_url"
          : selectedPdf.id === "lesson-file"
            ? "lesson_video_url"
          : lessonPdfs.some((p) => p.id === selectedPdf.id)
            ? "lesson_pdfs"
            : "lesson_attachments",
    };
    if (!debugOn) return;
     
    console.log("[pdf-debug] opened", info);
    const short = safeUrl.length > 60 ? safeUrl.slice(0, 57) + "…" : safeUrl;
    toast.info(`PDF: ${info.id} (${info.source})`, {
      description: short,
      duration: 8000,
      action: {
        label: "Copy URL",
        onClick: () => {
          try {
            navigator.clipboard?.writeText(safeUrl);
            toast.success("Redacted URL copied (token stripped)");
          } catch {
            toast.error("Copy failed");
          }
        },
      },
    });

  }, [selectedPdf, lessonPdfs, redactPdfDebugUrl]);

  // When a PDF opens, show chrome briefly then auto-hide for distraction-free reading.
  useEffect(() => {
    if (isReader) {
      setChromeVisible(true);
      scheduleHideChrome();
    } else {
      setChromeVisible(true);
      if (chromeHideTimer.current) window.clearTimeout(chromeHideTimer.current);
    }
    return () => {
      if (chromeHideTimer.current) window.clearTimeout(chromeHideTimer.current);
    };
  }, [isReader, scheduleHideChrome]);

  // Android / browser back-button integration for the inline PDF viewer only.
  // Cleanup must NEVER call history.back(); doing so created a back-loop where
  // closing a PDF popped the lesson route too. User taps close → closeSelectedPdf
  // pops the sentinel. Hardware back → popstate closes selectedPdf.
  useEffect(() => {
    if (!selectedPdf) return;
    try {
      window.history.pushState({ pdfFullscreen: true }, "");
      pdfHistorySentinelActiveRef.current = true;
    } catch {}
    const onPop = () => {
      // A nested overlay (autoscroll settings sheet, dialog) closing itself
      // pops ITS sentinel — that must never close the PDF. Only a genuine
      // back press, which pops our own `pdfFullscreen` entry, does.
      if (isSyntheticPop()) return;
      if (window.history.state?.pdfFullscreen) return;
      pdfHistorySentinelActiveRef.current = false;
      setSelectedPdf(null);
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (window.history.state?.pdfFullscreen) {
        try {
          window.history.replaceState({ ...window.history.state, pdfFullscreen: false, overlay: false }, "");
        } catch {}
      }
      pdfHistorySentinelActiveRef.current = false;
    };
  }, [selectedPdf?.id]);

  // Progress tracking state
  const [completedLessonIds, setCompletedLessonIds] = useState<Set<string>>(new Set());
  const progressSavedRef = useRef<string | null>(null);

  // DPP (Daily Practice Problems) for this lesson/chapter
  const [lessonDpps, setLessonDpps] = useState<{ id: string; title: string; total_marks: number | null; type: string | null }[]>([]);
  const [dppsLoading, setDppsLoading] = useState(false);

  // Load completed lessons from DB on mount
  useEffect(() => {
    if (!user || !courseId) return;
    let cancelled = false;
    supabase.from('user_progress')
      .select('lesson_id')
      .eq('user_id', user.id)
      .eq('course_id', Number(courseId))
      .eq('completed', true)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setCompletedLessonIds(new Set(data.map(r => r.lesson_id)));
      });
    return () => { cancelled = true; };
  }, [user, courseId]);

  // Fetch DPPs for current lesson or chapter
  useEffect(() => {
    if (!currentLesson) { setLessonDpps([]); setDppsLoading(false); return; }
    let cancelled = false;
    const fetchDpps = async () => {
      // Clear stale DPPs from the previously viewed lesson immediately —
      // otherwise the card stays mounted with a spinner while the new
      // (often empty) result loads.
      if (!cancelled) { setLessonDpps([]); setDppsLoading(true); }
      try {

        // Try lesson_id first, then chapter_id
        if (currentLesson.id) {
          const { data: byLesson } = await supabase
            .from("quizzes")
            .select("id, title, total_marks, type")
            .eq("is_published", true)
            .eq("lesson_id", currentLesson.id);
          if (cancelled) return;
          if (byLesson && byLesson.length > 0) {
            setLessonDpps(byLesson);
            return;
          }
        }
        if (currentLesson.chapter_id) {
          const { data: byChapter } = await supabase
            .from("quizzes")
            .select("id, title, total_marks, type")
            .eq("is_published", true)
            .eq("chapter_id", currentLesson.chapter_id);
          if (cancelled) return;
          if (byChapter && byChapter.length > 0) {
            setLessonDpps(byChapter);
            return;
          }
        }
        if (!cancelled) setLessonDpps([]);
      } catch {
        if (!cancelled) setLessonDpps([]);
      } finally {
        if (!cancelled) setDppsLoading(false);
      }
    };
    fetchDpps();
    return () => { cancelled = true; };
  }, [currentLesson?.id, currentLesson?.chapter_id, currentLesson?.course_id]);


  // Reset saved ref and close PDF viewer when lesson changes
  useEffect(() => {
    progressSavedRef.current = null;
    if (pdfHistorySentinelActiveRef.current && window.history.state?.pdfFullscreen) {
      try { window.history.replaceState({ ...window.history.state, pdfFullscreen: false, overlay: false }, ""); } catch {}
      pdfHistorySentinelActiveRef.current = false;
    }
    setSelectedPdf(null);
    setImmersivePdf(null);
    setShowPdfPopup(false);
  }, [currentLesson?.id]);

  // Auto-open a PDF when arriving via the PDFs deep-link.
  // - `?openPdf=1`     → first available PDF
  // - `?openPdf=<id>`  → specific PDF / attachment by id (falls back to first)
  // Without this the user lands on the Notes/Attachments list and has to tap
  // again — the lecture-card and attachment-tap flows open the PDF directly.
  const autoOpenedPdfRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentLesson?.id) return;
    const openPdfParam = searchParams.get("openPdf");
    if (!openPdfParam) return;
    if (pdfsLoading || attachmentsLoading) return;
    if (selectedPdf || immersivePdf) return;
    if (autoOpenedPdfRef.current === currentLesson.id) return;

    // For standalone PDF/NOTES/DPP lessons, the cinema area at line ~1872
    // already mounts a <PdfViewer> for currentLesson.video_url. Auto-opening
    // the same URL into the attachment-chip reader mounts a SECOND PdfViewer
    // for the same Notion/Drive source. react-notion-x's singleton context
    // and the duplicate iframes race each other, leaving the visible cinema
    // viewer blank. Skip auto-open for these lecture types — the user already
    // sees the PDF rendered up top.
    const lt = (currentLesson.lecture_type || "").toUpperCase();
    if (lt === "PDF" || lt === "NOTES" || lt === "DPP" || lt === "DPP_ATTEMPT") {
      autoOpenedPdfRef.current = currentLesson.id;
      return;
    }

    const resolved = resolveDeepLinkPdf(
      openPdfParam,
      {
        id: currentLesson.id,
        title: currentLesson.title,
        video_url: currentLesson.video_url,
        class_pdf_url: currentLesson.class_pdf_url,
        lecture_type: currentLesson.lecture_type,
      },
      lessonPdfs,
      lessonAttachments,
    );
    if (!resolved) {
       
      console.warn("[eval-debug] pdf resolve failed", {
        openPdfParam,
        lessonId: currentLesson.id,
        pdfCount: lessonPdfs.length,
        attachmentCount: lessonAttachments.length,
      });
      toast.error("Couldn't find that PDF", {
        description: openPdfParam === "1"
          ? "No PDF, DPP, or notes file is linked to this lesson."
          : `No matching attachment for id "${openPdfParam}".`,
      });
      autoOpenedPdfRef.current = currentLesson.id;
      return;
    }

    if (resolved.kind === "direct") {
      // If the file_url is still a `storage://` URI (signed URL hasn't been
      // populated yet for this lesson), trigger fetchSecureLessonUrl now and
      // patch currentLesson — the effect re-runs once class_pdf_url updates
      // to an https URL and the PDF then opens. Without this kick, the
      // auto-open silently no-op'd and the user saw nothing happen after
      // tapping "Open" on a PDF card.
      if (/^storage:\/\//i.test(resolved.pdf.file_url || "")) {
        autoOpenedPdfRef.current = currentLesson.id; // guard against re-fire
        (async () => {
          const urls = await fetchSecureLessonUrl(currentLesson.id);
          const nextPdf =
            (resolved.pdf.id === "class-pdf" ? urls?.class_pdf_url : null) ||
            (resolved.pdf.id === "lesson-file" ? (urls?.video_url || urls?.class_pdf_url) : null) ||
            urls?.class_pdf_url ||
            urls?.video_url ||
            null;
          if (nextPdf && !/^storage:\/\//i.test(nextPdf)) {
            setCurrentLesson((prev) => prev ? {
              ...prev,
              video_url: urls?.video_url || prev.video_url,
              class_pdf_url: urls?.class_pdf_url || prev.class_pdf_url,
            } : prev);
            void openPdfItem({ ...resolved.pdf, file_url: nextPdf }, { immersive: true });
          } else {
            autoOpenedPdfRef.current = null; // allow retry
            toast.error("Couldn't open PDF", { description: "Signed URL unavailable. Try again." });
          }
        })();
        return;
      }
      void openPdfItem(resolved.pdf, { immersive: true });
      autoOpenedPdfRef.current = currentLesson.id;
      return;
    }

    // Attachment — needs a signed URL
    const att = lessonAttachments.find((a) => a.id === resolved.attachment.id);
    if (!att) {
       
      console.warn("[eval-debug] pdf attachment missing from list", {
        wantedId: resolved.attachment.id,
        lessonId: currentLesson.id,
      });
      toast.error("Attachment unavailable", {
        description: "It may have been removed. Pull to refresh and try again.",
      });
      autoOpenedPdfRef.current = currentLesson.id;
      return;
    }
    (async () => {
      try {
        const url = await getAttachmentUrl(att);
        if (!url) {
           
          console.warn("[eval-debug] pdf signed url empty", {
            attachmentId: att.id,
            file_name: resolved.attachment.file_name,
          });
          toast.error("Couldn't open PDF", {
            description: "The download link returned empty. Check your connection and retry.",
          });
          return;
        }
        void openPdfItem({
          id: att.id,
          file_name: resolved.attachment.file_name,
          file_url: url,
        }, { immersive: true });
        autoOpenedPdfRef.current = currentLesson.id;
      } catch (err) {
         
        logger.error("[eval-debug] pdf open failed", {
          attachmentId: att.id,
          file_name: resolved.attachment.file_name,
          error: (err as Error)?.message || String(err),
        });
        toast.error("Couldn't open PDF", {
          description: (err as Error)?.message || "Unknown error while resolving attachment.",
        });
      }
    })();
  }, [
    currentLesson?.id,
    currentLesson?.class_pdf_url,
    currentLesson?.title,
    pdfsLoading,
    attachmentsLoading,
    lessonPdfs,
    lessonAttachments,
    searchParams,
    selectedPdf,
    immersivePdf,
    getAttachmentUrl,
    openPdfItem,
  ]);

  // Flush progress on tab-hide / back-press / route teardown so users don't
  // lose mid-video watch position. Idempotent (on-conflict upsert).
  useEffect(() => {
    const flush = () => {
      if (!user || !currentLesson || !courseId) return;
      const t = videoCurrentTimeRef.current ?? 0;
      if (t <= 0) return;
      if (progressSavedRef.current === currentLesson.id) return; // already 80%-saved
      // Audit F1: `void` + empty catch swallowed rejections silently. Await
      // + logger.error so failed background flushes surface in Sentry.
      (async () => {
        try {
          const { error: upErr } = await supabase.from('user_progress').upsert({
            user_id: user.id,
            lesson_id: currentLesson.id,
            course_id: Number(courseId),
            completed: false,
            watched_seconds: Math.floor(t),
            last_watched_at: new Date().toISOString(),
          }, { onConflict: 'user_id,lesson_id' });
          if (upErr) logger.warn('[user_progress] background flush failed', { err: upErr });
        } catch (err) {
          logger.warn('[user_progress] background flush threw', { err });
        }
      })();
    };
    const onVis = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [user, currentLesson?.id, courseId]);

  // Handle video time update → save progress at 80%
  const handleVideoTimeUpdate = useCallback(async (currentTime: number, duration: number) => {
    videoCurrentTimeRef.current = currentTime;
    // Feed the lesson_progress hook (debounced upsert, 90% completion gate).
    reportLessonProgress(currentTime);
    // Snapshot the lesson id BEFORE any await (audit H-3): rapid lesson
    // switching used to let `currentLesson` change while the upsert was
    // in-flight, writing the current progress against the wrong lesson id.
    const lessonId = currentLesson?.id;
    if (!user || !lessonId || !courseId || duration <= 0) return;
    const progress = currentTime / duration;
    if (progress >= 0.8 && progressSavedRef.current !== lessonId) {
      progressSavedRef.current = lessonId;
      try {
        await supabase.from('user_progress').upsert({
          user_id: user.id,
          lesson_id: lessonId,
          course_id: Number(courseId),
          completed: true,
          watched_seconds: Math.floor(currentTime),
          last_watched_at: new Date().toISOString(),
        }, { onConflict: 'user_id,lesson_id' });
        setCompletedLessonIds(prev => new Set([...prev, lessonId]));
        void notifySuccess();
      } catch (err) {
        logger.error('Progress save error:', err);
      }
    }
  }, [user, currentLesson?.id, courseId]);

  // Wire lesson_progress: interval-based unique-watch tracking + resume.
  const { report: reportLessonProgress, flush: flushLessonProgress } =
    useLessonProgress(currentLesson?.id, videoDuration, (lastPosition) => {
      // Buffer the seek until the player reports ready; MahimaGhostPlayer
      // ignores seekTo before playerReady is true.
      if (playerReadyRef.current) dispatchResumeSeek(lastPosition);
      else pendingResumeRef.current = lastPosition;
    });

  // Reset ready flag whenever the lesson changes.
  useEffect(() => {
    playerReadyRef.current = false;
    pendingResumeRef.current = null;
    return () => { void flushLessonProgress(); };
  }, [currentLesson?.id, flushLessonProgress]);


  
  // Check if user is admin or teacher
  const { isAdmin, isTeacher } = useAuth();
  const isAdminOrTeacher = isAdmin || isTeacher;
  // Admin-controlled lesson feature switches (site_settings). Defaults are
  // all-ON, so the page behaves exactly as before until an admin flips one.
  const lessonFlags = useLessonFeatureFlags();
  // Admin chip manager: per content-type defaults + per-lesson override.
  const chipConfig = useLessonChipConfig();
  const chipScope = useMemo(
    () => resolveLessonChipScope(chipConfig, currentLesson?.lecture_type, currentLesson?.id),
    [chipConfig, currentLesson?.lecture_type, currentLesson?.id],
  );
  const lessonChips = useMemo(
    () => buildLessonChips({
      hasNotes,
      isAdminOrTeacher,
      hasLiked,
      likeCount,
      flags: lessonFlags,
      hiddenChipIds: chipScope.hidden,
      customChips: chipScope.custom,
    }),
    [hasNotes, isAdminOrTeacher, hasLiked, likeCount, lessonFlags, chipScope],
  );

  // A disabled/hidden chip must not stay open via a ?tab= deep link.
  useEffect(() => {
    if (lessonFlags.isLoading || lessonChips.length === 0) return;
    if (isPanelChipEnabled(lessonChips, activeChip)) return;
    const fallback = firstPanelChipId(lessonChips);
    if (fallback && fallback !== activeChip) setActiveChip(fallback);
  }, [lessonChips, activeChip, lessonFlags.isLoading]);

  // Custom (link) chips open their website instead of switching panels.
  const handleChipSelect = useCallback((id: string) => {
    const chip = lessonChips.find((c) => c.id === id);
    if (chip?.action === "link") {
      if (chip.url) void openResource({ url: chip.url });
      return;
    }
    setActiveChip(id);
  }, [lessonChips]);

  // Load notes from storage when lesson changes
  useEffect(() => {
    if (currentLesson?.id) {
      const savedNote = safeGet(`lesson_note_${currentLesson.id}`);
      if (savedNote) {
        setNoteContent(savedNote);
      } else {
        setNoteContent("");
      }
    }
  }, [currentLesson?.id]);

  // Auto-save notes to storage
  useEffect(() => {
    if (currentLesson?.id && noteContent) {
      const timer = setTimeout(() => {
        safeSet(`lesson_note_${currentLesson.id}`, noteContent);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [noteContent, currentLesson?.id]);

  // Load archive books from storage when lesson changes
  useEffect(() => {
    if (currentLesson?.id) {
      const savedBooks = safeGet(`lesson_archive_books_${currentLesson.id}`);
      if (savedBooks) {
        try {
          setArchiveBooks(JSON.parse(savedBooks));
        } catch {
          setArchiveBooks([]);
        }
      } else {
        setArchiveBooks([]);
      }
    }
  }, [currentLesson?.id]);

  // Archive books management functions
  const handleAddArchiveBook = (book: Omit<ArchiveBook, 'id'>) => {
    if (!currentLesson?.id) return;
    
    const newBook: ArchiveBook = {
      ...book,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };
    
    const updatedBooks = [...archiveBooks, newBook];
    setArchiveBooks(updatedBooks);
    safeSet(`lesson_archive_books_${currentLesson.id}`, JSON.stringify(updatedBooks));
    toast.success("Book added to lesson resources!");
  };

  const handleRemoveArchiveBook = (bookId: string) => {
    if (!currentLesson?.id) return;
    
    const updatedBooks = archiveBooks.filter(b => b.id !== bookId);
    setArchiveBooks(updatedBooks);
    safeSet(`lesson_archive_books_${currentLesson.id}`, JSON.stringify(updatedBooks));
    toast.success("Book removed from lesson resources");
  };

  // Fetch secure video/pdf URL for current lesson via Supabase Edge Function.
  // Uses supabase.functions.invoke so it works in every environment (Lovable
  // preview, Vercel static, Replit/Express, Capacitor native) — the previous
  // `/api/functions/v1/...` fetch only worked behind the Replit Express proxy
  // and silently returned index.html on Lovable/Vercel, leaving video_url
  // empty and the player stuck on "Select a lesson to watch".
  const fetchSecureLessonUrl = async (lessonId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("get-lesson-url", {
        body: { lesson_id: lessonId },
      });
      if (error) {
        const fnErr = error as { context?: { status?: number; json?: () => Promise<{ error?: string } | null> }; status?: number };
        const status = fnErr.context?.status ?? fnErr.status;
        let errData: { error?: string } | null = null;
        try {
          errData = (await fnErr.context?.json?.()) ?? null;
        } catch {}
        if (status === 403) {
          toast.error(errData?.error || "Purchase required to access this lesson");
        } else if (status && status >= 500) {
          toast.error("Server error loading lesson. Please retry.");
        } else {
          toast.error(errData?.error || error.message || "Network error loading lesson URL");
        }
        return null;
      }
      return data as { video_url: string | null; class_pdf_url: string | null } | null;
    } catch {
      toast.error("Network error loading lesson URL");
      return null;
    }
  };


  // --- 1. DATA FETCHING (offline-first) ---
  // Strategy: hydrate from cache synchronously so the page paints immediately
  // even on 2G/offline, then refresh from the network in the background. On
  // offline / network failure we keep showing the cached bundle and only show
  // an error toast if the cache was empty too.
  useEffect(() => {
    if (!courseId) return;

    let cancelled = false;
    const controller = new AbortController();
    const signal = controller.signal;
    const aliveRef = isMountedRef; // alias for read-clarity below


    mark("lesson:open");
    // Step 1: synchronous cache hydration (zero network).
    const cached = readBundleSync(courseId);
    if (cached) {
      setCourse(cached.course);
      setChapters(cached.chapters as unknown as Chapter[]);
      setLessons(cached.lessons as unknown as Lesson[]);
      setHasPurchased(cached.hasPurchased);
      setLoading(false); // unblock the UI immediately
      measure("lesson:cached-ready", "lesson:open");
      // Optimistically show the first/last-viewed lesson from cache so the
      // player isn't stuck on the empty placeholder while the network
      // refresh + secure-URL fetch are in flight.
      const cachedLessons = (cached.lessons as unknown as Lesson[]) || [];
      if (cachedLessons.length > 0) {
        const pick = cachedLessons.find(l => l.id === lessonIdParam) || cachedLessons[0];
        setCurrentLesson(pick);
      }
    }

    const initPage = async () => {
      try {
        if (!cached) setLoading(true);

        // If we're offline AND have cache, skip the network entirely — the
        // background refresh would just fail noisily.
        if (isOffline() && cached) {
          // Still try to recall the last-viewed lesson from this course.
          const lastId = await recallLastLesson(courseId);
          const target = lastId
            ? (cached.lessons as unknown as Lesson[]).find(l => l.id === lastId) ?? (cached.lessons as unknown as Lesson[])[0]
            : (cached.lessons as unknown as Lesson[])[0];
          if (target && !cancelled) {
            // Video URL needs network — leave empty so player shows offline state.
            setCurrentLesson({ ...target, video_url: "", class_pdf_url: null } as Lesson);
          }
          return;
        }

        // Use getSession (reads from local storage, no network) instead of
        // getUser (auth server round-trip). Cold-start latency was 600-1500ms
        // on slow networks and gated the entire parallel fetch below — which
        // is why lessons appeared to "load very late" after the player frame.
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user ?? null;

        // Single RPC call replaces enrollment + course + chapters + lessons round-trips.
        const { data: bundle, error: bundleErr } = await supabase
          .rpc('get_course_bundle', { _course_id: Number(courseId) })
          .abortSignal(signal);

        if (cancelled || signal.aborted || !aliveRef.current) return;
        if (bundleErr) throw bundleErr;

        const b = (bundle ?? {}) as {
          course: any;
          chapters: any[];
          lessons: any[];
          is_enrolled: boolean;
        };

        const enrolled = !!b.is_enrolled;
        if (enrolled) setHasPurchased(true);
        if (!b.course) throw new Error('Course not found');

        setCourse(b.course);
        setChapters(b.chapters || []);

        const mappedLessons: Lesson[] = normalizeLessons(b.lessons);

        setLessons(mappedLessons);

        // Write-through cache so the next visit hydrates instantly.
        writeBundle(courseId, {
          course: b.course,
          chapters: (b.chapters || []) as unknown as import("../lib/perf/lessonViewCache").CachedChapter[],
          lessons: mappedLessons as unknown as import("../lib/perf/lessonViewCache").CachedLesson[],
          hasPurchased: enrolled,
        });




        if (mappedLessons.length > 0) {
          let targetLessonId = lessonIdParam;
          if (!targetLessonId && tokenParam) {
            try {
              const decoded = JSON.parse(atob(tokenParam));
              targetLessonId = decoded.l || null;
            } catch { /* ignore */ }
          }
          // Fall back to last-viewed lesson for this course if no param.
          if (!targetLessonId) {
            targetLessonId = await recallLastLesson(courseId);
          }
          const targetLesson = targetLessonId
            ? mappedLessons.find(l => l.id === targetLessonId) || mappedLessons[0]
            : mappedLessons[0];
          // Render immediately with the raw URL so the player never gets
          // stuck on "Select a lesson to watch" while the edge function is
          // in-flight or failing.
          setCurrentLesson(targetLesson);
          const urls = await fetchSecureLessonUrl(targetLesson.id);
          if (cancelled) return;
          if (urls && (urls.video_url || urls.class_pdf_url)) {
            setCurrentLesson({
              ...targetLesson,
              video_url: urls.video_url || targetLesson.video_url || '',
              class_pdf_url: urls.class_pdf_url || targetLesson.class_pdf_url || null,
            });
          }
          rememberLastLesson(courseId, targetLesson.id);
        }

      } catch (error) {
        logger.error("Error loading lessons:", error);
        // Only surface the error if we have nothing cached to fall back on.
        if (!cached) {
          // Try async cache as a last resort (covers cold native start where
          // localStorage may be empty but Preferences has data).
          const lateCache = await readBundle(courseId);
          if (lateCache && !cancelled) {
            setCourse(lateCache.course);
            setChapters(lateCache.chapters as unknown as Chapter[]);
            setLessons(lateCache.lessons as unknown as Lesson[]);
            setHasPurchased(lateCache.hasPurchased);
          } else if (!cancelled) {
            toast.error(isOffline() ? "You're offline. Reconnect to load this course." : "Could not load course content");
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          measure("lesson:ready", "lesson:open");
        }
      }
    };

    initPage();
    return () => { cancelled = true; controller.abort(); };
  }, [courseId]);

  // Enrollment guard: redirect unenrolled non-admin users
  useEffect(() => {
    if (!loading && !hasPurchased && !isAdminOrTeacher && courseId && user) {
      toast.error("Please purchase this course to access lessons.", { id: "course-locked" });
      navigate(`/buy-course?id=${courseId}`, { replace: true });
    }
  }, [loading, hasPurchased, isAdminOrTeacher, courseId, user, navigate]);

  // Refetch comments when lesson changes
  useEffect(() => {
    if (currentLesson?.id) {
      fetchComments();
    }
  }, [currentLesson?.id, fetchComments]);

  // --- Logic ---
  const canAccessLesson = (lesson: Lesson) => canAccessLessonRule(lesson, hasPurchased);

  const handleLessonClick = async (lesson: Lesson) => {
    if (!canAccessLesson(lesson)) {
      toast.error("Course locked! Please buy to watch.");
      navigate(`/buy-course?id=${courseId}`);
      return;
    }
    // Switch instantly, then hydrate secure URLs. The previous guard compared
    // against the currently-open lesson before updating the requested id, so
    // every second lesson tap was dropped and LessonView felt frozen/slow.
    const requestedId = lesson.id;
    currentLessonIdRef.current = requestedId;
    setCurrentLesson({
      ...lesson,
      video_url: lesson.video_url || '',
      class_pdf_url: lesson.class_pdf_url || null,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });

    const urls = await fetchSecureLessonUrl(requestedId);
    if (!isMountedRef.current) return;
    if (currentLessonIdRef.current !== requestedId) {
      // User clicked a different lesson while this one was loading — drop result.
      return;
    }
    setCurrentLesson({
      ...lesson,
      video_url: urls?.video_url || lesson.video_url || '',
      class_pdf_url: urls?.class_pdf_url || lesson.class_pdf_url || null,
    });
  };




  // Post comment
  const handlePostComment = async () => {
    if (!newComment.trim() && !commentImage) {
      toast.error("Please enter a comment or attach an image");
      return;
    }

    if (!user) {
      toast.error("Please login to comment");
      return;
    }

    if (!currentLesson?.id) return;

    setIsPostingComment(true);
    
    let imageUrl: string | undefined;
    
    // Upload image if present
    if (commentImage) {
      setUploadingImage(true);
      try {
        const filePath = `${user.id}/${Date.now()}_${commentImage.name}`;
        const { error: uploadError } = await supabase.storage
          .from("comment-images")
          .upload(filePath, commentImage);
        if (uploadError) throw uploadError;
        const { data: urlData, error: urlError } = await supabase.storage
          .from("comment-images")
          .createSignedUrl(filePath, 60 * 60 * 24 * 365);
        if (urlError) throw urlError;
        imageUrl = urlData.signedUrl;
      } catch (err: unknown) {

        toast.error("Failed to upload image");
        setIsPostingComment(false);
        setUploadingImage(false);
        return;
      }
      setUploadingImage(false);
    }
    
    const success = await createComment(
      { lessonId: currentLesson.id, message: newComment.trim() || "📷 Image", imageUrl },
      profile?.fullName || user.email || 'Anonymous'
    );

    if (success) {
      setNewComment("");
      setCommentImage(null);
      setCommentImagePreview(null);
    }
    setIsPostingComment(false);
  };

  const handleCommentImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const imgCheck = checkCommentImage(file);
    if (!imgCheck.ok) {
      toast.error(imgCheck.error);
      return;
    }
    setCommentImage(file);
    setCommentImagePreview(URL.createObjectURL(file));
  };

  const removeCommentImage = () => {
    setCommentImage(null);
    if (commentImagePreview) URL.revokeObjectURL(commentImagePreview);
    setCommentImagePreview(null);
  };

  // Revoke the blob URL whenever it changes OR on unmount. Without this,
  // navigating away with an image still selected leaks the blob — accumulates
  // on Android WebView during long sessions and contributes to OOM kills.
  useEffect(() => {
    return () => {
      if (commentImagePreview) URL.revokeObjectURL(commentImagePreview);
    };
  }, [commentImagePreview]);

  // Format relative time
  const fromParam = resolveFromParam(searchParams, courseId);
  const fromMyCourses = fromParam === 'my-courses';
  const fromAllClasses = fromParam === 'all-classes';
  const fromCourses = fromParam === 'courses';
  const chapterParam = searchParams.get('chapter');
  const pathParam = searchParams.get('path');

  const handleBack = useCallback(() => {
    // my-courses drills subject → chapter → lessons IN-PAGE inside
    // MyCourseDetail (all on /my-courses/:id), so a bare history.back()
    // returns to the subject root and loses the user's place. Navigate to an
    // explicit restore URL (chapter + path) so the exact lesson list is
    // rebuilt. Must run BEFORE the trail check — otherwise history.back()
    // wins and dumps the user at the course root.
    if (fromMyCourses) {
      const params = new URLSearchParams();
      if (chapterParam) params.set('chapter', chapterParam);
      if (pathParam) params.set('path', pathParam);
      const qs = params.toString();
      navigate(`/my-courses/${courseId}${qs ? `?${qs}` : ''}`, { replace: true });
      return;
    }
    // Prefer the real in-app navigation trail (history path) so Back returns
    // to wherever the user actually came from (breadcrumb / web / app parity).
    const prevInTrail = navHistory.peekPrevious();
    if (prevInTrail) {
      window.history.back();
      return;
    }
    // Deterministic fallback for cold-launch / deep links (empty trail).
    // Audit fix (Batch): chapter takes priority over course/subject root.
    // Previously `fromMyCourses` short-circuited FIRST and threw the user
    // to `/my-courses/:id`, skipping the LectureListing they just came
    // from. Chapter-first mirrors the breadcrumb parent + hardware back.
    const restoreChapter = chapterParam || currentLesson?.chapter_id || '';
    if (restoreChapter) {
      const qs = fromParam ? `?from=${fromParam}` : '';
      navigate(`/classes/${courseId}/chapter/${restoreChapter}${qs}`);
    } else if (fromMyCourses) {
      const params = new URLSearchParams();
      if (pathParam) params.set('path', pathParam);
      const qs = params.toString();
      navigate(`/my-courses/${courseId}${qs ? `?${qs}` : ''}`);
    } else if (fromAllClasses) {
      navigate('/all-classes');
    } else if (fromCourses) {
      navigate(`/course/${courseId}`);
    } else {
      navigate(`/classes/${courseId}/chapters`);
    }
  }, [chapterParam, currentLesson, courseId, fromParam, fromMyCourses, fromAllClasses, fromCourses, navigate, navHistory, pathParam]);

  if (loading) {
    return <LoadingSpinner fullPage size="lg" />;
  }

  // Defensive: if loading finished but course is still null (e.g. warm cache
  // path with a pending refetch), hold a spinner instead of blinking the
  // empty state. A genuine missing course is rare here because access to this
  // route is gated by enrollment upstream.
  if (!course) return <LoadingSpinner fullPage size="lg" />;

  // Calculate Progress Logic
  const completedCount = completedLessonIds.size;
  const progressPercentage = lessonProgressPercent(completedCount, lessons.length);

  // PDF / DPP / NOTES open in immersive full-page DocumentReader (no inline
  // chrome / bottom white strip) so students can read distraction-free.
  const isDocumentType = currentLesson && ['PDF', 'DPP', 'DPP_ATTEMPT', 'NOTES'].includes(currentLesson.lecture_type?.toUpperCase() ?? '');
  const documentUrl = currentLesson?.video_url || currentLesson?.class_pdf_url || '';
  if (isDocumentType && documentUrl) {
    return (
      <SafeBoundary fallbackTitle="Document failed to load">
        <DocumentReader
          title={currentLesson.title}
          subtitle={course?.title}
          badge={currentLesson.lecture_type?.toUpperCase()}
          url={documentUrl}
          lessonId={currentLesson.id}
          onBack={handleBack}
        />
      </SafeBoundary>
    );
  }

  // Immersive PDF from Notes-sheet deep-link (?openPdf=<id>). Renders full-page
  // DocumentReader on top of the lesson view; onBack strips the query param and
  // returns the user to the normal lesson layout (attachment tab stays inline).
  if (immersivePdf && currentLesson) {
    const closeImmersive = () => {
      // If the user deep-linked into this reader from the Lecture card view
      // (?openPdf=... navigation from LectureListing), a plain "clear state"
      // leaves them stranded on the LessonView they never wanted to see.
      // Prefer popping the whole route so hardware/UI back returns to the
      // exact card view they tapped from. Fall back to the in-lesson clear
      // for callers that opened the immersive reader without a history entry
      // (e.g. Notes sheet within the same lesson).
      setImmersivePdf(null);
      const hasOpenPdfParam = searchParams.has("openPdf");
      const cameFromTrail = !!navHistory.peekPrevious();
      if (hasOpenPdfParam && cameFromTrail) {
        // handleBack already knows how to unwind to the right ancestor
        // (LectureListing / MyCourseDetail / All Classes) using the nav trail.
        handleBack();
        return;
      }
      const next = new URLSearchParams(searchParams);
      if (next.has("openPdf")) {
        next.delete("openPdf");
        setSearchParams(next, { replace: true });
      }
    };
    return (
      <SafeBoundary fallbackTitle="Document failed to load">
        <DocumentReader
          title={immersivePdf.title}
          subtitle={currentLesson.title}
          badge={immersivePdf.badge || "PDF"}
          url={immersivePdf.url}
          lessonId={immersivePdf.id || currentLesson.id}
          onBack={closeImmersive}
        />
      </SafeBoundary>
    );
  }


  return (
    <div data-lesson-root className="min-h-dvh bg-background flex flex-col">

      {/* Status-bar safe-area filler — black on mobile so it visually merges
          with the video frame below it (no more blank white strip between
          the system status bar and the player). Desktop keeps the regular
          card header below, so the filler is hidden there. */}
      <div
        className="lg:hidden bg-black shrink-0"
        style={{ height: "env(safe-area-inset-top, 0px)" }}
        aria-hidden="true"
      />

      {/* --- HEADER (Clean & Minimal) — desktop only --- */}
      <LessonDesktopHeader
        courseTitle={course.title}
        gradeLabel={formatGrade(course.grade)}
        lessonCount={lessons.length}
        hasPurchased={hasPurchased}
        onBack={handleBack}
        onBuy={() => navigate(`/buy-course?id=${courseId}`)}
      />
      {/* Mobile top bar removed — was a 44px blank white strip between status
          bar and video. Back navigation is handled by:
            1. Android hardware back (useAndroidBackButton)
            2. Edge-swipe-right (useSwipeBack)
            3. Floating back chip inside the video frame (top-left, see player)
          UX feedback was that the standalone bar added zero affordance and
          broke the cinematic "video sits right under the status bar" feel
          competitors (YouTube, MX, Hotstar) ship. */}
      <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
        
        {/* --- LEFT: VIDEO PLAYER & TABS (Cinema Area) --- */}
        <main className="flex-1 overflow-y-auto bg-card lg:bg-muted/20">
            <div className="max-w-5xl mx-auto lg:p-6 lg:space-y-6">
                {/* VIDEO CONTAINER — full-width, hidden when PiP mode is active */}
                {!isPiPMode && (
                <div className={cn("lg:rounded-2xl overflow-hidden relative group", !isReader && "shadow-2xl")}>
                    {/* NOTE: The always-on floating back chip was removed (2026-06-27)
                        per UX audit — it was visually distracting AND its tap was
                        being swallowed by the player's z-[55] top overlay, so the
                        button silently failed. Back navigation is still covered by:
                          1. Android hardware back (useAndroidBackButton)
                          2. Edge-swipe-right gesture (useSwipeBack)
                          3. Player's own exit arrow in fullscreen (MahimaGhostPlayer) */}
                    {currentLesson && (['PDF', 'DPP', 'DPP_ATTEMPT', 'NOTES'].includes(currentLesson.lecture_type?.toUpperCase() ?? '')) ? (
                      <div className="relative w-full bg-background">
                        {/* Open the class PDF in the full-page immersive reader
                            (user request 2026-09-08). The inline viewer reserves
                            room for the lesson chrome below, which left a dead
                            band on tall phones — full page removes it. */}
                        <button
                          type="button"
                          aria-label="Open PDF full page"
                          onClick={() => {
                            const url = currentLesson.video_url || currentLesson.class_pdf_url || '';
                            if (!url) return;
                            void selectionHaptic();
                            setImmersivePdf({
                              id: currentLesson.id,
                              url,
                              title: currentLesson.title || 'Class PDF',
                              badge: (currentLesson.lecture_type?.toUpperCase() === 'DPP' ? 'DPP' : 'PDF'),
                            });
                          }}
                          className="absolute right-2 top-2 z-[60] inline-flex min-h-11 items-center gap-1.5 rounded-full bg-background/85 px-3 py-1.5 text-xs font-medium text-foreground shadow-lg ring-1 ring-border backdrop-blur transition active:scale-95"
                        >
                          <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" /> Full page
                        </button>
                        <PdfViewer
                          url={currentLesson.video_url || currentLesson.class_pdf_url || ''}
                          title={currentLesson.title}
                          filename={currentLesson.title}
                          alwaysShowFab
                          fabBottomOffset={96}
                        />
                      </div>
                    ) : currentLesson && currentLesson.video_url ? (
                        <UnifiedVideoPlayer
                            url={currentLesson.video_url}
                            lessonId={currentLesson.id}
                            title={currentLesson.title}
                            subtitle={currentLesson.created_at ? new Date(currentLesson.created_at).toLocaleDateString('en-GB') + (course?.title ? ` · ${course.title}` : '') : (course?.title ?? undefined)}
                            onReady={() => {
                              playerReadyRef.current = true;
                              const pending = pendingResumeRef.current;
                              if (pending != null) {
                                pendingResumeRef.current = null;
                                dispatchResumeSeek(pending);
                              }
                            }}
                            onDurationReady={(dur) => setVideoDuration(dur)}
                            onTimeUpdate={handleVideoTimeUpdate}
                        />
                    ) : (
                        <div className="aspect-video bg-black flex items-center justify-center rounded-2xl">
                            <p className="text-white/50">Select a lesson to watch</p>
                        </div>
                    )}

                    {/* Locked Overlay */}
                    {currentLesson && !canAccessLesson(currentLesson) && (
                        <LessonLockedOverlay lessonCount={lessons.length} onBuy={() => navigate(`/buy-course?id=${courseId}`)} />
                    )}
                </div>
                )}

                {/* Floating PiP Video Player — DISABLED to prevent overlay on PDF/sidebar */}

                {/* PDF Select Popup — still mounted for chip-strip multi-PDF selection */}
                {currentLesson && (() => {
                  const allPdfs: PdfItem[] = [];
                  if (currentLesson.class_pdf_url) {
                    allPdfs.push({ id: 'class-pdf', file_name: 'Class PDF', file_url: currentLesson.class_pdf_url });
                  }
                  lessonPdfs.forEach(p => allPdfs.push({ id: p.id, file_name: p.file_name, file_url: p.file_url, file_size: p.file_size }));
                  return (
                    <Suspense fallback={null}>
                      <PdfSelectPopup
                        open={showPdfPopup}
                        onOpenChange={setShowPdfPopup}
                        pdfs={allPdfs}
                        onSelect={(pdf) => { void openPdfItem(pdf); }}
                      />
                    </Suspense>
                  );
                })()}

                {/* PDF Download picker — same list as the top-of-lesson
                    "PDF Download" button. Selecting a row triggers the
                    in-app download pipeline (never an external redirect). */}
                {currentLesson && (() => {
                  const downloadablePdfs: PdfItem[] = [];
                  if (currentLesson.class_pdf_url && currentLesson.class_pdf_url.trim() !== "") {
                    downloadablePdfs.push({ id: "class-pdf", file_name: `${currentLesson.title || "Lesson"} — Class PDF`, file_url: currentLesson.class_pdf_url });
                  }
                  lessonPdfs.forEach((p) => {
                    downloadablePdfs.push({ id: p.id, file_name: p.file_name, file_url: p.file_url, file_size: p.file_size });
                  });
                  return (
                    <Suspense fallback={null}>
                      <PdfSelectPopup
                        open={showPdfDownloadPopup}
                        onOpenChange={setShowPdfDownloadPopup}
                        pdfs={downloadablePdfs}
                        onSelect={(pdf) => { void downloadPdfItem(pdf); }}
                      />
                    </Suspense>
                  );
                })()}

                {/* INFO & TABS */}
                <div className={cn("pb-10", isReader ? "px-0 space-y-0" : "px-4 lg:px-0 space-y-3")}>

                    {/* Lesson Title + meta (duration • date) + description.
                        Auto-hides smoothly (together with the chip strip) when a PDF is
                        open and chrome has timed out. Uses opacity + max-height so the
                        chips below don't snap — no display:none flicker. */}
                    {currentLesson && (() => {
                       const collapsed = isReader && !chromeVisible;
                      return (
                        <div
                          className={cn(
                            "overflow-hidden transition-[opacity,max-height,padding] duration-300 ease-out",
                            collapsed
                              ? "opacity-0 max-h-0 py-0 pointer-events-none"
                              : "opacity-100 max-h-[400px] py-2"
                          )}
                          aria-hidden={collapsed}
                        >
                          <div className="space-y-1">
                            <h1 className="text-base md:text-lg font-semibold text-foreground leading-snug line-clamp-2">
                              {currentLesson.title || "Course Introduction"}
                            </h1>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              {videoDuration > 0 && (
                                <span className="inline-flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {formatDuration(videoDuration)}
                                </span>
                              )}
                              {currentLesson.created_at && (
                                <span>
                                  {new Date(currentLesson.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                </span>
                              )}
                            </div>
                            {/* Replaced video description with Like + Rating summary (per product spec). */}
                            <div className="mt-2 flex items-center gap-4 flex-wrap">
                              <button
                                type="button"
                                onClick={() => toggleLike()}
                                disabled={likesLoading}
                                className={cn(
                                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm border transition-colors",
                                  hasLiked
                                    ? "bg-primary/10 border-primary/30 text-primary"
                                    : "bg-transparent border-border text-foreground hover:bg-accent/30"
                                )}
                                aria-label="Like lesson"
                              >
                                <ThumbsUp className={cn("h-4 w-4", hasLiked && "fill-current")} />
                                <span className="font-medium">{likeCount}</span>
                                <span className="hidden sm:inline">{hasLiked ? "Liked" : "Like"}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setActiveChip("rating")}
                                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm border border-border bg-transparent text-foreground hover:bg-accent/30"
                                aria-label="Rate lesson"
                              >
                                <div className="flex">
                                  {[1,2,3,4,5].map((s) => (
                                    <Star key={s}
                                      className={cn(
                                        "h-4 w-4",
                                        (ratingAvg >= s - 0.25) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"
                                      )}
                                    />
                                  ))}
                                </div>
                                <span className="font-medium">{ratingAvg ? ratingAvg.toFixed(1) : "—"}</span>
                                <span className="text-muted-foreground">({ratingCount})</span>
                              </button>

                              {(() => {
                                // Collect every downloadable PDF for the CTA. Attachments
                                // are excluded — they already have per-row download buttons
                                // in the Attachment chip, and mixing them here would double
                                // up the affordance.
                                const downloadablePdfs: PdfItem[] = [];
                                if (currentLesson?.class_pdf_url && currentLesson.class_pdf_url.trim() !== "") {
                                  downloadablePdfs.push({ id: "class-pdf", file_name: `${currentLesson.title || "Lesson"} — Class PDF`, file_url: currentLesson.class_pdf_url });
                                }
                                lessonPdfs.forEach((p) => {
                                  downloadablePdfs.push({ id: p.id, file_name: p.file_name, file_url: p.file_url, file_size: p.file_size });
                                });
                                if (downloadablePdfs.length === 0) return null;
                                if (!lessonFlags.pdfDownload) return null;
                                return (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      // Single PDF → download immediately. Multiple → picker.
                                      if (downloadablePdfs.length === 1) {
                                        void downloadPdfItem(downloadablePdfs[0]);
                                        return;
                                      }
                                      setShowPdfDownloadPopup(true);
                                    }}
                                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm border border-border bg-transparent text-foreground hover:bg-accent/30"
                                    aria-label={downloadablePdfs.length === 1 ? "Download PDF" : "Choose a PDF to download"}
                                  >
                                    <Download className="h-4 w-4" />
                                    <span className="font-medium">PDF Download</span>
                                  </button>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* TABS COMPONENT — horizontal pill chips */}
                    <div ref={tabsRef}>
                    {currentLesson && lessonFlags.chipStrip && (
                    <div className={cn("w-full", isReader ? "mt-0" : "mt-2")}>
                      {/* Pill chip strip — auto-hides while reading PDF. Floating glass-card look. */}
                      <LessonChipStrip
                        chips={lessonChips}
                        activeChip={activeChip}
                        hasLiked={hasLiked}
                        likesLoading={likesLoading}
                        collapsed={isReader && !chromeVisible}
                        notesIconSrc={notesFireIcon}
                        onSelect={handleChipSelect}
                        onToggleLike={() => toggleLike()}
                      />

                      {/* Panel content */}
                      <div className={cn(
                        "overflow-hidden",
                        isReader || isNotesPanel
                          ? "bg-card -mx-4 lg:mx-0 mt-0"
                          : activeChip === "ask-doubt"
                            ? "mt-2 bg-transparent"
                            : "bg-card rounded-xl border border-border shadow-sm mt-2"
                      )}>

                        {activeChip === "timeline" && (
                          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                            Timeline markers coming soon.
                          </div>
                        )}

                        {activeChip === "notes" && (
                          <LessonNotesPanel
                            hasNotes={hasNotes}
                            currentLesson={currentLesson}
                            setCurrentLesson={setCurrentLesson}
                            isAdminOrTeacher={isAdminOrTeacher}
                            chromeVisible={chromeVisible}
                            revealChrome={revealChrome}
                            copyChatText={copyChatText}
                            addDownload={addDownload}
                            inlineReadingMode={inlineReadingMode}
                            setInlineReadingMode={setInlineReadingMode}
                            setSmartNotesReadingMode={setSmartNotesReadingMode}
                            setSmartNotesSheetOpen={setSmartNotesSheetOpen}
                            inlineNotesScrollRef={inlineNotesScrollRef}
                            notesAutoScroll={lessonFlags.notesAutoScroll}
                            smartNotesEditing={smartNotesEditing}
                            setSmartNotesEditing={setSmartNotesEditing}
                            smartNotesDraft={smartNotesDraft}
                            setSmartNotesDraft={setSmartNotesDraft}
                            smartNotesSaving={smartNotesSaving}
                            setSmartNotesSaving={setSmartNotesSaving}
                            smartNotesImportProgress={smartNotesImportProgress}
                            setSmartNotesLinkDialogOpen={setSmartNotesLinkDialogOpen}
                            smartNotesDragOver={smartNotesDragOver}
                            setSmartNotesDragOver={setSmartNotesDragOver}
                            smartNotesEditorRef={smartNotesEditorRef}
                            importFileToDraft={importFileToDraft}
                          />
                        )}

                        {activeChip === "attachment" && (
                          selectedPdf ? (
                            // Edge-to-edge distraction-free PDF view.
                            // Tap reveals chrome (back arrow + title + chip strip); they auto-hide after ~2.5s.
                            <div
                              className="relative w-full"
                              onClick={revealChrome}
                              onTouchStart={revealChrome}
                              onMouseMove={revealChrome}
                            >
                              {/* Removed: floating PDF toolbar (ListVideo/X toggle).
                                  Download / Export / Close now live on the PdfViewer's
                                  own header chrome; autoscroll FAB stays untouched.
                                  User request 2026-07-11. */}
                              {/* Open this PDF in the full-page immersive reader
                                  (user request 2026-09-08). */}
                              <button
                                type="button"
                                aria-label="Open PDF full page"
                                onClick={(e) => { e.stopPropagation(); openSelectedPdfFullPage(); }}
                                className="absolute right-2 top-2 z-[60] flex items-center gap-1.5 rounded-full bg-background/85 px-3 py-1.5 text-xs font-medium text-foreground shadow-lg ring-1 ring-border backdrop-blur transition active:scale-95"
                              >
                                <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" /> Full page
                              </button>
                              <PdfViewer
                                url={selectedPdf.file_url}
                                title={selectedPdf.file_name}
                                filename={selectedPdf.file_name}
                                chromeVisible={true}
                                alwaysShowFab
                                fabBottomOffset={96}
                                onDownloaded={({ title, url, filename }) => addDownload(title, url, filename, "PDF")}
                              />
                            </div>
                          ) : (pdfsLoading || attachmentsLoading) ? (
                            // Skeleton while attachments/PDFs load — surfaces progress
                            // before the viewer opens (especially for the `?openPdf=` deep-link).
                            <div className="px-4 py-4 space-y-3" aria-busy="true" aria-label="Loading attachments">
                              {[0, 1, 2].map((i) => (
                                <div key={i} className="flex items-center gap-3 py-2.5">
                                  <div className="h-7 w-7 rounded-md bg-muted animate-pulse flex-shrink-0" />
                                  <div className="h-4 flex-1 rounded bg-muted animate-pulse" />
                                </div>
                              ))}
                            </div>
                          ) : (
                            <LessonAttachmentsPanel
                              lessonTitle={currentLesson?.title || ""}
                              classPdfUrl={currentLesson?.class_pdf_url}
                              pdfs={lessonPdfs}
                              attachments={lessonAttachments}
                              notesOpen={notesOpen}
                              onToggleNotes={() => setNotesOpen(v => !v)}
                              onOpenPdf={(item) => void openPdfItem(item)}
                              resolveAttachmentUrl={(att) => getAttachmentUrl(att)}
                              onAttachmentDownloaded={(title, url, filename, kind) => addDownload(title, url, filename, kind)}
                              pdfsLoading={pdfsLoading}
                              attachmentsLoading={attachmentsLoading}
                            />
                          )
                        )}

                        {activeChip === "bookmarks" && (
                          <Suspense fallback={<div className="px-4 py-6 text-sm text-muted-foreground">Loading bookmarks…</div>}>
                            <BookmarksPanel lessonId={currentLesson.id} />
                          </Suspense>
                        )}

                        {activeChip === "mentors" && <PersonalMentorsPanel />}

                        {activeChip === "ask-doubt" && currentLesson && (
                          <AskDoubtSheet
                            inline
                            open={true}
                            onClose={() => setActiveChip("comments")}
                            chatMessages={chatMessages}
                            chatBusy={chatBusy}
                            chatInput={chatInput}
                            setChatInput={setChatInput}
                            sendChat={sendChat}
                            regenerateLast={regenerateLast}
                            askingName={askingName}
                            getVideoTime={getVideoTime}
                            suggestions={SARTHI_SUGGESTIONS}
                            lessonTitle={currentLesson.title}
                            persistKey={currentLesson.id}
                            saveAnswer={async (md, idx) => {
                              try {
                                const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
                                const safe = (currentLesson.title || "doubt").replace(/[^\w.-]+/g, "_").slice(0, 60);
                                const fileName = `${safe}-doubt-${idx + 1}-${stamp}.md`;
                                const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
                                const url = URL.createObjectURL(blob);
                                // Pass the blob directly (5th arg) so the offline copy is written to IndexedDB / Filesystem.
                                // Without it, the save path tries to fetch() a blob: URL — unreliable on Android WebView —
                                // and falls back to storing only the soon-to-be-revoked URL, producing "Offline copy missing".
                                // Use "MD" so the Downloads viewer routes to MarkdownViewer (same as Smart Notes save).
                                await addDownload(fileName, url, fileName, "MD", blob);
                                toast.success("Saved to Downloads");
                                setTimeout(() => URL.revokeObjectURL(url), 5_000);
                              } catch (err: unknown) {
                                toast.error(getErrorMessage(err) || "Save failed");
                              }
                            }}
                          />
                        )}

                        {activeChip === "my-doubts" && (
                          <MyDoubtsPanel comments={comments} loading={commentsLoading} userId={user?.id} />
                        )}

                        {activeChip === "rating" && (
                          <LessonRatingPanel
                            ratingValue={ratingValue}
                            ratingHover={ratingHover}
                            ratingComment={ratingComment}
                            ratingSaving={ratingSaving}
                            ratingSubmitted={ratingSubmitted}
                            ratingCount={ratingCount}
                            ratingAvg={ratingAvg}
                            canSubmit={!!user}
                            onHover={setRatingHover}
                            onSelect={setRatingValue}
                            onCommentChange={setRatingComment}
                            onSubmit={submitRating}
                          />
                        )}

                        {activeChip === "comments" && (
                          <CommentsPanel
                            comments={comments}
                            loading={commentsLoading}
                            newComment={newComment}
                            isPosting={isPostingComment}
                            postDisabled={isPostingComment || (!newComment.trim() && !commentImage)}
                            onCommentChange={setNewComment}
                            onPost={handlePostComment}
                            onOpenImage={(url) => void openResource({ url, kind: 'image' })}
                          />
                        )}
                      </div>
                    </div>
                    )}
                    </div>

                    {/* DPP / Quiz Section — hidden entirely while loading or when empty */}
                    {!dppsLoading && lessonDpps.length > 0 && (
                      <DppCard dpps={lessonDpps} loading={dppsLoading} />
                    )}

                    {/* Video Recommendations removed — distracting element */}
                </div>
            </div>
        </main>

      </div>
      {currentLesson && (
        <Suspense fallback={null}>
          <SmartNotesListSheet
            open={smartNotesSheetOpen}
            onOpenChange={setSmartNotesSheetOpen}
            lessonId={currentLesson.id}
            courseId={currentLesson.course_id ?? undefined}
            seedContent={currentLesson.transcript_md || ""}
            defaultTitle={currentLesson.title}
            onOpenNote={(n) => { setSmartNotesActiveId(n.id); setSmartNotesOpen(true); }}
          />
        </Suspense>
      )}
      {smartNotesOpen && currentLesson && (
        <Suspense fallback={<LoadingSpinner fullPage />}>
          <SmartNotesReader
            title={`${currentLesson.title} · Smart Notes`}
            markdown={currentLesson.transcript_md || ""}
            lessonId={smartNotesActiveId ? null : currentLesson.id}
            courseId={smartNotesActiveId ? null : (currentLesson.course_id ?? undefined)}
            noteId={smartNotesActiveId}
            defaultReadingMode={smartNotesReadingMode}
            onBack={() => { setSmartNotesOpen(false); setSmartNotesActiveId(null); setSmartNotesReadingMode("off"); }}
            onDownload={async () => {
              try {
                const fileName = `${currentLesson.title.replace(/[^\w.-]+/g, "_")}-smart-notes.md`;
                const md = currentLesson.transcript_md || "";
                if (!md.trim()) {
                  toast.error("Notes khaali hain — pehle Save karein.");
                  return;
                }
                const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                // "MD" → Downloads opens with MarkdownViewer (not the PDF reader).
                // Pass blob directly — avoids "NetworkError" when the blob: URL goes stale.
                await addDownload(fileName, url, fileName, "MD", blob);
                toast.success("Smart Notes saved to Downloads");
                setTimeout(() => URL.revokeObjectURL(url), 5_000);
              } catch (err) {
                toast.error((err as Error)?.message || "Save failed");
              }
            }}
          />
        </Suspense>
      )}

      <Suspense fallback={null}>
        <SmartNotesLinkDialog
          open={smartNotesLinkDialogOpen}
          onOpenChange={setSmartNotesLinkDialogOpen}
          onImport={importUrlToDraft}
          progress={smartNotesImportProgress}
        />
      </Suspense>

    </div>
  );
};
import CrashShield from "../components/system/CrashShield";
import { formatGrade } from "../lib/formatGrade";
import { getErrorMessage } from "@/lib/errorMessage";

const LessonViewShielded = () => (
  <CrashShield source="lesson-view">
    <LessonView />
  </CrashShield>
);

export default LessonViewShielded;
