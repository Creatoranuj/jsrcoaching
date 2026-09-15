import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/errorMessage";

export interface Message {
  id: string;
  senderId: string;
  recipientId: string;
  subject: string;
  content: string;
  isRead: boolean;
  createdAt: string;
}

export interface MessageWithProfiles extends Message {
  sender?: {
    fullName: string | null;
    email: string | null;
  };
  recipient?: {
    fullName: string | null;
    email: string | null;
  };
}

export interface MessageInput {
  recipientId: string;
  subject: string;
  content: string;
}

export const useMessages = () => {
  const { user } = useAuth();
  const [inbox, setInbox] = useState<MessageWithProfiles[]>([]);
  const [sent, setSent] = useState<MessageWithProfiles[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const userId = user?.id != null ? String(user.id) : undefined;

  const fetchMessages = useCallback(async () => {
    if (!userId) return;

    try {
      setLoading(true);

      const { data, error: fetchError } = await supabase
        .from("messages")
        .select("*")
        .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;

      const allMessages: MessageWithProfiles[] = (data || []).map((m) => ({
        id: m.id,
        senderId: m.sender_id,
        recipientId: m.recipient_id,
        subject: "",
        content: m.content,
        isRead: m.is_read,
        createdAt: m.created_at,
      }));

      const inboxMessages = allMessages.filter(m => m.recipientId === userId);
      const sentMessages = allMessages.filter(m => m.senderId === userId);

      setInbox(inboxMessages);
      setSent(sentMessages);
      setUnreadCount(inboxMessages.filter((m) => !m.isRead).length);
    } catch (err: unknown) {
      logger.error("Error fetching messages:", err);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const fetchInbox = fetchMessages;
  const fetchSent = fetchMessages;

  const sendMessage = useCallback(async (input: MessageInput): Promise<boolean> => {
    if (!userId) {
      toast.error("Please login to send messages");
      return false;
    }

    try {
      const { error: insertError } = await supabase.from("messages").insert({
        sender_id: userId,
        recipient_id: input.recipientId,
        subject: input.subject || "Message",
        content: input.content,
      });

      if (insertError) throw insertError;

      toast.success("Message sent");
      await fetchMessages();
      return true;
    } catch (err: unknown) {
      logger.error("Error sending message:", err);
      toast.error(getErrorMessage(err) || "Failed to send message");
      return false;
    }
  }, [userId, fetchMessages]);

  const markAsRead = useCallback(async (messageId: string): Promise<void> => {
    try {
      await supabase.from("messages").update({ is_read: true }).eq("id", messageId);
      await fetchMessages();
    } catch (err: unknown) {
      logger.error("Error marking message as read:", err);
    }
  }, [fetchMessages]);

  const deleteMessage = useCallback(async (messageId: string): Promise<boolean> => {
    toast.info("Delete not available — messages cannot be deleted");
    return false;
  }, []);

  useEffect(() => {
    if (userId) {
      fetchMessages();
    }
  }, [userId, fetchMessages]);

  // Real-time subscription for messages.
  // Same pattern as useComments: keep fetchMessages OUT of deps via a ref
  // so the channel isn't torn down + re-subscribed on every fetch tick.
  const fetchMessagesRef = useRef(fetchMessages);
  fetchMessagesRef.current = fetchMessages;

  useEffect(() => {
    if (!userId) return;

    // PERF: scope realtime to rows involving this user only (recipient OR sender)
    // to avoid receiving the entire messages table's INSERT/UPDATE/DELETE traffic.
    const channel = supabase
      .channel(`messages-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `recipient_id=eq.${userId}` },
        () => { fetchMessagesRef.current(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `sender_id=eq.${userId}` },
        () => { fetchMessagesRef.current(); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return {
    inbox,
    sent,
    unreadCount,
    loading,
    error,
    fetchInbox,
    fetchSent,
    sendMessage,
    markAsRead,
    deleteMessage,
  };
};
