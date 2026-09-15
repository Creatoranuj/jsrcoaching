import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../integrations/supabase/client";
import Header from "../components/Layout/Header";
import Sidebar from "../components/Layout/Sidebar";
import { useAuth } from "../contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../components/ui/dialog";
import { Textarea } from "../components/ui/textarea";
import { toast } from "sonner";
import { Users as UsersIcon, Search, ShieldOff, ShieldCheck, RefreshCw, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Row = {
  id: string;
  full_name: string | null;
  email: string | null;
  mobile: string | null;
  created_at: string | null;
  is_blocked: boolean;
  blocked_reason: string | null;
  batch_count: number;
};

const AdminUsers = () => {
  const { isAdmin, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [target, setTarget] = useState<Row | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAdmin) navigate("/admin/login");
  }, [authLoading, isAdmin, navigate]);

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: profiles }, { data: enrollments }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email, mobile, created_at, is_blocked, blocked_reason").order("created_at", { ascending: false }).limit(500),
      supabase.from("enrollments").select("user_id"),
    ]);
    const counts: Record<string, number> = {};
    (enrollments ?? []).forEach((e) => { counts[e.user_id] = (counts[e.user_id] ?? 0) + 1; });
    setRows((profiles ?? []).map((p) => ({ ...p, batch_count: counts[p.id] ?? 0 })));
    setLoading(false);
  };

  useEffect(() => { if (isAdmin) fetchAll(); }, [isAdmin]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter(r =>
      (r.full_name ?? "").toLowerCase().includes(t) ||
      (r.email ?? "").toLowerCase().includes(t) ||
      (r.mobile ?? "").includes(t)
    );
  }, [rows, q]);

  const doBlock = async (blocked: boolean) => {
    if (!target) return;
    setBusy(true);
    const { error } = await supabase.rpc("admin_set_user_block", {
      _user_id: target.id, _blocked: blocked, _reason: reason || null,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(blocked ? "User blocked" : "User unblocked");
    setTarget(null); setReason("");
    fetchAll();
  };

  if (authLoading) return null;

  return (
    <div className="min-h-dvh bg-background flex">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-h-dvh">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 p-4 md:p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <UsersIcon className="h-6 w-6 text-primary" /> Users
            </h1>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name/email/phone" className="pl-8 w-64" />
              </div>
              <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading} className="gap-2">
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
              </Button>
            </div>
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{filtered.length} users</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {filtered.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 active:scale-[0.99] transition-all">
                    <button
                      onClick={() => navigate(`/admin/users/${r.id}`)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">{r.full_name || "Unnamed"}</p>
                        {r.is_blocked && <Badge variant="destructive" className="text-[10px]">BLOCKED</Badge>}
                        <Badge variant="secondary" className="text-[10px]">{r.batch_count} batches</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{r.email || r.mobile || r.id.slice(0, 8)}</p>
                      {r.created_at && <p className="text-[10px] text-muted-foreground">joined {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</p>}
                    </button>
                    <Button
                      variant={r.is_blocked ? "outline" : "destructive"}
                      size="sm"
                      onClick={() => { setTarget(r); setReason(r.blocked_reason ?? ""); }}
                      className="gap-1 min-h-[44px]"
                    >
                      {r.is_blocked ? <><ShieldCheck className="h-4 w-4" /> Unblock</> : <><ShieldOff className="h-4 w-4" /> Block</>}
                    </Button>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                ))}
                {!loading && filtered.length === 0 && (
                  <div className="py-10 text-center text-muted-foreground">No users found.</div>
                )}
              </div>
            </CardContent>
          </Card>
        </main>
      </div>

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{target?.is_blocked ? "Unblock user" : "Block user"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {target?.full_name || target?.email || target?.id}
            </p>
            {!target?.is_blocked && (
              <Textarea
                placeholder="Reason (visible to admins only)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTarget(null)}>Cancel</Button>
            <Button
              variant={target?.is_blocked ? "default" : "destructive"}
              onClick={() => doBlock(!target?.is_blocked)}
              disabled={busy || (!target?.is_blocked && !reason.trim())}
            >
              {target?.is_blocked ? "Unblock" : "Block"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminUsers;