import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/errorMessage";

/**
 * Manage a student's reminder for a given live session.
 * Backed by public.live_reminders (RLS: own rows only).
 */
export function useLiveReminder(sessionId: string | undefined) {
  const { user } = useAuth();
  const [isSet, setIsSet] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user || !sessionId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("live_reminders")
        .select("id")
        .eq("user_id", user.id)
        .eq("session_id", sessionId)
        .maybeSingle();
      if (!cancelled) setIsSet(!!data);
    })();
    return () => { cancelled = true; };
  }, [user, sessionId]);

  const toggle = useCallback(async () => {
    if (!user) {
      toast.error("Pehle login karo");
      return;
    }
    if (!sessionId || busy) return;
    setBusy(true);
    try {
      if (isSet) {
        const { error } = await supabase
          .from("live_reminders")
          .delete()
          .eq("user_id", user.id)
          .eq("session_id", sessionId);
        if (error) throw error;
        setIsSet(false);
        toast.success("Reminder hata diya");
      } else {
        const { error } = await supabase
          .from("live_reminders")
          .insert({ user_id: user.id, session_id: sessionId });
        if (error && !String(error.message).includes("duplicate")) throw error;
        setIsSet(true);
        toast.success("Reminder set — class shuru hote hi ping karenge");
      }
    } catch (e: unknown) {
      toast.error(getErrorMessage(e) || "Reminder save nahi hua");
    } finally {
      setBusy(false);
    }
  }, [user, sessionId, isSet, busy]);

  return { isSet, busy, toggle };
}
