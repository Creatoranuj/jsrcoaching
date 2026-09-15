import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../integrations/supabase/client";
import { enqueueMutation } from "../lib/offline/mutationQueue";
import { captureException } from "../lib/sentry";

export interface SmartNote {
  id: string;
  user_id: string;
  lesson_id: string | null;
  course_id: number | null;
  title: string;
  content_md: string;
  updated_at: string;
}

interface Args {
  lessonId?: string | null;
  courseId?: number | null;
  defaultTitle?: string;
  /** When set, load THIS specific smart_notes row instead of the
   *  first-per-lesson row. Used by the multi-note picker. */
  noteId?: string | null;
}

/**
 * Loads a user's saved Smart Note for a given lesson (or course-level).
 *
 * Returns `{ note, loading, saving, queued, save, scheduleAutoSave, refresh }`.
 *
 * - `save(content_md, title?)` upserts immediately. On network failure the
 *   payload is enqueued via the offline mutation queue (kind:
 *   `smart_notes.upsert`) and the optimistic note is kept in local state, so
 *   the editor never loses the user's work.
 * - `scheduleAutoSave(content_md, title?)` debounces saves at 700 ms — wire
 *   it to your editor's `onChange` to eliminate the "user forgot to press
 *   Save" failure mode flagged in CAPACITOR_AUDIT.md.
 * - Errors are reported via Sentry (`captureException`) instead of being
 *   swallowed by `console.error`.
 */
export function useSmartNote({ lessonId, courseId, defaultTitle = "Smart Note", noteId }: Args) {
  const [note, setNote] = useState<SmartNote | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [queued, setQueued] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const autoSaveTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!cancelled) setUserId(data.user?.id ?? null);
    })();
    return () => { cancelled = true; };
  }, []);

  const refresh = useCallback(async () => {
    if (!userId || (!lessonId && !courseId && !noteId)) { setLoading(false); return; }
    setLoading(true);
    try {
      let q = supabase.from("smart_notes").select("*").eq("user_id", userId);
      if (noteId) {
        q = q.eq("id", noteId);
      } else if (lessonId) {
        q = q.eq("lesson_id", lessonId).order("updated_at", { ascending: false }).limit(1);
      } else {
        q = q.is("lesson_id", null).eq("course_id", courseId!).order("updated_at", { ascending: false }).limit(1);
      }
      const { data, error } = await q.maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      setNote((data as SmartNote) ?? null);
    } catch (err) {
      captureException(err, { surface: "useSmartNote.refresh", lessonId, courseId, noteId });
    } finally {
      setLoading(false);
    }
  }, [userId, lessonId, courseId, noteId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const save = useCallback(
    async (content_md: string, title?: string): Promise<SmartNote | null> => {
      if (!userId) throw new Error("Not signed in");
      if (!lessonId && !courseId && !noteId) throw new Error("Missing lesson/course/note id");
      setSaving(true);
      const payload = {
        user_id: userId,
        lesson_id: lessonId ?? null,
        course_id: courseId ?? null,
        title: title ?? note?.title ?? defaultTitle,
        content_md,
        updated_at: new Date().toISOString(),
      };
      try {
        // When editing a specific note (picker → reader), UPDATE by id so we
        // never collide with sibling notes for the same lesson. Otherwise
        // fall back to the legacy per-lesson single-row upsert.
        const targetId = noteId ?? note?.id;
        let data: SmartNote | null = null;
        if (targetId) {
          const { data: row, error } = await supabase
            .from("smart_notes")
            .update({ title: payload.title, content_md: payload.content_md, updated_at: payload.updated_at })
            .eq("id", targetId)
            .eq("user_id", userId)
            .select()
            .single();
          if (error) throw error;
          data = row as SmartNote;
        } else {
          // First-ever save for this lesson — insert.
          const { data: row, error } = await supabase
            .from("smart_notes")
            .insert(payload)
            .select()
            .single();
          if (error) throw error;
          data = row as SmartNote;
        }
        setNote(data);
        setQueued(false);
        return data;
      } catch (err) {
        // Offline / network error → queue and keep optimistic local state.
        const offline = typeof navigator !== "undefined" && navigator.onLine === false;
        if (offline) {
          enqueueMutation("smart_notes.upsert", payload);
          setNote((prev) => ({ ...(prev ?? { id: "pending", user_id: userId }), ...payload } as SmartNote));
          setQueued(true);
          return null;
        }
        captureException(err, { surface: "useSmartNote.save", lessonId, courseId, noteId });
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [userId, lessonId, courseId, note, defaultTitle, noteId]
  );

  /** Debounced auto-save. Call from editor onChange. */
  const scheduleAutoSave = useCallback(
    (content_md: string, title?: string) => {
      if (autoSaveTimer.current) window.clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = window.setTimeout(() => {
        void save(content_md, title).catch(() => { /* surfaced via captureException */ });
      }, 700);
    },
    [save]
  );

  useEffect(() => () => {
    if (autoSaveTimer.current) window.clearTimeout(autoSaveTimer.current);
  }, []);

  return { note, loading, saving, queued, save, scheduleAutoSave, refresh };
}
