import { useState } from "react";
import { reportError } from "@/lib/sentry";
import { FileText, FileType2, Image as ImageIcon, Music, Video, File, Loader2, Eye } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { LessonAttachment, LessonAttachmentKind } from "@/hooks/useLessonAttachments";
import pdfIconSvg from "@/assets/pdf-icon-grayscale.svg";
import { getErrorMessage } from "@/lib/errorMessage";

interface AttachmentRowProps {
  attachment: LessonAttachment;
  onOpenPdf: (url: string, fileName: string) => void;
  resolveUrl: () => Promise<string | null>;
  onDownloaded?: (title: string, url: string, filename: string, kind: string) => void;
  className?: string;
  variant?: "default" | "compact";
}

const ICONS: Record<LessonAttachmentKind, typeof FileText> = {
  pdf: FileText,
  doc: FileType2,
  image: ImageIcon,
  video: Video,
  audio: Music,
  other: File,
};

const ICON_TINT: Record<LessonAttachmentKind, string> = {
  pdf: "bg-destructive/10 text-destructive",
  doc: "bg-primary/10 text-primary",
  image: "bg-accent/30 text-accent-foreground",
  video: "bg-secondary/40 text-secondary-foreground",
  audio: "bg-secondary/40 text-secondary-foreground",
  other: "bg-muted text-muted-foreground",
};

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentRow({ attachment, onOpenPdf, resolveUrl, onDownloaded, className, variant = "default" }: AttachmentRowProps) {
  const [busy, setBusy] = useState(false);
  const Icon = ICONS[attachment.kind] || File;
  const tint = ICON_TINT[attachment.kind] || ICON_TINT.other;
  const sizeStr = formatSize(attachment.file_size);
  const compact = variant === "compact";

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const url = await resolveUrl();
      if (!url) {
        toast.error("File link could not be opened. Please try again.");
        return;
      }
      if (attachment.kind === "pdf") {
        onOpenPdf(url, attachment.title || attachment.file_name);
      } else {
        await runDownload(url);
      }
    } finally {
      setBusy(false);
    }
  };

  const runDownload = async (url: string) => {
    const { savePdfToDevice } = await import("@/lib/nativePdfSaver");
    const fileName =
      attachment.kind === "pdf" && !/\.[a-z0-9]{2,5}$/i.test(attachment.file_name || "")
        ? `${attachment.file_name || attachment.title || "document"}.pdf`
        : attachment.file_name || attachment.title || "document";
    const t = toast.loading("Saving file…");
    try {
      const { nativeSave } = await savePdfToDevice(url, fileName);
      toast.success(
        nativeSave ? "Saved to Documents/JSR/" : "Download started",
        { id: t },
      );
      onDownloaded?.(attachment.title || attachment.file_name, url, fileName, attachment.kind.toUpperCase());
    } catch (err: unknown) {
      reportError(err, { surface: "AttachmentRow.download" });
      // Last resort: hand the file to the system browser / download manager so
      // a tap never ends with nothing happening.
      try {
        const { openResource } = await import("@/lib/openResource");
        await openResource({ url, kind: "link" });
        toast.success("Opening file…", { id: t });
      } catch {
        toast.error(getErrorMessage(err) || "Download failed", { id: t });
      }
    }
  };





  return (
    attachment.kind === "pdf" ? (
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        aria-label={`Open PDF: ${attachment.title || attachment.file_name}`}
        className={cn(
          "nb-tap group relative w-full text-left bg-card border border-border/60 disabled:opacity-60",
          compact
            ? "rounded-xl p-2 active:bg-accent/50 transition-colors"
            : "rounded-2xl p-3 hover:shadow-md hover:border-primary/40 active:scale-[0.995] transition-all",
          className
        )}
      >
        <div className={cn("flex items-center", compact ? "gap-2.5" : "gap-3")}>
          <div className={cn(
            "flex items-center justify-center flex-shrink-0 overflow-hidden bg-muted/50",
            compact ? "h-11 w-11 min-w-11 rounded-lg" : "min-w-[64px] w-[64px] h-[64px] rounded-xl"
          )}>
            {busy ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <img
                src={pdfIconSvg}
                alt="PDF"
                width={compact ? 30 : 40}
                height={compact ? 30 : 40}
                className={cn(compact ? "h-7 w-7" : "w-10 h-10", "text-foreground dark:text-foreground dark:invert")}
                decoding="async"
              />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              PDF{sizeStr ? ` · ${sizeStr}` : ""}
            </p>
            <h4 className={cn(
              "font-semibold text-foreground text-[15px] leading-snug mt-0.5",
              compact ? "truncate" : "line-clamp-2"
            )}>
              {attachment.title || attachment.file_name}
            </h4>
          </div>
          {compact ? (
            <div className="shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground group-active:bg-accent group-active:text-accent-foreground transition-colors">
              <Eye className="h-4 w-4" />
            </div>
          ) : (
            <div className="shrink-0 inline-flex items-center justify-center gap-1.5 bg-primary text-primary-foreground rounded-xl h-10 px-4 text-sm font-semibold transition-colors [@media(hover:hover)]:group-hover:bg-primary/90">
              <Eye className="h-4 w-4" />
              View
            </div>
          )}
        </div>
      </button>
    ) : (
    <div
      className={cn(
        "group relative flex items-center gap-3 py-2.5 w-full rounded-md px-2 transition-colors hover:bg-accent/10",
        className
      )}
    >
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="flex items-center gap-3 flex-1 min-w-0 text-left disabled:opacity-60"
      >
        <div className={cn("h-7 w-7 rounded-md flex items-center justify-center flex-shrink-0", tint)}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] text-foreground truncate">{attachment.title || attachment.file_name}</p>
          {sizeStr && <p className="text-xs text-muted-foreground">{sizeStr}</p>}
        </div>
      </button>

      {/* Big blue circular download FAB removed per UX request — the
          minimal outline download icon in LessonAttachmentsSheet is the
          single source of truth for downloads, so each attachment row now
          shows exactly one download affordance instead of two. */}
    </div>
    )
  );
}
