import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../integrations/supabase/client";
import Header from "../components/Layout/Header";
import Sidebar from "../components/Layout/Sidebar";
import { useAuth } from "../contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { toast } from "sonner";
import {
  ArrowLeft, RefreshCw, Mail, Phone, Calendar, BookOpen, CreditCard,
  Trophy, Activity, ShieldOff, ShieldCheck,
} from "lucide-react";
import { format } from "date-fns";

type Snapshot = {
  profile: any;
  enrollments: any[];
  batch_count: number;
  payments: any[];
  total_spent: number;
  lessons_completed: number;
  quiz_attempts: number;
  last_session: any;
};

const AdminStudentDetail = () => {
  const { userId } = useParams<{ userId: string }>();
  const { isAdmin, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (!authLoading && !isAdmin) navigate("/admin/login"); }, [authLoading, isAdmin, navigate]);

  const fetchAll = async () => {
    if (!userId) return;
    setLoading(true);
    const { data: snap, error } = await supabase.rpc("admin_get_user_snapshot", { _user_id: userId });
    if (error) toast.error(error.message);
    setData(snap as unknown as Snapshot);
    setLoading(false);
  };

  useEffect(() => { if (isAdmin && userId) fetchAll(); }, [isAdmin, userId]);

  const toggleBlock = async () => {
    if (!data?.profile) return;
    const blocking = !data.profile.is_blocked;
    const reason = blocking ? window.prompt("Reason for blocking?") ?? "" : "";
    if (blocking && !reason.trim()) return;
    const { error } = await supabase.rpc("admin_set_user_block", {
      _user_id: userId, _blocked: blocking, _reason: reason || null,
    });
    if (error) return toast.error(error.message);
    toast.success(blocking ? "User blocked" : "User unblocked");
    fetchAll();
  };

  if (authLoading) return null;
  const p = data?.profile;

  return (
    <div className="min-h-dvh bg-background flex">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-h-dvh">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 p-4 md:p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => navigate("/admin/users")} className="-ml-1"><ArrowLeft className="h-4 w-4" /></Button>
              <h1 className="text-xl font-bold truncate">{p?.full_name || "Student"}</h1>
              {p?.is_blocked && <Badge variant="destructive">BLOCKED</Badge>}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading} className="gap-2">
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
              </Button>
              {p && (
                <Button variant={p.is_blocked ? "default" : "destructive"} size="sm" onClick={toggleBlock} className="gap-2 min-h-[44px]">
                  {p.is_blocked ? <><ShieldCheck className="h-4 w-4" /> Unblock</> : <><ShieldOff className="h-4 w-4" /> Block</>}
                </Button>
              )}
            </div>
          </div>

          {loading || !data ? (
            <div className="py-16 text-center text-muted-foreground"><RefreshCw className="h-6 w-6 animate-spin mx-auto" /></div>
          ) : (
            <>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Profile</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" />{p?.email || "—"}</div>
                  <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" />{p?.mobile || "—"}</div>
                  <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-muted-foreground" />Joined {p?.created_at ? format(new Date(p.created_at), "dd MMM yyyy") : "—"}</div>
                  <div className="flex items-center gap-2"><Activity className="h-4 w-4 text-muted-foreground" />
                    Last session {data.last_session?.created_at ? format(new Date(data.last_session.created_at), "dd MMM, hh:mm a") : "—"}
                    {data.last_session?.platform && <Badge variant="secondary" className="text-[10px] ml-1">{data.last_session.platform}</Badge>}
                  </div>
                  {p?.is_blocked && (
                    <div className="md:col-span-2 text-destructive text-xs">
                      Blocked {p.blocked_at ? format(new Date(p.blocked_at), "dd MMM") : ""} — {p.blocked_reason || "no reason"}
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Stat icon={BookOpen} label="Batches" value={data.batch_count} />
                <Stat icon={Trophy} label="Lessons Done" value={data.lessons_completed} />
                <Stat icon={Activity} label="Quiz Attempts" value={data.quiz_attempts} />
                <Stat icon={CreditCard} label="Total Spent" value={`₹${Number(data.total_spent).toLocaleString("en-IN")}`} />
              </div>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><BookOpen className="h-4 w-4" /> Enrolled Batches</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-border">
                    {data.enrollments.length === 0 && <div className="p-4 text-sm text-muted-foreground">No enrollments.</div>}
                    {data.enrollments.map((e) => (
                      <div key={e.course_id} className="px-4 py-3 flex items-center justify-between text-sm">
                        <span className="truncate">{e.course_title || `Course #${e.course_id}`}</span>
                        <span className="text-xs text-muted-foreground">{e.enrolled_at ? format(new Date(e.enrolled_at), "dd MMM yyyy") : ""}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><CreditCard className="h-4 w-4" /> Payments</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-border">
                    {data.payments.length === 0 && <div className="p-4 text-sm text-muted-foreground">No payments.</div>}
                    {data.payments.slice(0, 20).map((pay) => (
                      <div key={pay.id} className="px-4 py-2.5 flex items-center justify-between text-sm">
                        <span className="font-mono text-xs truncate">{pay.id.slice(0, 8)}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant={pay.status === "captured" || pay.status === "paid" ? "default" : "secondary"} className="text-[10px]">{pay.status}</Badge>
                          <span className="font-medium">₹{Number(pay.amount ?? 0).toLocaleString("en-IN")}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </main>
      </div>
    </div>
  );
};

const Stat = ({ icon: Icon, label, value }: { icon: any; label: string; value: any }) => (
  <Card><CardContent className="pt-4 pb-3">
    <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide"><Icon className="h-4 w-4" />{label}</div>
    <p className="text-2xl font-bold mt-1">{value}</p>
  </CardContent></Card>
);

export default AdminStudentDetail;