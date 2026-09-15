import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../integrations/supabase/client";
import Header from "../components/Layout/Header";
import Sidebar from "../components/Layout/Sidebar";
import { useAuth } from "../contexts/AuthContext";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { toast } from "sonner";
import { AlertTriangle, RefreshCw, ShieldOff, CheckCircle, User, XCircle, ArrowLeft } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Row = {
  id: number;
  user_id: string;
  course_id: number;
  course_title: string;
  course_price: number;
  full_name: string | null;
  email: string | null;
  mobile: string | null;
  is_blocked: boolean | null;
  purchased_at: string;
  ok_count: number;
  max_ok_amount: number | null;
  any_paid_count: number;
  latest_status: string | null;
  rule: string;
  severity: "critical" | "high" | "medium" | "low";
};

const RULE_LABEL: Record<string, string> = {
  no_payment: "No payment record",
  payment_for_wrong_course: "Paid for different course",
  payment_failed: "Latest payment failed/refunded",
  amount_mismatch: "Paid less than price",
  duplicate_order: "Order ID reused across users",
  velocity: "Burst: 5+ enrollments in 10 min",
};

const SEVERITY_STYLE: Record<Row["severity"], string> = {
  critical: "bg-destructive/15 text-destructive border-destructive/30",
  high: "bg-[hsl(38,92%,50%)]/15 text-[hsl(38,92%,35%)] border-[hsl(38,92%,50%)]/30",
  medium: "bg-primary/10 text-primary border-primary/20",
  low: "bg-muted text-muted-foreground",
};

const AdminFraudWatch = () => {
  const { isAdmin, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | Row["severity"]>("all");
  const [q, setQ] = useState("");

  useEffect(() => { if (!authLoading && !isAdmin) navigate("/admin/login"); }, [authLoading, isAdmin, navigate]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_get_suspicious_enrollments", { _limit: 200 });
    if (error) toast.error(error.message);
    setRows((data as unknown as Row[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  const counts = useMemo(() => ({
    critical: rows.filter(r => r.severity === "critical").length,
    high: rows.filter(r => r.severity === "high").length,
    medium: rows.filter(r => r.severity === "medium").length,
  }), [rows]);

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (filter !== "all" && r.severity !== filter) return false;
      if (!q) return true;
      const s = q.toLowerCase();
      return (r.full_name ?? "").toLowerCase().includes(s)
        || (r.email ?? "").toLowerCase().includes(s)
        || (r.mobile ?? "").includes(s)
        || (r.course_title ?? "").toLowerCase().includes(s);
    });
  }, [rows, filter, q]);

  const revoke = async (r: Row) => {
    const reason = window.prompt(`Revoke access to "${r.course_title}" for ${r.full_name || r.email}?\n\nReason:`);
    if (!reason?.trim()) return;
    const { error } = await supabase.rpc("admin_revoke_enrollment", { _enrollment_id: r.id, _reason: reason });
    if (error) return toast.error(error.message);
    toast.success("Access revoked");
    load();
  };

  const block = async (r: Row) => {
    const reason = window.prompt(`Block user ${r.full_name || r.email}?\n\nReason:`);
    if (!reason?.trim()) return;
    const { error } = await supabase.rpc("admin_set_user_block", { _user_id: r.user_id, _blocked: true, _reason: reason });
    if (error) return toast.error(error.message);
    toast.success("User blocked");
    load();
  };

  const whitelist = async (r: Row) => {
    const note = window.prompt("Mark this enrollment as legitimate? Add a note:");
    if (!note?.trim()) return;
    const { error } = await supabase.rpc("admin_mark_enrollment_legit", { _enrollment_id: r.id, _note: note });
    if (error) return toast.error(error.message);
    toast.success("Whitelisted");
    load();
  };

  if (authLoading) return null;

  return (
    <div className="min-h-dvh bg-background flex">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-h-dvh">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 p-4 md:p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="-ml-1" onClick={() => navigate("/admin")}><ArrowLeft className="h-4 w-4" /></Button>
              <div>
                <h1 className="text-xl font-bold flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-destructive" /> Fraud Watch</h1>
                <p className="text-xs text-muted-foreground mt-0.5">Enrollments without valid payment · scanned server-side</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2 min-h-[44px]">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Rescan
            </Button>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Chip active={filter === "all"} onClick={() => setFilter("all")}>All · {rows.length}</Chip>
            <Chip active={filter === "critical"} onClick={() => setFilter("critical")} tone="critical">Critical · {counts.critical}</Chip>
            <Chip active={filter === "high"} onClick={() => setFilter("high")} tone="high">High · {counts.high}</Chip>
            <Chip active={filter === "medium"} onClick={() => setFilter("medium")} tone="medium">Medium · {counts.medium}</Chip>
          </div>

          <Input placeholder="Search name / email / phone / course…" value={q} onChange={e => setQ(e.target.value)} className="max-w-md text-base" />

          {loading ? (
            <div className="py-16 text-center"><RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <Card><CardContent className="py-12 text-center space-y-2">
              <CheckCircle className="h-10 w-10 mx-auto text-primary" />
              <p className="font-medium">No suspicious enrollments 🎉</p>
              <p className="text-xs text-muted-foreground">Every paid course access has a matching Razorpay payment.</p>
            </CardContent></Card>
          ) : (
            <div className="space-y-3">
              {filtered.map(r => (
                <Card key={r.id} className="border-border overflow-hidden">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <Badge variant="outline" className={`uppercase text-[10px] font-bold ${SEVERITY_STYLE[r.severity]}`}>{r.severity}</Badge>
                          <Badge variant="secondary" className="text-[10px]">{RULE_LABEL[r.rule] ?? r.rule}</Badge>
                          {r.is_blocked && <Badge variant="destructive" className="text-[10px]">BLOCKED</Badge>}
                        </div>
                        <p className="font-semibold truncate">{r.full_name || "Unknown"}</p>
                        <p className="text-xs text-muted-foreground truncate">{r.email || "—"} · {r.mobile || "no phone"}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs bg-muted/30 rounded-lg p-3">
                      <div><span className="text-muted-foreground">Course</span><p className="font-medium truncate">{r.course_title}</p></div>
                      <div><span className="text-muted-foreground">Price</span><p className="font-medium">₹{Number(r.course_price).toLocaleString("en-IN")}</p></div>
                      <div><span className="text-muted-foreground">Paid OK</span><p className="font-medium">{r.ok_count > 0 ? `₹${Number(r.max_ok_amount ?? 0).toLocaleString("en-IN")}` : <span className="text-destructive">NONE</span>}</p></div>
                      <div><span className="text-muted-foreground">Enrolled</span><p className="font-medium">{formatDistanceToNow(new Date(r.purchased_at), { addSuffix: true })}</p></div>
                    </div>

                    <div className="flex gap-2 flex-wrap">
                      <Button size="sm" variant="outline" className="gap-2 min-h-[44px]" onClick={() => navigate(`/admin/users/${r.user_id}`)}>
                        <User className="h-4 w-4" /> View student
                      </Button>
                      <Button size="sm" variant="destructive" className="gap-2 min-h-[44px] active:scale-[0.97] transition-transform duration-150" onClick={() => revoke(r)}>
                        <XCircle className="h-4 w-4" /> Revoke access
                      </Button>
                      {!r.is_blocked && (
                        <Button size="sm" variant="destructive" className="gap-2 min-h-[44px] active:scale-[0.97] transition-transform duration-150" onClick={() => block(r)}>
                          <ShieldOff className="h-4 w-4" /> Block user
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="gap-2 min-h-[44px]" onClick={() => whitelist(r)}>
                        <CheckCircle className="h-4 w-4" /> Mark legit
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

const Chip = ({ active, onClick, children, tone }: { active: boolean; onClick: () => void; children: React.ReactNode; tone?: "critical" | "high" | "medium" }) => (
  <button
    onClick={onClick}
    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors min-h-[36px] active:scale-[0.97] duration-150
      ${active
        ? tone === "critical" ? "bg-destructive text-destructive-foreground border-destructive"
        : tone === "high" ? "bg-[hsl(38,92%,50%)] text-white border-[hsl(38,92%,50%)]"
        : tone === "medium" ? "bg-primary text-primary-foreground border-primary"
        : "bg-foreground text-background border-foreground"
        : "bg-background text-foreground border-border hover:bg-muted"}`}
  >{children}</button>
);

export default AdminFraudWatch;