import { Trash2, X, CheckSquare, Square } from "lucide-react";
import { Button } from "../ui/button";
import { PriorityBulkPicker } from "./PriorityBadge";

interface Props {
  count: number;
  total: number;
  onClear: () => void;
  onSelectAll: () => void;
  onDelete: () => void;
  selectedKeys: string[];
  extraActions?: React.ReactNode;
}

/**
 * Sticky bottom action bar shown when the user is in multi-select mode.
 * Safe-area aware so it stays above the Android nav bar / iOS home indicator.
 */
export default function SelectionActionBar({
  count,
  total,
  onClear,
  onSelectAll,
  onDelete,
  selectedKeys,
  extraActions,
}: Props) {
  const allSelected = count > 0 && count === total;
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 shadow-[0_-4px_12px_-2px_rgba(0,0,0,0.08)] safe-area-bottom"
      role="region"
      aria-label="Selection actions"
    >
      <div className="max-w-3xl mx-auto px-3 py-2 flex items-center gap-2">
        <Button
          size="icon"
          variant="ghost"
          onClick={onClear}
          className="h-9 w-9 shrink-0"
          aria-label="Exit selection"
        >
          <X className="h-4 w-4" />
        </Button>
        <button
          type="button"
          onClick={onSelectAll}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary transition-colors"
        >
          {allSelected ? (
            <CheckSquare className="h-4 w-4 text-primary" />
          ) : (
            <Square className="h-4 w-4 text-muted-foreground" />
          )}
          {count} selected
        </button>
        <div className="flex-1" />
        {extraActions}
        <PriorityBulkPicker itemKeys={selectedKeys} />
        <Button
          size="sm"
          variant="destructive"
          onClick={onDelete}
          disabled={count === 0}
          className="h-9"
        >
          <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
        </Button>
      </div>
    </div>
  );
}
