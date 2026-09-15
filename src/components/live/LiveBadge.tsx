import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../integrations/supabase/client";
import { Button } from "../ui/button";
import { Radio } from "lucide-react";

interface LiveSession {
  id: string;
  title: string;
}

const LiveBadge = () => {
  const [activeSession, setActiveSession] = useState<LiveSession | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchActive = async () => {
      const { data } = await supabase
        .from("live_sessions")
        .select("id, title")
        .eq("is_active", true)
        .maybeSingle();
      setActiveSession(data as LiveSession | null);
    };

    fetchActive();

    const channel = supabase
      .channel("live-badge-watch")
      .on("postgres_changes", { event: "*", schema: "public", table: "live_sessions" }, () => {
        fetchActive();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  if (!activeSession) return null;

  return (
    <div className="relative flex items-center gap-3 bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-3 mb-4 overflow-hidden">
      <div className="absolute inset-0 bg-destructive/5 animate-pulse rounded-xl" />
      <div className="relative flex items-center gap-2 flex-1">
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-destructive" />
        </span>
        <Radio className="h-4 w-4 text-destructive" />
        <div>
          <p className="text-sm font-bold text-destructive">LIVE CLASS NOW</p>
          <p className="text-xs text-muted-foreground line-clamp-1">{activeSession.title}</p>
        </div>
      </div>
      <Button
        size="sm"
        variant="destructive"
        className="relative shrink-0"
        onClick={() => navigate(`/live/${activeSession.id}`)}
      >
        Join Now
      </Button>
    </div>
  );
};

export default LiveBadge;
