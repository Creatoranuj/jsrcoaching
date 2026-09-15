import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../integrations/supabase/client";
import Header from "../components/Layout/Header";
import Sidebar from "../components/Layout/Sidebar";
import { useAuth } from "../contexts/AuthContext";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import BatchCommentsPanel from "../components/admin/BatchCommentsPanel";
import { toast } from "sonner";
import { EyeOff, Eye, Flag, RefreshCw, ShieldAlert } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type ContentType = "post" | "comment" | "reply";

type Item = {
  id: string;
  user_id: string | null;
  body: string;
  created_at: string;
  is_hidden: boolean;
  hidden_reason: string | null;
};

type Report = {
  id: string;
  reporter_id: string;
  content_type: ContentType;
  content_id: string;
  reason: string;
  status: string;
  created_at: string;
};

const AdminModeration = () => {
  const { isAdmin, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tab, setTab] = useState<"posts" | "comments" | "lesson" | "replies" | "reports">("posts");
  const [items, setItems] = useState<Item[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (!authLoading && !isAdmin) navigate("/admin/login"); }, [authLoading, isAdmin, navigate]);

  const fetchItems = async () => {
    if (tab === "lesson") { setLoading(false); return; } // handled by <BatchCommentsPanel />
    setLoading(true);
    if (tab === "reports") {
      const { data } = await supabase
        .from("content_reports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      setReports((data ?? []) as Report[]);
    } else {
      const table = tab === "posts" ? "community_posts" : tab === "comments" ? "community_comments" : "doubt_replies";
      const bodyCol = tab === "replies" ? "message" : "body";
      const { data, error } = await supabase
        .from(table as any)
        .select(`id, user_id, ${bodyCol}, created_at, is_hidden, hidden_reason`)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) toast.error(error.message);
      setItems((data ?? []).map((r: any) => ({
        id: r.id, user_id: r.user_id, body: r[bodyCol] ?? "", created_at: r.created_at,
        is_hidden: !!r.is_hidden, hidden_reason: r.hidden_reason,
      })));
    }
    setLoading(false);
  };

  useEffect(() => { if (isAdmin) fetchItems(); }, [isAdmin, tab]);

  const toggleHide = async (item: Item) => {
    const contentType: ContentType = tab === "posts" ? "post" : tab === "comments" ? "comment" : "reply";
    const reason = item.is_hidden ? null : window.prompt("Reason (optional)") ?? "";
    const { error } = await supabase.rpc("admin_hide_content", {
      _content_type: contentType, _content_id: item.id, _hidden: !item.is_hidden, _reason: reason,
    });
    if (error) return toast.error(error.message);
    toast.success(item.is_hidden ? "Content restored" : "Content hidden");
    fetchItems();
  };

  const resolveReport = async (id: string, status: "resolved" | "dismissed") => {
    const { error } = await supabase.rpc("admin_resolve_report", { _report_id: id, _status: status });
    if (error) return toast.error(error.message);
    toast.success("Report updated");
    fetchItems();
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
              <ShieldAlert className="h-6 w-6 text-primary" /> Moderation
            </h1>
            <Button variant="outline" size="sm" onClick={fetchItems} disabled={loading} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList>
              <TabsTrigger value="posts">Posts</TabsTrigger>
              <TabsTrigger value="comments">Comments</TabsTrigger>
              <TabsTrigger value="lesson">Lesson Comments</TabsTrigger>
              <TabsTrigger value="replies">Doubt Replies</TabsTrigger>
              <TabsTrigger value="reports"><Flag className="h-3.5 w-3.5 mr-1" />Reports</TabsTrigger>
            </TabsList>

            {tab === "lesson" ? (
              <TabsContent value="lesson" className="mt-4">
                <BatchCommentsPanel />
              </TabsContent>
            ) : tab !== "reports" ? (
              <TabsContent value={tab} className="mt-4">
                <Card><CardContent className="p-0">
                  <div className="divide-y divide-border">
                    {items.map((it) => (
                      <div key={it.id} className="flex items-start gap-3 px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {it.is_hidden && <Badge variant="destructive" className="text-[10px]">HIDDEN</Badge>}
                            <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(it.created_at), { addSuffix: true })}</span>
                            {it.user_id && (
                              <button
                                onClick={() => navigate(`/admin/users/${it.user_id}`)}
                                className="text-xs text-primary hover:underline truncate max-w-[160px]"
                              >{it.user_id.slice(0, 8)}</button>
                            )}
                          </div>
                          <p className="text-sm text-foreground line-clamp-3 whitespace-pre-wrap">{it.body || "(empty)"}</p>
                          {it.hidden_reason && <p className="text-xs text-destructive mt-1">Hidden: {it.hidden_reason}</p>}
                        </div>
                        <Button size="sm" variant={it.is_hidden ? "outline" : "destructive"} onClick={() => toggleHide(it)} className="gap-1 min-h-[44px]">
                          {it.is_hidden ? <><Eye className="h-4 w-4" />Unhide</> : <><EyeOff className="h-4 w-4" />Hide</>}
                        </Button>
                      </div>
                    ))}
                    {!loading && items.length === 0 && <div className="py-10 text-center text-muted-foreground">Nothing to moderate.</div>}
                  </div>
                </CardContent></Card>
              </TabsContent>
            ) : (
              <TabsContent value="reports" className="mt-4">
                <Card><CardContent className="p-0">
                  <div className="divide-y divide-border">
                    {reports.map((r) => (
                      <div key={r.id} className="flex items-start gap-3 px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant={r.status === "pending" ? "default" : "secondary"} className="text-[10px] uppercase">{r.status}</Badge>
                            <Badge variant="outline" className="text-[10px]">{r.content_type}</Badge>
                            <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</span>
                          </div>
                          <p className="text-sm text-foreground line-clamp-3">{r.reason}</p>
                          <p className="text-[11px] text-muted-foreground mt-1 font-mono">target {r.content_id.slice(0, 8)}</p>
                        </div>
                        {r.status === "pending" && (
                          <div className="flex flex-col gap-1">
                            <Button size="sm" variant="outline" onClick={() => resolveReport(r.id, "resolved")}>Resolve</Button>
                            <Button size="sm" variant="ghost" onClick={() => resolveReport(r.id, "dismissed")}>Dismiss</Button>
                          </div>
                        )}
                      </div>
                    ))}
                    {!loading && reports.length === 0 && <div className="py-10 text-center text-muted-foreground">No reports.</div>}
                  </div>
                </CardContent></Card>
              </TabsContent>
            )}
          </Tabs>
        </main>
      </div>
    </div>
  );
};

export default AdminModeration;