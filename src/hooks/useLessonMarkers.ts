import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ChapterMarker {
  id: string;
  start_seconds: number;
  title: string;
}

export interface QuizMarker {
  id: string;
  at_seconds: number;
  label: string | null;
  quiz_id: string | null;
}

/**
 * Fetch chapter + quiz markers for a lesson (single round-trip each).
 * Returns stable arrays sorted by time.
 */
export function useLessonMarkers(lessonId?: string) {
  const [chapters, setChapters] = useState<ChapterMarker[]>([]);
  const [quizMarkers, setQuizMarkers] = useState<QuizMarker[]>([]);

  useEffect(() => {
    if (!lessonId) { setChapters([]); setQuizMarkers([]); return; }
    let cancelled = false;
    (async () => {
      const [chRes, qRes] = await Promise.all([
        supabase
          .from("lesson_chapters" as never)
          .select("id,start_seconds,title")
          .eq("lesson_id", lessonId)
          .order("start_seconds", { ascending: true }),
        supabase
          .from("lesson_quiz_markers" as never)
          .select("id,at_seconds,label,quiz_id")
          .eq("lesson_id", lessonId)
          .order("at_seconds", { ascending: true }),
      ]);
      if (cancelled) return;
      setChapters(((chRes.data as unknown) as ChapterMarker[]) || []);
      setQuizMarkers(((qRes.data as unknown) as QuizMarker[]) || []);
    })();
    return () => { cancelled = true; };
  }, [lessonId]);

  return { chapters, quizMarkers };
}
