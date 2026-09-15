import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, UserPlus, Activity, Smartphone, RefreshCw } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  CartesianGrid,
} from "recharts";
import { format, subDays, differenceInCalendarDays } from "date-fns";
import type { Range } from "./RangePicker";

interface Props {
  range: Range;
}

const PLATFORM_COLORS: Record<string, string> = {
  android: "hsl(142,71%,45%)",
  ios: "hsl(216,90%,60%)",
  web: "hsl(38,92%,50%)",
  desktop: "hsl(280,60%,55%)",
  other: "hsl(0,0%,55%)",
};

const KpiCard = ({
  title,
  value,
  icon: Icon,
  sub,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  sub?: string;
}) => (
  <Card className="border-border">
    <CardContent className="pt-5 pb-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
            {title}
          </p>
          <p className="text-3xl font-bold text-foreground mt-1 tabular-nums">
            {value}
          </p>
          {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        </div>
        <div className="p-2.5 rounded-lg bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
      </div>
    </CardContent>
  </Card>
);

export default function UsersSection({ range }: Props) {
  const [loading, setLoading] = useState(true);
  const [totalUsers, setTotalUsers] = useState(0);
  const [newSignups, setNewSignups] = useState(0);
  const [dau, setDau] = useState(0);
  const [wau, setWau] = useState(0);
  const [mau, setMau] = useState(0);
  const [signupTrend, setSignupTrend] = useState<{ date: string; count: number }[]>([]);
  const [activeTrend, setActiveTrend] = useState<{ date: string; count: number }[]>([]);
  const [platforms, setPlatforms] = useState<{ name: string; value: number }[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const fromIso = range.from.toISOString();
      const toIso = range.to.toISOString();
      const now = new Date();

      const [
        { count: totalCount },
        { data: signups },
        { data: sessions },
      ] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase
          .from("profiles")
          .select("id, created_at")
          .gte("created_at", fromIso)
          .lte("created_at", toIso),
        supabase
          .from("user_sessions")
          .select("user_id, device_type, last_active_at")
          .gte("last_active_at", subDays(now, 30).toISOString()),
      ]);

      if (cancelled) return;

      setTotalUsers(totalCount ?? 0);
      setNewSignups(signups?.length ?? 0);

      // Signup trend
      const dayCount = Math.max(
        differenceInCalendarDays(range.to, range.from) + 1,
        1,
      );
      const signupMap = new Map<string, number>();
      (signups ?? []).forEach((s) => {
        const key = format(new Date(s.created_at), "yyyy-MM-dd");
        signupMap.set(key, (signupMap.get(key) ?? 0) + 1);
      });
      const trend = Array.from({ length: dayCount }, (_, i) => {
        const d = subDays(range.to, dayCount - 1 - i);
        const key = format(d, "yyyy-MM-dd");
        return { date: format(d, "MMM dd"), count: signupMap.get(key) ?? 0 };
      });
      setSignupTrend(trend);

      // Active user rollups
      const sess = sessions ?? [];
      const dayAgo = subDays(now, 1).getTime();
      const weekAgo = subDays(now, 7).getTime();
      const monthAgo = subDays(now, 30).getTime();
      const dauSet = new Set<string>();
      const wauSet = new Set<string>();
      const mauSet = new Set<string>();
      const platformMap = new Map<string, number>();
      const activeByDay = new Map<string, Set<string>>();

      sess.forEach((s) => {
        const t = new Date(s.last_active_at).getTime();
        if (t >= dayAgo) dauSet.add(s.user_id);
        if (t >= weekAgo) wauSet.add(s.user_id);
        if (t >= monthAgo) mauSet.add(s.user_id);

        const plat = (s.device_type ?? "other").toLowerCase();
        platformMap.set(plat, (platformMap.get(plat) ?? 0) + 1);

        if (t >= range.from.getTime() && t <= range.to.getTime()) {
          const key = format(new Date(s.last_active_at), "yyyy-MM-dd");
          if (!activeByDay.has(key)) activeByDay.set(key, new Set());
          activeByDay.get(key)!.add(s.user_id);
        }
      });

      setDau(dauSet.size);
      setWau(wauSet.size);
      setMau(mauSet.size);
      setPlatforms(
        Array.from(platformMap.entries()).map(([name, value]) => ({
          name,
          value,
        })),
      );

      const activeTrendData = Array.from({ length: dayCount }, (_, i) => {
        const d = subDays(range.to, dayCount - 1 - i);
        const key = format(d, "yyyy-MM-dd");
        return {
          date: format(d, "MMM dd"),
          count: activeByDay.get(key)?.size ?? 0,
        };
      });
      setActiveTrend(activeTrendData);

      setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to]);

  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KpiCard title="Total Users" value={totalUsers.toLocaleString()} icon={Users} />
        <KpiCard
          title="New Signups"
          value={newSignups.toLocaleString()}
          icon={UserPlus}
          sub="in range"
        />
        <KpiCard title="DAU" value={dau} icon={Activity} sub="last 24h" />
        <KpiCard title="WAU" value={wau} icon={Activity} sub="last 7d" />
        <KpiCard title="MAU" value={mau} icon={Activity} sub="last 30d" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-primary" />
              Daily Signups
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={signupTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Active Users (in range)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={activeTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="hsl(142,71%,45%)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-primary" />
            Platform Split (sessions, last 30d)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {platforms.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No session data.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={platforms}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={2}
                >
                  {platforms.map((p, i) => (
                    <Cell
                      key={i}
                      fill={PLATFORM_COLORS[p.name] ?? PLATFORM_COLORS.other}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}