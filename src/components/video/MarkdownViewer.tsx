import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Markdown } from "../Markdown";
import { Loader2, ExternalLink } from "lucide-react";
import "github-markdown-css/github-markdown.css";
import { fileDB as personalFileDB } from "../../lib/personalLibraryDB";
import { downloadFileDB, getDownload } from "../../lib/indexedDB";

interface Props {
  url: string;
  title?: string;
}

export type MarkdownViewerHandle = {
  getScrollEl: () => HTMLElement | null;
};

const personalLibraryId = (url: string) =>
  url.match(/^nb-personal-library:([^?#]+)$/i)?.[1] ?? null;
const webDownloadId = (url: string) => url.match(/^web-indexeddb:(\d+)$/i)?.[1] ?? null;
const nbDownloadId = (url: string) => url.match(/^nb-download:(\d+)$/i)?.[1] ?? null;

/**
 * Read a Capacitor-local file (capacitor://, file://, or the WebViewLocalServer
 * https://localhost/_capacitor_file_/<path> form) DIRECTLY via the Filesystem
 * plugin instead of round-tripping through fetch(). Some Android release APK
 * builds return empty / HTML responses for `_capacitor_file_` fetches, which
 * surfaces here as a blank markdown page.
 */
async function readNativeFileAsText(url: string): Promise<string | null> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return null;
    const { Filesystem } = await import("@capacitor/filesystem");

    let absPath: string | null = null;
    if (/^file:\/\//i.test(url)) {
      absPath = decodeURIComponent(url.replace(/^file:\/\//i, ""));
    } else if (/_capacitor_file_/i.test(url)) {
      const m = url.match(/_capacitor_file_(.*)$/i);
      if (m) absPath = decodeURIComponent(m[1]);
    } else if (/^capacitor:\/\//i.test(url) || /^ionic:\/\//i.test(url)) {
      const m = url.match(/_capacitor_file_(.*)$/i);
      if (m) absPath = decodeURIComponent(m[1]);
    }
    if (!absPath) return null;

    const res = await Filesystem.readFile({ path: absPath, encoding: "utf8" as never });
    const data = (res as { data: string | Blob }).data;
    if (typeof data === "string") {
      // Some platforms return base64 even when utf8 is requested if encoding is
      // unsupported. Heuristic: if it looks like base64 and not markdown, decode.
      if (!/[#*\-`\n>|]/.test(data) && /^[A-Za-z0-9+/=\r\n]+$/.test(data.slice(0, 200))) {
        try {
          return decodeURIComponent(escape(atob(data)));
        } catch {
          return data;
        }
      }
      return data;
    }
    if (data instanceof Blob) return await data.text();
    return null;
  } catch {
    return null;
  }
}

async function loadMarkdownText(url: string): Promise<string> {
  const plId = personalLibraryId(url);
  if (plId) {
    const row = await personalFileDB.get(plId);
    if (!row?.blob)
      throw new Error("This markdown file is no longer available on this device.");
    return row.blob.text();
  }
  const dlId = webDownloadId(url);
  if (dlId) {
    const row = await downloadFileDB.get(Number(dlId));
    if (!row?.blob)
      throw new Error(
        "This downloaded markdown file is missing. Re-download it while online."
      );
    return row.blob.text();
  }
  const nbId = nbDownloadId(url);
  if (nbId) {
    const rec = await getDownload(Number(nbId));
    if (!rec) throw new Error("This download no longer exists on this device.");
    if (rec.local_path?.startsWith("web-indexeddb:")) {
      const row = await downloadFileDB.get(Number(nbId));
      if (!row?.blob) throw new Error("Downloaded copy missing. Re-download it while online.");
      return row.blob.text();
    }
    // Native filesystem tier — read UTF-8 text.
    try {
      const { Capacitor } = await import("@capacitor/core");
      if (Capacitor.isNativePlatform() && rec.local_path) {
        const { Filesystem, Directory } = await import("@capacitor/filesystem");
        const parsed = rec.local_path.match(/^(Documents|Data|External|ExternalStorage|Cache|Library):(.+)$/);
        const dirName = parsed?.[1] ?? "Data";
        const filePath = parsed?.[2] ?? rec.local_path;
        const directory =
          (Directory as unknown as Record<string, unknown>)[dirName] ??
          Directory.Data;
        const res = await Filesystem.readFile({ path: filePath, directory: directory as never, encoding: "utf8" as never });
        const data = (res as { data: string | Blob }).data;
        if (typeof data === "string") return data;
        if (data instanceof Blob) return await data.text();
      }
    } catch (err) {
      throw new Error((err as Error)?.message || "Could not read downloaded file", { cause: err });
    }
    throw new Error("Could not read downloaded markdown file.");
  }
  // Try the native Filesystem path first for capacitor://, file://, or
  // _capacitor_file_ URLs (release-APK safety net).
  const isNativeLocal =
    /^(capacitor:|ionic:|file:)/i.test(url) || /_capacitor_file_/i.test(url);
  if (isNativeLocal) {
    const direct = await readNativeFileAsText(url);
    if (direct != null) return direct;
  }
  const res = await fetch(url, { credentials: "omit" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (!text) throw new Error("Empty response — file may be inaccessible offline.");
  return text;
}

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

  const isVirtualUrl = /^(nb-personal-library:|web-indexeddb:|nb-download:)/i.test(url);

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
