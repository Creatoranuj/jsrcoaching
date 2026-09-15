import { supabase } from "@/integrations/supabase/client";

/**
 * Fire-and-forget security event logger.
 * Insert into public.security_events. Never throws — security logging must
 * not break the user experience.
 *
 * Phone numbers MUST be masked before being passed in via `payload`.
 */
export async function logSecurityEvent(
  eventType: string,
  payload: Record<string, unknown> = {}
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return; // RLS requires authenticated user_id
    await supabase
      .from("security_events" as never)
      .insert({
        user_id: user.id,
        event_type: eventType,
        payload,
      } as never);
  } catch (err) {
    if (typeof console !== "undefined") {
      console.debug("[logSecurityEvent] swallowed", err);
    }
  }
}
