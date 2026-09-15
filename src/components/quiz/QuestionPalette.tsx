import { cn } from "../../lib/utils";
import { Flag } from "lucide-react";

interface QuestionPaletteProps {
  total: number;
  currentIndex: number;
  answers: Record<string, string>;
  flagged: Set<string>;
  questionIds: string[];
  onNavigate: (index: number) => void;
}

const QuestionPalette = ({
  total,
  currentIndex,
  answers,
  flagged,
  questionIds,
  onNavigate,
}: QuestionPaletteProps) => {
  const answered = Object.keys(answers).filter((k) => answers[k] !== "").length;
  const flaggedCount = flagged.size;
  const unanswered = total - answered;

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded bg-green-500 inline-block" />
          Answered ({answered})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded bg-yellow-500 inline-block" />
          Flagged ({flaggedCount})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded bg-muted-foreground/20 inline-block" />
          Unanswered ({unanswered})
        </span>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-5 gap-1.5">
        {questionIds.map((qId, idx) => {
          const isAnswered = !!answers[qId];
          const isFlagged = flagged.has(qId);
          const isCurrent = idx === currentIndex;

          return (
            <button
              key={qId}
              onClick={() => onNavigate(idx)}
              className={cn(
                "relative h-9 w-full rounded-lg text-xs font-semibold border-2 transition-all",
                isCurrent
                  ? "border-primary bg-primary text-primary-foreground shadow-md scale-105"
                  : isFlagged
                  ? "border-yellow-400 bg-yellow-400/20 text-yellow-700 dark:text-yellow-400"
                  : isAnswered
                  ? "border-green-500 bg-green-500/20 text-green-700 dark:text-green-400"
                  : "border-border bg-muted/30 text-muted-foreground hover:border-primary/50"
              )}
            >
              {idx + 1}
              {isFlagged && (
                <Flag className="absolute -top-1 -right-1 h-2.5 w-2.5 text-yellow-500 fill-yellow-500" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default QuestionPalette;
