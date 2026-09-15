import { Download, Loader2, Trash2, X, BookOpen } from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import type { CatalogPdf } from "../../hooks/usePdfLibrary";
import type { LibraryRecord } from "../../lib/libraryDB";
import FileTypeIcon from "../common/FileTypeIcon";

function fmtSize(b?: number | null) {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

interface Props {
  pdf: CatalogPdf;
  local?: LibraryRecord;
  progress?: number;
  onDownload: () => void;
  onOpen: () => void;
  onDelete: () => void;
  onCancel: () => void;
}

const PdfCard = ({ pdf, local, progress, onDownload, onOpen, onDelete, onCancel }: Props) => {
  const isDownloading = progress !== undefined;
  const isDownloaded = !!local && local.state === "complete";
  const isStale = isDownloaded && local!.version !== pdf.version;

  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-sm">
      <FileTypeIcon type="LINK" url={pdf.file_name || pdf.url} className="h-11 w-11" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{pdf.title}</p>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          {pdf.subject && (
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
              {pdf.subject}
            </Badge>
          )}
          <span>{fmtSize(pdf.file_size ?? local?.size_bytes)}</span>
          {isDownloaded && !isStale && (
            <span className="text-emerald-600 dark:text-emerald-400">✓ Saved</span>
          )}
          {isStale && <span className="text-amber-600">Update available</span>}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {isDownloading ? (
          <>
            <Button size="sm" variant="secondary" disabled className="min-h-[40px]">
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              {progress}%
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={onCancel}
              aria-label="Cancel download"
              className="min-h-[40px] min-w-[40px]"
            >
              <X className="h-4 w-4" />
            </Button>
          </>
        ) : isDownloaded && !isStale ? (
          <>
            <Button size="sm" onClick={onOpen} className="min-h-[40px]">
              <BookOpen className="mr-1 h-3.5 w-3.5" />
              Open
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={onDelete}
              aria-label="Delete"
              className="min-h-[40px] min-w-[40px] text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={onDownload} className="min-h-[40px]">
            <Download className="mr-1 h-3.5 w-3.5" />
            {isStale ? "Update" : "Download"}
          </Button>
        )}
      </div>
    </div>
  );
};

export default PdfCard;