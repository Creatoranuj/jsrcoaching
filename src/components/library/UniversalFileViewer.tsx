import { ArrowLeft, BookMarked, Download, ExternalLink, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import DocReaderShell from "./DocReaderShell";
import MarkdownViewer from "./MarkdownViewer";
import { downloadFile } from "../../utils/fileUtils";
import { addUrlToDefaultLibrary } from "../../services/personalLibrary";
import { openExternal } from "../../lib/native/browser";
import { toast } from "sonner";
import { isNotion, isGoogleDrive, isGoogleDocs } from "../../lib/pdfViewerUrl";
import NotionPageRenderer from "../video/NotionPageRenderer";

type Kind = "PDF" | "MARKDOWN" | "OFFICE" | "IMAGE" | "VIDEO" | "LINK";

function classify(fileType: string, url: string, filename?: string): Kind {
  // Notion + Google Drive/Docs → route to PDF surface. Drive/Docs are
  // converted to a streamable PDF inside PdfViewer (proxy → pdf.js); Notion
  // is intercepted below to render via NotionPageRenderer. Without this,
  // a Drive `/file/d/<id>/view` URL saved with fileType="other" would fall
  // through to the LINK branch and bounce out to the OS browser.
  if (isNotion(url) || isGoogleDrive(url) || isGoogleDocs(url)) return "PDF";
  const t = (fileType || "").toUpperCase();
  // Filename/url extension takes priority over fileType label — old records
  // saved as "Notes" with a .md filename should open in the markdown viewer,
  // not the PDF reader (which would throw "NetworkError" trying to parse).
  const probe = `${filename || ""} ${url || ""}`.toLowerCase();
  if (/\.(md|markdown)(\?|#|$|\s)/.test(probe)) return "MARKDOWN";
  if (["MD", "MARKDOWN"].includes(t)) return "MARKDOWN";
  if (["PDF", "NOTES", "DPP"].includes(t)) return "PDF";
  if (["DOC", "DOCX", "PPT", "PPTX", "XLSX", "XLS"].includes(t)) return "OFFICE";
  if (t === "IMAGE") return "IMAGE";
  if (t === "VIDEO") return "VIDEO";
  // URL-based inference
  const u = url.toLowerCase();
  if (/\.(pdf)(\?|#|$)/.test(u)) return "PDF";
  if (/\.(doc|docx|ppt|pptx|xls|xlsx)(\?|#|$)/.test(u)) return "OFFICE";
  if (/\.(jpg|jpeg|png|webp|gif|svg|heic)(\?|#|$)/.test(u)) return "IMAGE";
  if (/\.(mp4|mov|webm|m4v|mkv)(\?|#|$)/.test(u) || /youtube\.com|youtu\.be|vimeo\.com/.test(u)) return "VIDEO";
  return "LINK";
}

interface Props {
  url: string;
  title: string;
  filename?: string;
  fileType: string;
  itemId?: string;
  source?: "library" | "downloads" | "attachment" | "other";
  hideDownload?: boolean;
  onBack: () => void;
}

export default function UniversalFileViewer(props: Props) {
  const { url, title, filename, fileType, hideDownload, onBack } = props;
  const kind = classify(fileType, url, filename);
  const [saving, setSaving] = useState(false);
  const [savingLib, setSavingLib] = useState(false);

  // LINK kind: open externally and bounce back.
  // Declared before any early return so hook order stays stable.
  useEffect(() => {
    if (kind !== "LINK") return;
    void openExternal(url);
    setTimeout(onBack, 0);
  }, [kind, url, onBack]);

  if (kind === "PDF" && isNotion(url)) return (
    <div className="fixed inset-0 z-50 bg-background">
      <NotionPageRenderer url={url} title={title} onClose={onBack} />
    </div>
  );
  if (kind === "PDF") return <DocReaderShell {...props} />;
  if (kind === "MARKDOWN") return (
    <MarkdownViewer url={url} title={title} filename={filename} onBack={onBack} hideDownload={hideDownload} />
  );

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    const t = toast.loading("Saving to device…");
    try {
      await downloadFile(url, filename || title);
      toast.success("Saved", { id: t });
    } catch (e) {
      toast.error((e as Error)?.message || "Save failed", { id: t });
    } finally {
      setSaving(false);
    }
  };

  const handleAddLib = async () => {
    if (savingLib) return;
    setSavingLib(true);
    const t = toast.loading("Adding to My Library…");
    try {
      await addUrlToDefaultLibrary(url, title, filename);
      toast.success("Added to My Library", { id: t });
      try { window.dispatchEvent(new Event("personalLibrary:refresh")); } catch { /* ignore */ }
    } catch (e) {
      toast.error((e as Error)?.message || "Could not add", { id: t });
    } finally {
      setSavingLib(false);
    }
  };

  const officeSrc = kind === "OFFICE"
    ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`
    : "";

  // YouTube / Vimeo embed
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  const videoEmbed = ytMatch
    ? `https://www.youtube.com/embed/${ytMatch[1]}`
    : vimeoMatch
      ? `https://player.vimeo.com/video/${vimeoMatch[1]}`
      : null;

  if (kind === "LINK") return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="safe-area-top z-30 flex min-h-[48px] items-center gap-2 border-b bg-card/95 px-3 shadow-sm">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</h1>
        <Button variant="ghost" size="icon" onClick={handleAddLib} disabled={savingLib} aria-label="Add to My Library">
          {savingLib ? <Loader2 className="h-5 w-5 animate-spin" /> : <BookMarked className="h-5 w-5" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open in browser"
          onClick={() => void openExternal(url)}
        >
          <ExternalLink className="h-5 w-5" />
        </Button>
        {!hideDownload && (
          <Button variant="ghost" size="icon" onClick={handleSave} disabled={saving} aria-label="Download">
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
          </Button>
        )}
      </header>
      <div className="relative flex-1 bg-neutral-100 dark:bg-neutral-900">
        {kind === "OFFICE" && (
          <iframe src={officeSrc} title={title} className="h-full w-full border-0" allow="fullscreen" />
        )}
        {kind === "IMAGE" && (
          <div className="flex h-full w-full items-center justify-center overflow-auto">
            <img src={url} alt={title} className="max-h-full max-w-full object-contain" />
          </div>
        )}
        {kind === "VIDEO" && videoEmbed && (
          <iframe
            src={videoEmbed}
            title={title}
            className="h-full w-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
          />
        )}
        {kind === "VIDEO" && !videoEmbed && (
          <video src={url} controls className="h-full w-full bg-black" />
        )}
      </div>
    </div>
  );
}