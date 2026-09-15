import { memo } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface LessonDesktopHeaderProps {
  courseTitle: string;
  gradeLabel: string;
  lessonCount: number;
  hasPurchased: boolean;
  onBack: () => void;
  onBuy: () => void;
}

/**
 * Desktop-only lesson header (back arrow, course title, grade chip, Buy CTA).
 * Mobile intentionally has no top bar — see the note in LessonView.
 */
export const LessonDesktopHeader = memo(function LessonDesktopHeader({
  courseTitle,
  gradeLabel,
  lessonCount,
  hasPurchased,
  onBack,
  onBuy,
}: LessonDesktopHeaderProps) {
  return (
    <header className="hidden lg:flex bg-card border-b h-16 items-center px-4 lg:px-6 sticky top-0 z-30 shadow-sm pt-[env(safe-area-inset-top)]">
      <Button variant="ghost" size="icon" onClick={onBack} className="mr-2" aria-label="Go back">
        <ArrowLeft className="h-5 w-5 text-muted-foreground" />
      </Button>
      <div className="flex-1">
        <h1 className="text-sm lg:text-base font-bold text-foreground line-clamp-1">{courseTitle}</h1>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">{gradeLabel}</span>
          <span>• {lessonCount} Lessons</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {!hasPurchased && (
          <Button
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-md"
            onClick={onBuy}
          >
            Buy Now
          </Button>
        )}
      </div>
    </header>
  );
});
