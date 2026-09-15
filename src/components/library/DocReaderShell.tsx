import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, BookMarked, BookOpen, Download, Loader2, Maximize2, Minimize2, NotebookPen, X } from "lucide-react";
import RotatePhoneIcon from "../icons/RotatePhoneIcon";
import { Button } from "../ui/button";
import PdfViewer, { type PdfViewerHandle } from "../video/PdfViewer";
import { useLessonFeatureFlag } from "@/hooks/useLessonFeatureFlags";
import AutoScrollFab from "../viewer/AutoScrollFab";
import NotesPanel from "./reader/NotesPanel";
import { Sheet, SheetContent, SheetTitle } from "../ui/sheet";
import { useIsMobile } from "../../hooks/use-mobile";
import { downloadFile } from "../../utils/fileUtils";
import { SpokeSpinner } from "../ui/spoke-spinner";
import { getReadingPage, setReadingPage } from "../../services/libraryNotes";
import { addBreadcrumb } from "../../lib/sentry";
import { toast } from "sonner";
import { addUrlToDefaultLibrary } from "../../services/personalLibrary";
import { lockOrientation, unlockOrientation } from "../../lib/screenOrientation";
import { tapHaptic, selectionHaptic } from "../../lib/native/haptics";
import { hideStatusBar, showStatusBar } from "../../lib/nativeChrome";
import { enterImmersive, exitImmersive } from "../../lib/androidImmersive";
import { beginSyntheticPop, isSyntheticPop } from "../../lib/reader/overlayHistory";

interface Props {
  url: string;
  title: string;
  filename?: string;
  onBack: () => void;
  hideDownload?: boolean;
  onDownloaded?: () => void;
  /** Stable id used to persist reading position + notes. Enables the Notes panel. */
  itemId?: string;
  /** Where this PDF came from (telemetry). */
  source?: "library" | "downloads" | "attachment" | "other";
  /** Resolve a [[wikilink]] note name to a new doc to open. */
  onOpenLink?: (name: string) => void;
}

export default function DocReaderShell({
  url, title, filename, onBack, hideDownload, onDownloaded, itemId, source = "other", onOpenLink,
}: Props) {
  const readerAutoScrollEnabled = useLessonFeatureFlag("readerAutoScroll");
  const [headerVisible, setHeaderVisible] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloadPercent, setDownloadPercent] = useState<number>(0);
  const [savingLibrary, setSavingLibrary] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [readingMode, setReadingMode] = useState(false);
  // Full-page mode: PDF fills the screen edge-to-edge, chrome stays out of the way.
  const [fullPage, setFullPage] = useState(false);
  const [landscape, setLandscape] = useState(false);
  const [autoActive, setAutoActive] = useState(false);
  const isMobile = useIsMobile();
  const [initialPage, setInitialPage] = useState<number | undefined>(undefined);
  const idleTimer = useRef<number | null>(null);
  const pageTimer = useRef<number | null>(null);
  const viewerRef = useRef<PdfViewerHandle>(null);
  const scrollElRef = useRef<HTMLElement | null>(null);
  const iframeElRef = useRef<HTMLIFrameElement | null>(null);
  const downloadAbortRef = useRef<AbortController | null>(null);

  // Android hardware-back sentinel: push a history entry on open so the
  // global useAndroidBackButton hook pops us via popstate instead of
  // navigating the enclosing route (Library/Downloads/etc.).
  useEffect(() => {
    try { window.history.pushState({ pdfFullscreen: true }, ""); } catch {}
    const onPop = () => {
      // Nested overlays (autoscroll sheet) pop their own sentinel when they
      // close — ignore those so the PDF stays open.
      if (isSyntheticPop()) return;
      // Belt-and-braces: our own sentinel is still the top entry, so whatever
      // just popped belonged to a nested overlay (autoscroll sheet "Done").
      // The timing flag above can expire on slow Android WebViews.
      if (window.history.state?.pdfFullscreen) return;
      try { onBack(); } catch {}
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (window.history.state?.pdfFullscreen) {
        try { beginSyntheticPop(); window.history.back(); } catch {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hide the global bottom tab bar while the PDF viewer is open.
  // GlobalBottomNav watches this body attribute via MutationObserver.
  useEffect(() => {
    document.body.setAttribute("data-reader-open", "true");
    return () => {
      document.body.removeAttribute("data-reader-open");
    };
  }, []);

  // Kill the white status-bar strip on Android while the reader is open.
  // Matches the video-player behaviour (see useVideoStatusBarHide). Web is
  // a no-op; always restore on unmount so navigating away can never leave
  // the app in hidden-chrome state.
  useEffect(() => {
    void hideStatusBar();
    enterImmersive();
    return () => {
      void showStatusBar();
      exitImmersive();
    };
  }, []);

  const scheduleHide = () => {
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setHeaderVisible(false), 2500);
  };

  // Telemetry + restore saved reading position.
  useEffect(() => {
    addBreadcrumb("pdf", "open", { source, offline: /^(capacitor:|file:|blob:)/i.test(url), itemId });
    if (itemId) {
      getReadingPage(itemId).then((p) => setInitialPage(p > 1 ? p : undefined));
    }
  }, [url, itemId, source]);

  useEffect(() => {
    scheduleHide();
    return () => { if (idleTimer.current) window.clearTimeout(idleTimer.current); };
     
  }, [url]);

  // Release orientation lock on unmount only if we actually locked it.
  const landscapeRef = useRef(false);
  useEffect(() => { landscapeRef.current = landscape; }, [landscape]);
  useEffect(() => () => { if (landscapeRef.current) unlockOrientation().catch(() => {}); }, []);

  // Abort any in-flight download on unmount / back so the fetch stops
  // burning bandwidth after the reader closes.
  useEffect(() => () => {
    try { downloadAbortRef.current?.abort(); } catch { /* ignore */ }
  }, []);

  // Refresh refs as soon as the viewer reports readiness. Replaces the
  // earlier 150ms-interval poll: onReady is fired by PdfViewer after the
  // FastPdfReader scrollEl mounts OR after the fallback iframe `load` event,
  // so AutoScroll attaches to the right element on the first try.
  const refreshRefs = useCallback(() => {
    scrollElRef.current = viewerRef.current?.getScrollEl() ?? null;
    iframeElRef.current = viewerRef.current?.getIframeEl() ?? null;
  }, []);
  useEffect(() => {
    refreshRefs();
  }, [url, refreshRefs]);

  const handlePageChange = useCallback(
    (page: number) => {
      if (!itemId) return;
      if (pageTimer.current) window.clearTimeout(pageTimer.current);
      pageTimer.current = window.setTimeout(() => setReadingPage(itemId, page), 500);
    },
    [itemId]
  );

  const handleSurfaceTap = () => {
    // Single tap reveals/hides chrome + FABs (rotate, autoscroll, save).
    // Works in reading mode too so users can quickly access controls without
    // exiting reading mode.
    setHeaderVisible((v) => {
      const next = !v;
      if (next) scheduleHide();
      return next;
    });
  };

  const toggleReadingMode = (e: React.MouseEvent) => {
    e.stopPropagation();
    setReadingMode((v) => {
      const next = !v;
      if (next) {
        setHeaderVisible(false);
        if (idleTimer.current) window.clearTimeout(idleTimer.current);
      } else {
        setHeaderVisible(true);
        scheduleHide();
      }
      return next;
    });
  };

  const handleSave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (saving) return;
    const controller = new AbortController();
    downloadAbortRef.current = controller;
    setSaving(true);
    setDownloadPercent(0);
    const t = toast.loading("Saving to device…");
    const baseName = filename || title || "document";
    const safeName = /\.[a-z0-9]{2,5}$/i.test(baseName) ? baseName : `${baseName}.pdf`;
    try {
      await downloadFile(
        url,
        safeName,
        ({ percent }) => setDownloadPercent(percent),
        controller.signal,
      );
      if (controller.signal.aborted) { toast.dismiss(t); return; }
      toast.success("Saved", { id: t });
      onDownloaded?.();
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") { toast.dismiss(t); }
      else {
        // Never leave the tap with nothing happening — hand the file off to the
        // system browser / download manager as a last resort.
        try {
          const { openResource } = await import("../../lib/openResource");
          await openResource({ url, kind: "link" });
          toast.success("Opening file…", { id: t });
        } catch {
          toast.error((err as Error)?.message || "Save failed — check your connection.", { id: t });
        }
      }
    } finally {
      setSaving(false);
      setDownloadPercent(0);
      if (downloadAbortRef.current === controller) downloadAbortRef.current = null;
    }
  };


  const handleAddToLibrary = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (savingLibrary) return;
    setSavingLibrary(true);
    const t = toast.loading("Adding to My Library…");
    try {
      await addUrlToDefaultLibrary(url, filename || title);
      toast.success("Added to My Library · folder \"Saved PDFs\"", { id: t });
      try { window.dispatchEvent(new Event("personalLibrary:refresh")); } catch { /* ignore */ }
      onDownloaded?.();
    } catch (err) {
      toast.error((err as Error)?.message || "Could not add to My Library", { id: t });
    } finally {
      setSavingLibrary(false);
    }
  };

  // Show "Add to My Library" anywhere except when the doc is already a Library item.
  const showAddToLibrary = source !== "library";

  return (
    <div className="fixed inset-0 z-[60] flex bg-background motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150" data-testid="doc-reader-shell">
      {/* Center column */}
      <div className="relative flex min-w-0 flex-1 flex-col" onClick={handleSurfaceTap}>
        <header
          className={`safe-area-top absolute left-0 right-0 top-0 z-30 flex min-h-[48px] items-center gap-2 border-b bg-card/95 px-3 shadow-sm backdrop-blur transition-transform duration-300 ${
            headerVisible ? "translate-y-0" : "-translate-y-full"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={() => { void selectionHaptic(); onBack(); }}
            aria-label="Back"
            className="h-11 w-11 active:scale-[0.94] transition-transform duration-150 ease-out"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</h1>
          {showAddToLibrary && (
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => { void tapHaptic("light"); handleAddToLibrary(e); }}
              disabled={savingLibrary}
              aria-label="Add to My Library"
              title="Add to My Library"
              className="h-11 w-11 active:scale-[0.94] transition-transform duration-150 ease-out"
            >
              {savingLibrary ? <Loader2 className="h-5 w-5 animate-spin" /> : <BookMarked className="h-5 w-5" />}
            </Button>
          )}
          {itemId && (
            <Button
              variant={notesOpen ? "secondary" : "ghost"}
              size="icon"
              onClick={() => { void selectionHaptic(); setNotesOpen((v) => !v); }}
              aria-label="Toggle notes"
              className="h-11 w-11 active:scale-[0.94] transition-transform duration-150 ease-out"
            >
              <NotebookPen className="h-5 w-5" />
            </Button>
          )}
          <Button
            variant={fullPage ? "secondary" : "ghost"}
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              void selectionHaptic();
              setFullPage((v) => {
                const next = !v;
                if (next) setHeaderVisible(false);
                return next;
              });
            }}
            aria-label={fullPage ? "Exit full page" : "Full page"}
            aria-pressed={fullPage}
            title="Full page"
            className="h-11 w-11 active:scale-[0.94] transition-transform duration-150 ease-out"
          >
            {fullPage ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
          </Button>
          <Button
            variant={readingMode ? "secondary" : "ghost"}
            size="icon"
            onClick={(e) => { void selectionHaptic(); toggleReadingMode(e); }}
            aria-label="Reading mode"
            title="Reading mode (sepia, distraction-free)"
            className="h-11 w-11 active:scale-[0.94] transition-transform duration-150 ease-out"
          >
            <BookOpen className="h-5 w-5" />
          </Button>
        </header>

        {/* Eye-comfort sepia overlay — sits above the PDF, ignores pointer events. */}
        {readingMode && (
          <div
            className="pointer-events-none absolute inset-0 z-20"
            style={{ backgroundColor: "rgba(244, 208, 144, 0.18)", mixBlendMode: "multiply" }}
            aria-hidden="true"
          />
        )}

        {/* In reading mode the only way back to chrome is to tap the page —
            we removed the distracting "Reading" pill. Tap reveals the header
            which contains the BookOpen toggle. */}

        {/* PDF surface — offset only while the floating header is visible so
            the first page never sits under the header/notch. When the header
            auto-hides we collapse fully to top:0 (full-bleed under the status
            bar) — the previous safe-area-inset-top offset left a visible
            ~24–48 px white strip above the PDF on notched devices. */}
        <div
          className="absolute inset-x-0 bottom-0 bg-background transition-[top] duration-300"
          style={{
            top: headerVisible && !fullPage
              ? "calc(env(safe-area-inset-top, 0px) + 48px)"
              : "0px",
          }}
        >
          <PdfViewer
            ref={viewerRef}
            url={url}
            title={title}
            filename={filename || title}
            chromeVisible={false}
            initialPage={initialPage}
            onPageChange={handlePageChange}
            onReady={refreshRefs}
          />
        </div>

        {/* AutoScroll FAB — auto-hides with chrome so the page is distraction-free
            while reading. Stays visible while autoscroll is active so the user
            can hold-to-pause or stop it. */}
        {readerAutoScrollEnabled && (
        <AutoScrollFab
          targetRef={scrollElRef}
          iframeRef={iframeElRef}
          docKey={itemId || url}
          bottomOffset={hideDownload ? 96 : 84}
          visible={headerVisible || autoActive}
          onActiveChange={(a) => {
            setAutoActive(a);
            if (a) setHeaderVisible(false);
          }}
        />
        )}

        {/* Rotate FAB — lightweight SVG only, no black pill background. */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            const next = !landscape;
            setLandscape(next);
            if (next) lockOrientation("landscape"); else unlockOrientation();
            scheduleHide();
          }}
          aria-label={landscape ? "Exit landscape" : "Rotate to landscape"}
          aria-pressed={landscape}
          title="Rotate to landscape"
          style={{ bottom: hideDownload ? "calc(env(safe-area-inset-bottom, 0px) + 20px)" : "calc(env(safe-area-inset-bottom, 0px) + 84px)" }}
          className={`fixed left-4 z-40 p-2 text-foreground transition-all duration-300 active:scale-95 ${headerVisible ? "opacity-100" : "pointer-events-none opacity-0"}`}
        >
          <RotatePhoneIcon className={`h-7 w-7 transition-transform drop-shadow-md ${landscape ? "rotate-90" : ""}`} />
        </button>


        <div
          className={`transition-opacity duration-300 ${
            headerVisible && !readingMode ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          {!hideDownload && (
            <button
              type="button"
            onClick={(e) => { void tapHaptic("light"); handleSave(e); }}
              aria-label="Save to device"
              style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
            className="fixed right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-1 ring-black/10 transition-transform duration-150 ease-out active:scale-[0.94]"
            >
              {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
            </button>
          )}
        </div>

        {/* Download progress overlay — mirrors ReaderProgress styling so
            the user always sees a moving percent + bar while saving. */}
        {saving && (
          <div
            aria-busy="true"
            aria-label={`Saving — ${downloadPercent}%`}
            className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-background/95 backdrop-blur-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <SpokeSpinner />
            <p className="text-sm text-muted-foreground text-center px-6 max-w-xs tabular-nums">
              Saving “{title.length > 40 ? `${title.slice(0, 40)}…` : title}” — {downloadPercent}%
            </p>
            <div className="h-1 w-40 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-[width] duration-300 ease-out"
                style={{ width: `${downloadPercent}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Notes — right panel on desktop, bottom sheet on mobile */}
      {itemId && notesOpen && !isMobile && (
        <aside className="flex w-[320px] shrink-0 flex-col border-l">
          <NotesPanel itemId={itemId} title={title} onOpenLink={onOpenLink} />
        </aside>
      )}
      {itemId && isMobile && (
        <Sheet open={notesOpen} onOpenChange={setNotesOpen}>
          <SheetContent side="bottom" className="h-[70vh] rounded-t-2xl p-0">
            <SheetTitle className="sr-only">Notes</SheetTitle>
            <div className="flex items-center justify-end p-2">
              <Button variant="ghost" size="icon" onClick={() => setNotesOpen(false)} aria-label="Close notes">
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="h-[calc(70vh-48px)]">
              <NotesPanel itemId={itemId} title={title} onOpenLink={onOpenLink} />
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
