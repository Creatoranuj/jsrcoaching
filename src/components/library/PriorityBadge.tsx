import { Flag } from "lucide-react";
import { Badge } from "../ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Button } from "../ui/button";
import {
  setPriority,
  setPriorityBulk,
  useItemPriority,
  type Priority,
} from "../../lib/itemPriority";

const STYLE: Record<Exclude<Priority, 0>, string> = {
  1: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30",
  2: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  3: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30",
};
const LABEL: Record<Priority, string> = {
  0: "No priority",
  1: "P1 — Top",
  2: "P2 — Important",
  3: "P3 — Later",
};

interface BadgeProps {
  itemKey: string;
}
/** Inline tappable badge for a single item. */
export function PriorityBadgeChip({ itemKey }: BadgeProps) {
  const p = useItemPriority(itemKey);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Set priority — current: ${LABEL[p]}`}
          className="inline-flex items-center"
          onClick={(e) => e.stopPropagation()}
        >
          {p === 0 ? (
            <span className="inline-flex items-center gap-1 rounded border border-dashed border-muted-foreground/40 px-1.5 h-4 text-[10px] text-muted-foreground hover:border-foreground/40">
              <Flag className="h-2.5 w-2.5" /> Priority
            </span>
          ) : (
            <Badge className={`text-[10px] px-1.5 py-0 h-4 border ${STYLE[p]}`}>
              P{p}
            </Badge>
          )}
        </button>
      </DropdownMenuTrigger>
      <PriorityMenuContent
        current={p}
        onPick={(np) => setPriority(itemKey, np)}
      />
    </DropdownMenu>
  );
}

interface BulkProps {
  itemKeys: string[];
  trigger?: React.ReactNode;
  onAfter?: () => void;
}
/** Bulk picker used in selection action bars. */
export function PriorityBulkPicker({ itemKeys, trigger, onAfter }: BulkProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="h-9">
            <Flag className="h-3.5 w-3.5 mr-1" /> Priority
          </Button>
        )}
      </DropdownMenuTrigger>
      <PriorityMenuContent
        current={0}
        onPick={(p) => {
          setPriorityBulk(itemKeys, p);
          onAfter?.();
        }}
      />
    </DropdownMenu>
  );
}

function PriorityMenuContent({
  current,
  onPick,
}: {
  current: Priority;
  onPick: (p: Priority) => void;
}) {
  return (
    <DropdownMenuContent align="end" className="w-44">
      <DropdownMenuLabel className="text-[11px]">Set priority</DropdownMenuLabel>
      <DropdownMenuSeparator />
      {([1, 2, 3] as const).map((n) => (
        <DropdownMenuItem
          key={n}
          onClick={() => onPick(n)}
          className={current === n ? "font-semibold" : ""}
        >
          <span className={`inline-block w-2 h-2 rounded-full mr-2 ${
            n === 1 ? "bg-rose-500" : n === 2 ? "bg-amber-500" : "bg-sky-500"
          }`} />
          {LABEL[n]}
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => onPick(0)} className="text-muted-foreground">
        Clear priority
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}

export const PRIORITY_LABEL = LABEL;
