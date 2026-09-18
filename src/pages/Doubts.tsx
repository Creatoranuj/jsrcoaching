import { useState, useEffect, useCallback } from "react";
import { reportError } from "@/lib/sentry";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../contexts/AuthContext";
import Header from "../components/Layout/Header";
import Sidebar from "../components/Layout/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import { Label } from "../components/ui/label";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../components/ui/dialog";
import { toast } from "sonner";
import {
  Video, Clock, CheckCircle2, XCircle, CalendarDays, Plus,
  Loader2, BookOpen, ExternalLink, Users, RefreshCw,
  MessageCircle, Send, Bot, ChevronDown, ChevronUp,
} from "lucide-react";
import ZoomMeetingEmbed from "../components/live/ZoomMeetingEmbed";
import { useNavigate } from "react-router-dom";
import { Markdown } from "../components/Markdown";
import { openResource } from "../lib/openResource";
import { getErrorMessage } from "@/lib/errorMessage";

interface DoubtSession {
  id: string;
  student_id: string;
  teacher_id: string | null;
  course_id: number | null;
  subject: string | null;
  description: string;
  status: string;
  zoom_meeting_id: string | null;
  zoom_join_url: string | null;
  zoom_password: string | null;
  zoom_meeting_number: string | null;
  scheduled_at: string | null;
  created_at: string;
  courses?: { title: string } | null;
  student_profile?: { full_name: string | null; email: string | null } | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending: { label: "Pending", color: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: Clock },
  scheduled: { label: "Scheduled", color: "bg-blue-100 text-blue-700 border-blue-200", icon: CalendarDays },
  active: { label: "Active", color: "bg-green-100 text-green-700 border-green-200", icon: Video },
  completed: { label: "Completed", color: "bg-muted text-muted-foreground border-border", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-700 border-red-200", icon: XCircle },
};

const Doubts = () => {
  const { user, profile, isAdmin, isTeacher, isAuthenticated, isLoading: authLoading } = useAuth();
  const confirmAction = useConfirm();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessions, setSessions] = useState<DoubtSession[]>([]);
  const [courses, setCourses] = useState<{ id: number; title: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [creatingMeeting, setCreatingMeeting] = useState<string | null>(null);
  const [joiningSession, setJoiningSession] = useState<DoubtSession | null>(null);

  // Form state
  const [form, setForm] = useState({
    subject: "",
    description: "",
    course_id: "",
    scheduled_at: "",
  });

  // Admin schedule form
  const [scheduleForm, setScheduleForm] = useState({
    sessionId: "",
    startTime: "",
    duration: "60",
  });
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<DoubtSession | null>(null);

  const isStaff = isAdmin || isTeacher;

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/login");
    }
  }, [authLoading, isAuthenticated, navigate]);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("doubt_sessions")
        .select(`
          *,
          courses(title)
        `)
        .order("created_at", { ascending: false });

      // Students only see their own
      if (!isStaff) {
        query = query.eq("student_id", user!.id);
      }

      const { data, error } = await query;
      if (error) throw error;

      // For staff, also fetch student profiles
      if (isStaff && data && data.length > 0) {
        const studentIds = [...new Set(data.map((s) => s.student_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", studentIds);

        const enriched = data.map((s) => ({
          ...s,
          student_profile: profiles?.find((p) => p.id === s.student_id) || null,
        }));
        setSessions(enriched as DoubtSession[]);
      } else {
        setSessions((data || []) as DoubtSession[]);
      }
    } catch (err) {
      reportError(err, { surface: "Doubts.fetchSessions" });
      toast.error("Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }, [isStaff, user]);

  useEffect(() => {
    if (user) {
      fetchSessions();
      fetchCourses();
    }
  }, [user, fetchSessions]);

  const fetchCourses = async () => {
    const { data } = await supabase.from("courses").select("id, title");
    if (data) setCourses(data);
  };

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description.trim()) return toast.error("Description is required");
    setSubmitting(true);
    try {
      const { data: newSession, error } = await supabase.from("doubt_sessions").insert({
        student_id: user!.id,
        subject: form.subject || null,
        description: form.description,
        course_id: form.course_id ? parseInt(form.course_id) : null,
        scheduled_at: form.scheduled_at || null,
        status: "pending",
      }).select("id").single();
      if (error) throw error;
      toast.success("Doubt submitted! JSR AI Sahayak jawab taiyar kar raha hai...");
      setForm({ subject: "", description: "", course_id: "", scheduled_at: "" });
      fetchSessions();

      // Call JSR AI Sahayak to auto-resolve
      if (newSession?.id) {
        try {
          const { error: aiError } = await supabase.functions.invoke("resolve-doubt", {
            body: {
              sessionId: newSession.id,
              description: form.description,
              subject: form.subject,
            },
          });
          if (aiError) throw aiError;
          toast.success("JSR AI Sahayak ne aapke doubt ka jawab diya hai!");
        } catch (aiErr) {
          // AUDIT 2026-08-03 [M2]: this used to fail completely silently, so a
          // student saw "taiyar kar raha hai..." forever with no AI answer and
          // no explanation. The doubt itself is already saved, so this is a
          // soft failure — but say so.
          console.error("resolve-doubt failed", aiErr);
          toast.info(
            "Aapka doubt save ho gaya hai. AI jawab abhi nahi mil paya — teacher jaldi reply karenge."
          );
        }
      }
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || "Failed to submit request");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateZoomMeeting = async () => {
    if (!selectedSession) return;
    setCreatingMeeting(selectedSession.id);
    try {
      const { data: meeting, error } = await supabase.functions.invoke("create-zoom-meeting", {
        body: {
          sessionId: selectedSession.id,
          topic: selectedSession.subject || selectedSession.description.slice(0, 60),
          startTime: scheduleForm.startTime || undefined,
          duration: parseInt(scheduleForm.duration),
        },
      });
      if (error) throw new Error(error.message || "Failed to create meeting");
      toast.success(`Zoom meeting created! Meeting ID: ${meeting.meetingId}`);
      setScheduleDialogOpen(false);
      fetchSessions();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || "Failed to create Zoom meeting");
    } finally {
      setCreatingMeeting(null);
    }
  };

  const handleUpdateStatus = async (sessionId: string, status: string) => {
    const { error } = await supabase
      .from("doubt_sessions")
      .update({ status })
      .eq("id", sessionId);
    if (error) toast.error(error.message);
    else {
      toast.success(`Session marked as ${status}`);
      fetchSessions();
    }
  };

  const handleCancelSession = async (sessionId: string) => {
    if (!(await confirmAction({ title: "Cancel this doubt request?", variant: "destructive" }))) return;
    handleUpdateStatus(sessionId, "cancelled");
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Not scheduled";
    return new Date(dateStr).toLocaleString("en-IN", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  };

  const pendingSessions = sessions.filter((s) => s.status === "pending");
  const activeSessions = sessions.filter((s) => ["scheduled", "active"].includes(s.status));
  const pastSessions = sessions.filter((s) => ["completed", "cancelled"].includes(s.status));

  if (joiningSession) {
    return (
      <div className="min-h-dvh bg-background flex flex-col">
        <div className="bg-card border-b px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setJoiningSession(null)}>
            ← Back
          </Button>
          <div>
            <p className="font-semibold text-sm">{joiningSession.subject || "Doubt Session"}</p>
            <p className="text-xs text-muted-foreground">Zoom Meeting #{joiningSession.zoom_meeting_number}</p>
          </div>
        </div>
        <div className="flex-1 p-4">
          <ZoomMeetingEmbed
            meetingNumber={joiningSession.zoom_meeting_number!}
            password={joiningSession.zoom_password || ""}
            userName={profile?.fullName || "Student"}
            userEmail={user?.email || ""}
            role={isStaff ? 1 : 0}
            onLeave={() => setJoiningSession(null)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-muted/30 flex flex-col">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <Header onMenuClick={() => setSidebarOpen(true)} userName={profile?.fullName || "User"} />

      <main className="flex-1 p-4 md:p-6 max-w-4xl mx-auto w-full pb-24 md:pb-6 space-y-6">
        {/* Page Title */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Video className="h-5 w-5 text-primary" />
              {isStaff ? "Manage Doubt Sessions" : "Doubt Sessions"}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {isStaff
                ? "Schedule Zoom meetings for student doubt requests"
                : "Request 1:1 Zoom sessions with your teacher"}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchSessions} aria-label="Refresh doubt sessions">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Student: Submit Request Form */}
        {!isStaff && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Request a Doubt Session
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmitRequest} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="subject">Subject / Topic</Label>
                    <Input
                      id="subject"
                      placeholder="e.g. Newton's Laws, Limits..."
                      value={form.subject}
                      onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="course">Course (optional)</Label>
                    <Select
                      value={form.course_id || "__none__"}
                      onValueChange={(v) => setForm({ ...form, course_id: v === "__none__" ? "" : v })}
                    >
                      <SelectTrigger id="course">
                        <SelectValue placeholder="Select course" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No course</SelectItem>
                        {courses.map((c) => (
                          <SelectItem key={c.id} value={c.id.toString()}>{c.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="description">Describe your doubt *</Label>
                  <Textarea
                    id="description"
                    placeholder="Explain what you're struggling with in detail..."
                    rows={3}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="preferred_time">Preferred Time (optional)</Label>
                  <Input
                    id="preferred_time"
                    type="datetime-local"
                    value={form.scheduled_at}
                    onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
                  />
                </div>
                <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                  Submit Request
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Active / Scheduled Sessions */}
        {activeSessions.length > 0 && (
          <div className="space-y-3">
            <h2 className="font-semibold text-foreground flex items-center gap-2">
              <Video className="h-4 w-4 text-green-600" />
              {isStaff ? "Active & Scheduled Sessions" : "Your Upcoming Sessions"}
              <Badge className="bg-green-100 text-green-700 border-green-200">{activeSessions.length}</Badge>
            </h2>
            {activeSessions.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                isStaff={isStaff}
                onJoin={() => setJoiningSession(s)}
                onComplete={() => handleUpdateStatus(s.id, "completed")}
                onCancel={() => handleCancelSession(s.id)}
                formatDate={formatDate}
              />
            ))}
          </div>
        )}

        {/* Pending Sessions */}
        {pendingSessions.length > 0 && (
          <div className="space-y-3">
            <h2 className="font-semibold text-foreground flex items-center gap-2">
              <Clock className="h-4 w-4 text-yellow-600" />
              {isStaff ? "Pending Requests" : "Awaiting Scheduling"}
              <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">{pendingSessions.length}</Badge>
            </h2>
            {pendingSessions.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                isStaff={isStaff}
                onSchedule={isStaff ? () => {
                  setSelectedSession(s);
                  setScheduleForm({ sessionId: s.id, startTime: "", duration: "60" });
                  setScheduleDialogOpen(true);
                } : undefined}
                onCancel={() => handleCancelSession(s.id)}
                formatDate={formatDate}
              />
            ))}
          </div>
        )}

        {/* Past Sessions */}
        {pastSessions.length > 0 && (
          <div className="space-y-3">
            <h2 className="font-semibold text-foreground flex items-center gap-2 text-muted-foreground">
              <CheckCircle2 className="h-4 w-4" />
              Past Sessions
            </h2>
            {pastSessions.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                isStaff={isStaff}
                formatDate={formatDate}
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && sessions.length === 0 && (
          <Card className="border-2 border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <Video className="h-10 w-10 text-muted-foreground/50" />
              <p className="font-semibold text-foreground">
                {isStaff ? "No doubt requests yet" : "No doubt sessions"}
              </p>
              <p className="text-sm text-muted-foreground">
                {isStaff
                  ? "Students can request sessions from this page"
                  : "Use the form above to request a Zoom session with your teacher"}
              </p>
            </CardContent>
          </Card>
        )}

        {loading && (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}
      </main>

      {/* Admin: Create Zoom Meeting Dialog */}
      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Video className="h-5 w-5 text-primary" />
              Create Zoom Meeting
            </DialogTitle>
          </DialogHeader>
          {selectedSession && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-3 space-y-1">
                <p className="text-sm font-medium">{selectedSession.subject || "Doubt Request"}</p>
                <p className="text-xs text-muted-foreground line-clamp-2">{selectedSession.description}</p>
                {selectedSession.student_profile && (
                  <p className="text-xs text-muted-foreground">
                    Student: {selectedSession.student_profile.full_name || selectedSession.student_profile.email}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Meeting Start Time (optional)</Label>
                <Input
                  type="datetime-local"
                  value={scheduleForm.startTime}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, startTime: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">Leave empty to start immediately</p>
              </div>
              <div className="space-y-1">
                <Label>Duration (minutes)</Label>
                <Select
                  value={scheduleForm.duration}
                  onValueChange={(v) => setScheduleForm({ ...scheduleForm, duration: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["30", "45", "60", "90", "120"].map((d) => (
                      <SelectItem key={d} value={d}>{d} min</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateZoomMeeting}
              disabled={creatingMeeting === selectedSession?.id}
            >
              {creatingMeeting === selectedSession?.id ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Video className="h-4 w-4 mr-2" />
              )}
              Create Zoom Meeting
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


    </div>
  );
};

// Session Card Component
interface SessionCardProps {
  session: DoubtSession;
  isStaff: boolean;
  onJoin?: () => void;
  onSchedule?: () => void;
  onComplete?: () => void;
  onCancel?: () => void;
  formatDate: (d: string | null) => string;
}

interface DoubtReply {
  id: string;
  message: string;
  is_ai: boolean;
  created_at: string;
  user_id: string;
  parent_reply_id: string | null;
}

interface ReplyNode extends DoubtReply {
  children: ReplyNode[];
}

function buildReplyTree(flat: DoubtReply[]): ReplyNode[] {
  const map = new Map<string, ReplyNode>();
  const roots: ReplyNode[] = [];
  flat.forEach((r) => map.set(r.id, { ...r, children: [] }));
  flat.forEach((r) => {
    const node = map.get(r.id)!;
    if (r.parent_reply_id && map.has(r.parent_reply_id)) {
      map.get(r.parent_reply_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

const SessionCard = ({
  session,
  isStaff,
  onJoin,
  onSchedule,
  onComplete,
  onCancel,
  formatDate,
}: SessionCardProps) => {
  const statusCfg = STATUS_CONFIG[session.status] || STATUS_CONFIG.pending;
  const StatusIcon = statusCfg.icon;
  const [showReplies, setShowReplies] = useState(false);
  const [replies, setReplies] = useState<DoubtReply[]>([]);
  const [repliesLoading, setRepliesLoading] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const { user } = useAuth();

  const fetchReplies = useCallback(async () => {
    if (!showReplies) return;
    setRepliesLoading(true);
    const { data } = await supabase
      .from("doubt_replies")
      .select("*")
      .eq("doubt_session_id", session.id)
      .order("created_at", { ascending: true });
    setReplies((data || []) as DoubtReply[]);
    setRepliesLoading(false);
  }, [session.id, showReplies]);

  useEffect(() => {
    fetchReplies();
  }, [fetchReplies]);

  const handleSendReply = async () => {
    if (!replyText.trim() || !user) return;
    setSending(true);
    const { error } = await supabase.from("doubt_replies").insert({
      doubt_session_id: session.id,
      user_id: user.id,
      message: replyText.trim(),
      is_ai: false,
      parent_reply_id: replyingTo,
    });
    if (error) toast.error(error.message);
    else {
      setReplyText("");
      setReplyingTo(null);
      fetchReplies();
    }
    setSending(false);
  };

  const replyTree = buildReplyTree(replies);

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-start gap-3">
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              {session.subject && (
                <span className="font-semibold text-sm text-foreground">{session.subject}</span>
              )}
              <Badge className={`text-xs border ${statusCfg.color} gap-1`}>
                <StatusIcon className="h-3 w-3" />
                {statusCfg.label}
              </Badge>
              {session.courses && (
                <Badge variant="outline" className="text-xs">
                  <BookOpen className="h-3 w-3 mr-1" />
                  {session.courses.title}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground line-clamp-2">{session.description}</p>
            {isStaff && session.student_profile && (
              <p className="text-xs text-muted-foreground">
                <Users className="h-3 w-3 inline mr-1" />
                {session.student_profile.full_name || session.student_profile.email}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              <CalendarDays className="h-3 w-3 inline mr-1" />
              {formatDate(session.scheduled_at || session.created_at)}
            </p>
            {session.zoom_meeting_number && (
              <p className="text-xs text-muted-foreground font-mono">
                Meeting #{session.zoom_meeting_number}
                {session.zoom_password && ` · Pass: ${session.zoom_password}`}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-row sm:flex-col gap-2 shrink-0">
            {session.zoom_join_url && onJoin && (
              <Button size="sm" onClick={onJoin} className="gap-1">
                <Video className="h-3.5 w-3.5" />
                Join
              </Button>
            )}
            {session.zoom_join_url && !onJoin && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void openResource({ url: session.zoom_join_url!, kind: "link" })}
                className="gap-1"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open
              </Button>
            )}
            {onSchedule && session.status === "pending" && (
              <Button size="sm" variant="outline" onClick={onSchedule} className="gap-1">
                <Video className="h-3.5 w-3.5" />
                Create Zoom
              </Button>
            )}
            {onComplete && ["scheduled", "active"].includes(session.status) && (
              <Button size="sm" variant="outline" onClick={onComplete} className="gap-1 text-green-600 border-green-200 hover:bg-green-50">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Complete
              </Button>
            )}
            {onCancel && ["pending"].includes(session.status) && (
              <Button size="sm" variant="ghost" onClick={onCancel} className="gap-1 text-destructive hover:text-destructive">
                <XCircle className="h-3.5 w-3.5" />
                Cancel
              </Button>
            )}
          </div>
        </div>

        {/* Reply Thread Toggle */}
        <button
          onClick={() => setShowReplies(!showReplies)}
          className="mt-3 flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          <MessageCircle className="h-3.5 w-3.5" />
          {showReplies ? "Hide" : "View"} Replies
          {showReplies ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>

        {/* Reply Thread */}
        {showReplies && (
          <div className="mt-3 border-t pt-3 space-y-3">
            {repliesLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : replies.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">No replies yet</p>
            ) : (
              <div className="space-y-2 max-h-[60vh] overflow-y-auto overscroll-contain pb-20 md:pb-2">
                {replyTree.map((node) => (
                  <ReplyTreeNode
                    key={node.id}
                    node={node}
                    studentId={session.student_id}
                    depth={0}
                    replyingTo={replyingTo}
                    onReply={(id) => setReplyingTo(id)}
                  />
                ))}
              </div>
            )}

            {/* Reply Input */}
            <div className="space-y-1.5">
              {replyingTo && (
                <div className="flex items-center justify-between gap-2 text-xs bg-primary/5 border border-primary/20 rounded-md px-2 py-1.5">
                  <span className="text-muted-foreground truncate">
                    Replying to thread
                  </span>
                  <button
                    onClick={() => setReplyingTo(null)}
                    className="text-primary hover:underline shrink-0"
                  >
                    Cancel
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  placeholder={replyingTo ? "Type your reply..." : "Type a reply..."}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendReply()}
                  className="text-sm"
                />
                <Button
                  size="sm"
                  onClick={handleSendReply}
                  disabled={sending || !replyText.trim()}
                >
                  {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

interface ReplyTreeNodeProps {
  node: ReplyNode;
  studentId: string;
  depth: number;
  replyingTo: string | null;
  onReply: (id: string) => void;
}

const ReplyTreeNode = ({ node, studentId, depth, replyingTo, onReply }: ReplyTreeNodeProps) => {
  const indent = Math.min(depth, 6) * 12;
  const isActive = replyingTo === node.id;
  return (
    <div style={{ marginLeft: indent }}>
      <div
        className={`rounded-lg p-3 text-sm border-l-2 ${
          node.is_ai
            ? "bg-primary/5 border-primary/40"
            : isActive
            ? "bg-muted border-primary"
            : "bg-muted/50 border-transparent"
        }`}
      >
        <div className="flex items-center gap-1.5 mb-1">
          {node.is_ai ? (
            <>
              <Bot className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-semibold text-primary">JSR AI Sahayak</span>
            </>
          ) : (
            <span className="text-xs font-medium text-muted-foreground">
              {node.user_id === studentId ? "Student" : "Staff"}
            </span>
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            {new Date(node.created_at).toLocaleString("en-IN", {
              day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
            })}
          </span>
        </div>
        <div className="prose prose-sm max-w-none text-foreground">
          <Markdown gfm={false}>{node.message}</Markdown>
        </div>
        <button
          onClick={() => onReply(isActive ? "" : node.id)}
          className="mt-1.5 text-xs text-primary hover:underline flex items-center gap-1"
        >
          <MessageCircle className="h-3 w-3" />
          {isActive ? "Cancel reply" : "Reply"}
        </button>
      </div>
      {node.children.length > 0 && (
        <div className="mt-2 space-y-2">
          {node.children.map((child) => (
            <ReplyTreeNode
              key={child.id}
              node={child}
              studentId={studentId}
              depth={depth + 1}
              replyingTo={replyingTo}
              onReply={onReply}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default Doubts;
