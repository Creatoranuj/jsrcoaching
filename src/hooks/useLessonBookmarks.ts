import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { logger } from "@/lib/logger";


export interface Bookmark {
  id: string;
  at_seconds: number;
  note: string | null;
}

/**
 * Per-user bookmarks on a lesson timeline. Returns list + actions.
 */
export function useLessonBookmarks(lessonId?: string) {
  const { user } = useAuth();
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);

  const refresh = useCallback(async () => {
    if (!user?.id || !lessonId) { setBookmarks([]); return; }
    const { data } = await supabase
      .from("lesson_bookmarks" as never)
      .select("id,at_seconds,note")
      .eq("user_id", user.id)
      .eq("lesson_id", lessonId)
      .order("at_seconds", { ascending: true });
    setBookmarks(((data as unknown) as Bookmark[]) || []);
  }, [user?.id, lessonId]);

  useEffect(() => { refresh(); }, [refresh]);

  const add = useCallback(async (atSeconds: number, note?: string) => {
    if (!user?.id || !lessonId) return;
    const { data, error } = await supabase
      .from("lesson_bookmarks" as never)
      .insert({
        user_id: user.id,
        lesson_id: lessonId,
        at_seconds: Math.floor(atSeconds),
        note: note ?? null,
      } as never)
      .select("id,at_seconds,note")
      .single();
    if (error) {
      logger.error("[bookmarks] add failed", error);
      toast.error(error.message || "Could not add bookmark");
      return;
    }
    if (data) {
      const row = (data as unknown) as Bookmark;
      setBookmarks((prev) => [...prev, row].sort((a, b) => a.at_seconds - b.at_seconds));
    }
  }, [user?.id, lessonId]);

  const remove = useCallback(async (id: string) => {
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
    const { error } = await supabase.from("lesson_bookmarks" as never).delete().eq("id", id);
    if (error) {
      logger.error("[bookmarks] remove failed", error);
      toast.error(error.message || "Could not remove bookmark");
      refresh();
    }
  }, [refresh]);

  const update = useCallback(async (id: string, note: string | null) => {
    setBookmarks((prev) => prev.map((b) => (b.id === id ? { ...b, note } : b)));
    const { error } = await supabase.from("lesson_bookmarks" as never).update({ note } as never).eq("id", id);
    if (error) {
      logger.error("[bookmarks] update failed", error);
      toast.error(error.message || "Could not save note");
      refresh();
    }
  }, [refresh]);

  /** Add and return the inserted row so the caller can immediately open a notes editor. */
  const addAndReturn = useCallback(async (atSeconds: number, note?: string): Promise<Bookmark | null> => {
    if (!user?.id || !lessonId) {
      toast.error("Please sign in to bookmark");
      return null;
    }
    const { data, error } = await supabase
      .from("lesson_bookmarks" as never)
      .insert({
        user_id: user.id,
        lesson_id: lessonId,
        at_seconds: Math.floor(atSeconds),
        note: note ?? null,
      } as never)
      .select("id,at_seconds,note")
      .single();
    if (error || !data) {
      logger.error("[bookmarks] addAndReturn failed", error);
      toast.error(error?.message || "Could not add bookmark");
      return null;
    }
    const row = (data as unknown) as Bookmark;
    setBookmarks((prev) => [...prev, row].sort((a, b) => a.at_seconds - b.at_seconds));
    return row;
  }, [user?.id, lessonId]);


  return { bookmarks, add, addAndReturn, update, remove, refresh };
}
