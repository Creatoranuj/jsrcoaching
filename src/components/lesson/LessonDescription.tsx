/**
 * LessonDescription — Read-more collapsible description block.
 * Extracted from LessonView.tsx (MAINT split).
 */
import { useState } from "react";
import { cn } from "../../lib/utils";

interface LessonDescriptionProps {
  description: string;
}

export const LessonDescription = ({ description }: LessonDescriptionProps) => {
  const [expanded, setExpanded] = useState(false);
  const isLong = description.length > 120;
  return (
    <div className="mt-2">
      <p
        className={cn(
          "text-sm text-muted-foreground leading-relaxed",
          !expanded && isLong && "line-clamp-2"
        )}
      >
        {description}
      </p>
      {isLong && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="text-xs font-semibold text-primary mt-1 hover:underline"
        >
          {expanded ? "Show Less" : "Read More"}
        </button>
      )}
    </div>
  );
};

export default LessonDescription;
