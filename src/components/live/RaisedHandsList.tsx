import { useState, useEffect } from "react";
import { supabase } from "../../integrations/supabase/client";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { ScrollArea } from "../ui/scroll-area";
import { Hand, HandMetal } from "lucide-react";
import { toast } from "sonner";

interface Participant {
  id: string;
  session_id: string;
  user_id: string;
  user_name: string;
  hand_raised: boolean;
  joined_at: string;
}

interface RaisedHandsListProps {
  sessionId: string;
}

const RaisedHandsList = ({ sessionId }: RaisedHandsListProps) => {
  const [participants, setParticipants] = useState<Participant[]>([]);

  const fetchParticipants = async () => {
    const { data } = await supabase
      .from("live_participants")
      .select("*")
      .eq("session_id", sessionId)
      .order("joined_at", { ascending: true });
    if (data) setParticipants(data as Participant[]);
  };

  useEffect(() => {
    fetchParticipants();

    const channel = supabase
      .channel(`raised-hands-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "live_participants",
          filter: `session_id=eq.${sessionId}`,
        },
        () => fetchParticipants()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [sessionId]);

  const dismissHand = async (participantId: string, userName: string) => {
    const { error } = await supabase
      .from("live_participants")
      .update({ hand_raised: false })
      .eq("id", participantId);
    if (error) toast.error("Failed to dismiss hand");
    else toast.success(`${userName}'s hand dismissed`);
  };

  const raisedHands = participants.filter((p) => p.hand_raised);
  const joinedCount = participants.length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Hand className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-semibold text-foreground">Raised Hands</span>
          {raisedHands.length > 0 && (
            <Badge className="bg-amber-500 text-white text-[10px] h-4 px-1.5">
              {raisedHands.length}
            </Badge>
          )}
        </div>
        <span className="text-[11px] text-muted-foreground">
          {joinedCount} joined
        </span>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {raisedHands.length === 0 ? (
            <div className="text-center py-8">
              <HandMetal className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">No raised hands right now</p>
            </div>
          ) : (
            raisedHands.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-lg px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-base">✋</span>
                  <span className="text-sm font-medium text-foreground truncate">
                    {p.user_name}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-muted-foreground hover:text-foreground shrink-0"
                  onClick={() => dismissHand(p.id, p.user_name)}
                >
                  Dismiss
                </Button>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default RaisedHandsList;
