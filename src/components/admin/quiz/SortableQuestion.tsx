import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronUp, GripVertical, Trash2 } from "lucide-react";
import { cn } from "../../../lib/utils";
import type { QuestionForm } from "./types";

interface Props {
  id: string;
  index: number;
  q: QuestionForm;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  children: React.ReactNode;
}

export const SortableQuestion = ({
  id, index, q, isExpanded, onToggle, onDelete, children,
}: Props) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="bg-card border rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 p-3 sm:p-4">
        <button
          {...attributes}
          {...listeners}
          className="touch-none cursor-grab active:cursor-grabbing p-2 text-muted-foreground hover:text-foreground rounded shrink-0"
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <button
          onClick={onToggle}
          className="flex-1 text-left flex items-center gap-2 min-h-[44px]"
        >
          <span className={cn(
            "text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0",
            q.question_text.trim()
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          )}>
            {index + 1}
          </span>
          <span className={cn(
            "text-sm flex-1 truncate",
            q.question_text.trim() ? "font-medium text-foreground" : "text-muted-foreground italic"
          )}>
            {q.question_text.trim() || "Enter question text..."}
          </span>
          <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">
            {q.marks}m · {q.question_type.replace("_", "/")}
          </span>
        </button>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onDelete}
            className="p-2 text-destructive hover:bg-destructive/10 rounded min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Delete question"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            onClick={onToggle}
            aria-label={isExpanded ? "Collapse question" : "Expand question"}
            aria-expanded={isExpanded}
            className="p-2 text-muted-foreground hover:text-foreground rounded min-h-[44px] min-w-[44px] flex items-center justify-center"
          >

            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-4 border-t pt-4">
          {children}
        </div>
      )}
    </div>
  );
};