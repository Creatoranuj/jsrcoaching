import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../contexts/AuthContext";
import { useBackgroundPresence } from "../hooks/useBackgroundPresence";
import { useScreenProtection } from "../hooks/useScreenProtection";
import Header from "../components/Layout/Header";
import LivePlayer from "../components/live/LivePlayer";
import LiveChat from "../components/live/LiveChat";
import LiveSarthiPanel from "../components/live/LiveSarthiPanel";
import RaiseHandButton from "../components/live/RaiseHandButton";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Eye, ArrowLeft, Radio, MessageCircle, HelpCircle, Bot } from "lucide-react";

interface LiveSession {
  id: string;
  title: string;
  description: string | null;
  youtube_live_id: string;
  is_active: boolean;
  started_at: string | null;
  ended_at: string | null;
  recording_url: string | null;
}

const LiveClass = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  // Android FLAG_SECURE while Lecture/Live view is mounted (admin bypass is inside the hook).
  useScreenProtection(true);
  const [session, setSession] = useState<LiveSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewerCount, setViewerCount] = useState(1);
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const presenceEpoch = useBackgroundPresence();

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) { navigate("/login"); return; }

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
      .channel(`live-session-${sessionId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "live_sessions", filter: `id=eq.${sessionId}` }, (payload) => {
        setSession(payload.new as LiveSession);
      })
      .subscribe();

    return () => { supabase.removeChannel(sessionChannel); };
  }, [sessionId, isAuthenticated, authLoading, navigate]);

  useEffect(() => {
    if (!user || !sessionId || !session?.is_active) return;

    const presenceChannel = supabase.channel(`live-presence-${sessionId}`, {
      config: { presence: { key: user.id } },
    });

    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        setViewerCount(Object.keys(state).length);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({ user_id: user.id, online_at: new Date().toISOString() });
        }
      });

    presenceChannelRef.current = presenceChannel;

    return () => {
      presenceChannel.untrack();
      supabase.removeChannel(presenceChannel);
    };
  }, [user, sessionId, presenceEpoch, session?.is_active]);

  if (loading || authLoading) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
          <p className="text-muted-foreground text-sm">Joining live class...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-dvh bg-background flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Live session not found.</p>
        <Button variant="outline" onClick={() => navigate("/live")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> All Live Classes
        </Button>
      </div>
    );
  }

  const hasRecording = !!session.recording_url;
  const isEnded = !session.is_active && !!session.ended_at;

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <Header onMenuClick={() => {}} userName="" />

      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden pb-16 lg:pb-0">
        <div className="flex-1 flex flex-col overflow-y-auto">
          <div className="p-3 md:p-4">
            <Button variant="ghost" size="sm" className="mb-3 -ml-1 text-muted-foreground" onClick={() => navigate("/live")}>
              <ArrowLeft className="h-4 w-4 mr-1" /> All Live Classes
            </Button>

            {isEnded && !hasRecording ? (
              <div className="aspect-video w-full bg-muted rounded-xl flex flex-col items-center justify-center gap-2 p-6 text-center">
                <p className="text-base font-semibold text-foreground">Ye class end ho gayi hai</p>
                <p className="text-xs text-muted-foreground">Recording jaldi available hogi.</p>
              </div>
            ) : (
              <LivePlayer
                youtubeId={session.youtube_live_id}
                title={session.title}
                recordingUrl={isEnded ? session.recording_url : null}
              />
            )}

            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2 flex-wrap justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  {session.is_active ? (
                    <Badge className="bg-destructive text-destructive-foreground gap-1.5 animate-pulse">
                      <span className="h-2 w-2 rounded-full bg-white" /> LIVE
                    </Badge>
                  ) : hasRecording ? (
                    <Badge variant="secondary">Recording</Badge>
                  ) : (
                    <Badge variant="secondary">Ended</Badge>
                  )}
                  {session.is_active && (
                    <div className="flex items-center gap-1 text-muted-foreground text-xs">
                      <Eye className="h-3.5 w-3.5" />
                      <span>{viewerCount} watching</span>
                    </div>
                  )}
                </div>
                {session.is_active && <RaiseHandButton sessionId={session.id} />}
              </div>
              <h1 className="text-lg font-bold text-foreground">{session.title}</h1>
              {session.description && (
                <p className="text-sm text-muted-foreground">{session.description}</p>
              )}
            </div>
          </div>
        </div>

        {/* Right: 3-tab interaction panel */}
        <div className="lg:w-80 xl:w-96 border-t lg:border-t-0 lg:border-l border-border flex flex-col h-[55vh] lg:h-auto">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
            <Radio className="h-4 w-4 text-destructive" />
            <span className="text-sm font-semibold text-foreground">Live Interaction</span>
          </div>
          <Tabs defaultValue="chat" className="flex flex-col flex-1 overflow-hidden">
            <TabsList className="grid grid-cols-3 mx-3 mt-2 shrink-0">
              <TabsTrigger value="chat" className="gap-1 text-[11px]">
                <MessageCircle className="h-3 w-3" /> Chat
              </TabsTrigger>
              <TabsTrigger value="doubts" className="gap-1 text-[11px]">
                <HelpCircle className="h-3 w-3" /> Doubts
              </TabsTrigger>
              <TabsTrigger value="sarthi" className="gap-1 text-[11px]">
                <Bot className="h-3 w-3" /> Sarthi
              </TabsTrigger>
            </TabsList>
            <TabsContent value="chat" className="flex-1 mt-0 overflow-hidden">
              <LiveChat sessionId={session.id} activeTab="chat" />
            </TabsContent>
            <TabsContent value="doubts" className="flex-1 mt-0 overflow-hidden">
              <LiveChat sessionId={session.id} activeTab="doubts" />
            </TabsContent>
            <TabsContent value="sarthi" className="flex-1 mt-0 overflow-hidden">
              <LiveSarthiPanel
                sessionId={session.id}
                sessionTitle={session.title}
                sessionDescription={session.description}
              />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
};

export default LiveClass;
