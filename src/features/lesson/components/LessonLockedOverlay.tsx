import { memo } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BuyGate } from "@/components/courses/BuyGate";

export interface LessonLockedOverlayProps {
  /** Needed by the Batch Full gate around the CTA. */
  courseId: number | string | null | undefined;
  lessonCount: number;
  onBuy: () => void;
}

/** Overlay shown on top of the player when the lesson is not accessible. */
export const LessonLockedOverlay = memo(function LessonLockedOverlay({
  courseId,
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
      <BuyGate
        courseId={courseId}
        fallback={
          <p className="text-sm font-semibold text-muted-foreground">
            Is batch me enrollment abhi band hai (Batch Full).
          </p>
        }
      >
        <Button
          size="lg"
          className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold px-8"
          onClick={onBuy}
        >
          Full course kholo
        </Button>
      </BuyGate>
    </div>
  );
});
