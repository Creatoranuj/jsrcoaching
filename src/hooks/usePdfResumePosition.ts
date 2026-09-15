import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Persist & restore the last-viewed PDF page per lesson/url.
 * Storage: localStorage["nb:pdf:lastPage"] = { [key]: { page, savedAt } }
 * - Debounced writes (800 ms) to avoid storm during fast scroll.
 * - LRU-capped at 200 entries by savedAt.
 * - Silently no-ops on storage failure (quota / private mode).
 */
const STORAGE_KEY = "nb:pdf:lastPage";
const MAX_ENTRIES = 200;
const WRITE_DEBOUNCE_MS = 800;

type Entry = { page: number; savedAt: number };
type Store = Record<string, Entry>;

function readStore(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Store) {
  try {
    // LRU prune
    const entries = Object.entries(store);
    if (entries.length > MAX_ENTRIES) {
      entries.sort((a, b) => b[1].savedAt - a[1].savedAt);
      store = Object.fromEntries(entries.slice(0, MAX_ENTRIES));
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* quota or private mode — no-op */
  }
}

function hashKey(input: string): string {
  // Simple non-crypto hash, sufficient for url-based keying.
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h << 5) - h + input.charCodeAt(i);
    h |= 0;
  }
  return `u:${h.toString(36)}`;
}

export function usePdfResumePosition(opts: { lessonId?: string | null; url?: string | null }) {
  const key = useMemo(() => {
    if (opts.lessonId) return `l:${opts.lessonId}`;
    if (opts.url) return hashKey(opts.url);
    return null;
  }, [opts.lessonId, opts.url]);

  const [initialPage, setInitialPage] = useState<number | undefined>(undefined);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<number>(0);

  // Restore on key change
  useEffect(() => {
    if (!key) {
      setInitialPage(undefined);
      return;
    }
    const store = readStore();
    const entry = store[key];
    setInitialPage(entry?.page && entry.page > 1 ? entry.page : undefined);
  }, [key]);

  const savePage = useCallback(
    (page: number) => {
      if (!key || !page || page < 1) return;
      if (page === lastSavedRef.current) return;
      lastSavedRef.current = page;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const store = readStore();
        store[key] = { page, savedAt: Date.now() };
        writeStore(store);
      }, WRITE_DEBOUNCE_MS);
    },
    [key]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return { initialPage, savePage };
}
