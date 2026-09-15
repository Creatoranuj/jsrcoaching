import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  IndianRupee,
  CheckCircle,
  XCircle,
  RotateCcw,
  TrendingUp,
  RefreshCw,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { format, subDays, differenceInCalendarDays } from "date-fns";
import { Badge } from "@/components/ui/badge";
import ApkDownloadsCard from "./ApkDownloadsCard";
import type { Range } from "./RangePicker";

interface Props {
  range: Range;
}

const fmtInr = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

const KpiCard = ({
  title,
  value,
  icon: Icon,
  sub,
  tone = "default",
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  sub?: string;
  tone?: "default" | "success" | "danger" | "warning";
}) => {
  const toneClass =
    tone === "success"
      ? "bg-[hsl(142,71%,45%)]/10 text-[hsl(142,71%,35%)]"
      : tone === "danger"
        ? "bg-destructive/10 text-destructive"
        : tone === "warning"
          ? "bg-[hsl(38,92%,45%)]/10 text-[hsl(38,92%,45%)]"
          : "bg-primary/10 text-primary";
  return (
    <Card className="border-border">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              {title}
            </p>
            <p className="text-2xl font-bold text-foreground mt-1 tabular-nums">
              {value}
            </p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`p-2.5 rounded-lg ${toneClass}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

interface PaymentRow {
  id: string;
  user_id: string;
  course_id: number | null;
  amount: number;
  status: string;
  created_at: string;
}

export default function PaymentsSection({ range }: Props) {
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [courseMap, setCourseMap] = useState<Record<number, string>>({});
  const [userMap, setUserMap] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("razorpay_payments")
        .select("id, user_id, course_id, amount, status, created_at")
        .gte("created_at", range.from.toISOString())
        .lte("created_at", range.to.toISOString())
        .order("created_at", { ascending: false })
        .limit(2000);

      if (cancelled) return;
      const rows = (data ?? []) as PaymentRow[];
      setPayments(rows);

      const courseIds = [...new Set(rows.map((r) => r.course_id).filter(Boolean))] as number[];
      const userIds = [...new Set(rows.slice(0, 20).map((r) => r.user_id))];

      const [{ data: courses }, { data: profiles }] = await Promise.all([
        courseIds.length
          ? supabase.from("courses").select("id, title").in("id", courseIds)
          : Promise.resolve({ data: [] as any[] }),
        userIds.length
          ? supabase.from("profiles").select("id, full_name").in("id", userIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      if (cancelled) return;
      const cm: Record<number, string> = {};
      (courses ?? []).forEach((c) => (cm[c.id] = c.title));
      setCourseMap(cm);

      const um: Record<string, string> = {};
      (profiles ?? []).forEach((p) => (um[p.id] = p.full_name ?? "—"));
      setUserMap(um);

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

  const succeeded = payments.filter((p) => p.status === "captured" || p.status === "paid");
  const failed = payments.filter((p) => p.status === "failed");
  const refunded = payments.filter((p) => p.status === "refunded");
  const revenue = succeeded.reduce((s, p) => s + Number(p.amount ?? 0), 0);
  const uniquePayers = new Set(succeeded.map((p) => p.user_id)).size;
  const arpu = uniquePayers > 0 ? revenue / uniquePayers : 0;

  // Daily revenue trend
  const dayCount = Math.max(differenceInCalendarDays(range.to, range.from) + 1, 1);
  const daily = new Map<string, number>();
  succeeded.forEach((p) => {
    const key = format(new Date(p.created_at), "yyyy-MM-dd");
    daily.set(key, (daily.get(key) ?? 0) + Number(p.amount ?? 0));
  });
  const revenueTrend = Array.from({ length: dayCount }, (_, i) => {
    const d = subDays(range.to, dayCount - 1 - i);
    const key = format(d, "yyyy-MM-dd");
    return { date: format(d, "MMM dd"), revenue: Math.round(daily.get(key) ?? 0) };
  });

  // Top courses by revenue
  const perCourse = new Map<number, number>();
  succeeded.forEach((p) => {
    if (p.course_id == null) return;
    perCourse.set(p.course_id, (perCourse.get(p.course_id) ?? 0) + Number(p.amount ?? 0));
  });
  const topCourses = Array.from(perCourse.entries())
    .map(([id, rev]) => ({
      name:
        (courseMap[id] ?? `Course #${id}`).slice(0, 22) +
        ((courseMap[id]?.length ?? 0) > 22 ? "…" : ""),
      revenue: Math.round(rev),
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KpiCard title="Revenue" value={fmtInr(revenue)} icon={IndianRupee} sub="captured" />
        <KpiCard
          title="Successful"
          value={succeeded.length}
          icon={CheckCircle}
          tone="success"
        />
        <KpiCard title="Failed" value={failed.length} icon={XCircle} tone="danger" />
        <KpiCard
          title="Refunded"
          value={refunded.length}
          icon={RotateCcw}
          tone="warning"
        />
        <KpiCard title="ARPU" value={fmtInr(Math.round(arpu))} icon={TrendingUp} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <IndianRupee className="h-4 w-4 text-primary" />
              Daily Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={revenueTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v) => fmtInr(Number(v))}
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="revenue"
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
              <TrendingUp className="h-4 w-4 text-primary" />
              Top Courses by Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topCourses.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No paid enrollments in range.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={topCourses} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    tick={{ fontSize: 11 }}
                    width={140}
                  />
                  <Tooltip
                    formatter={(v) => fmtInr(Number(v))}
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ApkDownloadsCard />

        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Recent Payments</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-80 overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/40 sticky top-0">
                  <tr>
                    <th className="text-left p-2 font-medium">User</th>
                    <th className="text-left p-2 font-medium">Course</th>
                    <th className="text-right p-2 font-medium">Amount</th>
                    <th className="text-left p-2 font-medium">Status</th>
                    <th className="text-left p-2 font-medium">When</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.slice(0, 20).map((p) => (
                    <tr key={p.id} className="border-t border-border">
                      <td className="p-2 truncate max-w-[110px]">
                        {userMap[p.user_id] ?? p.user_id.slice(0, 6)}
                      </td>
                      <td className="p-2 truncate max-w-[120px]">
                        {p.course_id != null ? courseMap[p.course_id] ?? `#${p.course_id}` : "—"}
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {fmtInr(Number(p.amount ?? 0))}
                      </td>
                      <td className="p-2">
                        <Badge
                          variant={
                            p.status === "captured" || p.status === "paid"
                              ? "default"
                              : p.status === "failed"
                                ? "destructive"
                                : "secondary"
                          }
                          className="text-[10px]"
                        >
                          {p.status}
                        </Badge>
                      </td>
                      <td className="p-2 text-xs text-muted-foreground">
                        {format(new Date(p.created_at), "dd MMM HH:mm")}
                      </td>
                    </tr>
                  ))}
                  {payments.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="p-6 text-center text-muted-foreground text-sm"
                      >
                        No payments in range.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}