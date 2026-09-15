import { Suspense } from "react";
import { toast } from "sonner";
import {
  FileText, Download, BookOpen, Upload as UploadIcon,
  Link as LinkIcon, Trash2, Loader2, Save,
} from "lucide-react";
import { cn } from "../../../lib/utils";
import { supabase } from "../../../integrations/supabase/client";
import { LoadingSpinner } from "../../../components/ui/loading-spinner";
import AutoScrollFab from "../../../components/viewer/AutoScrollFab";
import { lazyWithRetry } from "../../../lib/lazyWithRetry";
import type { Lesson } from "../types";
import { getErrorMessage } from "@/lib/errorMessage";

const ObsidianMarkdown = lazyWithRetry(() => import("../../../components/notes/ObsidianMarkdown"));

type AddDownload = (
  title: string,
  url: string,
  filename: string,
  fileType?: string,
  blob?: Blob,
) => Promise<unknown>;

export interface LessonNotesPanelProps {
  hasNotes: boolean;
  currentLesson: Lesson | null;
  setCurrentLesson: React.Dispatch<React.SetStateAction<Lesson | null>>;
  isAdminOrTeacher: boolean;
  chromeVisible: boolean;
  revealChrome: () => void;
  copyChatText: (text: string) => Promise<void> | void;
  addDownload: AddDownload;
  inlineReadingMode: boolean;
  setInlineReadingMode: React.Dispatch<React.SetStateAction<boolean>>;
  setSmartNotesReadingMode: (mode: "off" | "theme") => void;
  setSmartNotesSheetOpen: (open: boolean) => void;
  inlineNotesScrollRef: React.RefObject<HTMLDivElement | null>;
  notesAutoScroll: boolean;
  smartNotesEditing: boolean;
  setSmartNotesEditing: (v: boolean) => void;
  smartNotesDraft: string;
  setSmartNotesDraft: React.Dispatch<React.SetStateAction<string>>;
  smartNotesSaving: boolean;
  setSmartNotesSaving: (v: boolean) => void;
  smartNotesImportProgress: number | null;
  setSmartNotesLinkDialogOpen: (open: boolean) => void;
  smartNotesDragOver: boolean;
  setSmartNotesDragOver: (v: boolean) => void;
  smartNotesEditorRef: React.RefObject<HTMLTextAreaElement | null>;
  importFileToDraft: (f: File) => Promise<void>;
}

/**
 * Smart Notes panel (inline markdown reader + admin editor).
 * Extracted from src/pages/LessonView.tsx to keep the page component lean.
 */
export function LessonNotesPanel({
  hasNotes,
  currentLesson,
  setCurrentLesson,
  isAdminOrTeacher,
  chromeVisible,
  revealChrome,
  copyChatText,
  addDownload,
  inlineReadingMode,
  setInlineReadingMode,
  setSmartNotesReadingMode,
  setSmartNotesSheetOpen,
  inlineNotesScrollRef,
  notesAutoScroll,
  smartNotesEditing,
  setSmartNotesEditing,
  smartNotesDraft,
  setSmartNotesDraft,
  smartNotesSaving,
  setSmartNotesSaving,
  smartNotesImportProgress,
  setSmartNotesLinkDialogOpen,
  smartNotesDragOver,
  setSmartNotesDragOver,
  smartNotesEditorRef,
  importFileToDraft,
}: LessonNotesPanelProps) {
  if (hasNotes) {
    return (
      <div
        className="relative w-full"
        onClick={revealChrome}
        onTouchStart={revealChrome}
        onMouseMove={revealChrome}
      >
        {/* Floating Copy / Download / Open-fullscreen chip — auto-hides with chrome */}
        {chromeVisible && (
          <div
            className="absolute right-2 z-30 flex items-center gap-1 rounded-full bg-card/90 backdrop-blur-md border border-border shadow-md px-1 py-1"
            style={{ top: 'max(8px, env(safe-area-inset-top))' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => copyChatText(currentLesson!.transcript_md || "")}
              title="Copy notes"
              aria-label="Copy notes"
              className="h-7 w-7 rounded-full inline-flex items-center justify-center text-foreground hover:bg-accent/40 transition-colors"
            >
              <FileText className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  const fileName = `${(currentLesson?.title || "lesson").replace(/[^\w.-]+/g, "_")}-smart-notes.md`;
                  // Prefer in-progress draft so users can download what they're editing
                  // even before the Save round-trip lands; fall back to saved transcript.
                  const md = smartNotesDraft?.trim() ? smartNotesDraft : (currentLesson?.transcript_md || "");
                  if (!md.trim()) {
                    toast.error("Notes khaali hain — pehle kuchh likhein ya upload karein.");
                    return;
                  }
                  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  // Use "MD" so the Downloads viewer routes to MarkdownViewer
                  // (NOTES would force the PDF reader and fail to parse markdown).
                  // Pass the blob directly so we never re-fetch a (possibly stale) blob: URL.
                  await addDownload(fileName, url, fileName, "MD", blob);
                  setTimeout(() => URL.revokeObjectURL(url), 5_000);
                  toast.success("Saved to Downloads");
                } catch (err: unknown) {
                  toast.error(getErrorMessage(err) || "Download failed");
                }
              }}
              title="Download notes"
              aria-label="Download notes"
              className="h-7 w-7 rounded-full inline-flex items-center justify-center text-foreground hover:bg-accent/40 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setInlineReadingMode((v) => !v)}
              title={inlineReadingMode ? "Exit Reading mode" : "Reading mode (sepia)"}
              aria-label="Toggle Reading mode"
              aria-pressed={inlineReadingMode}
              className={cn(
                "h-7 w-7 rounded-full inline-flex items-center justify-center transition-colors",
                inlineReadingMode
                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                  : "text-foreground hover:bg-accent/40",
              )}
            >
              <BookOpen className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => { setSmartNotesReadingMode("off"); setSmartNotesSheetOpen(true); }}
              title="Open fullscreen"
              aria-label="Open fullscreen"
              className="h-7 px-2 rounded-full inline-flex items-center gap-1 bg-primary text-primary-foreground text-[11px] font-semibold hover:opacity-90 transition-opacity"
            >
              Open
            </button>
          </div>
        )}
        {/* Edge-to-edge markdown body, smooth scroll.
            Inline reading mode applies a sepia surface
            without opening the fullscreen reader. */}
        <div
          ref={inlineNotesScrollRef}
          className={cn(
            "overflow-y-auto overflow-x-auto px-4 sm:px-6 pt-3 pb-10 transition-colors",
            inlineReadingMode && "bg-reading-sepia text-reading-sepia-foreground",
          )}
          style={{ scrollBehavior: "smooth", maxHeight: "calc(100dvh - 220px)" }}
        >
          <Suspense fallback={<LoadingSpinner />}><ObsidianMarkdown>{currentLesson!.transcript_md!}</ObsidianMarkdown></Suspense>
        </div>
        {/* Inline Auto-Scroll FAB — scrolls the notes container above */}
        {notesAutoScroll && (
          <AutoScrollFab targetRef={inlineNotesScrollRef} bottomOffset={96} />
        )}
      </div>
    );
  }

  return (
    <div className="w-full px-4 sm:px-6 pt-4 pb-10">
      {isAdminOrTeacher && currentLesson && (
        <div className="mb-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary/10 inline-flex items-center justify-center">
                <FileText className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground leading-tight">Smart Notes</p>
                <p className="text-[11px] text-muted-foreground leading-tight">Admin upload · Markdown</p>
              </div>
            </div>
            {!smartNotesEditing ? (
              <button
                type="button"
                onClick={() => {
                  setSmartNotesDraft(currentLesson.transcript_md || "");
                  setSmartNotesEditing(true);
                }}
                className="text-xs px-3 py-1.5 rounded-full bg-primary text-primary-foreground hover:opacity-90 font-medium shadow-sm"
              >
                {currentLesson.transcript_md ? "Edit" : "Add notes"}
              </button>
            ) : (
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <label
                  title="Upload file (md / pdf / image)"
                  className="h-8 inline-flex items-center gap-1.5 px-2 sm:px-3 rounded-full border border-border bg-card hover:bg-accent/40 text-foreground cursor-pointer text-xs font-medium transition-colors"
                >
                  <UploadIcon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Upload</span>
                  <input
                    type="file"
                    accept=".md,.markdown,.txt,text/markdown,text/plain,application/pdf,.pdf,image/*,.jpg,.jpeg,.png,.webp,.gif"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f) await importFileToDraft(f);
                      e.target.value = "";
                    }}
                  />
                </label>

                <button
                  type="button"
                  disabled={smartNotesImportProgress !== null}
                  onClick={() => setSmartNotesLinkDialogOpen(true)}
                  title="Import from URL"
                  className="h-8 inline-flex items-center gap-1.5 px-2 sm:px-3 rounded-full border border-border bg-card hover:bg-accent/40 text-foreground text-xs font-medium disabled:opacity-60 transition-colors"
                >
                  <LinkIcon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{smartNotesImportProgress !== null ? `Importing ${smartNotesImportProgress}%` : "Link"}</span>
                </button>

                {currentLesson.transcript_md && (
                  <button
                    type="button"
                    disabled={smartNotesSaving}
                    onClick={async () => {
                      if (!currentLesson?.id) return;
                      if (!window.confirm("Delete Smart Notes for this lesson? This cannot be undone.")) return;
                      setSmartNotesSaving(true);
                      const { error } = await supabase
                        .from("lessons")
                        .update({ transcript_md: null })
                        .eq("id", currentLesson.id);
                      setSmartNotesSaving(false);
                      if (error) { toast.error(error.message || "Delete failed"); return; }
                      setCurrentLesson((prev) => prev ? { ...prev, transcript_md: null } : prev);
                      setSmartNotesDraft("");
                      setSmartNotesEditing(false);
                      toast.success("Smart Notes deleted");
                    }}
                    title="Delete Smart Notes"
                    className="h-8 inline-flex items-center gap-1.5 px-2 sm:px-3 rounded-full border border-destructive/40 bg-destructive/5 text-destructive hover:bg-destructive/10 text-xs font-medium disabled:opacity-50 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Delete</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={smartNotesSaving}
                  onClick={async () => {
                    if (!currentLesson?.id) return;
                    setSmartNotesSaving(true);
                    const { error } = await supabase
                      .from("lessons")
                      .update({ transcript_md: smartNotesDraft || null })
                      .eq("id", currentLesson.id);
                    setSmartNotesSaving(false);
                    if (error) {
                      toast.error(error.message || "Save failed");
                      return;
                    }
                    setCurrentLesson((prev) => prev ? { ...prev, transcript_md: smartNotesDraft || null } : prev);
                    setSmartNotesEditing(false);
                    toast.success("Smart Notes saved");
                  }}
                  title="Save Smart Notes"
                  className="h-8 inline-flex items-center gap-1.5 px-3 sm:px-4 rounded-full bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 text-xs font-semibold shadow-sm transition-opacity"
                >
                  {smartNotesSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {smartNotesSaving ? "Saving" : "Save"}
                </button>
                <button
                  type="button"
                  title="Discard changes"
                  onClick={() => setSmartNotesEditing(false)}
                  className="h-8 inline-flex items-center px-3 rounded-full text-foreground/80 hover:bg-accent/40 text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
          {smartNotesEditing && (
            <div
              className={cn(
                "relative overflow-hidden rounded-xl border bg-card transition-colors",
                smartNotesDragOver ? "border-primary ring-2 ring-primary/30" : "border-border/70"
              )}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (!smartNotesDragOver) setSmartNotesDragOver(true); }}
              onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setSmartNotesDragOver(false); }}
              onDrop={async (e) => {
                e.preventDefault(); e.stopPropagation();
                setSmartNotesDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) await importFileToDraft(f);
              }}
            >
              {smartNotesImportProgress !== null && (
                <div className="absolute left-0 right-0 top-0 h-0.5 bg-primary/15 z-10">
                  <div
                    className="h-full bg-primary transition-[width] duration-300"
                    style={{ width: `${smartNotesImportProgress}%` }}
                  />
                </div>
              )}
              <div className="flex items-center justify-between px-3 pt-2 pb-1 border-b border-border/40">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Markdown</span>
                <span className="text-[10px] text-muted-foreground/70">{smartNotesDraft.length.toLocaleString()} chars</span>
              </div>
              <textarea
                ref={smartNotesEditorRef}
                value={smartNotesDraft}
                onChange={(e) => setSmartNotesDraft(e.target.value)}
                placeholder="# Heading&#10;&#10;Paste or write Markdown notes here — ya file drag-drop karein…"
                className="block w-full min-h-[320px] resize-y bg-transparent px-4 py-3 text-base md:text-[13px] font-mono leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
              />
              {smartNotesDragOver && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-primary/5 backdrop-blur-[1px]">
                  <div className="flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 py-2 text-xs font-semibold shadow-lg">
                    <UploadIcon className="h-3.5 w-3.5" /> Drop to import
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {!smartNotesEditing && (
        <div className="text-center py-20 px-6">
          <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-primary/10 to-primary/[0.02] border border-primary/15 mx-auto flex items-center justify-center mb-5 shadow-sm">
            <FileText className="h-9 w-9 text-primary/70" strokeWidth={1.5} />
          </div>
          <p className="text-[17px] font-semibold text-foreground tracking-tight">Smart Notes abhi available nahi</p>
          <p className="text-[13px] leading-relaxed text-muted-foreground mt-2 max-w-[280px] mx-auto">
            Admin is lesson ke liye Markdown notes upload karenge — yahaan inline, full screen dikhenge.
          </p>
        </div>
      )}
    </div>
  );
}
