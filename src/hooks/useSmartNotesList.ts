import { useCallback, useEffect, useState } from "react";
import { supabase } from "../integrations/supabase/client";
import { captureException } from "../lib/sentry";

export interface SmartNoteRow {
  id: string;
  user_id: string;
  lesson_id: string | null;
  course_id: number | null;
  title: string;
  content_md: string;
  updated_at: string;
  created_at: string;
}

interface Args {
  lessonId?: string | null;
  courseId?: number | null;
}

/**
 * Multi-note CRUD for the `smart_notes` table, scoped to the current user
 * and (lesson OR course). Returns the list newest-first plus helpers:
 *
 *   create({title, content_md?})  → returns new row
 *   rename(id, title)              → patch title
 *   remove(id)                     → hard delete
 *   refresh()                      → refetch
 *
 * All mutations refresh the local list optimistically; errors surface via
 * Sentry (`captureException`) with a `surface` tag and the caller may
 * inspect the returned promise for UI toasts.
 */
export function useSmartNotesList({ lessonId, courseId }: Args) {
  const [notes, setNotes] = useState<SmartNoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!cancelled) setUserId(data.user?.id ?? null);
    })();
    return () => { cancelled = true; };
  }, []);

  const refresh = useCallback(async () => {
    if (!userId || (!lessonId && !courseId)) { setNotes([]); setLoading(false); return; }
    setLoading(true);
    try {
      let q = supabase.from("smart_notes").select("*").eq("user_id", userId);
      q = lessonId ? q.eq("lesson_id", lessonId) : q.is("lesson_id", null).eq("course_id", courseId!);
      const { data, error } = await q.order("updated_at", { ascending: false });
      if (error) throw error;
      setNotes((data ?? []) as SmartNoteRow[]);
    } catch (err) {
      captureException(err, { surface: "useSmartNotesList.refresh", lessonId, courseId });
    } finally {
      setLoading(false);
    }
  }, [userId, lessonId, courseId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const create = useCallback(
    async (args: { title: string; content_md?: string }): Promise<SmartNoteRow | null> => {
      if (!userId) throw new Error("Not signed in");
      const payload = {
        user_id: userId,
        lesson_id: lessonId ?? null,
        course_id: courseId ?? null,
        title: args.title.trim() || "Untitled note",
        content_md: args.content_md ?? "",
      };
      try {
        // Audit 2026-09-22: the live table carries UNIQUE indexes
        // `smart_notes_user_lesson_uniq` (user_id, lesson_id) and
        // `smart_notes_user_course_uniq` (user_id, course_id). A plain insert
        // therefore failed with 23505 on the second save from a retried/offline
        // mutation, surfacing as "Object captured as exception" in Sentry.
        // Upsert on the matching key so a replay updates the existing note.
        const { data, error } = await supabase
          .from("smart_notes")
          .upsert(payload, { onConflict: lessonId ? "user_id,lesson_id" : "user_id,course_id" })
          .select()
          .single();
        if (error) throw error;
        const row = data as SmartNoteRow;
        setNotes((prev) =>
          prev.some((n) => n.id === row.id)
            ? prev.map((n) => (n.id === row.id ? row : n))
            : [row, ...prev]
        );
        return row;
      } catch (err) {
        captureException(err, { surface: "useSmartNotesList.create", lessonId, courseId });
        throw err;
      }
    },
    [userId, lessonId, courseId]
  );

  const rename = useCallback(async (id: string, title: string): Promise<void> => {
    const clean = title.trim() || "Untitled note";
    // Optimistic
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, title: clean } : n)));
    try {
      const { error } = await supabase.from("smart_notes").update({ title: clean }).eq("id", id);
      if (error) throw error;
    } catch (err) {
      captureException(err, { surface: "useSmartNotesList.rename", id });
      void refresh();
      throw err;
    }
  }, [refresh]);

  const remove = useCallback(async (id: string): Promise<void> => {
    const prev = notes;
    setNotes((cur) => cur.filter((n) => n.id !== id));
    try {
      const { error } = await supabase.from("smart_notes").delete().eq("id", id);
      if (error) throw error;
    } catch (err) {
      setNotes(prev);
      captureException(err, { surface: "useSmartNotesList.remove", id });
      throw err;
    }
  }, [notes]);

  return { notes, loading, refresh, create, rename, remove };
}
