import { memo, useMemo, useState, useEffect } from "react";
import { Download, Maximize, Minimize, FileText, Loader2 } from "lucide-react";
import { useDownloads } from "../../hooks/useDownloads";
import { Button } from "../ui/button";
import { downloadFile, extractArchiveId, getArchiveDownloadUrl } from "../../utils/fileUtils";
import { toast } from "sonner";
import { resolveEmbedUrl, pdfJsViewerUrl } from "../../lib/pdfViewerUrl";
import nbLogo from "../../assets/branding/jsr-mark.webp";

interface DriveEmbedViewerProps {
  url: string;
  title?: string;
  onDownloaded?: (info: { title: string; url: string; filename: string }) => void;
}

const DriveEmbedViewer = memo(({ url, title, onDownloaded }: DriveEmbedViewerProps) => {
  const [downloading, setDownloading] = useState(false);
  const { addDownload } = useDownloads();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [archiveDirectUrl, setArchiveDirectUrl] = useState<string | null>(null);
  const [archiveLoading, setArchiveLoading] = useState(false);

  const { embedUrl, openUrl, canRender, isArchive, archiveId } = useMemo(() => {
    // Archive.org
    const aid = extractArchiveId(url);
    if (aid) {
      return {
        embedUrl: "",
        openUrl: `https://archive.org/details/${aid}`,
        canRender: true,
        isArchive: true,
        archiveId: aid,
      };
    }

    // Use shared resolver for Drive, Docs, custom viewers, and generic PDFs
    if (url.startsWith("http")) {
      const resolved = resolveEmbedUrl(url);
      return {
        embedUrl: resolved.embedUrl,
        openUrl: resolved.openUrl,
        canRender: true,
        isArchive: false,
        archiveId: null,
      };
    }

    return { embedUrl: url, openUrl: url, canRender: false, isArchive: false, archiveId: null };
  }, [url]);

  // Resolve Archive.org direct PDF URL with preconnect hint
  useEffect(() => {
    if (!isArchive || !archiveId) return;
    setArchiveLoading(true);
    getArchiveDownloadUrl(archiveId)
      .then((directUrl) => {
        setArchiveDirectUrl(directUrl);
        // Prefetch the PDF for faster loading
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = directUrl;
        link.as = 'document';
        document.head.appendChild(link);
      })
      .catch(() => setArchiveDirectUrl(`https://archive.org/download/${archiveId}/${archiveId}.pdf`))
      .finally(() => setArchiveLoading(false));
  }, [isArchive, archiveId]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      if (isArchive && archiveId) {
        toast.info("Finding PDF file…");
        const directUrl = archiveDirectUrl || await getArchiveDownloadUrl(archiveId);
        const filename = title ? `${title}.pdf` : `${archiveId}.pdf`;
        await downloadFile(directUrl, filename);
        await addDownload(title || archiveId, directUrl, filename, "PDF");
        onDownloaded?.({ title: title || archiveId, url: directUrl, filename });
      } else {
        const filename = title ? `${title}.pdf` : "document.pdf";
        await downloadFile(url, filename);
        await addDownload(title || "Document", url, filename, "PDF");
        onDownloaded?.({ title: title || "Document", url, filename });
      }
      toast.success("Download started");
    } catch {
      toast.error("Download failed");
    } finally {
      setDownloading(false);
    }
  };

  if (!canRender) return null;

  // For Archive: use PDF.js viewer with direct URL; for others: embedUrl
  const iframeSrc = isArchive
    ? (archiveDirectUrl ? pdfJsViewerUrl(archiveDirectUrl) : "")
    : embedUrl;

  return (
    <div
      className={
        isFullscreen
          ? "fixed inset-0 z-[100] bg-background flex flex-col"
          : "relative w-full h-full min-h-[70vh] rounded-xl overflow-hidden border border-border bg-card flex flex-col"
      }
    >
      <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border-b border-border shrink-0">
        <FileText className="w-4 h-4 text-primary shrink-0" />
        <span className="text-sm font-medium text-foreground truncate flex-1">
          {title || "Document"}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-muted-foreground hover:text-foreground"
            onClick={handleDownload}
            disabled={downloading || (isArchive && archiveLoading)}
            title="Download PDF"
          >
            {downloading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span className="ml-1 hidden sm:inline text-xs">
              {downloading ? "Downloading…" : "Download"}
            </span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-muted-foreground hover:text-foreground"
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      <div className="relative flex-1 min-h-0">
        {isArchive && archiveLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-card z-10 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading PDF…</p>
          </div>
        )}

        {iframeSrc && (
          <iframe
            key={iframeSrc}
            src={iframeSrc}
            className="absolute inset-0 w-full h-full border-0"
            title={title || "Document Preview"}
            {...(/drive\.google\.com|docs\.google\.com/.test(iframeSrc)
              ? { sandbox: "allow-scripts allow-same-origin allow-forms allow-popups" }
              : {})}
            loading="eager"
            allowFullScreen
          />
        )}

        {isArchive && iframeSrc && (
          <div
            className="absolute top-0 left-0 right-0 z-30 flex items-center gap-2 px-3 pointer-events-none select-none"
            style={{ height: "52px", background: "hsl(var(--background))", borderBottom: "1px solid hsl(var(--border))" }}
            aria-hidden="true"
          >
            <img src={nbLogo} alt="JSR COACHING" className="h-7 w-auto opacity-90" draggable={false} />
            <span className="text-sm font-semibold text-foreground truncate">JSR COACHING</span>
          </div>
        )}

        <div
          className="absolute bottom-3 right-3 z-20 flex items-center gap-2 select-none pointer-events-none"
          aria-hidden="true"
        >
          <img src={nbLogo} alt="" className="h-7 sm:h-9 w-auto opacity-40 drop-shadow-md" draggable={false} />
        </div>
      </div>
    </div>
  );
});

DriveEmbedViewer.displayName = "DriveEmbedViewer";

export default DriveEmbedViewer;
