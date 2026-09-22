// recharts 3: `payload`/`label` live on TooltipContentProps (what `content`
// receives), not on TooltipProps (what <Tooltip> accepts).
import type { TooltipContentProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";

// Partial: charts pass `content={<ChartTooltip />}` and recharts injects the
// rest at render time.
export const ChartTooltip = ({ active, payload, label }: Partial<TooltipContentProps<ValueType, NameType>>) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-lg text-sm">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p, i: number) => (
        <p key={i} style={{ color: p.color }} className="text-xs">
          {p.name}: <span className="font-bold">{p.value}</span>
        </p>
      ))}
    </div>
  );
};
