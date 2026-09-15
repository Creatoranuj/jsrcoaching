import { memo } from "react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

// Dashboard stat cards. These now sit ABOVE the tab strip so the key numbers
// stay visible no matter which admin tab is open.

export interface AdminStat {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color: string;
  tab?: string;
}

interface AdminStatsGridProps {
  stats: AdminStat[];
  onSelectTab: (tab: string) => void;
}

function AdminStatsGridImpl({ stats, onSelectTab }: AdminStatsGridProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 md:gap-4">
      {stats.map((stat) => (
        <Card
          key={stat.label}
          className={`border-none shadow-sm ${stat.tab ? "cursor-pointer hover:shadow-md transition-shadow" : ""}`}
          onClick={() => { if (stat.tab) onSelectTab(stat.tab); }}
        >
          <CardContent className="p-2 md:p-4 flex items-center gap-1.5 md:gap-4 min-w-0">
            <div className={`p-1.5 md:p-3 rounded-md md:rounded-xl shrink-0 ${stat.color}`}>
              <stat.icon className="h-3.5 w-3.5 md:h-6 md:w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-base md:text-2xl font-bold text-foreground leading-tight">{stat.value}</p>
              <p className="text-[10px] md:text-sm text-muted-foreground font-medium truncate">{stat.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export const AdminStatsGrid = memo(AdminStatsGridImpl);
