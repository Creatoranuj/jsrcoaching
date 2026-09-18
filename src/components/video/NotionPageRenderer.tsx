import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { lazyWithRetry } from "../../lib/lazyWithRetry";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import ReaderProgress from "../course/ReaderProgress";
import { extractNotionPageId, notionPageProxyUrl } from "../../lib/pdfViewerUrl";
import { savePdfToDevice } from "../../lib/nativePdfSaver";
import { useToast } from "../../hooks/use-toast";
import { traceReader } from "../../lib/readerDiagnostics";
import { useLessonFeatureFlag } from "@/hooks/useLessonFeatureFlags";
import AutoScrollFab from "../viewer/AutoScrollFab";



// react-notion-x is heavy (~150KB gz with prism + katex). Lazy-load so the
// main bundle isn't impacted for users who never open a Notion page.
const NotionRenderer = lazyWithRetry(() =>
  import("react-notion-x").then((m) => ({ default: m.NotionRenderer }))
);

// react-notion-x base CSS — required for layout/typography of the rendered page.
import "react-notion-x/src/styles.css";
import { isSyntheticPop } from "../../lib/reader/overlayHistory";
import { getErrorMessage } from "@/lib/errorMessage";

interface Props {
  url: string;
  title?: string;
  onClose?: () => void;
  onReady?: () => void;
  /**
   * Called with a document URL (PDF attachment / Drive-Docs embed) found on
   * the page. The parent re-renders that URL through the normal PDF pipeline,
   * because Notion's own embed cannot be displayed inside our reader.
   */
  onDocument?: (url: string) => void;
}

/**
 * In-app Notion page renderer.
 * - Extracts page id from notion.site / notion.so URL
 * - Fetches recordMap via Supabase edge function `notion-page` (JSON proxy)
 * - Renders natively with react-notion-x — full text, images, links, rich formatting
 * - Falls back to "Open in Browser" card on any failure
 */
/** Blocks that count as "the page has its own content worth reading". */
function textBlockCount(recordMap: { block?: Record<string, unknown> } | null | undefined): number {
  let n = 0;
  for (const entry of Object.values(recordMap?.block ?? {})) {
    const raw = (entry as { value?: unknown })?.value;
    const value = raw?.value ?? raw;
    const type = value?.type;
    if (!type || type === "page" || type === "external_object_instance" || type === "embed") continue;
    const text = (value?.properties?.title || [])
      .map((t: unknown[]) => (Array.isArray(t) ? String(t[0] ?? "") : ""))
      .join("")
      .trim();
    if (text) n += 1;
  }
  return n;
}

export default function NotionPageRenderer({ url, title, onClose, onReady, onDocument }: Props) {
  const { toast } = useToast();
  const readerAutoScrollEnabled = useLessonFeatureFlag("readerAutoScroll");
  const [exporting, setExporting] = useState(false);
  const [documents, setDocuments] = useState<{ id: string; name: string; url: string }[]>([]);
  const [bestDocument, setBestDocument] = useState<{ id: string; name: string; url: string } | null>(null);
  // Track in-flight blob URL + revoke timer so we can release memory immediately
  // if the user navigates away before the 30 s revoke fires (10-40 MB PDFs).
  const pendingBlobUrlRef = useRef<string | null>(null);
  /** Scroll container for the autoscroll engine (same-origin, rAF-driven). */
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const revokeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (revokeTimerRef.current) clearTimeout(revokeTimerRef.current);
    if (pendingBlobUrlRef.current) {
      try { URL.revokeObjectURL(pendingBlobUrlRef.current); } catch {}
      pendingBlobUrlRef.current = null;
    }
  }, []);
  // Subpage back-stack — every PageLink click pushes; floating back/close pops.
  // When the stack only has the root url, the close FAB calls history.back()
  // so the parent DocumentReader's popstate sentinel runs (exits the reader).
  const [stack, setStack] = useState<string[]>([url]);
  useEffect(() => { setStack([url]); }, [url]);
  const activeUrl = stack[stack.length - 1];
  const pageId = extractNotionPageId(activeUrl);
  const [recordMap, setRecordMap] = useState<{ block?: Record<string, unknown> } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const popOrClose = useCallback(() => {
    setStack((s) => {
      if (s.length > 1) return s.slice(0, -1);
      if (onClose) onClose();
      else try { window.history.back(); } catch {}
      return s;
    });
  }, [onClose]);

  /**
   * Export the currently rendered Notion DOM to a PDF and save it to the
   * device. We target `.notion-app-wrapper .notion` (the react-notion-x root)
   * so only the page body — not our floating buttons — ends up in the PDF.
   * html2pdf.js is dynamic-imported to keep it out of the main bundle.
   */
  const exportToPdf = useCallback(async () => {
    if (exporting) return;
    const target = document.querySelector<HTMLElement>(".notion-app-wrapper .notion");
    if (!target) {
      toast({ title: "Page not ready", description: "Wait for the page to finish loading.", variant: "destructive" });
      return;
    }
    setExporting(true);
    try {
      const mod = await import("html2pdf.js");
      type Html2PdfChain = {
        from: (element: HTMLElement) => Html2PdfChain;
        set: (options: Record<string, unknown>) => Html2PdfChain;
        outputPdf: (type: string) => Promise<Blob>;
      };
      const html2pdf = (mod as unknown as { default: () => Html2PdfChain }).default;
      const safeName = (title || "Notion Page").replace(/[/\\?%*:|"<>]/g, "_").slice(0, 80);
      const clone = target.cloneNode(true) as HTMLElement;
      clone.querySelectorAll(".notion-export-ignore").forEach((el) => el.remove());
      const sandbox = document.createElement("div");
      sandbox.style.cssText = "position:fixed;left:-10000px;top:0;width:794px;background:#fff;color:#111;z-index:-1;";
      clone.style.cssText = "width:794px;max-width:794px;padding:24px 32px 48px;background:#fff;color:#111;box-sizing:border-box;";
      sandbox.appendChild(clone);
      document.body.appendChild(sandbox);
      const blob: Blob = await html2pdf()
        .from(clone)
        .set({
          margin: [8, 8, 10, 8],
          filename: `${safeName}.pdf`,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, allowTaint: true, backgroundColor: "#ffffff", logging: false, windowWidth: 794, scrollX: 0, scrollY: 0 },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait", compress: true },
          pagebreak: { mode: ["avoid-all", "css", "legacy"], avoid: ["h1", "h2", "h3", "li", "pre", "table", ".notion-callout", ".notion-text"] },
        })
        .outputPdf("blob");
      sandbox.remove();
      const blobUrl = URL.createObjectURL(blob);
      pendingBlobUrlRef.current = blobUrl;
      try {
        await savePdfToDevice(blobUrl, `${safeName}.pdf`);
        toast({ title: "Saved", description: "PDF saved to Documents/JSR." });
      } finally {
        if (revokeTimerRef.current) clearTimeout(revokeTimerRef.current);
        revokeTimerRef.current = setTimeout(() => {
          try { URL.revokeObjectURL(blobUrl); } catch {}
          if (pendingBlobUrlRef.current === blobUrl) pendingBlobUrlRef.current = null;
          revokeTimerRef.current = null;
        }, 30_000);
      }
    } catch (e: unknown) {
      toast({ title: "Export failed", description: getErrorMessage(e) || "Could not generate PDF.", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }, [exporting, title, toast]);

  // Hardware/browser back: pop subpage stack first, then let parent handle exit.
  useEffect(() => {
    if (stack.length <= 1) return;
    const onPop = (e: PopStateEvent) => {
      if (isSyntheticPop()) return;
      e.stopImmediatePropagation();
      setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
      // Re-push sentinel so the next back press still has something to pop.
      try { window.history.pushState({ pdfFullscreen: true }, ""); } catch {}
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [stack.length]);


  useEffect(() => {
    if (!pageId) {
      traceReader("notion", "error", "notion-page-id-missing", { url });
      setError("Could not extract page id");
      try { window.dispatchEvent(new CustomEvent("pdf-error", { detail: "Could not extract Notion page id." })); } catch {}
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30000);
    setError(null);
    setRecordMap(null);
    setDocuments([]);
    traceReader("notion", "loading", "notion-fetch-start", { pageId });

    const proxyUrl = notionPageProxyUrl(pageId);
    const TRANSIENT = /failed to fetch|network error|network request failed|connection abort|connection reset|socket|ECONNRESET|ETIMEDOUT|timeout|Load failed|HTTP 5\d\d/i;

    // The `notion-page` edge function is fail-closed (requireUser): it 401s
    // without a Bearer token. In the APK the WebView fetch/CapacitorHttp path
    // does NOT inherit the Supabase session automatically, so we must attach
    // the current access token + anon apikey on every request — otherwise the
    // reader shows "In-app preview unavailable (HTTP 401)".
    const buildAuthHeaders = async (): Promise<Record<string, string>> => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      const anonKey = (import.meta as unknown as { env?: Record<string, string> }).env
        ?.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
      const headers: Record<string, string> = {};
      if (anonKey) headers.apikey = anonKey;
      if (token) headers.Authorization = `Bearer ${token}`;
      return headers;
    };

    const fetchOnce = async (): Promise<unknown> => {
      const authHeaders = await buildAuthHeaders();
      const isNative = Capacitor.isNativePlatform();
      // On Capacitor native, try native HTTP first (bypasses WebView CORS/socket quirks).
      try {
        const { fetchJsonViaNativeHttp } = await import("@/lib/nativePdfHttp");
        const native = await fetchJsonViaNativeHttp(proxyUrl, controller.signal, authHeaders);
        if (native) return native;
      } catch (e) {
        if ((e as { name?: string })?.name === "AbortError") throw e;
      }
      if (isNative) throw new Error("Native Notion request failed");
      const res = await fetch(proxyUrl, { signal: controller.signal, headers: authHeaders });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    };

    (async () => {
      let data: unknown;
      try {
        data = await fetchOnce();
      } catch (e) {
        const name = (e as { name?: string })?.name || "";
        const msg = (e as Error)?.message || "";
        if (cancelled || name === "AbortError") return;
        if (TRANSIENT.test(msg)) {
          // One silent retry after a short delay.
          await new Promise((r) => setTimeout(r, 500));
          if (cancelled || controller.signal.aborted) return;
          try {
            data = await fetchOnce();
          } catch (e2) {
            if (cancelled || (e2 as { name?: string })?.name === "AbortError") return;
            const msg2 = (e2 as Error)?.message || "Failed to load";
            traceReader("notion", "error", "notion-fetch-error", { message: msg2 });
            setError(msg2);
            try { window.dispatchEvent(new CustomEvent("pdf-error", { detail: msg2 })); } catch {}
            return;
          }
        } else {
          const friendly = name === "AbortError" ? "Notion page timed out." : msg || "Failed to load";
          traceReader("notion", "error", "notion-fetch-error", { message: friendly });
          setError(friendly);
          try { window.dispatchEvent(new CustomEvent("pdf-error", { detail: friendly })); } catch {}
          return;
        }
      }
      if (cancelled) return;
      const recordMap = (data as { recordMap?: { block?: Record<string, unknown> } })?.recordMap;
      if (!recordMap?.block) {
        const friendly = "Empty Notion response";
        traceReader("notion", "error", "notion-fetch-error", { message: friendly });
        setError(friendly);
        try { window.dispatchEvent(new CustomEvent("pdf-error", { detail: friendly })); } catch {}
        return;
      }
      traceReader("notion", "ready", "notion-fetch-success", { blocks: Object.keys(recordMap.block).length });
      setRecordMap(recordMap as Parameters<typeof setRecordMap>[0]);
      const payload = data as {
        documents?: { id: string; name: string; url: string }[];
        bestDocument?: { id: string; name: string; url: string } | null;
      };
      const docs = payload?.documents ?? [];
      setDocuments(docs);
      setBestDocument(payload?.bestDocument ?? docs[0] ?? null);
      window.clearTimeout(timeout);
    })();



    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [pageId, url]);

  useEffect(() => {
    if (!recordMap) return;
    const id = requestAnimationFrame(() => {
      try { window.dispatchEvent(new CustomEvent("pdf-ready")); } catch {}
      traceReader("notion", "ready", "notion-render-ready");
      onReady?.();
    });
    return () => cancelAnimationFrame(id);
  }, [recordMap, onReady]);

  // A Notion page that is just a wrapper around one attached/embedded document
  // opens straight in the PDF reader — Notion's own embed renders as a blank
  // box inside our WebView, which is what students reported as a broken PDF.
  // AUDIT 2026-09-08: the old rule required EXACTLY one document and at most one
  // text block, so a wrapper page with a heading plus a "click to download"
  // line (or two links) stayed in web-page mode and the student never saw a
  // PDF. Any page whose own content is thin now hands its best document to the
  // reader; content-rich pages still render as a page with a document list.
  const CONTENT_BLOCK_THRESHOLD = 4;
  useEffect(() => {
    if (!onDocument || !bestDocument || !recordMap) return;
    if (textBlockCount(recordMap) > CONTENT_BLOCK_THRESHOLD) return;
    traceReader("notion", "ready", "notion-document-fastpath", {
      url: bestDocument.url.slice(0, 160),
      documents: documents.length,
    });
    onDocument(bestDocument.url);
  }, [onDocument, bestDocument, documents.length, recordMap]);

  if (error) {
    return <FallbackCard url={activeUrl} title={title} reason={error} />;
  }

  if (!recordMap) {
    return (
      <div className="relative h-full w-full">
        <ReaderProgress visible title={title} variant="notion" />
      </div>
    );
  }


  const canGoBack = stack.length > 1;
  return (
    <div
      ref={scrollRef}
      className="relative h-full w-full max-w-full overflow-auto overscroll-contain bg-background notion-app-wrapper"
    >
      {/* Minimal top-left exit arrow — pops subpage stack, else exits reader
          (history.back returns to the previous page that opened this Notion view).
          Kept small + translucent so it never obstructs page content. */}
      <button
        type="button"
        onClick={popOrClose}
        aria-label={canGoBack ? "Back to previous page" : "Close Notion preview"}
        className="notion-export-ignore fixed left-3 z-50 inline-flex h-9 w-9 items-center justify-center rounded-full bg-background/80 text-foreground shadow-md ring-1 ring-border backdrop-blur transition-transform active:scale-95"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 10px)" }}
      >
        <ArrowLeft className="h-4 w-4" />
      </button>

      {/* Honest label: this lesson is typed PDF but the source is a live web
          page, so the usual PDF toolbar (page count, print) does not apply.
          The download FAB still exports a real PDF. */}
      <span
        className="notion-export-ignore fixed left-14 z-50 inline-flex h-9 items-center rounded-full bg-background/80 px-3 text-[11px] font-medium text-muted-foreground shadow-md ring-1 ring-border backdrop-blur"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 10px)" }}
      >
        Web page
      </span>

      {/* Attached / embedded documents — Notion cannot render these inside our
          WebView, so offer to open them in the app's own PDF reader. */}
      {onDocument && documents.length > 0 && (
        <div className="notion-export-ignore px-4 pt-16">
          {documents.map((doc) => (
            <button
              key={doc.id}
              type="button"
              onClick={() => onDocument(doc.url)}
              className="mb-2 flex min-h-[44px] w-full items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-left text-sm font-medium text-foreground transition-transform active:scale-[0.99]"
            >
              <Download className="h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate">{doc.name || "Open attached document"}</span>
            </button>
          ))}
        </div>
      )}


      {/* Floating "Download as PDF" — bottom-right, safe-area aware. Exports
          the currently rendered Notion page to a real PDF and routes through
          savePdfToDevice → Capacitor Filesystem (Documents/JSR) on
          Android/iOS, or a normal browser download on web. */}
      <button
        type="button"
        onClick={exportToPdf}
        disabled={exporting}
        aria-label="Download as PDF"
        className="notion-export-ignore fixed right-4 z-50 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-1 ring-border transition-transform active:scale-95 disabled:opacity-60"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 18px)" }}
      >
        {exporting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
      </button>

      {/* Autoscroll for long Notion notes — same rAF engine as the PDF reader,
          per-page speed memory, parked above the Download FAB. */}
      {readerAutoScrollEnabled && (
        <AutoScrollFab
          key={`notion:${activeUrl}`}
          targetRef={scrollRef}
          bottomOffset={84}
          docKey={`notion:${activeUrl}`}
        />
      )}

      <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Rendering…</div>}>
        <NotionRenderer
          recordMap={recordMap}
          fullPage={false}
          darkMode={false}
          disableHeader
          // Override missing components so react-notion-x doesn't emit the
          // "using empty component Code/Equation/..." warnings and so that
          // code blocks still render readable text in-app (we don't ship
          // prismjs/katex to keep the bundle small).
          components={{
            Code: ({ block }: { block: { properties?: { title?: unknown[][] } } }) => {
              const text = (block?.properties?.title || [])
                .map((t) => (Array.isArray(t) ? t[0] : ""))
                .join("");
              return (
                <pre className="my-2 overflow-x-auto rounded-md bg-muted p-3 text-xs leading-relaxed text-foreground">
                  <code>{text}</code>
                </pre>
              );
            },
            Equation: ({ block }: { block: { properties?: { title?: unknown[][] } } }) => {
              const text = (block?.properties?.title || [])
                .map((t) => (Array.isArray(t) ? t[0] : ""))
                .join("");
              return <code className="rounded bg-muted px-1 py-0.5 text-xs">{text}</code>;
            },
            // Subpage links inside a Notion page → navigate in-app by
            // swapping the active URL so we refetch a new recordMap.
            // Never open externally — that breaks the back stack.
            PageLink: ({ href, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
              <a
                {...rest}
                href={href}
                onClick={(e) => {
                  e.preventDefault();
                  if (typeof href === "string" && href) {
                    const next = href.startsWith("http") ? href : `https://www.notion.so${href.startsWith("/") ? "" : "/"}${href}`;
                    setStack((s) => [...s, next]);
                    try { window.history.pushState({ pdfFullscreen: true, notionSub: true }, ""); } catch {}
                  }
                }}

              >
                {children}
              </a>
            ),
          }}
        />
      </Suspense>
      {/* In-app safety: clamp huge images, respect theme, and keep every block
          inside the mobile gutter. react-notion-x ships desktop-first CSS where
          DB-view tables are `width:100vw; align-self:center` and inner content
          is `min-width:720px` — on a phone that breaks blocks out past the left
          padding, clipping the first characters (e.g. "PDF 1" → "DF 1") and the
          bullet/number markers of lists. We constrain widths to the container
          and let wide tables scroll internally instead of shifting the page. */}
      <style>{`
        .notion-app-wrapper {
          --notion-max-width: min(100%, calc(100vw - 2rem));
          overflow-x: hidden;
          max-width: 100%;
          contain: inline-size;
        }
        .notion-app-wrapper .notion {
          box-sizing: border-box !important;
          width: 100% !important;
          max-width: 100% !important;
          min-width: 0 !important;
          padding: 1rem 1rem 4rem;
          overflow-x: hidden;
        }
        .notion-app-wrapper .notion-page {
          width: 100% !important;
          max-width: 100% !important;
          min-width: 0 !important;
          padding: 0 !important;
        }
        .notion-app-wrapper .notion-page-content,
        .notion-app-wrapper .notion-page-content-inner {
          width: 100% !important; max-width: 100% !important; min-width: 0 !important;
          align-items: stretch !important;
        }
        .notion-app-wrapper .notion-page-content-inner > * {
          max-width: 100% !important;
          min-width: 0 !important;
        }
        .notion-app-wrapper .notion-title,
        .notion-app-wrapper .notion-h,
        .notion-app-wrapper .notion-text,
        .notion-app-wrapper .notion-page-text,
        .notion-app-wrapper .notion-page-title-text {
          max-width: 100% !important;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .notion-app-wrapper img { max-width: 100%; height: auto; }
        .notion-app-wrapper .notion-asset-wrapper {
          width: 100% !important;
          min-width: 0 !important;
          max-width: 100% !important;
          align-self: stretch !important;
        }
        /* DB-view (collection) tables: stop the 100vw break-out, scroll in place */
        .notion-app-wrapper .notion-collection {
          width: 100% !important;
          min-width: 0 !important;
          max-width: 100% !important;
          align-self: stretch !important;
          overflow-x: auto;
        }
        .notion-app-wrapper .notion-table {
          width: 100% !important; max-width: 100% !important;
          min-width: 0 !important;
          align-self: stretch !important; overflow-x: auto;
          margin-left: 0 !important;
          transform: none !important;
        }
        .notion-app-wrapper .notion-table-view { min-width: 0 !important; float: none !important; }
        /* Inline simple tables: let them scroll rather than widen the page */
        .notion-app-wrapper .notion-simple-table {
          display: block; width: max-content; max-width: 100%; overflow-x: auto;
        }
        .notion-app-wrapper .notion-row { width: 100% !important; max-width: 100% !important; overflow: visible; }
        .notion-app-wrapper .notion-column { width: 100% !important; max-width: 100% !important; }
        /* Keep list markers inside the gutter so numbers/bullets always show */
        .notion-app-wrapper .notion-list { width: 100%; max-width: 100%; margin-inline-start: 0; }
        .notion-app-wrapper .notion-list-disc,
        .notion-app-wrapper .notion-list-numbered {
          padding-inline-start: 1.35rem !important;
          list-style-position: outside;
        }
        .notion-app-wrapper .notion-list li { overflow-wrap: anywhere; }
        @media (max-width: 640px) {
          .notion-app-wrapper .notion-title { font-size: 1.65rem; line-height: 1.2; }
          .notion-app-wrapper .notion-h1 { font-size: 1.45rem; }
          .notion-app-wrapper .notion-h2 { font-size: 1.25rem; }
          .notion-app-wrapper .notion-list-disc,
          .notion-app-wrapper .notion-list-numbered {
            list-style-position: inside;
            padding-inline-start: 0.25rem !important;
          }
        }
        .notion-app-wrapper a { color: hsl(var(--primary)); word-break: break-word; }
      `}</style>

    </div>
  );
}

function FallbackCard({ title, reason }: { url: string; title?: string; reason: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 px-6 py-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-foreground/[0.06] ring-1 ring-border">
        <svg viewBox="0 0 24 24" className="h-8 w-8 text-foreground" fill="none" aria-hidden="true">
          <path d="M5 4h11l3 3v13H5V4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M9 9v6m0-6l5 6m0-6v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="space-y-1.5">
        <h2 className="text-base font-semibold leading-tight text-foreground">{title || "Notion Page"}</h2>
        <p className="max-w-sm text-xs text-muted-foreground">
          In-app preview unavailable ({reason}). Pull down or tap Retry to try again.
        </p>
      </div>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
      >
        <Loader2 className="h-4 w-4" />
        Retry
      </button>
    </div>
  );
}
