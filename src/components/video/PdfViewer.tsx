import { memo, useMemo, useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import { Loader2 } from "lucide-react";
import { resolveEmbedUrl, isNaveenBharatStorage, isGithubStoragesCdn, isGoogleDrive, isGoogleDocs, isNotion, renderablePdfUrl, extractDriveFileId, googleDrivePdfProxyUrl, hasPdfPath } from "../../lib/pdfViewerUrl";
import MarkdownViewer, { type MarkdownViewerHandle } from "./MarkdownViewer";
import FastPdfReader, { type FastPdfReaderHandle } from "./FastPdfReader";

import { useOfflineResolvedUrl } from "../../hooks/useOfflineResolvedUrl";
import { pushPlayerBusy } from "../../lib/playerBusy";
import { traceReader } from "../../lib/readerDiagnostics";
import { isResolvableStorageViewerUrl } from "@/lib/native/naveenStoragePdf";

import NotionPageRenderer from "./NotionPageRenderer";

interface PdfViewerProps {
  url: string;
  title?: string;
  filename?: string;
  chromeVisible?: boolean;
  onSurfaceTap?: () => void;
  onFirstByte?: () => void;
  onDownloaded?: (info: { title: string; url: string; filename: string }) => void;
  /** Page to restore on open (1-based). */
  initialPage?: number;
  /** Notified when the most-visible page changes (1-based). */
  onPageChange?: (page: number) => void;
  /** Fires once when scroll / iframe refs are mounted and queryable. */
  onReady?: () => void;
  /** Disable the nested loader when a parent shell renders progress. */
  showLoadingOverlay?: boolean;
}

export type PdfViewerHandle = {
  getScrollEl: () => HTMLElement | null;
  getIframeEl: () => HTMLIFrameElement | null;
};

const isMarkdownUrl = (u: string) => /\.(md|markdown)(\?|#|$)/i.test(u);

/**
 * URLs that must stay as iframe embeds (we can't render them as canvas).
 * Google Docs is a non-PDF document and must stay in its preview iframe.
 * Google Drive PDFs are intentionally excluded: they are always normalized to
 * pdf-proxy bytes and rendered by FastPdfReader, never Drive's broken preview
 * iframe on mobile Firefox / Android WebView.
 *
 * NOTE: local files (capacitor://, file://, ionic://, blob:, http://localhost
 * _capacitor_file_…) are intentionally NOT here — they render through
 * FastPdfReader (canvas) so offline autoscroll + large-PDF streaming work.
 */
const mustUseIframe = (u: string) =>
  isGoogleDocs(u) ||
  (isGithubStoragesCdn(u) && !hasPdfPath(u)) ||
  (isNaveenBharatStorage(u) && !isResolvableStorageViewerUrl(u) && !hasPdfPath(u));


const PdfViewerInner = forwardRef<PdfViewerHandle, PdfViewerProps>(
  ({ url: rawUrl, title, filename, chromeVisible = true, onSurfaceTap, onFirstByte, initialPage, onPageChange, onReady, showLoadingOverlay = true }, ref) => {
    // Screen protection removed here; only LessonView applies FLAG_SECURE for students.
    useEffect(() => pushPlayerBusy(), []);

    // Prefer an offline-downloaded copy when one exists for this URL.
    const { url: offlineUrl } = useOfflineResolvedUrl(rawUrl);
    const baseUrl = useMemo(() => renderablePdfUrl(offlineUrl), [offlineUrl]);
    // A Notion page whose only real content is an attached/embedded document
    // hands that document's URL back to us, and we then render it through the
    // normal PDF pipeline instead of an embed Notion itself cannot display.
    const [notionDoc, setNotionDoc] = useState<string | null>(null);
    useEffect(() => { setNotionDoc(null); }, [rawUrl]);
    const url = notionDoc ?? baseUrl;

    // ── All hooks declared up-front (rules-of-hooks) ────────────────────────
    const mdRef = useRef<MarkdownViewerHandle>(null);
    const pdfRef = useRef<FastPdfReaderHandle>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);

    const isMd = isMarkdownUrl(url) || (!!filename && isMarkdownUrl(filename));

    // Drive is single-path: proxy → FastPdfReader. Do not expose a toggle back
    // to Drive `/preview`; that iframe is the known blank-screen path on mobile.
    const driveId = useMemo(() => (isGoogleDrive(url) ? extractDriveFileId(url) : null), [url]);
    const driveProxyUrl = useMemo(
      () => (driveId ? googleDrivePdfProxyUrl(url) : null),
      [driveId, url]
    );
    const effectiveUrl = driveProxyUrl ?? url;
    const useIframe = !isMd && mustUseIframe(effectiveUrl);

    useImperativeHandle(
      ref,
      () => ({
        getScrollEl: () =>
          mdRef.current?.getScrollEl() ?? pdfRef.current?.getScrollEl() ?? null,
        getIframeEl: () => iframeRef.current ?? pdfRef.current?.getIframeEl() ?? null,
      }),
      []
    );

    // iframe-branch state (safe to declare regardless of branch — React only
    // cares that the hook order is stable per component instance).
    const [loaded, setLoaded] = useState(false);
    const [showOpenExternal, setShowOpenExternal] = useState(false);
    const [loadPercent, setLoadPercent] = useState(0);
    const loadedRef = useRef(false);

    const resolved = useMemo(() => resolveEmbedUrl(effectiveUrl), [effectiveUrl]);
    const { isDrive } = resolved;
    const isHtmlViewer = isNaveenBharatStorage(url) || isGithubStoragesCdn(url);
    const embedUrl = resolved.embedUrl;

    // Listen for global pdf-progress events so the iOS-style spinner can show
    // a determinate progress bar underneath while bytes stream in. Emitted by
    // FastPdfReader (canvas) and the pdfjs iframe bridge.
    useEffect(() => {
      const onProg = (e: Event) => {
        const pct = (e as CustomEvent<{ percent?: number }>).detail?.percent;
        if (typeof pct === "number" && !Number.isNaN(pct)) {
          setLoadPercent((prev) => (pct > prev ? Math.min(100, pct) : prev));
        }
      };
      window.addEventListener("pdf-progress", onProg as EventListener);
      return () => window.removeEventListener("pdf-progress", onProg as EventListener);
    }, [embedUrl]);
    useEffect(() => { setLoadPercent(0); setLoaded(false); loadedRef.current = false; }, [embedUrl]);

    useEffect(() => {
      traceReader(isNotion(url) ? "notion" : isGoogleDrive(url) ? "drive" : isGoogleDocs(url) ? "docs" : isMd ? "markdown" : "pdf", "loading", "route-selected", {
        useIframe,
        effectiveUrl: effectiveUrl.slice(0, 160),
      });
      try {
        if (driveProxyUrl) window.dispatchEvent(new CustomEvent("pdf-proxy", { detail: { route: "drive", url: driveProxyUrl.slice(0, 160) } }));
      } catch {}
    }, [driveProxyUrl, effectiveUrl, isMd, useIframe, url]);

    useEffect(() => {
      if (!driveId) return;
      // If the proxied pdf-proxy stream errors, surface a retry UI via the
      // FastPdfReader byte-fallback path — DO NOT switch back to Drive's
      // `/preview` iframe, which is the original blank-screen failure mode.
      const onPdfError = (event: Event) => {
        const detail = (event as CustomEvent).detail;
        traceReader("drive", "error", "reader-mode-pdf-error", { detail });
      };
      window.addEventListener("pdf-error", onPdfError as EventListener);
      return () => window.removeEventListener("pdf-error", onPdfError as EventListener);
    }, [driveId]);


    useEffect(() => {
      if (!useIframe) return;
      setLoaded(false);
      loadedRef.current = false;
      setShowOpenExternal(false);
      traceReader(isDrive ? "drive" : isGoogleDocs(effectiveUrl) ? "docs" : "iframe", "loading", "iframe-start", { embedUrl });
      try {
        if (typeof localStorage !== "undefined" && localStorage.getItem("nb_pdf_debug") === "1") {
           
          console.info("[PdfViewer] iframe branch", { isDrive, isHtmlViewer, embedUrl });
        }
      } catch {}
      // Drive iframes occasionally render blank in Capacitor WebView (3p-cookie
      // gating, Google's "sign in to view" interstitial, sandboxed frame race).
      // After 6s with no `load` event, auto-escalate Drive into Reader Mode —
      // that path proxies the PDF bytes through our edge function and renders
      // via FastPdfReader (canvas), which works regardless of Google's frame
      // policy. Non-Drive iframes (Docs, custom viewers) keep the 10s retry CTA.
      const escalateMs = isDrive ? 6000 : 10000;
      const t = window.setTimeout(() => {
        if (loadedRef.current) return;
        traceReader(isDrive ? "drive" : "iframe", "timeout", "iframe-timeout", { ms: escalateMs });
        setShowOpenExternal(true);
      }, escalateMs);
      return () => window.clearTimeout(t);
    }, [embedUrl, useIframe, isDrive, isHtmlViewer]);

    useEffect(() => {
      if (!useIframe) return;
      const onMessage = (event: MessageEvent) => {
        const payload = event.data as { type?: string; percent?: number; message?: string; source?: string } | null;
        if (!payload || typeof payload !== "object" || !String(payload.type || "").startsWith("nb-pdf-")) return;
        if (event.source && iframeRef.current?.contentWindow && event.source !== iframeRef.current.contentWindow) return;

        if (payload.type === "nb-pdf-progress") {
          traceReader(isDrive ? "drive" : "iframe", "loading", "iframe-pdf-progress", { percent: payload.percent });
          try { window.dispatchEvent(new CustomEvent("pdf-progress", { detail: { percent: payload.percent } })); } catch {}
          return;
        }
        if (payload.type === "nb-pdf-pagesloaded") {
          traceReader(isDrive ? "drive" : "iframe", "first-byte", "iframe-pdf-pagesloaded", { source: payload.source });
          try { window.dispatchEvent(new CustomEvent("pdf-first-byte", { detail: { source: payload.type } })); } catch {}
          return;
        }
        if (payload.type === "nb-pdf-ready" || payload.type === "nb-pdf-pagerendered") {
          loadedRef.current = true;
          setLoaded(true);
          traceReader(isDrive ? "drive" : "iframe", "ready", "iframe-pdf-ready", { event: payload.type, source: payload.source });
          try { window.dispatchEvent(new CustomEvent("pdf-ready", { detail: { source: payload.type } })); } catch {}
          onReady?.();
          return;
        }
        if (payload.type === "nb-pdf-error" || payload.type === "nb-pdf-timeout") {
          traceReader(isDrive ? "drive" : "iframe", "error", "iframe-pdf-error", { event: payload.type, message: payload.message });
          setShowOpenExternal(true);
          try { window.dispatchEvent(new CustomEvent("pdf-error", { detail: payload.message || "PDF iframe failed to render." })); } catch {}
        }
      };
      window.addEventListener("message", onMessage);
      return () => window.removeEventListener("message", onMessage);
    }, [isDrive, onReady, useIframe]);

    // ── Notion branch — in-app native render via react-notion-x ─────────────
    // Notion blocks iframes (x-frame-options), so we fetch the page's
    // recordMap through our edge function and render it natively. Falls back
    // to "Open in Browser" card on any error.
    if (isNotion(url)) {
      return (
        <div
          className={
            chromeVisible
              ? "relative w-full overflow-hidden bg-background"
              : "absolute inset-0 w-full h-full overflow-hidden bg-background"
          }
          style={
            chromeVisible
              ? { height: "calc(100dvh - 176px + env(safe-area-inset-bottom))", minHeight: "60vh" }
              : undefined
          }
        >
          <NotionPageRenderer url={url} title={title} onReady={onReady} onDocument={setNotionDoc} />
        </div>
      );
    }

    // ── Markdown branch ──────────────────────────────────────────────────────
    if (isMd) {
      return (
        <div
          className={
            chromeVisible
              ? "relative w-full overflow-hidden bg-background"
              : "absolute inset-0 w-full h-full overflow-hidden bg-background"
          }
          style={
            chromeVisible
              ? { height: "calc(100dvh - 176px + env(safe-area-inset-bottom))", minHeight: "60vh" }
              : undefined
          }

        >
          <MarkdownViewer ref={mdRef} url={url} title={title} />
        </div>
      );
    }

    // ── Fast native PDF branch (canvas, no iframe) ───────────────────────────
    if (!useIframe) {
      return (
        <div
          className={
            chromeVisible
              ? "relative w-full overflow-hidden bg-background landscape:!h-[calc(100dvh-var(--nb-player-h,56.25vw)-env(safe-area-inset-top)-env(safe-area-inset-bottom))] landscape:!min-h-[200px]"
              : "absolute inset-0 w-full h-full overflow-hidden bg-background"
          }
          style={
            chromeVisible
              ? { height: "calc(100dvh - 176px + env(safe-area-inset-bottom))", minHeight: "60vh" }
              : undefined
          }

        >
          <FastPdfReader
            ref={pdfRef}
            url={effectiveUrl}
            title={title}
            showLoadingOverlay={showLoadingOverlay}
            onSurfaceTap={onSurfaceTap}
            onFirstByte={onFirstByte}
            initialPage={initialPage}
            onPageChange={onPageChange}
            onReady={onReady}
          />
        </div>
      );
    }

    // ── Fallback iframe branch (Drive, Docs, Notion, custom viewer pages) ────
    // Drive `/preview` and Docs `/preview` already render WITHOUT a top toolbar,
    // so the legacy "shift iframe up by 72px to hide toolbar" trick was
    // CROPPING the first ~72px of the document inside the lesson's inline
    // viewer (root cause of "Drive PDF inline view me kat raha hai").
    // Self-hosted PDF.js viewer still needs the 56px hide to mask its header.
    const TOOLBAR_HIDE_PX = isHtmlViewer ? 56 : 0;

    const wrapperClass = chromeVisible
      ? "relative w-full overflow-hidden bg-background landscape:!h-[calc(100dvh-var(--nb-player-h,56.25vw)-env(safe-area-inset-top)-env(safe-area-inset-bottom))] landscape:!min-h-[200px]"
      : "absolute inset-0 w-full h-full overflow-hidden bg-background";

    const wrapperStyle: React.CSSProperties = chromeVisible
      ? {
          height: "calc(100dvh - 176px + env(safe-area-inset-bottom))",
          minHeight: "60vh",
          transition: "height 250ms ease",
        }
      : {};


    return (
      <div className={wrapperClass} style={wrapperStyle} onClick={onSurfaceTap}>
        <iframe
          ref={iframeRef}
          key={embedUrl}
          src={embedUrl}
          className="absolute left-0 w-full border-0"
          style={{ top: -TOOLBAR_HIDE_PX, height: `calc(100% + ${TOOLBAR_HIDE_PX}px)` }}
          title={title || "PDF Document"}
          allow="fullscreen"
          loading="eager"
          onLoad={() => {
            loadedRef.current = true;
            setLoaded(true);
            traceReader(isDrive ? "drive" : isGoogleDocs(effectiveUrl) ? "docs" : "iframe", "first-byte", "iframe-load", { embedUrl });
            try { window.dispatchEvent(new CustomEvent("pdf-first-byte", { detail: { iframe: true } })); } catch {}
            if (isDrive || isGoogleDocs(effectiveUrl) || isHtmlViewer) {
              try { window.dispatchEvent(new CustomEvent("pdf-ready")); } catch {}
            }
            onReady?.();
          }}
        />
        {!loaded && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/60" aria-label="Loading" />
              <div
                className="h-1 w-40 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={loadPercent || undefined}
                aria-label="PDF loading progress"
              >
                <div
                  className="h-full bg-primary transition-[width] duration-200 ease-out"
                  style={{ width: `${loadPercent > 0 ? loadPercent : 8}%` }}
                />
              </div>
              {loadPercent > 0 && (
                <span className="text-[11px] tabular-nums text-muted-foreground/70">
                  {Math.round(loadPercent)}%
                </span>
              )}
            </div>
            {showOpenExternal && (
              <button
                type="button"
                onClick={() => {
                  // No external redirect — force the in-app iframe to retry.
                  setLoaded(false);
                  loadedRef.current = false;
                  setShowOpenExternal(false);
                  if (iframeRef.current) iframeRef.current.src = embedUrl;
                }}
                className="absolute top-[calc(50%+2rem)] inline-flex items-center gap-1 text-xs text-primary underline"
              >
                Retry
              </button>
            )}
          </div>
        )}
      </div>
    );
  }
);

// NotionPreviewCard removed — Notion now always renders via NotionPageRenderer
// (in-app). The previous "Open in Notion" card leaked users to the system
// browser, breaking the in-app back stack. Do NOT re-introduce it.

PdfViewerInner.displayName = "PdfViewer";
const PdfViewer = memo(PdfViewerInner);
export default PdfViewer;
