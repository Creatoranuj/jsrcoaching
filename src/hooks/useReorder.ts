import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { invalidateCache } from "@/lib/ttlCache";
import { selectionHaptic } from "@/lib/native/haptics";
import { logger } from "@/lib/logger";
import {
  reorderByIndex,
  reorderByStep,
  type PositionUpdate,
  type Positioned,
} from "@/lib/reorderPositions";

type ReorderTable = "lessons" | "chapters";

async function persist(table: ReorderTable, updates: PositionUpdate[]): Promise<void> {
  if (updates.length === 0) return;
  const results = await Promise.all(
    updates.map((u) => supabase.from(table).update({ position: u.position }).eq("id", u.id)),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}

/**
 * Optimistic list reordering for admin screens.
 *
 * `apply` writes the new order to the caller's local state immediately, then
 * persists the minimal diff. On failure the previous order is restored so the
 * UI never drifts from the database.
 */
export function useReorder(table: ReorderTable) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const invalidateStudentViews = useCallback(() => {
    // React Query (Course page) + module TTL cache (useLessons / useCourses).
    queryClient.invalidateQueries({ queryKey: ["course-lessons"] });
    queryClient.invalidateQueries({ queryKey: ["course"] });
    queryClient.invalidateQueries({ queryKey: ["course-bundle"] });
    invalidateCache("lessons");
    invalidateCache("chapters");
  }, [queryClient]);

  const run = useCallback(
    async <T extends Positioned>(
      current: readonly T[],
      compute: (list: readonly T[]) => { ordered: T[]; updates: PositionUpdate[] },
      onOptimistic: (ordered: T[]) => void,
    ) => {
      const { ordered, updates } = compute(current);
      if (updates.length === 0) return;

      const previous = current.slice();
      onOptimistic(ordered.map((item, index) => ({ ...item, position: index })));
      void selectionHaptic();
      setSaving(true);
      try {
        await persist(table, updates);
        invalidateStudentViews();
      } catch (err) {
        logger.error("[useReorder] persist failed", err);
        onOptimistic(previous as T[]);
        toast.error("Order save nahi hua — dobara try karein");
      } finally {
        setSaving(false);
      }
    },
    [table, invalidateStudentViews],
  );

  const moveByIndex = useCallback(
    <T extends Positioned>(
      list: readonly T[],
      from: number,
      to: number,
      onOptimistic: (ordered: T[]) => void,
    ) => run(list, (l) => reorderByIndex(l, from, to), onOptimistic),
    [run],
  );

  const moveByStep = useCallback(
    <T extends Positioned>(
      list: readonly T[],
      id: string,
      direction: "up" | "down",
      onOptimistic: (ordered: T[]) => void,
    ) => run(list, (l) => reorderByStep(l, id, direction), onOptimistic),
    [run],
  );

  return { moveByIndex, moveByStep, saving };
}
