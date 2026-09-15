import { memo } from "react";
import { ThumbsUp, HelpCircle, Download, FileText } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";

interface LessonActionBarProps {
  likeCount: number;
  hasLiked: boolean;
  onLike: () => void;
  onDoubts: () => void;
  onDownloadPdf?: () => void;
  hasPdf: boolean;
  likesLoading?: boolean;
  lessonTitle?: string;
  teacherName?: string;
  courseInfo?: string;
  onViewPdf?: () => void;
  pdfCount?: number;
}

const LessonActionBar = memo(({
  likeCount,
  hasLiked,
  onLike,
  onDoubts,
  onDownloadPdf,
  hasPdf,
  likesLoading,
  lessonTitle,
  courseInfo,
  onViewPdf,
  pdfCount = 0,
}: LessonActionBarProps) => {
  const showPdfButton = pdfCount > 0 && onViewPdf;

  return (
    <div className="border-b border-border bg-card">
      {/* Action buttons row */}
      <div className="flex items-center gap-1.5 px-3 py-3">
        {/* Like Button */}
        <Button
          variant="outline"
          className={cn(
            "flex-1 min-w-0 gap-1.5 h-11 px-3 text-sm font-semibold rounded-full transition-all border-2",
            hasLiked
              ? "bg-primary/10 border-primary text-primary"
              : "border-border text-foreground"
          )}
          onClick={onLike}
          disabled={likesLoading}
        >
          <ThumbsUp className={cn("h-4 w-4 shrink-0", hasLiked && "fill-primary")} />
          <span className="truncate">{likeCount > 0 ? `${likeCount} Likes` : "Like"}</span>
        </Button>

        {/* View PDF Button — between Like and Doubts */}
        {showPdfButton && (
          <Button
            variant="outline"
            className="shrink-0 gap-1.5 h-11 px-3 text-sm font-semibold rounded-full border-2 border-orange-200 text-orange-600 hover:bg-orange-50"
            onClick={onViewPdf}
          >
            <FileText className="h-4 w-4 shrink-0" />
            <span className="whitespace-nowrap">PDF{pdfCount > 1 ? ` ${pdfCount}` : ""}</span>
          </Button>
        )}

        {/* Doubts Button */}
        <Button
          variant="outline"
          className="flex-1 min-w-0 gap-1.5 h-11 px-3 text-sm font-semibold rounded-full border-2 border-border text-foreground"
          onClick={onDoubts}
        >
          <HelpCircle className="h-4 w-4 text-amber-500 shrink-0" />
          <span className="truncate">Doubts</span>
        </Button>
      </div>

      {/* PDF / Download row — shown below if PDF exists */}
      {hasPdf && onDownloadPdf && (
        <div className="flex items-center gap-3 px-4 pb-3">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 h-9 text-xs font-medium text-muted-foreground hover:text-foreground"
            onClick={onDownloadPdf}
          >
            <FileText className="h-3.5 w-3.5" />
            Class PDF
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 h-9 text-xs font-medium text-muted-foreground hover:text-foreground"
            onClick={() => {
              if (onDownloadPdf) onDownloadPdf();
            }}
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </Button>
        </div>
      )}
    </div>
  );
});

LessonActionBar.displayName = "LessonActionBar";

export default LessonActionBar;
