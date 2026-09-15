import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import { logger } from "../lib/logger";
import { getErrorMessage } from "@/lib/errorMessage";

export interface Comment {
  id: string;
  lessonId: string | null;
  userId: string | null;
  userName: string;
  message: string;
  imageUrl: string | null;
  createdAt: string | null;
}

export interface CommentInput {
  lessonId: string;
  message: string;
  imageUrl?: string;
}

export const useComments = (lessonId?: string) => {
  const { user, profile } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchComments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      if (!lessonId) {
        setComments([]);
        setLoading(false);
        return;
      }

      const { data, error: dbError } = await supabase
        .from("comments")
        .select("id,lesson_id,user_id,user_name,message,image_url,created_at")
        .eq("lesson_id", lessonId)
        .eq("is_hidden", false)
        .order("created_at", { ascending: false })
        .limit(100);

      if (dbError) throw dbError;

      const formatted: Comment[] = (data || []).map((c) => ({
        id: c.id,
        lessonId: c.lesson_id,
        userId: c.user_id ?? null,
        userName: c.user_name,
        message: c.message,
        imageUrl: c.image_url || null,
        createdAt: c.created_at,
      }));

      setComments(formatted);
    } catch (err: unknown) {
      logger.error("Error fetching comments", err);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [lessonId]);

  const createComment = useCallback(async (input: CommentInput, userName?: string): Promise<boolean> => {
    if (!user) {
      toast.error("Comment ke liye pehle login karo");
      return false;
    }

    try {
      const { error: dbError } = await supabase.from("comments").insert({
        lesson_id: input.lessonId,
        user_name: userName || profile?.fullName || "Anonymous",
        message: input.message,
        image_url: input.imageUrl || null,
        user_id: user.id,
      });

      if (dbError) throw dbError;

      toast.success("Comment posted");
      await fetchComments();
      return true;
    } catch (err: unknown) {
      logger.error("Error creating comment", err);
      toast.error("Comment post nahi hua — dobara try karo");
      return false;
    }
  }, [user, profile, fetchComments]);

  const deleteComment = useCallback(async (commentId: string): Promise<boolean> => {
    if (!user) {
      toast.error("Delete ke liye pehle login karo");
      return false;
    }

    try {
      const { error: dbError } = await supabase
        .from("comments")
        .delete()
        .eq("id", commentId);

      if (dbError) throw dbError;

      toast.success("Comment deleted");
      await fetchComments();
      return true;
    } catch (err: unknown) {
      logger.error("Error deleting comment", err);
      toast.error("Comment delete nahi hua — dobara try karo");
      return false;
    }
  }, [user, fetchComments]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  // Real-time subscription for comments.
  // IMPORTANT: keep fetchComments OUT of the deps. Otherwise every
  // setLoading(true) inside fetchComments re-runs this effect, which tears
  // down + re-subscribes the WebSocket on every fetch → subscribe/unsubscribe
  // storm + main-thread jank. Use a ref to always call the latest fn.
  const fetchCommentsRef = useRef(fetchComments);
  fetchCommentsRef.current = fetchComments;

  useEffect(() => {
    if (!lessonId) return;

    const channel = supabase
      .channel(`comments-${lessonId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'comments', filter: `lesson_id=eq.${lessonId}` },
        () => {
          fetchCommentsRef.current();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [lessonId]);

  return {
    comments,
    loading,
    error,
    fetchComments,
    createComment,
    deleteComment,
  };
};
