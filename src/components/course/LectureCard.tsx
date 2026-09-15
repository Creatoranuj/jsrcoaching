import { memo } from "react";
import { Play, Lock, ClipboardCheck, CheckCircle2, Circle, FileText, BookOpen, ClipboardList, Download, NotebookPen } from "lucide-react";
import { cn } from "../../lib/utils";
import { format } from "date-fns";
import { getLessonThumbnail } from "../../lib/videoUtils";
import { SmartImage } from "../common/SmartImage";
import PdfIcon from "../common/PdfIcon";
import MinimalDocIcon from "../common/MinimalDocIcon";
import pdfIconSvg from "../../assets/pdf-icon-grayscale.svg";

export interface LectureCardProps {
  id: string;
  title: string;
  lectureType: "VIDEO" | "PDF" | "DPP" | "NOTES" | "TEST";
  position?: number;
  isLocked?: boolean;
  isCompleted?: boolean;
  createdAt?: string | null;
  duration?: number | null;
  youtubeId?: string | null;
  thumbnailUrl?: string | null;
  videoUrl?: string | null;
  classPdfUrl?: string | null;
  pdfCount?: number;
  attachmentCount?: number;
  onClick?: () => void;
  onMarkComplete?: (e: React.MouseEvent) => void;
  onNotesClick?: () => void;
  onDownloadClick?: (e: React.MouseEvent) => void;
  hasDpp?: boolean;
  compact?: boolean;
}

const formatDuration = (seconds: number | null | undefined): string => {
  if (!seconds || seconds <= 0 || !isFinite(seconds)) return "";
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
};

const formatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return "";
  try { return format(new Date(dateStr), "dd MMM yyyy"); } catch { return ""; }
};

const isVideoType = (type: string) => type === "VIDEO";
const isNotesType = (type: string) => type === "PDF" || type === "NOTES";
const isTestType = (type: string) => type === "TEST";

const typeBadgeClass: Record<string, string> = {
  VIDEO: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400",
  PDF: "bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-400",
  DPP: "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-400",
  NOTES: "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400",
  TEST: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400",
};

const typeIcon: Record<string, React.ReactNode> = {
  VIDEO: <Play className="h-3 w-3" />,
  PDF: <FileText className="h-3 w-3" />,
  DPP: <ClipboardList className="h-3 w-3" />,
  NOTES: <BookOpen className="h-3 w-3" />,
  TEST: <ClipboardCheck className="h-3 w-3" />,
};

const typeLabel: Record<string, string> = {
  VIDEO: "Lecture", PDF: "PDF", DPP: "DPP", NOTES: "Notes", TEST: "Test",
};

const LectureCardImpl = ({
  title, lectureType, isLocked = false, isCompleted = false,
  createdAt, duration, youtubeId, thumbnailUrl, videoUrl,
  classPdfUrl, pdfCount = 0, attachmentCount = 0, onClick, onMarkComplete, onNotesClick, onDownloadClick, hasDpp = false, compact = false,
}: LectureCardProps) => {
  const isVideo = isVideoType(lectureType);
  const isNotes = isNotesType(lectureType);
  const isTest = isTestType(lectureType);
  const isMarkable = !isVideo && !isTest;
  const dateStr = formatDate(createdAt);
  const durationStr = formatDuration(duration);
  const hasAttachments = (classPdfUrl && classPdfUrl.trim() !== "") || pdfCount > 0 || attachmentCount > 0 || hasDpp;
  const thumbSrc = getLessonThumbnail(thumbnailUrl, youtubeId, videoUrl, lectureType);

  // ── COMPACT ROW ──
  if (compact) {
    return (
      <div
        onClick={onClick}
        role="button"
        tabIndex={0}
        aria-label={title}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick?.();
          }
        }}
        className={cn(
        "nb-tap flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-border/50 cursor-pointer",
        "transition-all hover:bg-muted/40 hover:border-border active:scale-[0.99]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isLocked && "opacity-60"
      )}>
        <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase shrink-0", typeBadgeClass[lectureType] ?? typeBadgeClass.VIDEO)}>
          {typeIcon[lectureType]}{typeLabel[lectureType] ?? lectureType}
        </span>
        <span className="flex-1 min-w-0 text-sm font-medium text-foreground truncate">{title}</span>
        <span className="text-xs text-muted-foreground shrink-0 tabular-nums">{isVideo ? durationStr || "—" : (dateStr || "—")}</span>
      </div>
    );
  }

  // ── PW-STYLE FULL CARD ──
  const isPdf = lectureType === "PDF";
  // Product decision: lecture cards ALWAYS show "Watch" and open the video
  // player. The PDF/Notes attachment chip on the same card handles the
  // drawer separately, so users never lose the direct "Watch" affordance.
  const watchLabel = isVideo ? "Watch" : isTest ? "Take Test" : isPdf ? "View PDF" : isNotes ? "View" : "View DPP";
  const watchIcon = isPdf ? <FileText className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />;
  const handlePrimary = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick?.();
  };

  // ── PDF-SPECIFIC COMPACT CARD ──
  // PDFs are documents, not video lectures — they don't need a thumbnail
  // column, completion toggle, attachments row, or a separate "Watch" CTA.
  // The entire card is the tap target → opens the PDF directly.
  if (isPdf && !compact) {
    return (
      <div
        onClick={onClick}
        onKeyDown={(e) => {
          if (isLocked) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick?.();
          }
        }}
        role="button"
        tabIndex={isLocked ? -1 : 0}
        aria-disabled={isLocked || undefined}
        aria-label={`PDF: ${title}${isCompleted ? " — completed" : ""}`}
        className={cn(
          "nb-tap group relative bg-card rounded-2xl border border-border/60 p-3 cursor-pointer transition-all",
          "hover:shadow-md hover:border-primary/40 active:scale-[0.995]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
          isLocked && "opacity-60"
        )}
      >
        <div className="flex items-center gap-3">
          {/* Grayscale PDF thumbnail tile — matches Notes card structure. */}
          <div className={cn(
            "min-w-[64px] w-[64px] h-[64px] rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden",
            isCompleted
              ? "bg-green-50 dark:bg-green-950/30"
              : "bg-muted/50 dark:bg-zinc-900"
          )}>
            {isLocked ? (
              <Lock className="h-5 w-5 text-muted-foreground" />
            ) : isCompleted ? (
              <CheckCircle2 className="w-7 h-7 text-green-500" />
            ) : (
              <img
                src={pdfIconSvg}
                alt="PDF"
                width={40}
                height={40}
                className="w-10 h-10 text-foreground dark:text-foreground"
                loading="eager"
                decoding="async"
              />
            )}
          </div>


          {/* Title + meta — Notion links surface as NOTION so users know it
              opens externally instead of as an in-app PDF viewer. */}
          {(() => {
            const isNotionLink = !!classPdfUrl && /(^https?:\/\/)?([a-z0-9-]+\.)?notion\.(site|so)\//i.test(classPdfUrl);
            const kindLabel = isNotionLink ? "NOTION" : "PDF";
            const kindClass = isNotionLink ? "text-rose-600 dark:text-rose-400" : "text-foreground dark:text-foreground";
            return (
              <div className="flex-1 min-w-0">
                <p className={cn("text-[11px] font-semibold uppercase tracking-wide", kindClass)}>
                  {kindLabel}{dateStr ? ` · ${dateStr}` : ""}
                </p>
                <h4 className="font-semibold text-foreground text-[15px] leading-snug line-clamp-2 mt-0.5">{title}</h4>
              </div>
            );
          })()}

          {/* Mark-complete toggle */}
          {onMarkComplete && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onMarkComplete(e); }}
              aria-label={isCompleted ? "Mark as not done" : "Mark as done"}
              aria-pressed={isCompleted}
              className="nb-tap -m-2 p-2 rounded-full shrink-0 hover:bg-muted/60 active:scale-90 transition"
            >
              {isCompleted ? (
                <CheckCircle2 className="h-5 w-5 text-green-500 fill-green-500" />
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground/60" />
              )}
            </button>
          )}

          {/* View CTA — matches Notes card style (play icon + View). */}
          <div className="shrink-0 inline-flex items-center justify-center gap-1.5 bg-foreground text-background group-hover:bg-foreground/90 rounded-xl h-10 px-4 text-sm font-semibold transition-colors">
            <Play className="h-4 w-4 fill-current" />
            View
          </div>
        </div>
      </div>
    );
  }


  return (
    <div
      onClick={onClick}
      onKeyDown={(e) => {
        if (isLocked) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      role="button"
      tabIndex={isLocked ? -1 : 0}
      aria-disabled={isLocked || undefined}
      aria-label={`${typeLabel[lectureType] ?? lectureType}: ${title}${isCompleted ? " — completed" : ""}`}
      className={cn(
        "nb-tap relative bg-card rounded-2xl border border-border/60 p-3 cursor-pointer transition-all",
        "hover:shadow-md hover:border-border active:scale-[0.995]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        isLocked && "opacity-60"
      )}>

      <div className="flex gap-3">
        {/* Thumbnail */}
        {isVideo || lectureType === "DPP" || isTest ? (
          <div className="relative min-w-[88px] w-[88px] h-[88px] rounded-2xl flex-shrink-0 overflow-hidden bg-muted">
            {thumbSrc ? (
              <SmartImage src={thumbSrc} alt={title} width={180} height={180} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-emerald-100 to-emerald-200 dark:from-slate-700 dark:to-slate-900 flex items-center justify-center">
                {isLocked ? <Lock className="h-5 w-5 text-white/80" /> : isTest ? <ClipboardCheck className="h-5 w-5 text-foreground/70" /> : <Play className="h-5 w-5 text-foreground/70 fill-foreground/70" />}
              </div>
            )}
            {isLocked && thumbSrc && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><Lock className="h-4 w-4 text-white/90" /></div>
            )}
            {/* Red play badge bottom-left */}
            {isVideo && !isLocked && (
              <div className="absolute bottom-1.5 left-1.5 bg-red-500 rounded-full p-1 shadow-sm">
                <Play className="h-3 w-3 text-white fill-white" />
              </div>
            )}
          </div>
        ) : (
          <div className={cn(
            "min-w-[88px] h-[88px] rounded-2xl flex items-center justify-center flex-shrink-0",
            isCompleted ? "bg-green-50 dark:bg-green-950/30" : "bg-muted/50"
          )}>
            {isCompleted ? <CheckCircle2 className="w-8 h-8 text-green-500" /> : <NotebookPen className="w-8 h-8 text-muted-foreground" aria-label="Notes" />}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0 flex flex-col py-0.5">
          {/* Label + date row */}
          <div className="flex items-start justify-between gap-2">
            <p className="text-[12px] text-muted-foreground leading-none">
              <span>{typeLabel[lectureType] ?? lectureType}</span>
              {dateStr && <span className="mx-1">·</span>}
              {dateStr && <span className="font-medium text-foreground/70">{dateStr}</span>}
            </p>
            {/* Completion toggle — tap to mark done / undo */}
            {onMarkComplete ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onMarkComplete(e); }}
                aria-label={isCompleted ? "Mark as not done" : "Mark as done"}
                aria-pressed={isCompleted}
                className="nb-tap -m-2 p-2 rounded-full shrink-0 hover:bg-muted/60 active:scale-90 transition"
              >
                {isCompleted ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500 fill-green-500" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground/60" />
                )}
              </button>
            ) : isCompleted ? (
              <CheckCircle2 className="h-5 w-5 text-green-500 fill-green-500 shrink-0" aria-label="Completed" />
            ) : (
              <Circle className="h-5 w-5 text-muted-foreground/50 shrink-0" aria-hidden="true" />
            )}
          </div>

          {/* Title */}
          <h4 className="font-bold text-foreground text-[15px] leading-snug line-clamp-2 mt-1">{title}</h4>

          {/* Duration */}
          {isVideo && durationStr && (
            <p className="text-[13px] text-muted-foreground mt-1">{durationStr}</p>
          )}
        </div>
      </div>

      {/* Action row: Download · Attachments · Watch */}
      <div className="mt-3 flex items-stretch gap-2">
        {onDownloadClick && (isVideo || hasAttachments) && (
          <button
            onClick={(e) => { e.stopPropagation(); onDownloadClick(e); }}
            aria-label="Download"
            className="nb-tap shrink-0 inline-flex items-center justify-center bg-muted/60 hover:bg-muted text-foreground rounded-xl h-11 w-11 transition-colors"
          >
            <Download className="h-4 w-4" />
          </button>
        )}

        {hasAttachments && (
          <button
            onClick={(e) => { e.stopPropagation(); onNotesClick?.(); }}
            aria-label="Open attached PDF / notes"
            className="nb-tap flex-1 min-w-0 inline-flex items-center gap-2 bg-muted/40 hover:bg-muted/70 border border-border/60 rounded-xl h-11 pl-1 pr-3 text-left transition-colors"
          >
            <span className="shrink-0 h-9 w-9 rounded-lg bg-background dark:bg-zinc-900 border border-border/60 flex items-center justify-center overflow-hidden">
              <img src={pdfIconSvg} alt="" width={22} height={22} className="w-[22px] h-[22px]" loading="lazy" decoding="async" />
            </span>
            <span className="flex-1 min-w-0 leading-tight">
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-foreground">PDF</span>
              <span className="block text-[12px] font-medium text-muted-foreground truncate">
                {[classPdfUrl ? "Notes" : null, hasDpp ? "DPP" : null, pdfCount > 0 ? "Slides" : null, attachmentCount > 0 ? "Files" : null]
                  .filter(Boolean)
                  .join(", ") || "Attachments"}
              </span>
            </span>
          </button>
        )}

        <button
          onClick={handlePrimary}
          className="nb-tap ml-auto inline-flex items-center justify-center gap-2 bg-foreground text-background hover:bg-foreground/90 rounded-xl h-11 px-4 text-sm font-semibold transition-colors"
        >
          {watchIcon}
          {watchLabel}
        </button>
      </div>

      {/* Inline toggle in header circle handles mark-done; no duplicate button here */}
    </div>
  );
};

// Memo-wrap so MyCourseDetail's lesson list can skip re-rendering rows when
// only sibling state changes. Parent must pass stable callback identities
// (see LectureRow adapter in MyCourseDetail.tsx).
export const LectureCard = memo(LectureCardImpl);
LectureCard.displayName = "LectureCard";

export default LectureCard;
