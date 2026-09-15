import { memo } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface LessonLockedOverlayProps {
  lessonCount: number;
  onBuy: () => void;
}

/** Overlay shown on top of the player when the lesson is not accessible. */
export const LessonLockedOverlay = memo(function LessonLockedOverlay({
  lessonCount,
  onBuy,
}: LessonLockedOverlayProps) {
  return (
    <div className="absolute inset-0 bg-background/95 backdrop-blur-sm flex flex-col items-center justify-center z-20 text-center p-6">
      <div className="bg-foreground/10 p-4 rounded-full mb-4">
        <Lock className="h-8 w-8 text-foreground" />
      </div>
      <h2 className="text-2xl font-bold text-foreground mb-2">Content Locked</h2>
      <p className="text-muted-foreground mb-6 max-w-md">
        Poore course ki saari {lessonCount} lessons ek saath.
      </p>
      <Button
        size="lg"
        className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold px-8"
        onClick={onBuy}
      >
        Full course kholo
      </Button>
    </div>
  );
});
