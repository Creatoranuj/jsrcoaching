import { ArrowLeft, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { downloadFile } from "../../utils/fileUtils";
import { toast } from "sonner";
import SmartNotesReader from "../notes/SmartNotesReader";
import { isVirtualMarkdownUrl, loadMarkdownText } from "../../lib/markdown/loadMarkdownText";

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

  // A virtual address (nb-download:, web-indexeddb:, nb-personal-library:) means
  // the bytes already live on this device — re-saving would only re-fetch an
  // address the network cannot resolve, so hide the save affordance.
  const canSave = !hideDownload && !isVirtualMarkdownUrl(url);

  return (
    <SmartNotesReader
      title={title}
      markdown={text}
      onBack={onBack}
      onDownload={canSave ? handleSave : undefined}
    />
  );
}
