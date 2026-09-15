import { useEffect, useState } from "react";
import { supabase } from "../integrations/supabase/client";

/**
 * Batch-fetch "notes" counts for many lessons.
 * Combines: lesson_pdfs + lesson_attachments + class_pdf_url flag (passed in).
 *
 * `classPdfMap` is an optional { lessonId -> hasClassPdf } map derived
 * client-side from already-loaded lessons (avoids an extra query).
 */
export const useLessonNotesCounts = (
  lessonIds: string[],
  classPdfMap: Record<string, boolean> = {}
) => {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const idsKey = lessonIds.slice().sort().join(",");
  const classKey = Object.entries(classPdfMap)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .sort()
    .join(",");

  useEffect(() => {
    let cancelled = false;
    if (!lessonIds.length) { setCounts({}); return; }
    (async () => {
      const [pdfsRes, attRes] = await Promise.all([
        supabase.from("lesson_pdfs").select("lesson_id, file_url").in("lesson_id", lessonIds),
        supabase.from("lesson_attachments").select("lesson_id").in("lesson_id", lessonIds),
      ]);
      if (cancelled) return;

      const map: Record<string, number> = {};
      // Track URLs per lesson so the auto-linked class_pdf row isn't double-counted.
      const seenUrls: Record<string, Set<string>> = {};

      lessonIds.forEach(id => {
        if (classPdfMap[id]) {
          map[id] = 1;
          seenUrls[id] = new Set<string>();
        }
      });

      (pdfsRes.data || []).forEach((row) => {
        const lid = row.lesson_id;
        if (!seenUrls[lid]) seenUrls[lid] = new Set<string>();
        // If class_pdf_url equals this row's file_url, the +1 above already counted it.
        // We don't know the class_pdf_url value here, but the lesson_pdfs auto-link
        // uses the same URL. Safe approximation: when classPdfMap[lid] is true and
        // this is the first pdf row, skip one to avoid double-counting.
        if (classPdfMap[lid] && !seenUrls[lid].has("__class_dedup__")) {
          seenUrls[lid].add("__class_dedup__");
          return;
        }
        map[lid] = (map[lid] || 0) + 1;
      });

      (attRes.data || []).forEach((row: { lesson_id: string }) => {
        map[row.lesson_id] = (map[row.lesson_id] || 0) + 1;
      });

      setCounts(map);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, classKey]);

  return counts;
};
