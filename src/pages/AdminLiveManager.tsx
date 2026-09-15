import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../contexts/AuthContext";
import Header from "../components/Layout/Header";
import Sidebar from "../components/Layout/Sidebar";
import LiveChat from "../components/live/LiveChat";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../components/ui/sheet";
import { ScrollArea } from "../components/ui/scroll-area";
import { toast } from "sonner";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import {
  Radio, Plus, Play, Square, Eye, Trash2, Calendar, Clock,
  MessageSquare, ExternalLink, Loader2, GraduationCap, Pencil, X,
} from "lucide-react";

interface LiveSession {
  id: string;
  title: string;
  description: string | null;
  youtube_live_id: string;
  is_active: boolean;
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  recording_url?: string | null;
}

const AdminLiveManager = () => {
  const confirmAction = useConfirm();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, isAdmin, isLoading: authLoading } = useAuth();
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [courses, setCourses] = useState<{ id: number; title: string }[]>([]);

  const emptyForm = { title: "", description: "", youtube_live_id: "", scheduled_at: "", course_id: "", recording_url: "" };
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [previewSession, setPreviewSession] = useState<LiveSession | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      navigate("/dashboard");
    }
  }, [isAdmin, authLoading, navigate]);

  useEffect(() => {
    if (user && isAdmin) {
      fetchSessions();
      fetchCourses();
    }
  }, [user, isAdmin]);

  const fetchSessions = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("live_sessions")
      .select("*")
      .order("created_at", { ascending: false });
    setSessions((data as LiveSession[]) || []);
    setLoading(false);
  };

  const fetchCourses = async () => {
    const { data } = await supabase.from("courses").select("id, title").order("title");
    setCourses((data as { id: number; title: string }[]) || []);
  };

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.youtube_live_id.trim()) {
      toast.error("Title and YouTube Live ID are required");
      return;
    }
    setCreating(true);
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      youtube_live_id: form.youtube_live_id.trim(),
      scheduled_at: form.scheduled_at || null,
      course_id: form.course_id ? Number(form.course_id) : null,
    };
    let error: any;
    if (editingId) {
      ({ error } = await supabase.from("live_sessions").update(payload).eq("id", editingId));
    } else {
      ({ error } = await supabase.from("live_sessions").insert({ ...payload, created_by: user?.id, is_active: false }));
    }
    if (error) {
      toast.error((editingId ? "Failed to update: " : "Failed to create: ") + error.message);
    } else {
      toast.success(editingId ? "Session updated!" : "Live session created!");
      setForm(emptyForm);
      setEditingId(null);
      fetchSessions();
    }
    setCreating(false);
  };

  const handleEdit = (s: LiveSession) => {
    setEditingId(s.id);
    setForm({
      title: s.title,
      description: s.description || "",
      youtube_live_id: s.youtube_live_id,
      scheduled_at: s.scheduled_at ? s.scheduled_at.slice(0, 16) : "",
      course_id: "",
      recording_url: s.recording_url || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const fetchCoursesIfNeeded = fetchCourses;

  const handleGoLive = async (sessionId: string) => {
    const { error } = await supabase
      .from("live_sessions")
      .update({ is_active: true, started_at: new Date().toISOString(), ended_at: null })
      .eq("id", sessionId);
    if (error) toast.error("Failed to go live");
    else { toast.success("🔴 Now LIVE!"); fetchSessions(); }
  };

  const handleEndLive = async (sessionId: string) => {
    const { error } = await supabase
      .from("live_sessions")
      .update({ is_active: false, ended_at: new Date().toISOString() })
      .eq("id", sessionId);
    if (error) toast.error("Failed to end session");
    else { toast.success("Session ended"); fetchSessions(); }
  };

  const handleDelete = async (sessionId: string) => {
    if (!(await confirmAction({ title: "Delete this session and all its messages?", variant: "destructive" }))) return;
    const { error } = await supabase.from("live_sessions").delete().eq("id", sessionId);
    if (error) toast.error("Failed to delete");
    else { toast.success("Session deleted"); fetchSessions(); }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  if (authLoading) return null;

  return (
    <div className="min-h-dvh bg-muted/30 flex flex-col">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <Header onMenuClick={() => setSidebarOpen(true)} userName="" />

      <main className="flex-1 p-4 md:p-6 space-y-6 max-w-5xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-destructive/10">
            <Radio className="h-6 w-6 text-destructive" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Live Class Manager</h1>
            <p className="text-sm text-muted-foreground">Schedule, go live, and manage student interactions</p>
          </div>
        </div>

        {/* Create New Session */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              {editingId ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {editingId ? "Edit Live Class" : "Schedule New Live Class"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Session Title *</Label>
                <Input placeholder="e.g. Physics Chapter 5 - Motion" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>YouTube Live Video ID *</Label>
                <Input placeholder="e.g. dQw4w9WgXcQ" value={form.youtube_live_id} onChange={(e) => setForm({ ...form, youtube_live_id: e.target.value })} />
                <p className="text-[11px] text-muted-foreground">The ID from youtube.com/watch?v=<strong>THIS_PART</strong></p>
              </div>
              <div className="space-y-1.5">
                <Label>Scheduled Date & Time</Label>
                <Input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Link to Course (optional)</Label>
                <Select value={form.course_id} onValueChange={(v) => setForm({ ...form, course_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select course..." /></SelectTrigger>
                  <SelectContent>
                    {courses.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Description (optional)</Label>
              <Textarea placeholder="What will be covered in this session..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="min-h-[80px]" />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSubmit} disabled={creating} className="flex-1 sm:flex-none">
                {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : (editingId ? <Pencil className="h-4 w-4 mr-2" /> : <Plus className="h-4 w-4 mr-2" />)}
                {editingId ? "Update Session" : "Create Session"}
              </Button>
              {editingId && (
                <Button variant="outline" onClick={cancelEdit}>
                  <X className="h-4 w-4 mr-2" /> Cancel
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Sessions List */}
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">All Sessions</h2>
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : sessions.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-10 text-center text-muted-foreground">No sessions yet. Create your first live class above.</CardContent>
            </Card>
          ) : (
            sessions.map((session) => (
              <Card key={session.id} className={session.is_active ? "border-destructive/50 shadow-sm shadow-destructive/10" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        {session.is_active && (
                          <Badge className="bg-destructive text-destructive-foreground text-xs gap-1 animate-pulse">
                            <span className="h-1.5 w-1.5 rounded-full bg-white" /> LIVE
                          </Badge>
                        )}
                        {!session.is_active && session.ended_at && (
                          <Badge variant="secondary" className="text-xs">Ended</Badge>
                        )}
                        {!session.is_active && !session.ended_at && (
                          <Badge variant="outline" className="text-xs">Scheduled</Badge>
                        )}
                        <h3 className="font-semibold text-sm text-foreground">{session.title}</h3>
                      </div>
                      {session.description && (
                        <p className="text-xs text-muted-foreground mb-2 line-clamp-1">{session.description}</p>
                      )}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(session.created_at)}</span>
                        {session.scheduled_at && (
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Scheduled: {formatDate(session.scheduled_at)}</span>
                        )}
                        <span className="flex items-center gap-1 font-mono">ID: {session.youtube_live_id}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                      {!session.is_active ? (
                        <Button size="sm" variant="destructive" className="h-8 gap-1 text-xs" onClick={() => handleGoLive(session.id)}>
                          <Play className="h-3 w-3" /> Go Live
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" className="h-8 gap-1 text-xs border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={() => handleEndLive(session.id)}>
                          <Square className="h-3 w-3" /> End Live
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" className="h-8 w-8" title="Teacher View" onClick={() => window.open(`/teacher/live/${session.id}`, "_blank", "noopener,noreferrer")}>
                        <GraduationCap className="h-4 w-4 text-primary" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" title="Preview session" onClick={() => { setPreviewSession(session); setShowPreview(true); }}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" title="Open in YouTube" onClick={() => window.open(`https://youtu.be/${session.youtube_live_id}`, "_blank", "noopener,noreferrer")}>
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" title="Edit session" onClick={() => handleEdit(session)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => handleDelete(session.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </main>

      {/* Live Preview Sheet with Chat */}
      <Sheet open={showPreview} onOpenChange={setShowPreview}>
        <SheetContent side="right" className="w-full sm:w-[420px] p-0 flex flex-col">
          <SheetHeader className="px-4 py-3 border-b border-border shrink-0">
            <SheetTitle className="flex items-center gap-2 text-sm">
              <MessageSquare className="h-4 w-4 text-primary" />
              {previewSession?.title || "Session Preview"}
            </SheetTitle>
          </SheetHeader>
          {previewSession && (
            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="p-3 border-b border-border shrink-0">
                <div className="bg-black rounded-lg overflow-hidden" style={{ aspectRatio: "16/9" }}>
                  <iframe
                    src={`https://www.youtube.com/embed/${previewSession.youtube_live_id}?autoplay=0&rel=0&modestbranding=1`}
                    title={previewSession.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="w-full h-full"
                    style={{ border: "none" }}
                  />
                </div>
              </div>
              <ScrollArea className="flex-1">
                <LiveChat sessionId={previewSession.id} isAdmin={true} />
              </ScrollArea>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default AdminLiveManager;
