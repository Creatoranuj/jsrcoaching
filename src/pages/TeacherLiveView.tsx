import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../integrations/supabase/client";
import { openResource } from "../lib/openResource";
import { useAuth } from "../contexts/AuthContext";
import { useBackgroundPresence } from "../hooks/useBackgroundPresence";
import Header from "../components/Layout/Header";
import Sidebar from "../components/Layout/Sidebar";
import LivePlayer from "../components/live/LivePlayer";
import LiveChat from "../components/live/LiveChat";
import RaisedHandsList from "../components/live/RaisedHandsList";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Eye, ArrowLeft, Radio, MessageCircle, HelpCircle, Hand } from "lucide-react";

interface LiveSession {
  id: string;
  title: string;
  description: string | null;
  youtube_live_id: string;
  is_active: boolean;
  started_at: string | null;
  recording_url?: string | null;
}

const TeacherLiveView = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, isAuthenticated, isAdmin, role, isLoading: authLoading } = useAuth();
  const [session, setSession] = useState<LiveSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewerCount, setViewerCount] = useState(1);
  const [raisedHandCount, setRaisedHandCount] = useState(0);
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  // Tear down + re-subscribe presence after a long background — prevents
  // WebSocket / presence drift on multi-hour teacher sessions.
  const presenceEpoch = useBackgroundPresence();

  const canView = isAdmin || role === "teacher";

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) { navigate("/login"); return; }
    if (!canView) { navigate("/dashboard"); return; }

    const fetchSession = async () => {
      const { data } = await supabase
        .from("live_sessions")
        .select("*")
        .eq("id", sessionId)
        .maybeSingle();
      setSession(data as LiveSession | null);
      setLoading(false);
    };
    fetchSession();

    const sessionChannel = supabase
      .channel(`teacher-session-${sessionId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "live_sessions", filter: `id=eq.${sessionId}` }, (payload) => {
        setSession(payload.new as LiveSession);
      })
      .subscribe();

    return () => { supabase.removeChannel(sessionChannel); };
  }, [sessionId, isAuthenticated, authLoading, navigate, canView]);

  // Presence for viewer count
  useEffect(() => {
    if (!user || !sessionId) return;

    const presenceChannel = supabase.channel(`teacher-presence-${sessionId}`, {
      config: { presence: { key: user.id } },
    });

    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        setViewerCount(Object.keys(state).length);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({ user_id: user.id, role: "teacher", online_at: new Date().toISOString() });
        }
      });

    presenceChannelRef.current = presenceChannel;
    return () => {
      presenceChannel.untrack();
      supabase.removeChannel(presenceChannel);
    };
  }, [user, sessionId, presenceEpoch]);

  // Subscribe to raised hands count
  useEffect(() => {
    if (!sessionId) return;
    const fetchHandCount = async () => {
      const { count } = await supabase
        .from("live_participants")
        .select("*", { count: "exact", head: true })
        .eq("session_id", sessionId)
        .eq("hand_raised", true);
      setRaisedHandCount(count ?? 0);
    };
    fetchHandCount();

    const channel = supabase
      .channel(`teacher-hands-count-${sessionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "live_participants", filter: `session_id=eq.${sessionId}` }, () => fetchHandCount())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sessionId]);

  if (loading || authLoading) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-dvh bg-background flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Live session not found.</p>
        <Button variant="outline" onClick={() => navigate("/admin/live")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Live Manager
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <Header onMenuClick={() => setSidebarOpen(true)} userName="" />

      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left: Video + Info */}
        <div className="flex-1 flex flex-col overflow-y-auto">
          <div className="p-3 md:p-4">
            <Button variant="ghost" size="sm" className="mb-3 -ml-1 text-muted-foreground" onClick={() => navigate("/admin/live")}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Live Manager
            </Button>

            <LivePlayer youtubeId={session.youtube_live_id} title={session.title} />

            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                {session.is_active ? (
                  <Badge className="bg-destructive text-destructive-foreground gap-1.5 animate-pulse">
                    <span className="h-2 w-2 rounded-full bg-white" />
                    LIVE
                  </Badge>
                ) : (
                  <Badge variant="secondary">
                    {session.recording_url ? "Ended — Recording Available" : "Ended"}
                  </Badge>
                )}
                <div className="flex items-center gap-1 text-muted-foreground text-xs">
                  <Eye className="h-3.5 w-3.5" />
                  <span>{viewerCount} watching</span>
                </div>
                <Badge variant="outline" className="text-xs gap-1 bg-card">
                  <span className="text-amber-500">✋</span> Teacher View
                </Badge>
              </div>
              <h1 className="text-lg font-bold text-foreground">{session.title}</h1>
              {session.description && (
                <p className="text-sm text-muted-foreground">{session.description}</p>
              )}
              {session.recording_url && !session.is_active && (
                <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => { void openResource({ url: session.recording_url! }); }}>
                  ▶ View Recording
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Right: Interaction Panel */}
        <div className="lg:w-80 xl:w-96 border-t lg:border-t-0 lg:border-l border-border flex flex-col h-[55vh] lg:h-auto">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
            <Radio className="h-4 w-4 text-destructive" />
            <span className="text-sm font-semibold text-foreground">Teacher Panel</span>
          </div>

          <Tabs defaultValue="hands" className="flex flex-col flex-1 overflow-hidden">
            <TabsList className="grid grid-cols-3 mx-3 mt-2 shrink-0">
              <TabsTrigger value="hands" className="gap-1 text-xs">
                <Hand className="h-3.5 w-3.5" /> Hands
                {raisedHandCount > 0 && (
                  <Badge className="bg-amber-500 text-white text-[10px] h-4 px-1 ml-0.5">{raisedHandCount}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="chat" className="gap-1 text-xs">
                <MessageCircle className="h-3.5 w-3.5" /> Chat
              </TabsTrigger>
              <TabsTrigger value="doubts" className="gap-1 text-xs">
                <HelpCircle className="h-3.5 w-3.5" /> Doubts
              </TabsTrigger>
            </TabsList>

            <TabsContent value="hands" className="flex-1 overflow-hidden mt-0">
              <RaisedHandsList sessionId={session.id} />
            </TabsContent>

            <TabsContent value="chat" className="flex-1 overflow-hidden mt-0">
              <LiveChat sessionId={session.id} canModerate={true} activeTab="chat" />
            </TabsContent>

            <TabsContent value="doubts" className="flex-1 overflow-hidden mt-0">
              <LiveChat sessionId={session.id} canModerate={true} activeTab="doubts" />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
};

export default TeacherLiveView;
