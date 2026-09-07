import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Document, Page, pdfjs } from "react-pdf";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { ExternalLink } from "lucide-react";
import ReaderProgress from "../course/ReaderProgress";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { useLocalPdfSource } from "../../hooks/useLocalPdfSource";
import { usePageSlotVisibility } from "../../hooks/usePageSlotVisibility";
import { clampCanvasDpr, shouldReleaseDistantPages } from "../../lib/pdfCanvasBudget";
import { classifyPdfError } from "../../lib/pdfErrors";
import { pdfLog, pdfLogError } from "../../lib/pdfLog";
import { cn } from "../../lib/utils";
import { readerRouteForUrl, traceReader } from "../../lib/readerDiagnostics";
import { downloadFile } from "../../utils/fileUtils";
import { addBreadcrumb, captureException } from "../../lib/sentry";
import { isResolvableStorageViewerUrl, resolveStorageBytes } from "@/lib/native/naveenStoragePdf";
import { isKnownNonPdfWebUrl } from "../../lib/detectFileType";
import { openResource } from "../../lib/openResource";
import { requestPdfViaNativeHttp } from "../../lib/nativePdfHttp";
import { friendlyPdfErrorMessage } from "../../lib/pdfErrorMessage";
import { probeDriveBlock, drivePreviewFromViewUrl, drivePreviewFromSource } from "../../lib/driveBlockDiagnosis";
import { supabase } from "@/integrations/supabase/client";
import { emitPdfLifecycle } from "../../lib/pdfLifecycle";
import { suppressCrashShield } from "../../lib/crashShield";


// Guard worker assignment for SSR / non-browser execution.
if (typeof window !== "undefined") {
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
  // Silence noisy "Cannot load system font: TimesNewRomanPSMT" warnings.
  // pdf.js falls back to bundled standard fonts (Foxit/Liberation) automatically;
  // the warning is informational and clutters the console on every PDF open.
  try {
    // 0=errors, 1=warnings, 5=infos. Default is 1 → drop to 0 to mute font warnings.
    const pdfjsAny = pdfjs as unknown as Record<string, unknown>;
    pdfjsAny.verbosity = 0;
  } catch { /* noop */ }

}

export type FastPdfReaderHandle = {
  getScrollEl: () => HTMLElement | null;
  getIframeEl: () => HTMLIFrameElement | null;
  /** Current committed zoom factor (1 = fit width). */
  getZoom: () => number;
  /** Multiply the current zoom, anchored on the viewport centre. */
  zoomBy: (factor: number) => void;
  /** Reset to fit-width (zoom = 1). */
  fitWidth: () => void;
  getNumPages: () => number;
  /** Scroll a 1-based page into view. */
  goToPage: (page: number) => void;
  /** Pages (1-based, ascending) whose text contains `query`. */
  findPages: (query: string) => Promise<number[]>;
};


/** Per-URL cache of the probed total file size (bytes). */
const pdfTotalBytesCache = new Map<string, number>();

interface Props {
  url: string;
  /** Optional title shown in the loading overlay ("Opening <title> — NN%"). */
  title?: string;
  /** Parent reader shells may own the single blocking progress overlay. */
  showLoadingOverlay?: boolean;
  /** Called when user taps the document (used to toggle reader chrome). */
  onSurfaceTap?: () => void;
  /** Called as soon as pdf.js receives bytes, before first page render. */
  onFirstByte?: () => void;
  /** Page to scroll to on first render (1-based). */
  initialPage?: number;
  /** Notified when the most-visible page changes (1-based). */
  onPageChange?: (page: number) => void;
  /** Fired once after mount when scroll/iframe refs are ready to read. */
  onReady?: () => void;
  /** Notified whenever the committed zoom factor changes. */
  onZoomChange?: (zoom: number) => void;
  /** Stable identity that keeps lifecycle events scoped to this reader. */
  readerId?: string;

}

/**
 * PDF.js loader params, memoised so React-PDF doesn't re-create the loader on
 * every render. Streaming + incremental fetch are enabled so large PDFs (>50MB)
 * load page-by-page over range requests instead of buffering the whole file.
 */
const PDF_OPTIONS = {
  cMapUrl: "/pdfjs/web/cmaps/",
  cMapPacked: true,
  standardFontDataUrl: "/pdfjs/web/standard_fonts/",
  // JPEG2000 (JPX) / colour-profile decoders. Archive.org book scans store
  // page images as JPX; without this URL pdf.js can't init OpenJPEG and every
  // page renders BLANK white. Files are copied to public/pdfjs/wasm/.
  wasmUrl: "/pdfjs/wasm/",
  // Keep pdf.js incremental auto-fetch enabled. Range chunks remain small and
  // only visible canvases mount, while unusual exported PDFs (notably Sheets)
  // can still fetch the cross-reference objects needed to finish parsing.
  disableAutoFetch: false,
  disableStream: false,
  rangeChunkSize: 1 << 16, // 64 KB range requests
  // Silence "Cannot load system font: TimesNewRomanPSMT" warnings emitted by
  // the pdf.js worker. The worker reads verbosity from the loader params; the
  // earlier `pdfjs.verbosity = 0` on the main thread had no effect inside the
  // worker, so every PDF open spammed the console.
  verbosity: 0,
  // Prefer pdf.js's bundled Foxit/Liberation standard fonts over the host's
  // system fonts. This avoids the worker probing for TimesNewRomanPS* glyphs
  // that don't exist on Android/Capacitor and ChromeOS at all.
  useSystemFonts: false,
};

/** Blob and data URLs don't support HTTP range requests reliably — load whole buffer. */
const PDF_OPTIONS_LOCAL = {
  cMapUrl: "/pdfjs/web/cmaps/",
  cMapPacked: true,
  standardFontDataUrl: "/pdfjs/web/standard_fonts/",
  wasmUrl: "/pdfjs/wasm/",
  disableAutoFetch: true,
  disableStream: true,
  disableRange: true,
  verbosity: 0,
  useSystemFonts: false,
};

/**
 * Archive.org-only loader params. Internet Archive nodes are throttled and
 * high-latency, so 64 KB chunks + background auto-fetch meant dozens of slow
 * round trips before the first page painted. Larger chunks and visible-page-
 * only fetching cut that by ~8x. No other source uses these options.
 */
const PDF_OPTIONS_ARCHIVE = {
  ...PDF_OPTIONS,
  // IMPORTANT: Archive scans can exceed 1 GB. With streaming left enabled,
  // pdf.js keeps the initial HTTP 200 body alive and downloads the entire
  // document sequentially even though the proxy advertises byte ranges. The
  // UI then appears frozen at 1% for minutes. Disabling progressive streaming
  // makes pdf.js cancel that initial body after headers and use targeted 206
  // Range requests for the xref + visible pages instead. This is Archive-only;
  // every other PDF source retains the default streaming behavior above.
  disableStream: true,
  disableAutoFetch: true,
  rangeChunkSize: 1 << 19, // 512 KB range requests
};

const isAbortLike = (err: unknown): boolean => {
  const e = err as { name?: string; message?: string } | null | undefined;
  const text = `${e?.name || ""} ${e?.message || String(err || "")}`;
  return /AbortError|AbortException|aborted a request|operation was aborted|worker was terminated|\baborted\b/i.test(text);
};

/**
 * Android kills the WebView's in-flight sockets when the app is backgrounded.
 * A PDF that was mid-download then rejects with a transport-level error
 * ("Software caused connection abort", "Failed to fetch", "Load failed",
 * "ERR_NETWORK_CHANGED"…). That is a suspended download, NOT a broken
 * document: the student switched apps. Never show "Couldn't load the
 * document" for it — mark the load suspended and let the `app:resumed`
 * remount continue from scratch when they come back.
 */
const isTransportDeath = (err: unknown): boolean => {
  const e = err as { name?: string; message?: string } | null | undefined;
  const text = `${e?.name || ""} ${e?.message || String(err || "")}`;
  return /Software caused connection abort|connection (?:abort|reset|closed)|Failed to fetch|Load failed|NetworkError|ERR_NETWORK_CHANGED|ERR_CONNECTION_(?:ABORTED|RESET|CLOSED)|socket|ECONNRESET|TypeError: Network/i.test(
    text,
  );
};


import { computeFitPageWidth } from "../../lib/pdfFit";
export { computeFitPageWidth };
import { measureContentBox, fitToContent, type ContentFit } from "../../lib/pdfContentBox";

import { isSheetsSource, isArchiveSource, pdfSizeProbeRange } from "../../lib/pdfSourceKind";
export { isSheetsSource, isArchiveSource };




/**
 * A single page slot. The actual canvas is only mounted once the slot scrolls
 * near the viewport (IntersectionObserver) — this keeps memory flat on large
 * documents while autoscroll still works (placeholders preserve scroll height).
 */
function LazyPage({
  pageNumber,
  width,
  rootRef,
  onVisible,
  onRendered,
  smartFit = false,
  releaseWhenDistant = false,
  pixelRatio,
  estimateRatio,
  onRatio,
}: {
  pageNumber: number;
  width: number;
  rootRef: React.RefObject<HTMLElement | null>;
  onVisible: (page: number) => void;
  onRendered: (page: number) => void;
  smartFit?: boolean;
  releaseWhenDistant?: boolean;
  /** Clamped canvas DPR — keeps bitmap bytes bounded while zoomed in. */
  pixelRatio?: number;
  /** Best known height/width ratio for this page (measured, or doc average). */
  estimateRatio: (page: number) => number;
  /** Reports the real ratio once pdf.js has the page viewport. */
  onRatio: (page: number, ratio: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const render = usePageSlotVisibility({
    pageNumber,
    elementRef: ref,
    rootRef,
    releaseWhenDistant,
    onVisible,
  });
  const [pageRatio, setPageRatio] = useState(() => estimateRatio(pageNumber));
  const placeholderHeight = Math.round(width * pageRatio);
  const [fit, setFit] = useState<ContentFit | null>(null);

  // Re-measure when the available width changes (rotation / pinch commit).
  useEffect(() => { setFit(null); }, [width, smartFit]);

  const handlePageLoad = useCallback(
    (page: unknown) => {
      const loadedPage = page as { getViewport: (options: { scale: number }) => { width: number; height: number } };
      const viewport = loadedPage.getViewport({ scale: 1 });
      if (viewport.width > 0 && viewport.height > 0) {
        const ratio = viewport.height / viewport.width;
        setPageRatio(ratio);
        // Cache it on the document so this slot (and its neighbours) never
        // guess again — a wrong guess is what shifts scrollHeight mid-scroll.
        onRatio(pageNumber, ratio);
      }
      if (!smartFit) return;
      const p = page as Parameters<typeof measureContentBox>[0];
      void (async () => {
        const box = await measureContentBox(p);
        if (!box) return;
        const vp = p.getViewport({ scale: 1 });
        const next = fitToContent(box, { width: vp.width, height: vp.height }, width);
        if (next) setFit(next);
      })();
    },
    [smartFit, width, onRatio, pageNumber]
  );

  // Fully blank sheet (trailing page of a Sheets export) — collapse it.
  if (fit?.blank) {
    return <div ref={ref} data-page={pageNumber} data-blank="true" className="mx-auto h-0 w-full overflow-hidden" />;
  }

  if (fit) {
    return (
      <div
        ref={ref}
        data-page={pageNumber}
        className="mx-auto overflow-hidden"
        style={{ width: fit.cropWidth, height: fit.cropHeight }}
      >
        <div style={{ transform: `translate(${-fit.offsetX}px, ${-fit.offsetY}px)`, width: fit.renderWidth }}>
          <Page
            pageNumber={pageNumber}
            width={fit.renderWidth}
            devicePixelRatio={pixelRatio}
            onLoadSuccess={handlePageLoad}
            onRenderSuccess={() => onRendered(pageNumber)}
            renderAnnotationLayer
            renderTextLayer={false}
          loading={<div style={{ width: fit.cropWidth, height: fit.cropHeight }} className="nb-reader-surface" />}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      data-page={pageNumber}
      data-page-rendered={render ? "true" : "false"}
      className="mx-auto flex w-full justify-start overflow-hidden leading-none"
      style={{ maxWidth: width, fontSize: 0, lineHeight: 0 }}
    >
      {render ? (
        <Page
          pageNumber={pageNumber}
          width={width}
          devicePixelRatio={pixelRatio}
          className="!max-w-full overflow-hidden"
          onLoadSuccess={handlePageLoad}
          onRenderSuccess={() => onRendered(pageNumber)}
          renderAnnotationLayer
          renderTextLayer={false}
            loading={<div style={{ width, height: placeholderHeight }} className="nb-reader-surface" />}
        />
      ) : (
        <div style={{ width, height: placeholderHeight }} className="nb-reader-surface" />
      )}
    </div>
  );
}

/**
 * Fast, in-React PDF renderer. No iframe, no viewer.html, no postMessage.
 * Local files (capacitor://, file://) are materialised into blob URLs so the
 * pdf.js worker can read them; remote URLs stream via range requests.
 */
const FastPdfReader = forwardRef<FastPdfReaderHandle, Props>(
  ({ url, title, showLoadingOverlay = true, onSurfaceTap, onFirstByte, initialPage, onPageChange, onReady, onZoomChange, readerId }, ref) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    /** pdf.js document proxy — used for in-reader text search. */
    const pdfDocRef = useRef<{
      numPages: number;
      getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: unknown[] }> }>;
    } | null>(null);

    // State mirror of the scroll surface node: lets effects re-run once the
    // surface actually mounts (it does not exist during the loading branch).
    const [surfaceEl, setSurfaceEl] = useState<HTMLDivElement | null>(null);
    const setScrollEl = useCallback((node: HTMLDivElement | null) => {
      scrollRef.current = node;
      setSurfaceEl(node);
    }, []);

    const [numPages, setNumPages] = useState(0);
    const [error, setError] = useState<string | null>(null);
    /** Set when the failure can only be resolved outside the app (Drive download disabled). */
    const [errorAction, setErrorAction] = useState<{ label: string; url: string; exclusive?: boolean } | null>(null);
    /**
     * Drive files with downloads disabled can still be READ through Drive's
     * own embeddable preview (`/preview` sends no X-Frame-Options), so instead
     * of a dead-end error we render that preview inline.
     */
    const [drivePreviewUrl, setDrivePreviewUrl] = useState<string | null>(null);

    const [progress, setProgress] = useState<number | null>(null);
    const [fallbackData, setFallbackData] = useState<Uint8Array | null>(null);
    const [fallbackLoading, setFallbackLoading] = useState(false);
    const [accessToken, setAccessToken] = useState<string | null>(null);
    // Bumped on every app resume. Android can evict the WebView's backing
    // canvas while the app is backgrounded (and FLAG_SECURE's privacy
    // overlay can leave a stale black surface behind), so the page canvases
    // come back blank/black. Re-keying <Document> forces a clean repaint.
    const [resumeEpoch, setResumeEpoch] = useState(0);
    /**
     * True while the document load was cut short by the app going to the
     * background (socket death). The overlay shows "paused" copy instead of an
     * error, and the load auto-continues on `app:resumed`.
     */
    const [suspended, setSuspended] = useState(false);
    /** Mirror of `suspended` readable inside async callbacks without stale closures. */
    const suspendedRef = useRef(false);
    useEffect(() => { suspendedRef.current = suspended; }, [suspended]);
    /** Set whenever the page is hidden — proves a later transport error was a background kill. */
    const wentHiddenRef = useRef(false);

    useEffect(() => {
      const onHidden = () => {
        if (document.visibilityState === "hidden") wentHiddenRef.current = true;
      };
      document.addEventListener("visibilitychange", onHidden);
      window.addEventListener("app:paused", onHidden);
      return () => {
        document.removeEventListener("visibilitychange", onHidden);
        window.removeEventListener("app:paused", onHidden);
      };
    }, []);

    useEffect(() => {
      const onResumed = () => {
        wentHiddenRef.current = false;
        // Fresh network on resume → fresh silent-retry budget.
        transportRetriesRef.current = 0;
        // A background-suspended load must be allowed to try the byte
        // fallback again — the previous attempt died with the socket, not
        // because the bytes were bad.
        if (suspended) {
          triedByteFallback.current = false;
          setSuspended(false);
          setError(null);
          setProgress(null);
        }
        setResumeEpoch((n) => n + 1);
        addBreadcrumb("pdf", "resume:remount", { suspended });
      };
      window.addEventListener("app:resumed", onResumed);
      return () => window.removeEventListener("app:resumed", onResumed);
    }, [suspended]);

    // React-PDF performs its own worker requests, so it cannot rely on the
    // async module-level `?token=` cache being ready on the first render.
    // Supplying the current session as an Authorization header closes that
    // startup race and also remounts the document after automatic JWT refresh.
    useEffect(() => {
      let alive = true;
      void supabase.auth.getSession().then(({ data: sessionData }) => {
        if (alive) setAccessToken(sessionData.session?.access_token ?? null);
      });
      const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
        if (alive) setAccessToken(session?.access_token ?? null);
      });
      return () => {
        alive = false;
        authListener.subscription.unsubscribe();
      };
    }, []);

    const didJump = useRef(false);
    const sawFirstByte = useRef(false);
    const triedByteFallback = useRef(false);
    // Total file size in bytes, discovered by a 1-byte Range probe. Used so
    // the reader can show a REAL percentage even when the browser can't read
    // a Content-Length off the streaming response (chunked proxies).
    const probedTotalRef = useRef<number>(0);
    const lastProgressAtRef = useRef<number>(Date.now());
    const readyFiredRef = useRef(false);
    const fallbackAbortRef = useRef<AbortController | null>(null);
    const archiveStallRetriesRef = useRef(0);
    /** Bounded silent retries for transport-level socket deaths (flaky mobile network). */
    const transportRetriesRef = useRef(0);
    const transportRetryTimerRef = useRef<number | null>(null);

    const [retryNonce, setRetryNonce] = useState(0);
    const { src, data, loading: resolving, error: resolveError } = useLocalPdfSource(url, retryNonce);

    /**
     * Safety net: any terminal error on a Drive-backed source falls back to the
     * read-only Drive preview, even when the typed probe failed (aborted fetch,
     * offline blip, non-JSON gateway error). Without this the second open of a
     * download-disabled file showed a dead-end "Could not load PDF." card.
     */
    useEffect(() => {
      if (!error || drivePreviewUrl) return;
      const preview = drivePreviewFromSource(src);
      if (preview) setDrivePreviewUrl(preview);
    }, [error, drivePreviewUrl, src]);
    const route = readerRouteForUrl(url);

    useEffect(() => () => {
      if (transportRetryTimerRef.current) window.clearTimeout(transportRetryTimerRef.current);
    }, []);

    /**
     * A socket abort is a network hiccup, not a broken document. Retry silently
     * (max 2) while keeping the progress overlay alive — never dispatch
     * `pdf-error`, so the parent DocumentReader doesn't flash "Couldn't load
     * the document" for a recoverable failure.
     */
    const scheduleTransportRetry = useCallback((message: string): boolean => {
      if (transportRetriesRef.current >= 2) return false;
      transportRetriesRef.current += 1;
      const attempt = transportRetriesRef.current;
      addBreadcrumb("pdf", "transport-retry", { attempt, message: message.slice(0, 120) });
      traceReader(route, "retrying", "transport-death-retry", { attempt, message: message.slice(0, 120) });
      setError(null);
      // Keep the parent's error watchdog fed while we back off.
      try {
        emitPdfLifecycle("pdf-progress", readerId, { percent: -1, phase: "retrying", measured: false });
      } catch { /* noop */ }
      if (transportRetryTimerRef.current) window.clearTimeout(transportRetryTimerRef.current);
      transportRetryTimerRef.current = window.setTimeout(() => {
        transportRetryTimerRef.current = null;
        triedByteFallback.current = false;
        setFallbackData(null);
        setRetryNonce((n) => n + 1);
      }, 800 * attempt);
      return true;
    }, [readerId, route]);

    // NOTE: the imperative handle is installed further down, after the zoom
    // state it exposes exists (see "Reader imperative API").


    // Lazy-init so the very first render already uses the viewport width
    // (avoids the brief 800px overshoot that clipped the page on mobile).
    const [pageWidth, setPageWidth] = useState<number>(() => {
      if (typeof window === "undefined") return 800;
      return computeFitPageWidth(window.visualViewport?.width ?? window.innerWidth);
    });

    // ── Pinch-to-zoom (2-finger). No UI controls. Smooth: live CSS transform
    // during pinch (no React re-render → no flicker), then commit on release
    // so PDF.js re-rasterises the canvas at the new resolution (crisp, not blurry).
    // Zoom always starts at 100% (fit width) and never goes below it: a PDF
    // rendered at 50–70% is unreadable on a phone, so 1 is the hard floor.
    const MIN_ZOOM = 1;
    const MAX_ZOOM = 4;
    const pagesWrapperRef = useRef<HTMLDivElement>(null);
    const [zoom, setZoom] = useState<number>(MIN_ZOOM);
    const commitZoom = useCallback((next: number) => {
      const v = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(next * 100) / 100));
      setZoom(v);
    }, []);


    const pinchRef = useRef<{ startDist: number; startZoom: number; live: number } | null>(null);
    // Focal point of the active gesture, expressed in *content* coordinates
    // (unzoomed). On commit we restore this point under the same viewport
    // offset so the page grows around the fingers, Drive-style, instead of
    // around the top-centre of the document.
    const focalRef = useRef<{ cx: number; cy: number; vx: number; vy: number } | null>(null);
    const anchorAfterCommit = useCallback((prevZoom: number, nextZoom: number) => {
      const el = scrollRef.current;
      const f = focalRef.current;
      if (!el || !f || prevZoom <= 0) return;
      const k = nextZoom / prevZoom;
      // Run after React has re-rendered the pages at the new width.
      requestAnimationFrame(() => {
        const node = scrollRef.current;
        if (!node) return;
        node.scrollLeft = Math.max(0, f.cx * k - f.vx);
        node.scrollTop = Math.max(0, f.cy * k - f.vy);
      });
    }, []);
    useEffect(() => {
      const el = scrollRef.current;
      const wrap = pagesWrapperRef.current;
      if (!el || !wrap) return;
      const dist = (t: TouchList) => {
        const a = t[0], b = t[1];
        return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      };
      const setFocal = (clientX: number, clientY: number) => {
        const r = el.getBoundingClientRect();
        const vx = clientX - r.left;
        const vy = clientY - r.top;
        focalRef.current = { cx: el.scrollLeft + vx, cy: el.scrollTop + vy, vx, vy };
      };
      // Double-tap to toggle zoom (1x ↔ 2x) — single-hand alternative to pinch.
      let lastTapAt = 0;
      const onTap = (e: TouchEvent) => {
        if (e.touches.length !== 0 || e.changedTouches.length !== 1) return;
        if (pinchRef.current) return;
        const now = Date.now();
        if (now - lastTapAt < 300) {
          lastTapAt = 0;
          const t = e.changedTouches[0];
          setFocal(t.clientX, t.clientY);
          const next = zoom > 1.25 ? 1 : 2;
          anchorAfterCommit(zoom, next);
          commitZoom(next);
        } else {
          lastTapAt = now;
        }
      };
      const onTs = (e: TouchEvent) => {
        if (e.touches.length === 2) {
          pinchRef.current = { startDist: dist(e.touches), startZoom: zoom, live: zoom };
          const a = e.touches[0], b = e.touches[1];
          setFocal((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
          wrap.style.willChange = "transform";
        }
      };
      const onTm = (e: TouchEvent) => {
        if (e.touches.length === 2 && pinchRef.current) {
          e.preventDefault();
          const r = dist(e.touches) / pinchRef.current.startDist;
          const live = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pinchRef.current.startZoom * r));
          pinchRef.current.live = live;
          // Live preview only — relative to the already-committed zoom.
          const rel = live / zoom;
          // The wrapper's transform-origin is top-left, so a bare scale()
          // grows the page away from the fingers and the content visibly
          // jumps back into place on release (the commit re-anchors on the
          // focal point). Counter-translate by the focal point's own growth
          // so the pixel under the fingers stays put during the gesture.
          const f = focalRef.current;
          const tx = f ? -f.cx * (rel - 1) : 0;
          const ty = f ? -f.cy * (rel - 1) : 0;
          wrap.style.transform = `translate(${tx}px, ${ty}px) scale(${rel})`;
        }
      };
      const onTe = () => {
        if (pinchRef.current) {
          const committed = pinchRef.current.live;
          pinchRef.current = null;
          wrap.style.transform = "";
          wrap.style.willChange = "";
          if (Math.abs(committed - zoom) > 0.01) {
            anchorAfterCommit(zoom, committed);
            commitZoom(committed);
          }
        }
      };
      // Trackpad pinch / ctrl+wheel on web. Non-passive so the browser's own
      // page zoom never fires. deltaMode is normalised (Firefox reports lines).
      const onWheel = (e: WheelEvent) => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
        const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * Math.exp(-dy * 0.002)));
        if (Math.abs(next - zoom) < 0.005) return;
        setFocal(e.clientX, e.clientY);
        anchorAfterCommit(zoom, next);
        commitZoom(next);
      };
      el.addEventListener("touchstart", onTs, { passive: true });
      el.addEventListener("touchmove", onTm, { passive: false });
      el.addEventListener("touchend", onTe, { passive: true });
      el.addEventListener("touchcancel", onTe, { passive: true });
      el.addEventListener("touchend", onTap, { passive: true });
      el.addEventListener("wheel", onWheel, { passive: false });
      return () => {
        el.removeEventListener("touchstart", onTs);
        el.removeEventListener("touchmove", onTm);
        el.removeEventListener("touchend", onTe);
        el.removeEventListener("touchcancel", onTe);
        el.removeEventListener("touchend", onTap);
        el.removeEventListener("wheel", onWheel);
      };
    }, [zoom, commitZoom, anchorAfterCommit]);

    // ── Reader imperative API ───────────────────────────────────────────────
    // Zoom buttons, page jump and text search live in the reader chrome
    // (DocReaderShell), so they drive this component through the handle.
    // Everything reads through refs: the handle is installed once and must not
    // capture stale zoom/page values.
    /**
     * Measured height/width ratio per page. Virtualised slots would otherwise
     * all guess A4 (1.414) from page 1; when the real page turned out taller
     * or shorter the document height changed under an active autoscroll and
     * the view jumped. We remember every measured page and estimate unknown
     * ones from the running average instead of from page 1 alone.
     */
    const pageRatiosRef = useRef<Map<number, number>>(new Map());
    useEffect(() => { pageRatiosRef.current = new Map(); }, [src]);

    const estimateRatio = useCallback((page: number) => {
      const known = pageRatiosRef.current;
      const exact = known.get(page);
      if (exact) return exact;
      if (known.size === 0) return 1.414;
      let sum = 0;
      known.forEach((r) => { sum += r; });
      return sum / known.size;
    }, []);

    /**
     * Keeps the page under the viewport top pinned while a slot above it
     * resizes from its estimate to its real height.
     */
    const anchorAroundResize = useCallback(() => {
      const root = scrollRef.current;
      if (!root) return;
      const nodes = Array.from(root.querySelectorAll<HTMLElement>("[data-page]"));
      const anchor = nodes.find((n) => n.offsetTop + n.offsetHeight > root.scrollTop);
      if (!anchor) return;
      const before = anchor.offsetTop - root.scrollTop;
      requestAnimationFrame(() => {
        const r = scrollRef.current;
        if (!r || !anchor.isConnected) return;
        const delta = anchor.offsetTop - r.scrollTop - before;
        if (Math.abs(delta) > 0.5) r.scrollTop += delta;
      });
    }, []);

    const handlePageRatio = useCallback((page: number, ratio: number) => {
      const known = pageRatiosRef.current;
      const prev = known.get(page);
      known.set(page, ratio);
      if (prev === undefined || Math.abs(prev - ratio) > 0.005) anchorAroundResize();
    }, [anchorAroundResize]);

    const zoomRef = useRef(zoom);
    zoomRef.current = zoom;
    const numPagesRef = useRef(0);
    const textCacheRef = useRef<Map<number, string>>(new Map());

    useEffect(() => { onZoomChange?.(zoom); }, [zoom, onZoomChange]);
    useEffect(() => { textCacheRef.current = new Map(); }, [src]);

    /** Anchor a programmatic zoom on the centre of the viewport. */
    const zoomAroundCentre = useCallback((next: number) => {
      const el = scrollRef.current;
      const prev = zoomRef.current;
      const v = Math.min(4, Math.max(0.5, Math.round(next * 100) / 100));
      if (Math.abs(v - prev) < 0.005) return;
      if (el) {
        const vx = el.clientWidth / 2;
        const vy = el.clientHeight / 2;
        focalRef.current = { cx: el.scrollLeft + vx, cy: el.scrollTop + vy, vx, vy };
        anchorAfterCommit(prev, v);
      }
      commitZoom(v);
    }, [anchorAfterCommit, commitZoom]);

    useImperativeHandle(ref, () => ({
      getScrollEl: () => scrollRef.current,
      getIframeEl: () => null,
      getZoom: () => zoomRef.current,
      zoomBy: (factor: number) => zoomAroundCentre(zoomRef.current * factor),
      fitWidth: () => zoomAroundCentre(1),
      getNumPages: () => numPagesRef.current,
      goToPage: (page: number) => {
        const root = scrollRef.current;
        if (!root) return;
        const target = Math.max(1, Math.min(numPagesRef.current || page, page));
        const node = root.querySelector<HTMLElement>(`[data-page="${target}"]`);
        if (node) root.scrollTo({ top: Math.max(0, node.offsetTop - 8), behavior: "smooth" });
        else if (numPagesRef.current > 0) {
          // Slot not mounted yet (virtualised): approximate by proportion.
          const max = root.scrollHeight - root.clientHeight;
          root.scrollTo({ top: (max * (target - 1)) / numPagesRef.current });
        }
      },
      findPages: async (query: string) => {
        const needle = query.trim().toLowerCase();
        const doc = pdfDocRef.current;
        if (!needle || !doc) return [];
        const total = numPagesRef.current;
        const hits: number[] = [];
        for (let p = 1; p <= total; p += 1) {
          let text = textCacheRef.current.get(p);
          if (text === undefined) {
            try {
              const page = await doc.getPage(p);
              const content = await page.getTextContent();
              text = content.items
                .map((it) => (typeof (it as { str?: string }).str === "string" ? (it as { str: string }).str : ""))
                .join(" ")
                .toLowerCase();
            } catch {
              text = "";
            }
            textCacheRef.current.set(p, text);
            // Yield so a long document never blocks the UI thread.
            if (p % 8 === 0) await new Promise((r) => setTimeout(r, 0));
          }
          if (text.includes(needle)) hits.push(p);
        }
        return hits;
      },
    }), [zoomAroundCentre]);

    const renderWidth = Math.round(pageWidth * zoom);


    // ── Zoom memory guard (crash-shield) ────────────────────────────────────
    // react-pdf rasterises each canvas at `width * devicePixelRatio`, so bytes
    // grow with the SQUARE of both. At 4x zoom on a 3x-DPR phone a single A4
    // page is ~4300x6100px ≈ 105 MB of bitmap — several of those alive at once
    // is the classic low-RAM Android OOM. Clamp the effective DPR as zoom
    // rises (visual sharpness is already carried by the zoom itself) and let
    // off-screen pages release their canvas once we are past 1.5x.
    // Keep full device sharpness while the visible pages fit the memory
    // budget, instead of blurring the page exactly when the user zooms in.
    const pixelRatio = useMemo(() => {
      if (typeof window === "undefined") return 1;
      const dpr = window.devicePixelRatio || 1;
      const deviceMemoryGb = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
      return clampCanvasDpr(zoom, dpr, {
        cssWidth: window.innerWidth,
        visiblePages: 2,
        deviceMemoryGb,
      });
    }, [zoom]);
    const releaseDistantPages = shouldReleaseDistantPages(
      isArchiveSource(src),
      zoom,
      (navigator as unknown as { deviceMemory?: number }).deviceMemory,
      numPages,
    );




    // Track container width so pages scale fluidly on resize / rotation.
    //
    // BUG (landscape page rendered narrow with big empty bands on both sides):
    // this effect used to run once with `[]` deps. While the PDF is still
    // loading the component returns an early loading branch, so `scrollRef`
    // was null at that moment, the effect bailed out and NO observer was ever
    // attached — `pageWidth` stayed frozen at the portrait width measured on
    // mount. Re-running it when the surface node appears (`surfaceEl`) fixes
    // both the initial measurement and every later rotation.
    useEffect(() => {
      const el = surfaceEl;
      const update = () => {
        const visualWidth = window.visualViewport?.width ?? window.innerWidth;
        const visualHeight = window.visualViewport?.height ?? window.innerHeight;
        setPageWidth(computeFitPageWidth(visualWidth, el?.clientWidth ?? 0, visualHeight));
      };
      // The rotation animation resizes the surface over several frames; the
      // last event can still carry a mid-transition width, so re-measure once
      // it has settled.
      const timers: number[] = [];
      const updateSettled = () => {
        update();
        timers.push(window.setTimeout(update, 250));
        timers.push(window.setTimeout(update, 600));
      };

      update();
      const ro = el ? new ResizeObserver(update) : null;
      if (el && ro) ro.observe(el);
      window.visualViewport?.addEventListener("resize", update);
      window.addEventListener("resize", update);
      window.addEventListener("orientationchange", updateSettled);
      return () => {
        timers.forEach((t) => window.clearTimeout(t));
        ro?.disconnect();
        window.visualViewport?.removeEventListener("resize", update);
        window.removeEventListener("resize", update);
        window.removeEventListener("orientationchange", updateSettled);
      };
    }, [surfaceEl]);



    // IMPORTANT: clone the Uint8Array before handing it to pdf.js. The worker
    // transfers (detaches) the underlying ArrayBuffer, so re-passing the same
    // reference on a later render produces a blank/glitched canvas OR a
    // DataCloneError when postMessage tries to send a detached buffer.
    // Defense-in-depth: (1) skip if the source buffer was already detached
    // (byteLength 0), (2) allocate a brand-new ArrayBuffer per file identity
    // and copy bytes into it — pdf.js can safely transfer this fresh copy.
    const file = useMemo(() => {
      const source = fallbackData ?? data;
      if (source) {
        if (source.byteLength === 0) {
          // Detached / empty — do not postMessage; let onLoadError path retry.
          return null;
        }
        const copy = new Uint8Array(source.byteLength);
        copy.set(source);
        return { data: copy };
      }
      if (src) {
        return accessToken && /\/functions\/v1\/pdf-proxy(?:\?|$)/i.test(src)
          ? { url: src, httpHeaders: { Authorization: `Bearer ${accessToken}` } }
          : { url: src };
      }
      return null;
      // resumeEpoch/retryNonce are in the deps on purpose: <Document> is
      // re-keyed on those, and a remount hands the file to a BRAND NEW pdf.js
      // worker. Without them the memo returned the *same* `copy` whose
      // ArrayBuffer the previous worker already transferred (detached), so
      // postMessage threw `DataCloneError: ArrayBuffer ... is already
      // detached`. Recomputing allocates a fresh copy per mount.
    }, [src, data, fallbackData, resumeEpoch, retryNonce, accessToken]);

    useEffect(() => {
      traceReader(route, "loading", "fast-reader-source", {
        src: src?.slice(0, 160),
        hasData: !!data,
        resolving,
      });
    }, [data, resolving, route, src]);

    useEffect(() => {
      setNumPages(0);
      setError(null);
      setProgress(null);
      setFallbackData(null);
      setFallbackLoading(false);
      didJump.current = false;
      sawFirstByte.current = false;
      triedByteFallback.current = false;
      readyFiredRef.current = false;
      lastProgressAtRef.current = Date.now();
      archiveStallRetriesRef.current = 0;
      fallbackAbortRef.current?.abort();
      fallbackAbortRef.current = null;
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    }, [src, data]);

    useEffect(() => () => {
      fallbackAbortRef.current?.abort();
    }, []);

    const friendlyPdfError = useCallback(
      (err: unknown): string => friendlyPdfErrorMessage(err, src),
      [src]
    );

    // ── Total-size probe ────────────────────────────────────────────────
    // A tiny prefix Range request returns `Content-Range: bytes 0-4/N`
    // (or our proxy's `X-Pdf-Total-Bytes`). Knowing N lets onLoadProgress emit
    // a real percent for every source — including chunked/streamed proxies
    // where pdf.js reports `total === 0`. Cheap (1 byte), cached per URL.
    useEffect(() => {
      if (!src || !/^https?:/i.test(src)) return;
      const cached = pdfTotalBytesCache.get(src);
      if (cached) { probedTotalRef.current = cached; return; }
      let cancelled = false;
      const controller = new AbortController();
      (async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          // Archive's proxy validates the `%PDF-` signature before relaying a
          // byte-zero response. Request all five signature bytes there; the
          // previous one-byte probe contained only `%` and was correctly but
          // misleadingly classified as `415 not_pdf`, leaving Archive readers
          // on the simulated 40% state with no measured total. Other PDF
          // sources retain the original one-byte probe.
          const headers: Record<string, string> = { Range: pdfSizeProbeRange(src) };
          if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
          const res = await fetch(src, { headers, credentials: "omit", signal: controller.signal });
          if (cancelled) return;
          const explicit = Number(res.headers.get("x-pdf-total-bytes") || 0);
          const fromRange = Number(res.headers.get("content-range")?.match(/\/(\d+)\s*$/)?.[1] || 0);
          const total = explicit || fromRange;
          await res.body?.cancel().catch(() => {});
          if (total > 0) {
            probedTotalRef.current = total;
            pdfTotalBytesCache.set(src, total);
          }
        } catch {
          /* probe is best-effort — progress falls back to indeterminate */
        }
      })();
      return () => { cancelled = true; controller.abort(); };
    }, [src]);



    const fetchPdfBlobWithRetry = useCallback(async (source: string, signal: AbortSignal): Promise<Blob> => {
      const maxAttempts = 3;
      let lastErr: Error | null = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const sep = source.includes("?") ? "&" : "?";
          // Byte-fallback ONLY runs after the streaming path already failed.
          // Common root cause: truncated cached response (CDN/proxy sent fewer
          // bytes than Content-Length promised → "Content-Length header of
          // network response exceeds response Body"). Reusing the browser
          // cache on attempt 1 would return the same poisoned bytes and the
          // fallback would fail identically. Always cache-bust from attempt 1.
          const attemptUrl = `${source}${sep}_nbretry=${Date.now()}_${attempt}`;
          const { data: { session } } = await supabase.auth.getSession();
          const authHeaders = session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : undefined;
          const nativeBlob = await requestPdfViaNativeHttp(attemptUrl, { signal, headers: authHeaders });
          if (nativeBlob) return nativeBlob;
          const res = await fetch(attemptUrl, {
            credentials: "omit",
            cache: "reload",
            headers: authHeaders,
            signal,
          });
          if (!res.ok) {
            // Keep the server's own wording so the UI can show the exact
            // reason (CDN links report e.g. "Forbidden" / "Not Found").
            const err = new Error(`HTTP ${res.status}`) as Error & { status?: number; statusText?: string };
            err.status = res.status;
            err.statusText = (res.statusText || "").trim() || undefined;
            throw err;
          }

          const ct = res.headers.get("content-type") || "";
          if (/text\/html/i.test(ct)) throw new Error("Source is an HTML page, not a PDF");
          // Typed proxy verdicts (e.g. drive_download_disabled) come back as
          // 200 + JSON so they are not logged as edge-function runtime errors.
          const typedCode = res.headers.get("x-pdf-error-code");
          if (typedCode || /application\/json/i.test(ct)) {
            const body = (await res.json().catch(() => null)) as { error?: string; type?: string } | null;
            const err = new Error(body?.error || typedCode || "PDF source returned JSON, not a PDF") as Error & { code?: string };
            err.code = body?.type || typedCode || undefined;
            throw err;
          }
          // Stream the body so the byte-fallback reports REAL progress instead
          // of only an indeterminate heartbeat (the bar used to look frozen for
          // the whole download). Falls back to res.blob() when the runtime has
          // no readable stream (older Android WebViews).
          const totalHeader = Number(res.headers.get("content-length") || 0);
          if (!res.body || !totalHeader || typeof res.body.getReader !== "function") return res.blob();
          const reader = res.body.getReader();
          const chunks: Uint8Array[] = [];
          let received = 0;
          let lastEmit = 0;
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              chunks.push(value);
              received += value.byteLength;
              const now = Date.now();
              if (now - lastEmit > 150) {
                lastEmit = now;
                try {
                  emitPdfLifecycle("pdf-progress", readerId, {
                    percent: Math.min(88, Math.round((received / totalHeader) * 88)),
                    phase: "downloading",
                    measured: true,
                    fallback: true,
                  });
                } catch { /* ignore */ }
              }
            }
          }
          return new Blob(chunks as BlobPart[], { type: "application/pdf" });
        } catch (err) {
          const msg = (err as Error)?.message || "";
          if (isAbortLike(err)) throw err;
          lastErr = err instanceof Error ? err : new Error(String(err));
          const status = (lastErr as Error & { status?: number }).status ?? Number(msg.match(/HTTP\s+(\d{3})/i)?.[1] || 0);
          // Transport-level socket deaths ("Software caused connection abort",
          // "Failed to fetch") are transient on mobile networks — retry with
          // backoff instead of surfacing a scary document error.
          const retryable =
            status === 503 || status === 502 || status === 504 || status === 429 || isTransportDeath(err);
          if (!retryable || attempt === maxAttempts) break;
          traceReader(route, "retrying", "byte-fallback-retry", { attempt, status, message: msg.slice(0, 120) });
          await new Promise((resolve) => window.setTimeout(resolve, 500 * attempt));
        }
      }
      throw lastErr ?? new Error("Failed to fetch PDF bytes");
    }, [readerId, route]);

    /**
     * A Drive file that is shared but has downloads disabled fails with a bare
     * 403, which reads as "file is private". Ask the proxy for the typed reason
     * and swap in the correct copy + an "Open in Drive" action.
     */
    const refineDriveError = useCallback(async () => {
      const info = await probeDriveBlock(src);
      if (!info) return;
      setError(info.message);
      setErrorAction({ label: "Open in Drive", url: info.viewUrl, exclusive: true });
      setDrivePreviewUrl(drivePreviewFromViewUrl(info.viewUrl));
    }, [src]);


    const fetchWholeFileFallback = useCallback(async () => {
      if (!src || !/^https?:/i.test(src) || triedByteFallback.current || data || fallbackData) return false;
      const MAX_WHOLE_FILE_BYTES = 32 * 1024 * 1024;
      if (probedTotalRef.current <= 0 || probedTotalRef.current > MAX_WHOLE_FILE_BYTES) {
        // Unknown/large PDFs stay on streaming. Native arraybuffer fallback can
        // multiply memory usage and OOM the Android WebView.
        if (transportRetriesRef.current < 2) {
          scheduleTransportRetry("whole-file fallback skipped for memory safety");
        }
        return false;
      }
      triedByteFallback.current = true;
      suppressCrashShield(15_000);
      setFallbackLoading(true);
      fallbackAbortRef.current?.abort();
      const controller = new AbortController();
      fallbackAbortRef.current = controller;
      // Heartbeat: byte-fallback is a single fetch()+arrayBuffer() await so it
      // emits no measured `pdf-progress` events. Without a heartbeat
      // the DocumentReader's 25s ERROR_TIMEOUT_MS fires mid-download on large
      // PDFs / slow networks and shows a false "Couldn't load the document."
      // We dispatch `pdf-first-byte` immediately and then send an explicit
      // indeterminate heartbeat every 3s so the parent's error timer keeps
      // resetting until either the fetch resolves (`pdf-ready` via
      // onLoadSuccess) or rejects (`pdf-error`).
      emitPdfLifecycle("pdf-first-byte", readerId, { fallback: true });
      const heartbeat = window.setInterval(() => {
        if (controller.signal.aborted) return;
        try {
          emitPdfLifecycle("pdf-progress", readerId, { percent: -1, phase: "downloading", fallback: true, measured: false });
        } catch {}
      }, 3000);
      try {
        traceReader(route, "retrying", "byte-fallback-start", { src: src.slice(0, 160) });
        const blob = isResolvableStorageViewerUrl(src)
          ? await resolveStorageBytes(src, controller.signal)
          : await fetchPdfBlobWithRetry(src, controller.signal);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        setError(null);
        setFallbackData(bytes);
        traceReader(route, "fallback", "byte-fallback-success", { bytes: bytes.byteLength });
        addBreadcrumb("pdf", "byte-fallback:ok", { size: bytes.byteLength });
        return true;
      } catch (fallbackErr) {
        const msg = (fallbackErr as Error)?.message || "";
        if (isAbortLike(fallbackErr)) {
          addBreadcrumb("pdf", "byte-fallback:aborted", { url: url.slice(0, 80) });
          traceReader(route, "unmounted", "byte-fallback-aborted", { message: msg });
          return false;
        }
        // Background kill → park as suspended; foreground network hiccup →
        // silent bounded retry. Either way: no error card, no `pdf-error`.
        if (isTransportDeath(fallbackErr)) {
          if (document.visibilityState === "hidden" || wentHiddenRef.current) {
            addBreadcrumb("pdf", "byte-fallback:suspended-background", { message: msg.slice(0, 120) });
            traceReader(route, "loading", "byte-fallback-suspended", { message: msg });
            setSuspended(true);
            setError(null);
            return false;
          }
          if (scheduleTransportRetry(msg)) return false;
        }
        const friendly = friendlyPdfError(fallbackErr);
        setError(friendly);
        emitPdfLifecycle("pdf-error", readerId, { message: friendly });
        traceReader(route, "error", "byte-fallback-error", { message: friendly });
        void refineDriveError();
        const status = (fallbackErr as { status?: number })?.status ?? Number(msg.match(/HTTP\s+(\d{3})/i)?.[1] || 0);
        if (status !== 403 && status !== 404 && !/HTML page, not a PDF|HTTP 415/i.test(msg)) {
          captureException(fallbackErr, { where: "FastPdfReader:byteFallback", url: url.slice(0, 120) });
        }
        return false;
      } finally {
        window.clearInterval(heartbeat);
        if (fallbackAbortRef.current === controller) fallbackAbortRef.current = null;
        setFallbackLoading(false);
      }
    }, [data, fallbackData, fetchPdfBlobWithRetry, friendlyPdfError, readerId, refineDriveError, route, scheduleTransportRetry, src, url]);

    const onLoadError = useCallback(
      async (err: Error) => {
        // pdf.js / fetch raise AbortError whenever the user navigates away
        // (component unmount aborts the loadingTask). It isn't an error —
        // surfacing it as a load failure made the reader flash "Failed to
        // load" and spammed Sentry. Drop silently.
        const msg = err?.message || "";
        if (isAbortLike(err)) {
          addBreadcrumb("pdf", "load-aborted", { url: url.slice(0, 80) });
          traceReader(route, "unmounted", "load-aborted", { message: msg });
          return;
        }
        // Transport-level socket death. Background → the student switched apps,
        // park as "suspended" and continue on `app:resumed`. Foreground → flaky
        // network, retry silently (bounded) before ever showing an error.
        if (isTransportDeath(err)) {
          if (document.visibilityState === "hidden" || wentHiddenRef.current) {
            addBreadcrumb("pdf", "load-suspended-background", { message: msg.slice(0, 120) });
            traceReader(route, "loading", "load-suspended-background", { message: msg });
            setSuspended(true);
            setError(null);
            return;
          }
          if (scheduleTransportRetry(msg)) return;
        }


        const kind = classifyPdfError(err);
        addBreadcrumb("pdf", "load-error", { kind, message: msg });
        traceReader(route, "error", "load-error", { kind, message: msg });

        // "Owner disabled downloading" is a permanent, fully-diagnosed state,
        // not a crash: settle the UI first (message + Open in Drive) and never
        // report it to Sentry, byte-fallback it, or leave a blank frame while
        // the async probe runs.
        const driveBlock = await probeDriveBlock(src);
        if (driveBlock) {
          emitPdfLifecycle("pdf-error", readerId, { message: driveBlock.message });
          setError(driveBlock.message);
          setErrorAction({ label: "Open in Drive", url: driveBlock.viewUrl, exclusive: true });
          setDrivePreviewUrl(drivePreviewFromViewUrl(driveBlock.viewUrl));
          return;
        }

        // Expected client-side rejections (private/missing/blocked files) are
        // shown to the student, not reported as runtime exceptions.
        // 415 = the upstream item simply has no PDF (archive.org item without a
        // PDF derivative, or a viewer HTML page): a content problem the student
        // sees as a message — retrying can never change it, so it is breadcrumb
        // material, not a Sentry exception.
        const status = (err as { status?: number })?.status ?? Number(msg.match(/HTTP\s+(\d{3})/i)?.[1] || 0);
        const expectedContentStatus = status === 403 || status === 404 || status === 410 || status === 415;
        const notPdfVerdict = /not_pdf|no pdf file found|Unexpected server response \(415\)/i.test(msg);
        if (!expectedContentStatus && !notPdfVerdict) {
          captureException(err, { where: "FastPdfReader", kind, url: url.slice(0, 120) });
        } else {
          addBreadcrumb("pdf", "load-content-unavailable", { status, kind, message: msg.slice(0, 160) });
        }



        // Archive scans can be hundreds of MB or larger. Materialising one as
        // a Uint8Array after a transient Range failure can OOM the WebView and
        // cannot improve time-to-first-page. Keep Archive on its range-streamed
        // path; Retry below remounts pdf.js with a fresh request instead.
        if (isArchiveSource(src)) {
          const friendly = friendlyPdfError(err);
          emitPdfLifecycle("pdf-error", readerId, { message: friendly });
          setError(friendly);
          return;
        }

        if (await fetchWholeFileFallback()) return;
        // The fallback may have parked the load (background suspend) or queued a
        // silent transport retry — in both cases it already owns the UI state.
        if (transportRetryTimerRef.current || suspendedRef.current) return;

        const friendly = friendlyPdfError(err);
        emitPdfLifecycle("pdf-error", readerId, { message: friendly });
        setError(friendly);
        void refineDriveError();
      },
      [fetchWholeFileFallback, friendlyPdfError, readerId, refineDriveError, route, scheduleTransportRetry, src, url]
    );


    const onLoadSuccess = useCallback(
      (doc: { numPages: number }) => {
        const n = doc.numPages;
        // Keep the document proxy so in-reader search can read page text.
        pdfDocRef.current = doc as unknown as typeof pdfDocRef.current;
        numPagesRef.current = n;
        if (!sawFirstByte.current) {
          sawFirstByte.current = true;
          onFirstByte?.();
          emitPdfLifecycle("pdf-first-byte", readerId);
        }
        setError(null);
        setProgress(null);
        setNumPages(n);

        archiveStallRetriesRef.current = 0;
        transportRetriesRef.current = 0;
        addBreadcrumb("pdf", "load-success", { pages: n });
        traceReader(route, "loading", "document-parsed", { pages: n });
        // Parsing the xref is not visual readiness. Hold the overlay until a
        // Page canvas reports onRenderSuccess, but advance to a finishing stage.
        emitPdfLifecycle("pdf-progress", readerId, { percent: 92, phase: "rendering", measured: false });
      },
      [onFirstByte, readerId, route]
    );

    const handleRendered = useCallback((page: number) => {
      if (readyFiredRef.current) return;
      readyFiredRef.current = true;
      traceReader(route, "ready", "first-page-rendered", { page, pages: numPages });
      try {
        emitPdfLifecycle("pdf-progress", readerId, { percent: 100, phase: "ready", measured: true });
        emitPdfLifecycle("pdf-ready", readerId, { page, pages: numPages, url: url.slice(0, 120) });
      } catch {}
      onReady?.();
    }, [numPages, onReady, readerId, route, url]);

    // Throttle progress dispatch: pdf.js fires `onLoadProgress` per chunk
    // (60+/s on slow nets), which spammed setState + custom events. We
    // coalesce into a single rAF tick (~16ms) and only emit when the
    // rounded percent actually changes.
    const lastEmittedPct = useRef<number>(-2);
    const pendingPct = useRef<number | null>(null);
    const rafScheduled = useRef<boolean>(false);
    const flushProgress = useCallback(() => {
      rafScheduled.current = false;
      const pct = pendingPct.current;
      if (pct === null) return;
      pendingPct.current = null;
      if (pct === lastEmittedPct.current) return;
      lastEmittedPct.current = pct;
      if (pct >= 0) setProgress(pct);
      emitPdfLifecycle("pdf-progress", readerId, {
        percent: pct,
        phase: isArchiveSource(src) && pct === 28 ? "indexing" : "downloading",
        measured: !isArchiveSource(src),
      });
    }, [readerId, src]);

    // pdf.js can go quiet after the final byte while parsing a large xref/object
    // stream. A low-frequency lifecycle heartbeat keeps the parent from turning
    // that healthy parse into a false timeout. It stops at first canvas paint.
    useEffect(() => {
      if (!file || readyFiredRef.current || error) return;
      const id = window.setInterval(() => {
        if (readyFiredRef.current) return;
        emitPdfLifecycle("pdf-progress", readerId, {
          percent: numPages > 0 ? 92 : -1,
          phase: numPages > 0 ? "rendering" : "downloading",
          measured: false,
        });
      }, 5_000);
      return () => window.clearInterval(id);
    }, [error, file, numPages, readerId]);

    const onLoadProgress = useCallback(({ loaded, total }: { loaded: number; total: number }) => {
      lastProgressAtRef.current = Date.now();
      if (loaded > 0 && !sawFirstByte.current) {
        sawFirstByte.current = true;
        traceReader(route, "first-byte", "load-progress-first-byte", { loaded, total });
        onFirstByte?.();
        emitPdfLifecycle("pdf-first-byte", readerId);
      }
      // Network bytes occupy 0–88%. Parsing + first canvas paint own the final
      // 12%, so a Range request can never claim visual completion prematurely.
      // When pdf.js can't see a Content-Length (chunked proxy) we fall back to
      // the size discovered by the 1-byte Range probe; only if BOTH are unknown
      // do we emit -1 (indeterminate).
      const archive = isArchiveSource(src);
      const effectiveTotal = total > 0 ? total : probedTotalRef.current;
      // Archive.org is consumed through sparse Range reads: pdf.js fetches the
      // header, xref and visible pages rather than downloading the 1.4 GB file
      // from byte zero. Dividing those sparse bytes by the whole-file size
      // produces a permanently misleading 0–1%. Report the real first-byte /
      // parsing milestones instead; onLoadSuccess and handleRendered own 92%
      // and 100% respectively.
      pendingPct.current = archive
        // Sparse range bytes are not a whole-file percentage. Emit one honest
        // index milestone; parse and first paint advance to 92% and 100%.
        ? loaded > 0 ? 28 : null
        : effectiveTotal > 0
          ? Math.min(88, Math.round((loaded / effectiveTotal) * 88))
          : loaded > 0 ? -1 : null;
      if (!rafScheduled.current) {
        rafScheduled.current = true;
        requestAnimationFrame(flushProgress);
      }
    }, [onFirstByte, flushProgress, readerId, route, src]);

    // AUDIT 2026-08-03: the reader used to run three overlapping stall timers
    // (archive range-stall interval, stream-stall interval, hard 15s mount
    // timeout). Each depended on `progress`, so every percent tick tore them
    // down and rebuilt them during a *healthy* download, and the two
    // byte-fallback triggers could fire concurrently. One watchdog now owns
    // every stall decision; it reads live state from refs so it never churns.
    const progressRef = useRef<number | null>(null);
    useEffect(() => { progressRef.current = progress; }, [progress]);
    const fallbackBusyRef = useRef(false);
    fallbackBusyRef.current = fallbackLoading || !!fallbackData || !!data;

    useEffect(() => {
      if (!src || numPages > 0) return;
      const archive = isArchiveSource(src);
      if (archive && error) return;
      const mountedAt = Date.now();
      const WATCHDOG_TICK_MS = 2000;
      // Same thresholds as the three timers this replaces.
      const ARCHIVE_SILENCE_MS = 30_000;
      const STREAM_SILENCE_MS = 6000;
      const MOUNT_TIMEOUT_MS = 15_000;

      const id = window.setInterval(() => {
        if (numPages > 0) return;
        const silentFor = Date.now() - lastProgressAtRef.current;
        const pct = progressRef.current;

        // Archive scans must never fall back to a whole-file Uint8Array (the
        // known Botany scan is ~1.4 GB). If the Range stream goes silent
        // before the xref is parsed, remount pdf.js with a freshly resolved
        // URL/token. Retries stay bounded so an unavailable upstream becomes
        // an actionable error instead of an infinite loading loop.
        if (archive) {
          if (silentFor < ARCHIVE_SILENCE_MS) return;
          if (archiveStallRetriesRef.current >= 2) {
            const message = "Archive.org is not responding. Tap Retry to reconnect.";
            setError(message);
            emitPdfLifecycle("pdf-error", readerId, { message });
            traceReader(route, "error", "archive-range-stalled", { retries: archiveStallRetriesRef.current });
            return;
          }
          archiveStallRetriesRef.current += 1;
          lastProgressAtRef.current = Date.now();
          setProgress(null);
          addBreadcrumb("pdf", "archive-range:retry", { attempt: archiveStallRetriesRef.current });
          traceReader(route, "retrying", "archive-range-stalled", { attempt: archiveStallRetriesRef.current });
          setRetryNonce((n) => n + 1);
          return;
        }

        // Non-archive sources degrade forward: streaming → whole-file bytes.
        if (!/^https?:/i.test(src)) return;
        if (triedByteFallback.current || fallbackBusyRef.current) return;
        if (silentFor < STREAM_SILENCE_MS) return;

        const mountTimedOut = Date.now() - mountedAt >= MOUNT_TIMEOUT_MS;
        if (mountTimedOut && (/_capacitor_file_/i.test(src) || isKnownNonPdfWebUrl(src))) return;

        addBreadcrumb("pdf", mountTimedOut ? "mount-timeout:byte-fallback" : "stream-stalled:fallback", {
          progress: pct,
          url: src.slice(0, 80),
        });
        traceReader(route, "timeout", mountTimedOut ? "mount-timeout" : "stream-stalled", {
          progress: pct,
          src: src.slice(0, 160),
        });
        // A `false` result means "already falling back" or "lifecycle abort";
        // the fallback owns real error reporting. Never synthesize a failure
        // here or a healthy byte fallback turns into a false "Couldn't load".
        void fetchWholeFileFallback();
      }, WATCHDOG_TICK_MS);

      return () => window.clearInterval(id);
    }, [error, fetchWholeFileFallback, numPages, readerId, route, src]);



    // Jump to the saved page once pages exist.
    useEffect(() => {
      if (didJump.current || !numPages || !initialPage || initialPage <= 1) return;
      const root = scrollRef.current;
      if (!root) return;
      const t = window.setTimeout(() => {
        const el = root.querySelector<HTMLElement>(`[data-page="${initialPage}"]`);
        if (el) {
          root.scrollTo({ top: el.offsetTop - 8 });
          didJump.current = true;
        }
      }, 150);
      return () => window.clearTimeout(t);
    }, [numPages, initialPage]);

    const handleVisible = useCallback(
      (page: number) => {
        if (didJump.current || !initialPage || initialPage <= 1) onPageChange?.(page);
      },
      [onPageChange, initialPage]
    );

    if (resolving || (fallbackLoading && !file)) {
      return (
        <div className="absolute inset-0 nb-reader-surface">
          {showLoadingOverlay && <ReaderProgress visible title={title} variant="pdf" />}
        </div>
      );
    }


    if (resolveError) {
      pdfLogError("resolve-error", resolveError, { url });
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 nb-reader-surface p-8 text-center text-sm">
          <p className="text-destructive">{friendlyPdfErrorMessage(new Error(resolveError), url)}</p>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => { pdfLog("download", { url }); void downloadFile(url); }}
              className="inline-flex items-center gap-1 text-primary underline"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Download PDF
            </button>
            <button
              type="button"
              onClick={() => { pdfLog("retry", { url }); setRetryNonce((n) => n + 1); }}
              className="inline-flex items-center gap-1 text-primary underline"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }

    if (src && isKnownNonPdfWebUrl(src)) {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 nb-reader-surface p-8 text-center text-sm">
          <p className="text-foreground">This attachment is a web page, not a PDF.</p>
          <button
            type="button"
            onClick={() => void openResource({ url: src, kind: "link", preferSystemBrowser: true })}
            className="inline-flex items-center gap-1 text-primary underline"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Open in browser
          </button>
        </div>
      );
    }

    if (error && drivePreviewUrl) {
      // Read-only Drive file: embed Drive's own viewer so the student can still
      // read it in the app, with an escape hatch to the Drive app.
      return (
        <div className="absolute inset-0 flex flex-col bg-neutral-900">
          <iframe
            src={drivePreviewUrl}
            title="Drive preview"
            className="h-full w-full flex-1 border-0"
            allow="autoplay"
          />
          <div className="flex items-center justify-between gap-3 bg-neutral-900 px-3 py-2 text-xs text-neutral-300">
            <span className="truncate">Owner ne download band kiya hai — read-only preview.</span>
            {errorAction ? (
              <button
                type="button"
                onClick={() => void openResource({ url: errorAction.url, kind: "link", preferSystemBrowser: true })}
                className="inline-flex shrink-0 items-center gap-1 text-primary underline"
              >
                <ExternalLink className="h-3.5 w-3.5" /> {errorAction.label}
              </button>
            ) : null}
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 nb-reader-surface p-8 text-center text-sm">
          <p className="max-w-sm text-destructive">{error}</p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            {errorAction ? (
              <button
                type="button"
                onClick={() => void openResource({ url: errorAction.url, kind: "link", preferSystemBrowser: true })}
                className="inline-flex items-center gap-1 text-primary underline"
              >
                <ExternalLink className="h-3.5 w-3.5" /> {errorAction.label}
              </button>
            ) : null}
            {/* A download-disabled Drive file can never be downloaded or
                retried — offering those CTAs only produces another failure. */}
            {errorAction?.exclusive ? null : (
            <>
            <button
              type="button"
              onClick={() => { pdfLog("download", { url }); void downloadFile(url); }}
              className="inline-flex items-center gap-1 text-primary underline"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Download PDF
            </button>
            <button
              type="button"
              onClick={() => {
                pdfLog("retry", { url });
                setError(null);
                setErrorAction(null);
                triedByteFallback.current = false;
                if (isArchiveSource(src)) setRetryNonce((n) => n + 1);
                else void fetchWholeFileFallback();
              }}
              className="inline-flex items-center gap-1 text-primary underline"
            >
              Retry
            </button>
            </>
            )}
          </div>
        </div>
      );
    }

    // Safety net: resolver finished but produced no source AND no error.
    // Without this guard the viewer would render a fully blank container,
    // which is exactly what users were seeing on APK for missing offline files.
    if (!file) {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 nb-reader-surface p-8 text-center text-sm">
          <p className="text-destructive">Offline copy missing for this file.</p>
          <p className="text-muted-foreground">
            Connect to the internet and re-download it to view again.
          </p>
        </div>
      );
    }

    return (
      <div
        ref={setScrollEl}
        data-archive-virtualized={isArchiveSource(src) ? "true" : undefined}
        className={cn(
          "nb-reader-surface absolute inset-0 overflow-y-auto overscroll-contain [&_.react-pdf__Document]:w-full [&_.react-pdf__Page]:!mx-auto [&_.react-pdf__Page]:!w-full [&_.react-pdf__Page]:!max-w-full [&_.react-pdf__Page__canvas]:!h-auto [&_.react-pdf__Page__canvas]:!w-full [&_.react-pdf__Page__canvas]:!max-w-full [&_.react-pdf__Page__canvas]:!block [&_.react-pdf__Page__canvas]:!align-top [&_.react-pdf__Page]:!mb-0 [&_.react-pdf__Page]:!border-0 [&_.react-pdf__Page]:!leading-none [&_.annotationLayer_section]:!pointer-events-auto",
          zoom > 1 ? "overflow-x-auto" : "overflow-x-hidden"
        )}
        onClick={onSurfaceTap}
        style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-x pan-y pinch-zoom" }}
      >
        {/* No in-surface load strip: the blocking `ReaderProgress` overlay
            already shows spinner + percent + bar, and this sticky 1px bar
            stayed painted at 100% over the first page after load (the blue
            line users reported). Progress events are untouched. */}
        {fallbackLoading && (
          <div className="sticky top-1 z-20 mx-auto mt-2 flex w-fit items-center gap-2 rounded-full border border-border bg-background/95 px-3 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
            </span>
            Stabilizing PDF stream…
          </div>
        )}
        {file && (
          <Document
            key={`pdf-${resumeEpoch}-${retryNonce}`}
            file={file}
            externalLinkTarget="_blank"
            externalLinkRel="noopener noreferrer"
            onLoadSuccess={onLoadSuccess}
            onLoadError={onLoadError}
            onLoadProgress={onLoadProgress}
            options={
              fallbackData ||
              data ||
              /^(blob:|data:)/i.test(src || "") ||
              // Drive pdf-proxy streams `Accept-Ranges: none` — using the
              // range-enabled PDF_OPTIONS makes pdf.js issue Range requests
              // that the proxy ignores (returns full body each time). The
              // size mismatch aborts the load right before completion (the
              // classic "loads to 90% then fails" symptom on Drive PDFs).
              // Force whole-buffer options so pdf.js consumes the one clean
              // stream the proxy is designed to serve.
              /\/pdf-proxy\?kind=drive|[?&]kind=drive/i.test(src || "")
                ? PDF_OPTIONS_LOCAL
                : isArchiveSource(src)
                  ? PDF_OPTIONS_ARCHIVE
                  : PDF_OPTIONS
            }
            loading={
              <div className="absolute inset-0 h-full w-full nb-reader-surface motion-safe:animate-[fade-in_180ms_ease-out_120ms_both]">
                {showLoadingOverlay && <ReaderProgress visible title={title} variant="pdf" />}
              </div>
            }

            error={
              <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-destructive">
                <p>Could not load PDF.</p>
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => { pdfLog("download", { url }); void downloadFile(url); }}
                    className="inline-flex items-center gap-1 text-primary underline"
                  >
                    <ExternalLink className="h-3 w-3" /> Download
                  </button>
                  <button
                    type="button"
                    onClick={() => { pdfLog("retry", { url }); setError(null); }}
                    className="inline-flex items-center gap-1 text-primary underline"
                  >
                    Retry
                  </button>
                </div>
              </div>
            }
            className=""
          >
            <div
              ref={pagesWrapperRef}
              style={{
                transformOrigin: "top left",
                width: renderWidth,
                // Kill inline-block whitespace + canvas baseline gaps so
                // pages sit flush against each other (no strips between).
                fontSize: 0,
                lineHeight: 0,
                marginLeft: "auto",
                marginRight: "auto",
              }}
            >
              {!error &&
                Array.from({ length: numPages }, (_, i) => (
                  <LazyPage
                    key={i + 1}
                    pageNumber={i + 1}
                    width={renderWidth}
                    rootRef={scrollRef}
                    onVisible={handleVisible}
                    onRendered={handleRendered}
                    smartFit={isSheetsSource(url)}
                    releaseWhenDistant={releaseDistantPages}
                    pixelRatio={pixelRatio}
                    estimateRatio={estimateRatio}
                    onRatio={handlePageRatio}
                  />
                ))}
            </div>
          </Document>
        )}
      </div>
    );
  }
);

FastPdfReader.displayName = "FastPdfReader";
export default FastPdfReader;
