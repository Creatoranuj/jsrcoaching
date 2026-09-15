import { useState, useEffect, useCallback } from "react";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../contexts/AuthContext";
import { reportError } from "../lib/sentry";

export const useLessonLikes = (lessonId?: string) => {
  const { user } = useAuth();
  const [likeCount, setLikeCount] = useState(0);
  const [hasLiked, setHasLiked] = useState(false);
  const [loading, setLoading] = useState(false);

  // Fetch like count + user's like status, then subscribe to realtime updates
  // so other viewers' likes push in instead of polling. (perf: was 544 calls/session)
  useEffect(() => {
    if (!lessonId) return;
    let cancelled = false;

    const fetchLikes = async () => {
      const { data: lesson } = await supabase
        .from("lessons")
        .select("like_count")
        .eq("id", lessonId)
        .maybeSingle();
      if (!cancelled && lesson) setLikeCount(lesson.like_count ?? 0);

      if (user) {
        const { data: like } = await supabase
          .from("lesson_likes")
          .select("id")
          .eq("lesson_id", lessonId)
          .eq("user_id", user.id)
          .maybeSingle();
        if (!cancelled) setHasLiked(!!like);
      }
    };

    fetchLikes();

    const channel = supabase
      .channel(`lesson-likes-${lessonId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "lessons", filter: `id=eq.${lessonId}` },
        (payload) => {
          const next = (payload.new as { like_count?: number | null } | null)?.like_count;
          if (typeof next === "number") setLikeCount(next);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [lessonId, user]);

  const toggleLike = useCallback(async () => {
    if (!lessonId || !user || loading) return;

    setLoading(true);
    try {
      if (hasLiked) {
        // Unlike
        await supabase
          .from("lesson_likes")
          .delete()
          .eq("lesson_id", lessonId)
          .eq("user_id", user.id);
        setHasLiked(false);
        setLikeCount((c) => Math.max(0, c - 1));
      } else {
        // Like
        await supabase
          .from("lesson_likes")
          .insert({ lesson_id: lessonId, user_id: user.id });
        setHasLiked(true);
        setLikeCount((c) => c + 1);
      }
    } catch (err) {
      reportError(err, { surface: "useLessonLikes.toggle" });
    } finally {
      setLoading(false);
    }
  }, [lessonId, user, hasLiked, loading]);

  return { likeCount, hasLiked, toggleLike, loading };
};
