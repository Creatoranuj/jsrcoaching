import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { format, subDays } from "date-fns";
import { cn } from "@/lib/utils";

export type Range = { from: Date; to: Date; label: string };

export const presetRange = (days: number): Range => ({
  from: subDays(new Date(), days - 1),
  to: new Date(),
  label: `${days}d`,
});

interface Props {
  value: Range;
  onChange: (r: Range) => void;
}

export default function RangePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const presets = [7, 30, 90];
  const isPreset = presets.some((d) => value.label === `${d}d`);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets.map((d) => (
        <Button
          key={d}
          size="sm"
          variant={value.label === `${d}d` ? "default" : "outline"}
          onClick={() => onChange(presetRange(d))}
          className="h-8 rounded-full px-3"
        >
          Last {d}d
        </Button>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            size="sm"
            variant={!isPreset ? "default" : "outline"}
            className={cn("h-8 gap-2 rounded-full px-3")}
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            {isPreset
              ? "Custom"
              : `${format(value.from, "dd MMM")} – ${format(value.to, "dd MMM")}`}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 pointer-events-auto" align="end">
          <Calendar
            mode="range"
            selected={{ from: value.from, to: value.to }}
            onSelect={(r) => {
              if (r?.from && r?.to) {
                onChange({ from: r.from, to: r.to, label: "custom" });
                setOpen(false);
              }
            }}
            numberOfMonths={2}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}