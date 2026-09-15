import { memo } from "react";
import {
  MessageCircle, Paperclip, FileText, HelpCircle, ListVideo, MessageSquare,
  Bookmark as BookmarkIcon, Users, ThumbsUp, Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { LessonChip, LessonChipIcon } from "@/features/lesson/lib/lessonChips";

const ICONS: Record<LessonChipIcon, React.ComponentType<{ className?: string }>> = {
  comments: MessageCircle,
  attachment: Paperclip,
  notes: FileText,
  "ask-doubt": HelpCircle,
  timeline: ListVideo,
  "my-doubts": MessageSquare,
  bookmarks: BookmarkIcon,
  mentors: Users,
  like: ThumbsUp,
  rating: Star,
};

export interface LessonChipStripProps {
  chips: LessonChip[];
  activeChip: string;
  hasLiked: boolean;
  likesLoading: boolean;
  /** Hidden while a PDF is open and the chrome has timed out. */
  collapsed: boolean;
  /** Custom icon image for the Smart Notes chip. */
  notesIconSrc?: string;
  onSelect: (id: string) => void;
  onToggleLike: () => void;
}

/**
 * Horizontal pill chip strip above the lesson panels. Presentational only —
 * all state and side effects stay in LessonView.
 */
export const LessonChipStrip = memo(function LessonChipStrip({
  chips,
  activeChip,
  hasLiked,
  likesLoading,
  collapsed,
  notesIconSrc,
  onSelect,
  onToggleLike,
}: LessonChipStripProps) {
  return (
    <div
      className={cn(
        "nb-snap-x flex items-center gap-2 overflow-x-auto scrollbar-hide transition-all duration-300",
        collapsed
          ? "hidden"
          : "mx-3 lg:mx-0 mb-3 px-3 py-2 rounded-full bg-card/85 backdrop-blur-md border border-border/60 shadow-[0_4px_16px_-6px_rgb(0_0_0/0.12)]"
      )}
    >
      {chips.map((chip) => {
        const Icon = ICONS[chip.icon];
        const isLikeChip = chip.action === "like";
        const active = isLikeChip ? hasLiked : activeChip === chip.id;
        const iconSrc = chip.icon === "notes" ? notesIconSrc : undefined;
        return (
          <button
            key={chip.id}
            onClick={() => {
              if (isLikeChip) { onToggleLike(); return; }
              onSelect(chip.id);
            }}
            disabled={isLikeChip && likesLoading}
            className={cn(
              "shrink-0 min-h-11 inline-flex items-center gap-1.5 rounded-full border px-4 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-foreground text-background border-foreground"
                : "bg-transparent text-foreground border-border hover:bg-accent/30"
            )}
          >
            {iconSrc ? (
              <img src={iconSrc} alt="" width={18} height={18} className="h-[18px] w-[18px] shrink-0" />
            ) : (
              <Icon className={cn("h-4 w-4", isLikeChip && hasLiked && "fill-current")} />
            )}
            {chip.label}
          </button>
        );
      })}
    </div>
  );
});
