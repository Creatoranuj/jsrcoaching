import { ArrowLeft, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { downloadFile } from "../../utils/fileUtils";
import { toast } from "sonner";
import SmartNotesReader from "../notes/SmartNotesReader";
import { fileDB as personalFileDB } from "../../lib/personalLibraryDB";
import { downloadFileDB } from "../../lib/indexedDB";

const personalLibraryId = (url: string) => url.match(/^nb-personal-library:([^?#]+)$/i)?.[1] ?? null;
const webDownloadId = (url: string) => url.match(/^web-indexeddb:(\d+)$/i)?.[1] ?? null;

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
    if (typeof data === "string") return data;
    if (data instanceof Blob) return data.text();
    return null;
  } catch {
    return null;
  }
}

async function loadMarkdownText(url: string): Promise<string> {
  const plId = personalLibraryId(url);
  if (plId) {
    const row = await personalFileDB.get(plId);
    if (!row?.blob) throw new Error("This markdown file is no longer available on this device.");
    return row.blob.text();
  }
  const dlId = webDownloadId(url);
  if (dlId) {
    const row = await downloadFileDB.get(Number(dlId));
    if (!row?.blob) throw new Error("This downloaded markdown file is missing. Re-download it while online.");
    return row.blob.text();
  }
  if (/^(capacitor:|ionic:|file:)/i.test(url) || /_capacitor_file_/i.test(url)) {
    const direct = await readNativeFileAsText(url);
    if (direct != null) return direct;
  }
  if (/^blob:/i.test(url)) {
    // A blob: URL only lives for the session that created it. The native
    // open path (`resolveDownloadUri`) mints a fresh blob URL from on-disk
    // bytes — try reading it first, and only declare it dead if the fetch
    // fails (i.e. the blob was revoked or never had bytes).
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (!text) throw new Error("Empty blob");
      return text;
    } catch (err) {
      console.warn("[MarkdownViewer] blob fetch failed", err);
      throw new Error("Offline copy missing. Please delete this entry and re-download the notes while online.", { cause: err });
    }
  }
  let res: Response;
  try {
    res = await fetch(url, { credentials: "omit" });
  } catch (e) {
    throw new Error(
      `Couldn't reach the file source (${(e as Error)?.message || "network error"}). If you're offline, re-download it while online.`,
      { cause: e }
    );
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (!text) throw new Error("Empty response — file may be inaccessible offline.");
  return text;
}

interface Props {
  url: string;
  title: string;
  filename?: string;
  onBack: () => void;
  hideDownload?: boolean;
}

/**
 * Lightweight Markdown viewer used by My Local Storage / Personal Library when
 * the user opens a .md / .markdown file. Fetches the file as text (works for
 * remote https://, blob:, capacitor://, file:// via the same path PDFs use)
 * and renders it with react-markdown.
 */
export default function MarkdownViewer({ url, title, filename, onBack, hideDownload }: Props) {
  const [text, setText] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const t = await loadMarkdownText(url);
        if (alive) setText(t);
      } catch (e) {
        if (alive) setError((e as Error)?.message || "Could not load markdown");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [url]);

  const handleSave = async () => {
    const t = toast.loading("Saving…");
    try {
      await downloadFile(url, filename || title || "note.md");
      toast.success("Saved", { id: t });
    } catch (e) {
      toast.error((e as Error)?.message || "Save failed", { id: t });
    }
  };

  if (loading || error) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background">
        <header className="safe-area-top z-30 flex min-h-[48px] items-center gap-2 border-b bg-card/95 px-3 shadow-sm">
          <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</h1>
        </header>
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
            </div>
          )}
          {!loading && error && (
            <div className="mx-auto max-w-md p-6 text-center text-sm">
              <p className="font-semibold text-destructive">Couldn't load markdown</p>
              <p className="mt-2 text-muted-foreground">{error}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <SmartNotesReader
      title={title}
      markdown={text}
      onBack={onBack}
      onDownload={hideDownload ? undefined : handleSave}
    />
  );
}
