import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Markdown } from "../Markdown";
import { Loader2, ExternalLink } from "lucide-react";
import "github-markdown-css/github-markdown.css";
import { isVirtualMarkdownUrl, loadMarkdownText } from "../../lib/markdown/loadMarkdownText";

interface Props {
  url: string;
  title?: string;
}

export type MarkdownViewerHandle = {
  getScrollEl: () => HTMLElement | null;
};

/**
 * GitHub-themed Markdown viewer.
 * - GFM enabled (tables, task lists, strikethrough, autolinks).
 * - Uses `markdown-body` from `github-markdown-css` for authentic GH look.
 * - Forwards a ref so AutoScrollFab can scroll the article container.
 * - Resolves `nb-personal-library:`, `web-indexeddb:`, and native Capacitor
 *   file URLs without a raw fetch (which goes blank on Android release APKs).
 */
const MarkdownViewer = forwardRef<MarkdownViewerHandle, Props>(({ url }, ref) => {
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({ getScrollEl: () => scrollRef.current }), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const text = await loadMarkdownText(url);
        if (!cancelled) {
          setContent(text);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError((e as Error)?.message || "Could not load markdown");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  // Pick the right theme variant by current color scheme
  const isDark =
    typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  const isVirtualUrl = isVirtualMarkdownUrl(url);

  return (
    <div ref={scrollRef} className="w-full h-full overflow-auto bg-background">
      <article
        className="markdown-body flexoki mx-auto max-w-3xl px-5 pt-14 pb-32"
        style={{
          background: "transparent",
          colorScheme: isDark ? "dark" : "light",
        }}
      >
        {loading && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading markdown…
          </div>
        )}
        {error && (
          <div className="text-sm text-destructive">
            Failed to load: {error}
            {!isVirtualUrl && (
              <>
                {" "}
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 underline"
                >
                  <ExternalLink className="h-3 w-3" /> Open
                </a>
              </>
            )}
          </div>
        )}
        {!loading && !error && <Markdown>{content}</Markdown>}
      </article>
    </div>
  );
});

MarkdownViewer.displayName = "MarkdownViewer";
export default MarkdownViewer;
