import { memo } from "react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

// Overview tab of the admin dashboard. Stat cards moved above the tab strip
// (see AdminStatsGrid), so this panel is the compact quick-action grid only.
// Purely presentational: navigation side effects stay in the page.

export type { AdminStat } from "./AdminStatsGrid";

export interface AdminQuickAction {
  label: string;
  description: string;
  icon: LucideIcon;
  tab?: string;
  route?: string;
}

interface AdminOverviewTabProps {
  quickActions: AdminQuickAction[];
  onSelectTab: (tab: string) => void;
  onNavigate: (route: string) => void;
}

function AdminOverviewTabImpl({
  quickActions,
  onSelectTab,
  onNavigate,
}: AdminOverviewTabProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-3">
      {quickActions.map((action) => (
        <Card
          key={action.label}
          className="cursor-pointer hover:shadow-md hover:border-primary/30 transition-all"
          onClick={() => {
            if (action.route) onNavigate(action.route);
            else if (action.tab) onSelectTab(action.tab);
          }}
        >
          <CardContent className="p-3 md:p-4 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <action.icon className="h-4 w-4 shrink-0 text-primary" />
              <p className="font-semibold text-foreground text-sm truncate">{action.label}</p>
            </div>
            <p className="mt-1 pl-6 text-xs text-muted-foreground truncate">{action.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export const AdminOverviewTab = memo(AdminOverviewTabImpl);
