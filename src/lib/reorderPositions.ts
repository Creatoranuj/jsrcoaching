/**
 * Pure helpers for list reordering.
 *
 * Both helpers return a NORMALIZED position map (0..n-1) so that legacy rows
 * with duplicate or gapped `position` values converge to a stable order on the
 * first save. Only rows whose position actually changes are returned, keeping
 * the DB write batch minimal.
 */

export interface Positioned {
  id: string;
  position?: number | null;
}

export interface PositionUpdate {
  id: string;
  position: number;
}

/** Move the item at `from` to index `to`, returning the reordered array. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = list.slice();
  if (from < 0 || from >= next.length || to < 0 || to >= next.length || from === to) {
    return next;
  }
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Diff a desired order against current positions → minimal normalized updates. */
export function positionUpdates<T extends Positioned>(ordered: readonly T[]): PositionUpdate[] {
  const updates: PositionUpdate[] = [];
  ordered.forEach((item, index) => {
    if ((item.position ?? -1) !== index) updates.push({ id: item.id, position: index });
  });
  return updates;
}

/** Reorder by index (drag & drop). */
export function reorderByIndex<T extends Positioned>(
  list: readonly T[],
  from: number,
  to: number,
): { ordered: T[]; updates: PositionUpdate[] } {
  const ordered = moveItem(list, from, to);
  return { ordered, updates: positionUpdates(ordered) };
}

/** Reorder by one step (arrow buttons). Returns unchanged list at the edges. */
export function reorderByStep<T extends Positioned>(
  list: readonly T[],
  id: string,
  direction: "up" | "down",
): { ordered: T[]; updates: PositionUpdate[] } {
  const from = list.findIndex((i) => i.id === id);
  const to = direction === "up" ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= list.length) {
    return { ordered: list.slice(), updates: [] };
  }
  return reorderByIndex(list, from, to);
}
