/**
 * Item priority store — lightweight, device-local labels (P1/P2/P3) that
 * users can attach to any downloadable/library item. Keyed by a stable id
 * convention so the same scheme works across downloads, personal library
 * and the PDF catalog.
 *
 * Key conventions:
 *   - Downloads (from courses):  `dl_<numericId>`
 *   - Personal Library items:    `pl_<uuid>`
 *   - Catalog PDFs:              `lib_<pdf_id>`
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";

export type Priority = 0 | 1 | 2 | 3; // 0 = none

const KEY = "nb_item_priority_v1";
const EVENT = "itemPriority:changed";

type Store = Record<string, Priority>;

function safeRead(): Store {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

let cache: Store | null = null;
function getCache(): Store {
  if (cache === null) cache = safeRead();
  return cache;
}

function persist(next: Store) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* quota: ignore */
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(EVENT));
  }
}

export function getPriority(id: string): Priority {
  return (getCache()[id] ?? 0) as Priority;
}

export function setPriority(id: string, p: Priority) {
  const next = { ...getCache() };
  if (p === 0) delete next[id];
  else next[id] = p;
  persist(next);
}

export function setPriorityBulk(ids: string[], p: Priority) {
  const next = { ...getCache() };
  for (const id of ids) {
    if (p === 0) delete next[id];
    else next[id] = p;
  }
  persist(next);
}

export function priorityKeyForDownload(numericId: number | undefined): string | null {
  return numericId == null ? null : `dl_${numericId}`;
}
export function priorityKeyForPersonalItem(id: string): string {
  return `pl_${id}`;
}
export function priorityKeyForLibraryPdf(pdfId: string): string {
  return `lib_${pdfId}`;
}

/** React hook: returns the priority for a given id and re-renders on change. */
export function useItemPriority(id: string | null | undefined): Priority {
  const subscribe = useCallback((cb: () => void) => {
    if (typeof window === "undefined") return () => {};
    window.addEventListener(EVENT, cb);
    window.addEventListener("storage", cb);
    return () => {
      window.removeEventListener(EVENT, cb);
      window.removeEventListener("storage", cb);
    };
  }, []);
  const getSnapshot = useCallback(() => (id ? getPriority(id) : 0), [id]);
  return useSyncExternalStore(subscribe, getSnapshot, () => 0);
}

/** Sort: P1 highest, then P2, then P3, then unset — stable otherwise. */
export function priorityRank(p: Priority): number {
  return p === 0 ? 4 : p;
}

/** Subscribe-once helper for non-React callers. */
export function onPriorityChanged(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

/** Read-all snapshot (e.g. for batch UI badges). */
export function snapshotPriorities(): Store {
  return { ...getCache() };
}

// Cross-tab cache invalidation.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) cache = null;
  });
}

// Silence the "useEffect imported but unused" lint when tree-shaken.
void useEffect;
