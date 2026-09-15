import { Suspense, useEffect, type ComponentProps } from "react";
import { lazyWithRetry } from "../../lib/lazyWithRetry";
import { SpokeSpinner } from "../ui/spoke-spinner";

/**
 * Lazy wrapper around PdfViewerWithAutoScroll.
 *
 * Why: react-pdf + pdfjs-dist together weigh ~131KB gzip. Statically
 * importing them in LessonView.tsx loaded the chunk for every lesson —
 * including video-only lessons that never open a PDF. This wrapper
 * defers the chunk until a PDF is actually rendered, and warm-prefetches
 * it on idle so the first tap still feels instant (<200ms warm load).
 *
 * Drop-in replacement: same props as PdfViewerWithAutoScroll. No ref
 * forwarding because no current call-site in LessonView uses one.
 */
const InnerPdfViewer = lazyWithRetry(
  () => import("./PdfViewerWithAutoScroll"),
);

type Props = ComponentProps<typeof import("./PdfViewerWithAutoScroll").default>;

// Warm-prefetch the chunk after first paint so the first PDF tap is
// instant. Runs once per session; safe on web + Capacitor.
let prefetched = false;
function prefetchPdfViewer() {
  if (prefetched) return;
  prefetched = true;
  // requestIdleCallback isn't available on iOS WebView — fall back to setTimeout.
  const ric: (cb: () => void) => void =
    (typeof window !== "undefined" && (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback) ||
    ((cb: () => void) => setTimeout(cb, 1500));
  ric(() => { void import("./PdfViewerWithAutoScroll"); });
}

/** Minimal fallback shown while the PDF chunk resolves. */
function Fallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Preparing your document"
      className="flex h-full min-h-[320px] w-full items-center justify-center bg-background"
      data-testid="pdf-skeleton"
    >
      <SpokeSpinner size={32} />
      <span className="sr-only">Loading PDF viewer…</span>
    </div>
  );
}

export default function LazyPdfViewer(props: Props) {
  useEffect(() => { prefetchPdfViewer(); }, []);
  return (
    <Suspense fallback={<Fallback />}>
      <InnerPdfViewer {...props} />
    </Suspense>
  );
}

// Allow external callers (e.g. a lesson page mounting) to warm the chunk.
export { prefetchPdfViewer };