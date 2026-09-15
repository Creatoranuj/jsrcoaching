import { memo, useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Maximize2, Minimize2, Download, Bookmark, BookmarkCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { reportError } from "@/lib/sentry";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import PdfViewer from "../video/LazyPdfViewer";
import ReaderProgress from "./ReaderProgress";
import ReaderErrorOverlay from "./ReaderErrorOverlay";

import { usePdfResumePosition } from "../../hooks/usePdfResumePosition";
import { useReaderImmersive } from "../../hooks/useReaderImmersive";

import { useDownloads } from "../../hooks/useDownloads";
import { isDocSaved, toggleDoc } from "../../lib/docLibrary";
import { readerRouteForUrl, traceReader, type ReaderHealthState, type ReaderRoute } from "../../lib/readerDiagnostics";
import { cn } from "../../lib/utils";
import { isGoogleDrive, googleDrivePdfProxyUrl } from "../../lib/pdfViewerUrl";
import { isArchiveSource } from "../../lib/pdfSourceKind";
import { isSyntheticPop } from "../../lib/reader/overlayHistory";



interface DocumentReaderProps {
  title: string;
  subtitle?: string;
  badge?: string;
  url: string;
  onBack: () => void;
  /** Optional stable id used to persist last-page across re-opens. */
  lessonId?: string | null;
}

const HIDE_AFTER_MS = 5000;
const ERROR_TIMEOUT_MS = 25000;
// archive.org serves very large scanned books from throttled CDN nodes; 25 s
// is a legitimate download window there, so this source gets a longer leash.
const ARCHIVE_ERROR_TIMEOUT_MS = 90000;

/**
 * Immersive document reader for PDF / DPP / Notes.
 *
 * UX:
 *  - No bottom Prev/Next bar.
 *  - Top header auto-hides after 3s; tap top edge or swipe down to reveal.
 *  - Fullscreen toggle for a true cinema mode.
 *  - Loading skeleton + error overlay with Retry / Open-externally.
 *  - Last-viewed page is restored when the lesson is re-opened.
 */
const DocumentReader = memo(
  ({ title, subtitle, badge, url, onBack, lessonId }: DocumentReaderProps) => {
  const [chromeVisible, setChromeVisible] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Hide the Android/Capacitor status bar whenever the reader is open.
    // When the user toggles cinema (chrome-less) mode, also hide the nav bar.
    useReaderImmersive(true, isFullscreen);

    const [showSkeleton, setShowSkeleton] = useState(true);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [retryNonce, setRetryNonce] = useState(0);
    const route = readerRouteForUrl(url);
    const [health, setHealth] = useState<{ state: ReaderHealthState; route: ReaderRoute; lastEvent: string }>(() => ({
      state: "loading",
      route,
      lastEvent: "mount",
    }));


    const docId = lessonId || url;
    const [saved, setSaved] = useState<boolean>(() => isDocSaved(docId));
    const [downloading, setDownloading] = useState(false);
    // Route downloads through the same indexer the inline reader uses so the
    // file (a) lands in the app-private filesystem on APK and (b) appears on
    // the /downloads page. `downloadDocument` only wrote to Documents/ — the
    // Downloads tab never saw it, which is the "PDF Downloads page pe nahi
    // dikhta" bug reported 2026-07-11.
    const { addDownload } = useDownloads();


    const rootRef = useRef<HTMLDivElement>(null);
    const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const skeletonTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const watchdogRetryCountRef = useRef(0);
    const lastProgressHealthRef = useRef<{ percent: number; at: number }>({ percent: -999, at: 0 });
    const readerHistoryPoppedRef = useRef(false);
    const readerHistoryTokenRef = useRef<string | null>(null);
    // Archive.org-only: longer stuck-load window. Every other source keeps 25 s.
    const loadTimeoutMs = isArchiveSource(url) ? ARCHIVE_ERROR_TIMEOUT_MS : ERROR_TIMEOUT_MS;

    const { initialPage, savePage } = usePdfResumePosition({ lessonId, url });

    // ── Chrome auto-hide ────────────────────────────────────────────────────
    const clearHide = useCallback(() => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    }, []);

    const scheduleHide = useCallback(() => {
      clearHide();
      const ms = isFullscreen ? 1500 : HIDE_AFTER_MS;
      hideTimerRef.current = setTimeout(() => setChromeVisible(false), ms);
    }, [clearHide, isFullscreen]);

    const showChrome = useCallback(() => {
      setChromeVisible(true);
      scheduleHide();
    }, [scheduleHide]);

    const hideChrome = useCallback(() => {
      clearHide();
      setChromeVisible(false);
    }, [clearHide]);

    useEffect(() => {
      scheduleHide();
      return clearHide;
    }, [scheduleHide, clearHide]);

    // Android / browser hardware-back support for the DocumentReader.
    // Push a `pdfFullscreen` sentinel onto history so `useAndroidBackButton`
    // recognises the reader as an overlay (step1-overlay-pop). Hardware back
    // pops the sentinel; the resulting popstate closes the reader.
    //
    // IMPORTANT: cleanup must never call `history.back()`. React 18 StrictMode
    // intentionally mounts → cleans up → re-mounts effects in dev/preview; the
    // old cleanup popped history during that fake cleanup, instantly navigating
    // away from standalone PDF/DPP lessons and aborting pdf.js. Users then saw
    // an infinite spinner / AbortError / "render-ready signal" timeout. Cleanup
    // now only neutralizes the top sentinel with replaceState when it still owns
    // it, so native Capacitor back still works without route side-effects.
    useEffect(() => {
      readerHistoryPoppedRef.current = false;
      const token = `reader:${Date.now()}:${Math.random().toString(36).slice(2)}`;
      readerHistoryTokenRef.current = token;
      try {
        window.history.pushState({ ...(window.history.state || {}), pdfFullscreen: true, overlay: true, readerToken: token }, "");
      } catch {}
      const onPop = () => {
        // Nested overlay closing itself (autoscroll sheet "Done", notes sheet)
        // fires a synthetic pop — it must not close the reader.
        if (isSyntheticPop()) return;
        // Our sentinel is still on top → the pop came from a nested overlay
        // (autoscroll sheet "Done", notes sheet), never a real back press.
        if (window.history.state?.readerToken === token) return;
        if (readerHistoryPoppedRef.current) return;
        readerHistoryPoppedRef.current = true;
        onBack();
      };
      window.addEventListener("popstate", onPop);
      // Hide the global bottom tab bar while the reader covers the screen.
      // GlobalBottomNav already hides on `/classes/:id/lessons`, but the
      // reader is reachable from other routes (downloads/library) where the
      // nav was still visible behind the fixed reader. A body flag is the
      // most reliable signal — independent of route.
      document.body.setAttribute("data-reader-open", "true");
      return () => {
        window.removeEventListener("popstate", onPop);
        document.body.removeAttribute("data-reader-open");
        try {
          const state = window.history.state || {};
          if (state?.pdfFullscreen && state?.readerToken === token) {
            const { pdfFullscreen: _pdfFullscreen, overlay: _overlay, readerToken: _readerToken, ...rest } = state;
            void _pdfFullscreen;
            void _overlay;
            void _readerToken;
            window.history.replaceState({ ...rest, pdfFullscreen: false, overlay: false }, "");
          }
        } catch {}
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);



    // Custom viewer hosts (JSR COACHING Storage, GitHub-Storages CDN) render
    // their own PDF viewer page inside the iframe → they never dispatch our
    // `pdf-first-byte` / `pdf-ready` events. Without this guard the 25-s
    // error timeout always fires and shows "Still loading… the file may be
    // unavailable." on a perfectly rendered document.
    const isSelfHostedViewer = /(?:storage-safarenglishka-recording|github-storages-cdn)\.vercel\.app/i.test(url);

    const updateHealth = useCallback((state: ReaderHealthState, event: string, detail?: Record<string, unknown>) => {
      traceReader(route, state, event, { title, retryNonce, ...detail });
      setHealth({ state, route, lastEvent: event });
    }, [retryNonce, route, title]);

    const scheduleLoadTimeout = useCallback(
      (ms: number, message = "Still loading… the file may be unavailable.") => {
        if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
        if (isSelfHostedViewer) return;
        errorTimerRef.current = setTimeout(() => {
          updateHealth("timeout", "error-timeout", { ms });
          setErrorMsg(message);
          // Breadcrumb for triage: which URL stalled past the error window.
          import("@/lib/sentry")
            .then(({ addBreadcrumb }) =>
              addBreadcrumb("reader", "load-timeout", {
                url: url.slice(0, 200),
                ms,
              }),
            )
            .catch(() => {});
        }, ms);
      },
      [isSelfHostedViewer, updateHealth, url],
    );

    // ── Progress overlay lifecycle + error timeout ─────────────────────────
    // We no longer fade the placeholder after a fixed 900ms. The new
    // `ReaderProgress` overlay stays up until a real `pdf-ready` event fires
    // (iframe onLoad for Drive/Docs, pdf.js onLoadSuccess for canvas PDFs)
    // or `pdf-progress` reports ≥99%. This kills the "blank white screen"
    // window between skeleton-fade and first byte on slow networks.
    useEffect(() => {
      setShowSkeleton(true);
      setErrorMsg(null);
      if (retryNonce === 0) watchdogRetryCountRef.current = 0;
      updateHealth("loading", "reader-mount", { url: url.slice(0, 160) });
      if (skeletonTimerRef.current) clearTimeout(skeletonTimerRef.current);
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      scheduleLoadTimeout(loadTimeoutMs);
      return () => {
        updateHealth("unmounted", "reader-unmount");
        setShowSkeleton(false);
        if (skeletonTimerRef.current) clearTimeout(skeletonTimerRef.current);
        if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      };
    }, [loadTimeoutMs, retryNonce, route, scheduleLoadTimeout, updateHealth, url]);



    /** Called on `pdf-ready`: first page canvas has actually painted. */
    const markPdfProgress = useCallback(() => {
      if (errorTimerRef.current) {
        clearTimeout(errorTimerRef.current);
        errorTimerRef.current = null;
      }
      if (errorMsg) setErrorMsg(null);
      updateHealth("ready", "pdf-ready");
      // Let the 100% state paint briefly instead of making the document appear
      // while the bar is visibly incomplete.
      if (skeletonTimerRef.current) clearTimeout(skeletonTimerRef.current);
      skeletonTimerRef.current = setTimeout(() => setShowSkeleton(false), 220);
    }, [errorMsg, updateHealth]);

    /** Called on `pdf-first-byte`: only resets the stuck-load error timer.
     *  The overlay stays visible so the user keeps seeing progress %. */
    const markFirstByte = useCallback(() => {
      updateHealth("first-byte", "pdf-first-byte");
      scheduleLoadTimeout(loadTimeoutMs, "Still rendering… the file may be too large or unavailable.");
      if (errorMsg) setErrorMsg(null);
    }, [errorMsg, loadTimeoutMs, scheduleLoadTimeout, updateHealth]);


    // Cancel error-timeout if bytes arrive or window emits a generic ready.
    // Cancel error-timeout + hide overlay on real ready/error events.
    // We intentionally do NOT hide on `pdf-first-byte` — that fires when the
    // first network byte arrives (often at 1-5%), which used to flash a blank
    // canvas while pdf.js was still decoding the file. ReaderProgress reacts
    // to `pdf-progress` internally for the determinate bar; only `pdf-ready`
    // unmounts the overlay.
    useEffect(() => {
      const onReady = () => markPdfProgress();
      const onFirstByte = () => markFirstByte();
      const onProgress = (e: Event) => {
        const raw = (e as CustomEvent<{ percent?: number }>).detail?.percent;
        const percent = typeof raw === "number" ? raw : -1;
        const now = Date.now();
        const last = lastProgressHealthRef.current;
        // As long as bytes keep arriving, extend the error timeout. Large Drive
        // PDFs streamed through pdf-proxy (Accept-Ranges: none) often need
        // >25 s to finish downloading after first-byte; without this reset the
        // reader falsely reports "too large or unavailable" mid-download.
        // `-1` is the indeterminate heartbeat: it still proves the stream is
        // alive, so it must extend the timeout too. Without this, sources that
        // can't report a byte total (large archive.org scans) hit the 25 s
        // error even while downloading normally.
        if (percent === -1 || percent > (last.percent < 0 ? -1 : last.percent - 5)) {
          scheduleLoadTimeout(loadTimeoutMs, "Still rendering… the file may be too large or unavailable.");
        }
        if (Math.abs(percent - last.percent) < 5 && now - last.at < 1000) return;
        lastProgressHealthRef.current = { percent, at: now };
        updateHealth("loading", "pdf-progress", { percent });
      };
      const onProxy = (e: Event) => {
        updateHealth("loading", "pdf-proxy", (e as CustomEvent<Record<string, unknown>>).detail);
      };
      const onErr = (e: Event) => {
        const detail = (e as CustomEvent).detail;
        updateHealth("error", "pdf-error", { detail });
        setErrorMsg(typeof detail === "string" ? detail : "The document failed to load.");
      };
      window.addEventListener("pdf-ready", onReady);
      window.addEventListener("pdf-first-byte", onFirstByte);
      window.addEventListener("pdf-progress", onProgress as EventListener);
      window.addEventListener("pdf-proxy", onProxy as EventListener);
      window.addEventListener("pdf-error", onErr as EventListener);
      return () => {
        window.removeEventListener("pdf-ready", onReady);
        window.removeEventListener("pdf-first-byte", onFirstByte);
        window.removeEventListener("pdf-progress", onProgress as EventListener);
        window.removeEventListener("pdf-proxy", onProxy as EventListener);
        window.removeEventListener("pdf-error", onErr as EventListener);
      };
    }, [loadTimeoutMs, markFirstByte, markPdfProgress, scheduleLoadTimeout, updateHealth]);


    // ── Fullscreen (CSS-based; no Fullscreen API) ───────────────────────────
    // Android WebView + some Firefox mobile builds CRASH the renderer when
    // `element.requestFullscreen()` is invoked on a container that already
    // uses `position: fixed; inset: 0` (which DocumentReader always does).
    // The reader is effectively fullscreen already, so "fullscreen" here is
    // an immersive-mode toggle: hide chrome + go edge-to-edge, no native
    // Fullscreen API involved. Keeps the icon working on every platform
    // and eliminates the crash reported on the notes/PDF page.
    useEffect(() => {
      // Kept for browsers that emit the event via user-agent shortcuts.
      const onChange = () => {
        if (typeof document !== "undefined" && !document.fullscreenElement) {
          setIsFullscreen(false);
        }
      };
      document.addEventListener("fullscreenchange", onChange);
      return () => document.removeEventListener("fullscreenchange", onChange);
    }, []);

    const toggleFullscreen = useCallback(() => {
      setIsFullscreen((prev) => {
        const next = !prev;
        // When entering immersive mode, hide chrome immediately.
        if (next) setChromeVisible(false);
        else setChromeVisible(true);
        return next;
      });
    }, []);

    // ── Swipe gestures (vertical only; horizontal needs 2 fingers) ──────────
    useEffect(() => {
      const el = rootRef.current;
      if (!el) return;
      let startX = 0;
      let startY = 0;
      let startT = 0;
      let touchCount = 0;

      const onStart = (e: TouchEvent) => {
        if (e.touches.length > 2) return;
        touchCount = e.touches.length;
        const t = e.touches[0];
        startX = t.clientX;
        startY = t.clientY;
        startT = Date.now();
      };
      const onEnd = (e: TouchEvent) => {
        if (touchCount === 0) return;
        const t = e.changedTouches[0];
        if (!t) return;
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;
        const dt = Date.now() - startT;
        if (dt > 600) return;
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);
        // Tap (single finger, minimal movement): toggle chrome and reset 3s timer.
        if (touchCount === 1 && absX < 10 && absY < 10 && dt < 300) {
          if (chromeVisible) hideChrome();
          else showChrome();
          return;
        }
        // Vertical swipe (single finger): reveal/hide chrome.
        if (touchCount === 1 && absY > 40 && absY > absX * 1.5) {
          if (dy > 0 && startY < 120) showChrome();
          else if (dy < 0 && chromeVisible) hideChrome();
        }
      };

      el.addEventListener("touchstart", onStart, { passive: true });
      el.addEventListener("touchend", onEnd, { passive: true });
      return () => {
        el.removeEventListener("touchstart", onStart);
        el.removeEventListener("touchend", onEnd);
      };
    }, [chromeVisible, showChrome, hideChrome]);

    // ── Retry ───────────────────────────────────────────────────────────────
    const closeReader = useCallback(() => {
      // Best-effort exit if a browser somehow put us in native fullscreen
      // (Android chrome shortcut, etc.). Wrapped defensively — never throws.
      try {
        if (typeof document !== "undefined" && document.fullscreenElement) {
          document.exitFullscreen?.().catch(() => {});
        }
      } catch { /* noop */ }
      // Unify header, floating arrow, browser back, and Capacitor hardware back:
      // pop the reader sentinel first, then let the popstate listener call
      // `onBack`. Calling `onBack` directly while the sentinel is still on top
      // makes cleanup issue a second async `history.back()`, which can leave the
      // parent screen briefly blank on Android WebView.
      if (window.history.state?.pdfFullscreen) {
        readerHistoryPoppedRef.current = true;
        window.history.back();
        onBack();
        return;
      }
      onBack();
    }, [onBack]);

    const handleRetry = useCallback(() => {
      updateHealth("retrying", "manual-retry");
      setErrorMsg(null);
      setRetryNonce((n) => n + 1);
    }, [updateHealth]);

    // Intentionally no external-open escape hatch — all documents stay
    // inside the in-app viewer to preserve back-button + lifecycle behavior.

    // ── Download + Save to library ─────────────────────────────────────────
    const handleDownload = useCallback(async (e: React.MouseEvent) => {
      e.stopPropagation();
      showChrome();
      if (downloading || !url) return;
      setDownloading(true);
      try {
        // Derive a sensible filename from the URL path, falling back to title.
        const inferredName = (() => {
          try {
            const pathTail = new URL(url, window.location.href).pathname.split("/").pop() || "";
            if (pathTail && /\.[a-z0-9]+$/i.test(pathTail)) return decodeURIComponent(pathTail);
          } catch { /* opaque URL — fall through */ }
          const safe = (title || "document").replace(/[\\/:*?"<>|]+/g, "_");
          return /\.[a-z0-9]+$/i.test(safe) ? safe : `${safe}.pdf`;
        })();
        const kind: "PDF" | "NOTES" | "DPP" | "MD" = (() => {
          const b = (badge || "").toUpperCase();
          if (b === "NOTES") return "NOTES";
          if (b === "DPP" || b === "DPP_ATTEMPT") return "DPP";
          if (/\.(md|markdown)(\?|#|$)/i.test(url)) return "MD";
          return "PDF";
        })();
        // Google Drive URLs are HTML wrappers, not the raw file — saving
        // them via addDownload would land a bogus .html blob on disk.
        // Route through pdf-proxy so we stream the actual PDF bytes.
        let effectiveUrl = url;
        let effectiveName = inferredName;
        if (isGoogleDrive(url)) {
          const proxied = googleDrivePdfProxyUrl(url);
          if (proxied) {
            effectiveUrl = proxied;
            if (!/\.[a-z0-9]{2,5}$/i.test(effectiveName)) effectiveName = `${effectiveName}.pdf`;
          }
        }
        await addDownload(title || effectiveName, effectiveUrl, effectiveName, kind);
      } catch (err) {
        reportError(err, { surface: "DocumentReader.download" });
        toast.error("Download failed. Please retry when online.");
      } finally {
        setDownloading(false);
      }
    }, [url, title, badge, downloading, showChrome, addDownload]);

    const handleToggleSave = useCallback((e: React.MouseEvent) => {
      e.stopPropagation();
      showChrome();
      const nowSaved = toggleDoc({ id: docId, title, subtitle, badge, url });
      setSaved(nowSaved);
      toast.success(nowSaved ? "Saved to Library" : "Removed from Library", {
        id: "doc-library-toggle",
        duration: 1500,
      });
    }, [docId, title, subtitle, badge, url, showChrome]);

    // Product decision (Jun 2026): Notes / DPP / Attachments / Notion pages MUST
    // open inside the app — no native browser handoff, no Custom Tabs, no
    // external app. `PdfViewer` handles every URL family in-app:
    //   • Notion → `NotionPageRenderer` (react-notion-x via edge proxy)
    //   • Drive → pdf-proxy + FastPdfReader, Docs → iframe `/preview`
    //   • Everything else (PDF) → `FastPdfReader` (fetch-as-blob + pdf.js)
    // The header back button below works in all three branches, so full-page
    // Notion pages now exit cleanly via the same control as PDFs.
    const badgeLabel = (badge || "").toUpperCase();
    void badgeLabel;






    return (
      <div
        ref={rootRef}
        className="fixed inset-0 bg-background flex flex-col overflow-hidden"
      >
        {/* Auto-hiding header */}
        <header
          onClick={showChrome}
          className={cn(
            "absolute top-0 left-0 right-0 z-30 bg-card/95 backdrop-blur border-b",
            "flex items-center gap-2 px-3 py-3 shadow-sm safe-area-top",
            "transition-transform duration-300 ease-out will-change-transform",
            chromeVisible ? "translate-y-0" : "-translate-y-full"
          )}
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              closeReader();
            }}
            aria-label="Go back"
            className="min-h-[44px] min-w-[44px]"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-foreground line-clamp-1">{title}</h1>
            {subtitle && (
              <p className="text-xs text-muted-foreground line-clamp-1">{subtitle}</p>
            )}
          </div>
          {badge && (
            <Badge variant="secondary" className="shrink-0 text-[10px]">
              {badge}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleToggleSave}
            aria-label={saved ? "Remove from Library" : "Save to Library"}
            aria-pressed={saved}
            className="min-h-[44px] min-w-[44px]"
          >
            {saved ? (
              <BookmarkCheck className="h-5 w-5 text-primary" />
            ) : (
              <Bookmark className="h-5 w-5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDownload}
            disabled={downloading || !url}
            aria-label="Download document"
            className="min-h-[44px] min-w-[44px]"
          >
            {downloading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Download className="h-5 w-5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              toggleFullscreen();
            }}
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            className="min-h-[44px] min-w-[44px]"
          >
            {isFullscreen ? (
              <Minimize2 className="h-5 w-5" />
            ) : (
              <Maximize2 className="h-5 w-5" />
            )}
          </Button>

        </header>

        {/* Full-bleed document.
            We deliberately do NOT pad top by the header height: the header
            is an overlay (absolute, auto-hides in 5s) and padding-top on a
            `relative` parent of `absolute inset-0` children was shrinking
            the viewer to zero in some WebView builds — that was the actual
            root cause of the "blank PDF/DPP/Notes/Notion" screen.
            We DO keep a bottom inset so the last PDF line isn't clipped by
            the Android gesture/nav bar or iOS home indicator. */}
        <div
          className="flex-1 relative min-h-0"
          style={{
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
          }}
        >
          <PdfViewer
            key={`${url}#${retryNonce}`}
            url={url}
            title={title}
            filename={title}
            chromeVisible={false}
            showLoadingOverlay={false}
            alwaysShowFab
            fabBottomOffset={96}
            onFirstByte={markFirstByte}
            onReady={markPdfProgress}
            initialPage={initialPage}
            onPageChange={(p) => {
              // Visibility tracks reading position only. It can happen before
              // PDF.js paints the canvas, so it must not dismiss the overlay.
              savePage(p);
            }}
          />

          {showSkeleton && !errorMsg && (
            <ReaderProgress
              visible
              title={title}
              variant={
                /docs\.google\.com/i.test(url)
                  ? "drive"
                  : /notion\.(?:so|site)/i.test(url)
                    ? "notion"
                    : isArchiveSource(url)
                      ? "archive"
                      : "pdf" /* Drive PDFs now stream through pdf-proxy → real pdf.js progress events fire, so use the pdf (real-progress) variant instead of the simulated 90% cap. */
              }
            />
          )}

          {/* Debug health chip hidden per product request (still tracked in state for logs). */}

          {errorMsg && (
            <ReaderErrorOverlay
              message={errorMsg}
              onRetry={handleRetry}
              
            />
          )}
        </div>

        {/* Top-edge tap strip — only mounted when chrome hidden. 6px so it
            never blocks PDF scrolling near the top edge. */}
        {!chromeVisible && (
          <button
            type="button"
            aria-label="Show reader controls"
            onClick={showChrome}
            className="absolute top-0 left-0 right-0 h-1.5 z-40 bg-transparent safe-area-top focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:bg-primary/20"
          />
        )}

        {/* Persistent floating exit arrow — ALWAYS visible, even when the
            auto-hiding header is collapsed. Gives users a guaranteed escape
            hatch from the PDF without depending on the Android hardware back
            button (which can be intercepted by the in-app overlay sentinel,
            the browser, or the OS gesture nav). Tap = same as header back. */}
        <button
          type="button"
          aria-label="Close document"
          onClick={(e) => {
            e.stopPropagation();
            closeReader();
          }}
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
          className={cn(
            "absolute left-3 z-50 inline-flex items-center justify-center",
            "h-11 w-11 rounded-full bg-black/55 text-white backdrop-blur-md",
            "shadow-lg ring-1 ring-white/20 active:scale-95 transition-all",
            "hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            // Fade slightly when the header is visible so it doesn't overlap
            // the header's own back button, but never disappears.
            chromeVisible ? "opacity-0 pointer-events-none" : "opacity-100"
          )}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
      </div>
    );

  }
);

DocumentReader.displayName = "DocumentReader";

export default DocumentReader;
