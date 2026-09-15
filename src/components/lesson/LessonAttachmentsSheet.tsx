import { useCallback, useEffect, useRef, useState } from "react";
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "../ui/drawer";
import { useLessonNotes, type LessonNote } from "../../hooks/useLessonNotes";
import { AttachmentRow } from "./AttachmentRow";
import { FileText, Download } from "lucide-react";
import { Skeleton } from "../ui/skeleton";
import { toast } from "sonner";
import DocReaderShell from "../library/DocReaderShell";
import { useDownloads } from "../../hooks/useDownloads";
import { isGoogleDocs, isGoogleDrive, isNotion, googleDrivePdfProxyUrl } from "../../lib/pdfViewerUrl";
import { openResource } from "../../lib/openResource";
import { safeDecodeFileName } from "../../lib/safeDecodeFileName";
import { shouldAutoOpenSinglePdfNote } from "../../lib/lessonNoteRouting";

type SheetMode = "closed" | "resolving" | "drawer" | "reader";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lessonId?: string;
  lessonTitle?: string;
  lessonType?: string | null;
  courseId?: string | number;
}

export function LessonAttachmentsSheet({ open, onOpenChange, lessonId, lessonTitle, lessonType }: Props) {
  const { notes, loading, getResolvedUrl } = useLessonNotes(open ? lessonId : undefined);
  const { addDownload } = useDownloads();
  const [viewer, setViewer] = useState<{ url: string; title: string; note?: LessonNote } | null>(null);
  const [mode, setMode] = useState<SheetMode>("closed");
  const didAutoOpenRef = useRef(false);
  const isMountedRef = useRef(true);
  const requestSeqRef = useRef(0);
  useEffect(() => () => { isMountedRef.current = false; }, []);

  // Each lesson/open cycle gets its own token so late async URL resolutions
  // cannot reopen stale drawers or mount a reader after the student backs out.
  useEffect(() => {
    requestSeqRef.current += 1;
    if (!open) {
      didAutoOpenRef.current = false;
      if (!viewer) setMode("closed");
      return;
    }
    didAutoOpenRef.current = false;
    setMode("resolving");
  }, [open, lessonId, viewer]);

  const releaseDrawer = useCallback((nextOpen: boolean) => {
    if (!nextOpen) {
      requestSeqRef.current += 1;
      didAutoOpenRef.current = false;
      if (!viewer) setMode("closed");
    } else {
      setMode("drawer");
    }
    onOpenChange(nextOpen);
  }, [onOpenChange, viewer]);

  const handleOpenPdf = useCallback(async (url: string, fileName: string, note?: LessonNote) => {
    if (!url) return;
    const seq = requestSeqRef.current;
    setMode("resolving");
    let resolved = url;
    if (!url.startsWith("http") && note) {
      const r = await getResolvedUrl(note);
      if (r) resolved = r;
    }
    if (!isMountedRef.current || seq !== requestSeqRef.current) return;
    const decodedName = safeDecodeFileName(fileName) || safeDecodeFileName(lessonTitle) || "Document";
    setViewer({ url: resolved, title: decodedName, note });
    setMode("reader");
    onOpenChange(false);
  }, [getResolvedUrl, lessonTitle, onOpenChange]);

  // Auto-open only for true standalone document lessons (PDF / NOTES / DPP)
  // that resolve to one PDF. Video lessons with attached notes must show the
  // picker drawer, even when the first response contains a single PDF.
  useEffect(() => {
    if (!open || didAutoOpenRef.current) return;
    if (loading && notes.length === 0) {
      setMode("resolving");
      return;
    }

    if (!shouldAutoOpenSinglePdfNote(lessonType, notes)) {
      setMode("drawer");
      return;
    }

    const only = notes[0];
    didAutoOpenRef.current = true;
    const seq = requestSeqRef.current;
    setMode("resolving");
    void (async () => {
      const resolved = (await getResolvedUrl(only)) || only.file_url;
      if (!isMountedRef.current || seq !== requestSeqRef.current) return;
      const decodedName =
        safeDecodeFileName(only.file_name) ||
        safeDecodeFileName(only.title) ||
        safeDecodeFileName(lessonTitle) ||
        "Document";
      setViewer({ url: resolved, title: decodedName, note: only });
      setMode("reader");
      // Silently release the sheet state. The drawer never mounted, so there is
      // no close animation or bottom-sheet frame in the single-PDF path.
      onOpenChange(false);
    })();
  }, [open, loading, notes, lessonType, getResolvedUrl, lessonTitle, onOpenChange]);

  const handleDownload = useCallback(async (note: LessonNote) => {
    const url = await getResolvedUrl(note);
    if (!url) { toast.error("Could not get file URL"); return; }
    let effectiveUrl = url;
    let filename = note.file_name || note.title || "document";
    if (isGoogleDrive(url)) {
      const proxied = googleDrivePdfProxyUrl(url);
      if (proxied) {
        effectiveUrl = proxied;
        if (!/\.[a-z0-9]{2,5}$/i.test(filename)) filename = `${filename}.pdf`;
        try {
          await addDownload(note.title || filename, effectiveUrl, filename, "PDF");
        } catch (err) {
          toast.error("Download failed: " + (err instanceof Error ? err.message : String(err)));
        }
        return;
      }
    }
    if (isNotion(url) || isGoogleDocs(url)) {
      await openResource({ url, kind: "link" });
      return;
    }
    const hasExt = /\.[a-z0-9]{2,5}$/i.test(filename);
    if (!hasExt && note.kind === "pdf") filename = `${filename}.pdf`;
    try {
      await addDownload(note.title || note.file_name, effectiveUrl, filename, note.kind.toUpperCase());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Download failed: " + msg);
    }
  }, [addDownload, getResolvedUrl]);

  const drawerOpen = open && !viewer && mode === "drawer";
  const closeReader = useCallback(() => {
    requestSeqRef.current += 1;
    setViewer(null);
    setMode("closed");
  }, []);

  return (
    <>
      {!viewer && (
        <Drawer
          open={drawerOpen}
          onOpenChange={releaseDrawer}
          shouldScaleBackground={false}
        >
        <DrawerContent className="max-h-[75vh] overflow-hidden shadow-2xl">
          <div className="px-4 pt-1 pb-2 border-b border-border/60 text-left flex items-center justify-between gap-3">
            <div className="min-w-0">
              <DrawerTitle className="text-[15px] font-semibold leading-5 truncate">
                {lessonTitle || "Notes"}
              </DrawerTitle>
              <DrawerDescription className="text-[11px] text-muted-foreground mt-0.5 leading-4">
                Notes &amp; downloadable files
              </DrawerDescription>
            </div>
            {notes.length > 0 && (
              <span className="shrink-0 inline-flex items-center h-6 px-2 rounded-full bg-muted text-[11px] font-medium text-muted-foreground tabular-nums">
                {notes.length} {notes.length === 1 ? "file" : "files"}
              </span>
            )}
          </div>

          <div
            className="flex-1 overflow-y-auto overscroll-contain px-3 py-2 [overflow-anchor:none] [scroll-behavior:smooth] [-webkit-overflow-scrolling:touch]"
            data-vaul-no-drag
          >
            {loading && notes.length === 0 ? (
              <div className="space-y-1.5" aria-hidden>
                {[0, 1].map((i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 rounded-xl border border-border/50 bg-muted/20 px-2.5 py-2"
                  >
                    <Skeleton className="h-11 w-11 rounded-lg" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-2/3" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                    <Skeleton className="h-9 w-9 rounded-md" />
                  </div>
                ))}
              </div>
            ) : notes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-muted to-muted/40 flex items-center justify-center mb-3">
                  <FileText className="h-6 w-6 text-muted-foreground/60" />
                </div>
                <p className="text-sm font-medium text-foreground">No notes yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Notes &amp; files for this lesson will appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {notes.map((note) => (
                  <div
                    key={note.id}
                    className="flex items-center gap-1.5 rounded-xl active:bg-accent/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <AttachmentRow
                        attachment={note as any}
                        onOpenPdf={(url, fileName) => void handleOpenPdf(url, fileName, note)}
                        resolveUrl={() => getResolvedUrl(note)}
                        variant="compact"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDownload(note)}
                      aria-label={`Download ${note.file_name}`}
                      className="shrink-0 h-9 w-9 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground active:scale-95 transition-all"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DrawerContent>
        </Drawer>
      )}

      {viewer && (
        <DocReaderShell
          url={viewer.url}
          title={viewer.title}
          filename={safeDecodeFileName(viewer.note?.file_name) || viewer.title}
          itemId={viewer.note?.id ? `att_${viewer.note.id}` : undefined}
          source="attachment"
          onBack={closeReader}
          onDownloaded={() => viewer.note && handleDownload(viewer.note)}
        />
      )}
    </>
  );
}

export default LessonAttachmentsSheet;
