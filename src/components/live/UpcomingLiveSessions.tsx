import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../integrations/supabase/client";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Calendar, Clock, ChevronRight, Bell, BellRing } from "lucide-react";
import { format, isToday, isTomorrow, differenceInMinutes } from "date-fns";
import { useLiveReminder } from "@/hooks/useLiveReminder";

interface UpcomingSession {
  id: string;
  title: string;
  description: string | null;
  scheduled_at: string;
}

const formatScheduledTime = (iso: string) => {
  const date = new Date(iso);
  const timeStr = format(date, "h:mm a");
  if (isToday(date)) return `Today, ${timeStr}`;
  if (isTomorrow(date)) return `Tomorrow, ${timeStr}`;
  return format(date, "MMM d, ") + timeStr;
};

const formatCountdown = (iso: string): string | null => {
  const mins = differenceInMinutes(new Date(iso), new Date());
  if (mins <= 0 || mins > 24 * 60) return null;
  if (mins < 60) return `Starts in ${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `Starts in ${h}h ${m}m`;
};

const SessionCard = ({ session, onOpen }: { session: UpcomingSession; onOpen: () => void }) => {
  const { isSet, busy, toggle } = useLiveReminder(session.id);
  const [countdown, setCountdown] = useState<string | null>(formatCountdown(session.scheduled_at));

  useEffect(() => {
    const t = setInterval(() => setCountdown(formatCountdown(session.scheduled_at)), 60_000);
    return () => clearInterval(t);
  }, [session.scheduled_at]);

  return (
    <Card
      className="min-w-[220px] max-w-[240px] flex-shrink-0 border border-border hover:shadow-sm transition-shadow"
    >
      <CardContent className="p-3">
        <div className="flex items-center gap-1 mb-2 flex-wrap">
          <Badge variant="outline" className="text-[10px] gap-1 text-primary border-primary/30 bg-primary/5">
            <Clock className="h-2.5 w-2.5" />
            {formatScheduledTime(session.scheduled_at)}
          </Badge>
          {countdown && (
            <Badge className="text-[10px] bg-destructive/10 text-destructive border-destructive/20">
              {countdown}
            </Badge>
          )}
        </div>
        <p className="text-sm font-semibold text-foreground line-clamp-2 mb-1 cursor-pointer" onClick={onOpen}>
          {session.title}
        </p>
        {session.description && (
          <p className="text-[11px] text-muted-foreground line-clamp-1">{session.description}</p>
        )}
        <div className="flex items-center justify-between mt-2 gap-1">
          <Button
            variant={isSet ? "default" : "outline"}
            size="sm"
            className="h-7 text-[10px] gap-1 px-2 flex-1"
            onClick={toggle}
            disabled={busy}
          >
            {isSet ? <BellRing className="h-3 w-3" /> : <Bell className="h-3 w-3" />}
            {isSet ? "Reminder set" : "Set Reminder"}
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-0.5 text-primary px-2" onClick={onOpen}>
            View <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

const UpcomingLiveSessions = () => {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<UpcomingSession[]>([]);

  useEffect(() => {
    const fetch = async () => {
      const now = new Date().toISOString();
      const { data } = await supabase
        .from("live_sessions")
        .select("id, title, description, scheduled_at")
        .eq("is_active", false)
        .is("ended_at", null)
        .not("scheduled_at", "is", null)
        .gt("scheduled_at", now)
        .order("scheduled_at", { ascending: true })
        .limit(5);
      if (data) setSessions(data as UpcomingSession[]);
    };
    fetch();
  }, []);

  if (sessions.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          Upcoming Live Classes
        </h3>
        <Button variant="ghost" size="sm" className="h-7 text-[11px] text-primary" onClick={() => navigate("/live")}>
          See all
        </Button>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
        {sessions.map((session) => (
          <SessionCard key={session.id} session={session} onOpen={() => navigate(`/live/${session.id}`)} />
        ))}
      </div>
    </div>
  );
};

export default UpcomingLiveSessions;
