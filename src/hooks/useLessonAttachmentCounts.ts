import { useEffect, useState } from "react";
import { supabase } from "../integrations/supabase/client";

/**
 * Bulk-fetch attachment counts for many lessons in one query.
 * Returns a stable map { [lessonId]: count }.
 */
export const useLessonAttachmentCounts = (lessonIds: string[]) => {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const key = lessonIds.slice().sort().join(",");

  useEffect(() => {
    let cancelled = false;
    if (!lessonIds.length) { setCounts({}); return; }
    (async () => {
      const { data, error } = await supabase
        .from("lesson_attachments")
        .select("lesson_id")
        .in("lesson_id", lessonIds);
      if (cancelled) return;
      if (error) { setCounts({}); return; }
      const map: Record<string, number> = {};
      (data || []).forEach((row: { lesson_id: string }) => {
        map[row.lesson_id] = (map[row.lesson_id] || 0) + 1;
      });
      setCounts(map);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return counts;
};
