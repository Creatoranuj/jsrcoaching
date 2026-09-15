import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Layout/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Radio, Clock, Calendar, Play, ArrowLeft } from "lucide-react";
import { format, isToday, isTomorrow, differenceInMinutes } from "date-fns";
import { useLiveReminder } from "@/hooks/useLiveReminder";

interface LiveSession {
  id: string;
  title: string;
  description: string | null;
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  is_active: boolean;
  recording_url: string | null;
}

const fmt = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isToday(d)) return `Today, ${format(d, "h:mm a")}`;
  if (isTomorrow(d)) return `Tomorrow, ${format(d, "h:mm a")}`;
  return format(d, "MMM d, h:mm a");
};

const countdown = (iso: string | null) => {
  if (!iso) return null;
  const m = differenceInMinutes(new Date(iso), new Date());
  if (m <= 0 || m > 24 * 60) return null;
  return m < 60 ? `in ${m}m` : `in ${Math.floor(m / 60)}h ${m % 60}m`;
};

const Row = ({ s, kind, onOpen }: { s: LiveSession; kind: "live" | "upcoming" | "past"; onOpen: () => void }) => {
  const { isSet, busy, toggle } = useLiveReminder(kind === "upcoming" ? s.id : undefined);
  return (
    <Card className="border border-border hover:shadow-sm transition-shadow">
      <CardContent className="p-3 flex items-center gap-3">
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
          kind === "live" ? "bg-destructive/10 text-destructive" :
          kind === "upcoming" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
        }`}>
          {kind === "live" ? <Radio className="h-5 w-5 animate-pulse" /> :
           kind === "upcoming" ? <Clock className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            {kind === "live" && <Badge className="bg-destructive text-destructive-foreground text-[10px] h-4 px-1.5">LIVE</Badge>}
            {kind === "upcoming" && countdown(s.scheduled_at) && (
              <Badge className="bg-destructive/10 text-destructive border-destructive/20 text-[10px] h-4 px-1.5">
                Starts {countdown(s.scheduled_at)}
              </Badge>
            )}
            <span className="text-[10px] text-muted-foreground">
              {kind === "past" ? fmt(s.ended_at || s.started_at) : fmt(s.scheduled_at || s.started_at)}
            </span>
          </div>
          <p className="text-sm font-semibold text-foreground line-clamp-1">{s.title}</p>
          {s.description && <p className="text-[11px] text-muted-foreground line-clamp-1">{s.description}</p>}
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          {kind === "upcoming" ? (
            <Button size="sm" variant={isSet ? "default" : "outline"} className="h-7 text-[10px]" onClick={toggle} disabled={busy}>
              {isSet ? "Reminder ✓" : "Remind me"}
            </Button>
          ) : (
            <Button size="sm" className="h-7 text-[10px]" onClick={onOpen}>
              {kind === "live" ? "Join" : "Watch"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

const AllLive = () => {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("live_sessions")
        .select("*")
        .order("scheduled_at", { ascending: false, nullsFirst: false })
        .limit(50);
      setSessions((data as LiveSession[]) || []);
      setLoading(false);
    };
    load();

    const ch = supabase
      .channel("all-live-watch")
      .on("postgres_changes", { event: "*", schema: "public", table: "live_sessions" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const live = sessions.filter((s) => s.is_active);
  const upcoming = sessions
    .filter((s) => !s.is_active && !s.ended_at && s.scheduled_at && new Date(s.scheduled_at) > new Date())
    .sort((a, b) => (a.scheduled_at! < b.scheduled_at! ? -1 : 1));
  const past = sessions.filter((s) => s.ended_at || (!s.is_active && s.scheduled_at && new Date(s.scheduled_at) < new Date()));

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <Header onMenuClick={() => {}} userName="" />
      <main className="flex-1 max-w-3xl w-full mx-auto p-3 md:p-4 space-y-4">
        <Button variant="ghost" size="sm" className="-ml-1 text-muted-foreground" onClick={() => navigate("/dashboard")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Dashboard
        </Button>

        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold text-foreground">Live Classes</h1>
        </div>

        <Tabs defaultValue={live.length > 0 ? "live" : "upcoming"}>
          <TabsList className="grid grid-cols-3">
            <TabsTrigger value="live" className="text-xs">
              Live {live.length > 0 && <Badge className="ml-1 bg-destructive text-destructive-foreground h-4 px-1 text-[10px]">{live.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="upcoming" className="text-xs">Upcoming ({upcoming.length})</TabsTrigger>
            <TabsTrigger value="past" className="text-xs">Recordings ({past.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="live" className="space-y-2 mt-3">
            {loading ? <p className="text-xs text-muted-foreground text-center py-6">Loading...</p> :
             live.length === 0 ? <p className="text-xs text-muted-foreground text-center py-6">Abhi koi class live nahi hai.</p> :
             live.map((s) => <Row key={s.id} s={s} kind="live" onOpen={() => navigate(`/live/${s.id}`)} />)}
          </TabsContent>

          <TabsContent value="upcoming" className="space-y-2 mt-3">
            {upcoming.length === 0 ? <p className="text-xs text-muted-foreground text-center py-6">Koi upcoming class schedule nahi hai.</p> :
             upcoming.map((s) => <Row key={s.id} s={s} kind="upcoming" onOpen={() => navigate(`/live/${s.id}`)} />)}
          </TabsContent>

          <TabsContent value="past" className="space-y-2 mt-3">
            {past.length === 0 ? <p className="text-xs text-muted-foreground text-center py-6">Abhi koi recording available nahi hai.</p> :
             past.map((s) => <Row key={s.id} s={s} kind="past" onOpen={() => navigate(`/live/${s.id}`)} />)}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default AllLive;
