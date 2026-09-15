import { Loader2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface LessonRatingPanelProps {
  ratingValue: number;
  ratingHover: number;
  ratingComment: string;
  ratingSaving: boolean;
  ratingSubmitted: boolean;
  ratingCount: number;
  ratingAvg: number;
  canSubmit: boolean;
  onHover: (star: number) => void;
  onSelect: (star: number) => void;
  onCommentChange: (value: string) => void;
  onSubmit: () => void;
}

export function LessonRatingPanel({
  ratingValue,
  ratingHover,
  ratingComment,
  ratingSaving,
  ratingSubmitted,
  ratingCount,
  ratingAvg,
  canSubmit,
  onHover,
  onSelect,
  onCommentChange,
  onSubmit,
}: LessonRatingPanelProps) {
  return (
    <div className="px-4 py-6">
      <h3 className="font-semibold text-base text-foreground mb-2 flex items-center gap-2">
        <Star className="h-4 w-4 text-amber-500" />
        Rate this Lesson
      </h3>
      <p className="text-sm text-muted-foreground mb-4">Aapka feedback humare liye important hai.</p>
      <div className="flex items-center gap-2 mb-4" onMouseLeave={() => onHover(0)}>
        {[1, 2, 3, 4, 5].map((star) => {
          const filled = (ratingHover || ratingValue) >= star;
          return (
            <button
              key={star}
              onClick={() => onSelect(star)}
              onMouseEnter={() => onHover(star)}
              className="p-1 transition-transform hover:scale-110"
              aria-label={`${star} star`}
            >
              <Star className={cn("h-8 w-8", filled ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")} />
            </button>
          );
        })}
      </div>
      <Textarea
        placeholder="Share your feedback (optional)..."
        value={ratingComment}
        onChange={(e) => onCommentChange(e.target.value)}
        className="min-h-[80px] resize-none mb-3"
      />
      <Button
        disabled={ratingValue === 0 || ratingSaving || !canSubmit}
        onClick={onSubmit}
        className="gap-2"
      >
        {ratingSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {ratingSubmitted ? "Update Rating" : "Submit Rating"}
      </Button>
      {ratingCount > 0 && (
        <p className="text-xs text-muted-foreground mt-2">
          Average {ratingAvg.toFixed(1)} ★ from {ratingCount} student{ratingCount === 1 ? "" : "s"}
        </p>
      )}
    </div>
  );
}
