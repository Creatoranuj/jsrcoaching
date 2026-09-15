import { memo } from "react";
import { ChevronRight } from "lucide-react";
import { buildUploadBreadcrumb } from "@/features/admin-upload/lib/uploadRules";

export interface UploadBreadcrumbProps {
  courseTitle?: string | null;
  chapterTitle?: string | null;
  onGoToRoot: () => void;
  onGoToCourse: () => void;
}

/** Upload Center > Course > Chapter navigation. */
export const UploadBreadcrumb = memo(function UploadBreadcrumb({
  courseTitle,
  chapterTitle,
  onGoToRoot,
  onGoToCourse,
}: UploadBreadcrumbProps) {
  const segments = buildUploadBreadcrumb(courseTitle, chapterTitle);
  return (
    <nav
      className="flex items-center gap-1 text-xs overflow-x-auto whitespace-nowrap py-2.5 px-4 mb-4 bg-gradient-to-r from-card/95 to-card/80 backdrop-blur-xl border-b border-border/40 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)] rounded-xl"
      aria-label="Breadcrumb"
    >
      {segments.map((seg, i) => (
        <div key={`${seg.label}-${i}`} className="flex items-center gap-1 shrink-0">
          {i > 0 && <ChevronRight className="h-3 w-3 text-primary/30 mx-0.5 shrink-0" />}
          {seg.clickable ? (
            <button
              onClick={i === 0 ? onGoToRoot : onGoToCourse}
              className="px-2 py-1 rounded-lg text-muted-foreground/80 hover:text-primary hover:bg-primary/10 transition-all duration-150 active:scale-95"
            >
              {seg.label}
            </button>
          ) : (
            <span className="px-2 py-1 rounded-lg font-bold text-primary bg-primary/10 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.12)]">
              {seg.label}
            </span>
          )}
        </div>
      ))}
    </nav>
  );
});
