import { Suspense, useEffect } from "react";
import { lazyWithRetry } from "../lib/lazyWithRetry";
import type { MarkdownInnerProps } from "./MarkdownInner";

const MarkdownInner = lazyWithRetry(() => import("./MarkdownInner"));

let prefetched = false;
function prefetchMarkdown() {
  if (prefetched) return;
  prefetched = true;
  // Warm the chunk after first paint so the first <Markdown> render doesn't
  // wait on a network round-trip.
  void import("./MarkdownInner");
}

/**
 * Drop-in replacement for `<ReactMarkdown>` that defers the markdown bundle
 * (react-markdown + remark-gfm + the micromark/mdast graph) to a separate
 * lazy chunk. Use this anywhere markdown is rendered so the initial entry
 * payload stays small. Pass `gfm={false}` to disable GitHub-flavored markdown.
 */
export function Markdown(props: MarkdownInnerProps) {
  useEffect(() => {
    const idle = (window as typeof window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    }).requestIdleCallback;
    if (idle) {
      idle(prefetchMarkdown, { timeout: 2000 });
    } else {
      window.setTimeout(prefetchMarkdown, 800);
    }
  }, []);

  return (
    <Suspense fallback={<div className="animate-pulse h-4 w-full bg-muted/40 rounded" />}>
      <MarkdownInner {...props} />
    </Suspense>
  );
}

export default Markdown;
