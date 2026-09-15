import { ALL_CHIP, type FormatChip } from "../../lib/formatChips";
import { cn } from "../../lib/utils";
import { selectionHaptic } from "../../lib/native/haptics";

interface Props {
  /** Pre-computed, sorted chips (highest count first). */
  chips: FormatChip[];
  /** Total item count (used for the "All" chip). */
  total: number;
  selected: string;
  onChange: (next: string) => void;
  className?: string;
}

type ChipProps = {
  value: string;
  label: string;
  count: number;
  active: boolean;
  onSelect: (value: string) => void;
};

/** Hoisted so it is a stable component type across renders (no remount on filter change). */
function Chip({ value, label, count, active, onSelect }: ChipProps) {
  return (
    <button
      type="button"
      onClick={() => {
        void selectionHaptic();
        onSelect(value);
      }}
      aria-pressed={active}
      role="tab"
      className={cn(
        "inline-flex items-center gap-1.5 h-7 px-3 rounded-full whitespace-nowrap shrink-0",
        "text-xs transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        active
          ? "bg-foreground text-background font-medium"
          : "border border-border/60 bg-background text-foreground/70 hover:bg-muted/60 hover:text-foreground",
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          "inline-flex items-center justify-center h-4 min-w-[1rem] px-1 rounded-full",
          "text-[10px] tabular-nums leading-none",
          active ? "bg-background/20 text-background" : "bg-muted/70 text-foreground/60",
        )}
      >
        {count}
      </span>
    </button>
  );
}

/**
 * Horizontal scrollable chip row filtering a file list by format
 * (PDF, DOC, MD, IMAGE, VIDEO, …).
 *
 * Lovable-style: pill shape, same geometry active/inactive, inverted bg on active
 * (no color swap, no border on active). See skill: lovable-design-language.
 */
export default function FormatFilterChips({
  chips,
  total,
  selected,
  onChange,
  className,
}: Props) {
  if (total === 0) return null;

  return (
    <div
      className={cn(
        "-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1",
        "scrollbar-none [&::-webkit-scrollbar]:hidden",
        className,
      )}
      role="tablist"
      aria-label="Filter by file format"
    >
      <Chip value={ALL_CHIP} label="All" count={total} active={selected === ALL_CHIP} onSelect={onChange} />
      {chips.map((c) => (
        <Chip
          key={c.type}
          value={c.type}
          label={c.type}
          count={c.count}
          active={selected === c.type}
          onSelect={onChange}
        />
      ))}
    </div>
  );
}
