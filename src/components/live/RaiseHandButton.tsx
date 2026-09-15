import { useState, useEffect } from "react";
import { supabase } from "../../integrations/supabase/client";
import { useAuth } from "../../contexts/AuthContext";
import { Button } from "../ui/button";
import { toast } from "sonner";

interface RaiseHandButtonProps {
  sessionId: string;
}

const RaiseHandButton = ({ sessionId }: RaiseHandButtonProps) => {
  const { user, profile } = useAuth();
  const [handRaised, setHandRaised] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    const fetchStatus = async () => {
      const { data } = await supabase
        .from("live_participants")
        .select("hand_raised")
        .eq("session_id", sessionId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) setHandRaised(data.hand_raised);
    };
    fetchStatus();

    const channel = supabase
      .channel(`raise-hand-${sessionId}-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "live_participants",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload: any) => {
          if (payload.new?.user_id === user.id) {
            setHandRaised(payload.new.hand_raised);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, sessionId]);

  const toggleHand = async () => {
    if (!user || !profile) return;
    setLoading(true);
    const newState = !handRaised;
    const { error } = await supabase
      .from("live_participants")
      .upsert(
        {
          session_id: sessionId,
          user_id: user.id,
          user_name: profile.fullName || profile.email || "Student",
          hand_raised: newState,
        },
        { onConflict: "session_id,user_id" }
      );

    if (error) {
      toast.error("Could not update hand status");
    } else {
      setHandRaised(newState);
      if (newState) toast.success("✋ Hand raised! Teacher will see it.");
      else toast.info("Hand lowered.");
    }
    setLoading(false);
  };

  return (
    <Button
      onClick={toggleHand}
      disabled={loading}
      size="sm"
      variant={handRaised ? "destructive" : "secondary"}
      className={`gap-2 font-semibold transition-all ${
        handRaised
          ? "bg-amber-500 hover:bg-amber-600 text-white border-amber-400"
          : "bg-card border border-border hover:bg-muted"
      }`}
    >
      <span className="text-base leading-none">{handRaised ? "✋" : "🖐️"}</span>
      {handRaised ? "Lower Hand" : "Raise Hand"}
    </Button>
  );
};

export default RaiseHandButton;
