/**
 * TanStack Query persister — IndexedDB on web (via idb-keyval),
 * @capacitor/preferences on native. Hydrates on app boot so cold-start
 * UI can render meaningful content before the network responds.
 *
 * Strategy:
 *  - Save on idle every 8s and on `visibilitychange:hidden`.
 *  - Only persist successful queries with non-empty data.
 *  - Cap total persisted size at ~4MB (IndexedDB has plenty of room;
 *    the old 512KB localStorage cap forced heavy eviction).
 *  - Skip queries whose key contains "live" / "realtime" / "presence" /
 *    "session" / "chatbot".
 *  - `CACHE_VERSION` bump on deploy auto-invalidates stale entries.
 */
import type { QueryClient } from "@tanstack/react-query";
import { get as idbGet, set as idbSet, del as idbDel, createStore } from "idb-keyval";
import { safeGet, safeSet } from "@/lib/storage";
import { loadCore } from "@/lib/native/core";
import { loadPreferences } from "@/lib/native/preferences";

/** Bump on schema/migration changes to force-drop stale caches. */
const CACHE_VERSION = 2;
const STORAGE_KEY = `nb_query_cache_v${CACHE_VERSION}`;
const LEGACY_KEY = "nb_query_cache_v1";
const MAX_BYTES = 4 * 1024 * 1024; // 4MB — IndexedDB gives us room
const SAVE_INTERVAL_MS = 8000;
const SKIP_KEY_PARTS = ["live", "realtime", "presence", "session", "chatbot"];
const idbStore = typeof indexedDB !== "undefined" ? createStore("nb-query-cache", "kv") : null;

type PersistedQuery = {
  key: unknown[];
  data: unknown;
  dataUpdatedAt: number;
};

async function getStorage() {
  try {
    const { Capacitor } = await loadCore();
    if (Capacitor.isNativePlatform()) {
      const { plugin: Preferences } = await loadPreferences();
      return {
        async get(): Promise<string | null> {
          return (await Preferences.get({ key: STORAGE_KEY })).value;
        },
        async set(v: string) {
          await Preferences.set({ key: STORAGE_KEY, value: v });
        },
      };
    }
  } catch {
    /* fall through to web */
  }
  // Web: IndexedDB (4MB+) with localStorage fallback for private-mode / SSR.
  if (idbStore) {
    return {
      async get(): Promise<string | null> {
        try {
          const v = await idbGet<string>(STORAGE_KEY, idbStore);
          return v ?? null;
        } catch { return safeGet(STORAGE_KEY); }
      },
      async set(v: string) {
        try { await idbSet(STORAGE_KEY, v, idbStore); }
        catch { safeSet(STORAGE_KEY, v); }
      },
    };
  }
  return {
    async get(): Promise<string | null> {
      return safeGet(STORAGE_KEY);
    },
    async set(v: string) {
      safeSet(STORAGE_KEY, v);
    },
  };
}

/** Fire-and-forget cleanup of pre-v2 caches. */
function purgeLegacy() {
  try { safeSet(LEGACY_KEY, ""); } catch { /* noop */ }
  if (idbStore) idbDel(LEGACY_KEY, idbStore).catch(() => { /* noop */ });
}

function shouldSkipKey(key: unknown[]): boolean {
  // Element-equality match, not substring. Previously `["user-session-notes"]`
  // was silently skipped because "session" matched as a substring. Only skip
  // when a top-level key element (string) exactly equals a reserved token.
  for (const part of key) {
    if (typeof part !== "string") continue;
    const low = part.toLowerCase();
    if (SKIP_KEY_PARTS.includes(low)) return true;
  }
  return false;
}

/**
 * Guard: JSON.stringify silently turns `Set`/`Map` into `{}`. If we persist
 * a query whose data tree contains a Set, the next cold-start hydrates a
 * broken object and callers crash with `x.has is not a function`. Detect
 * those shapes and skip persisting them — the query will simply re-fetch
 * fresh on next mount, which is the safe behavior.
 */
function containsNonSerializable(value: unknown, depth = 0): boolean {
  if (value == null || depth > 6) return false;
  if (value instanceof Set || value instanceof Map) return true;
  if (Array.isArray(value)) {
    for (const v of value) if (containsNonSerializable(v, depth + 1)) return true;
    return false;
  }
  if (typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      if (containsNonSerializable(v, depth + 1)) return true;
    }
  }
  return false;
}

export async function hydrateQueryCache(client: QueryClient) {
  purgeLegacy();
  try {
    const storage = await getStorage();
    const raw = await storage.get();
    if (!raw) return;
    const parsed = JSON.parse(raw) as { v: number; queries: PersistedQuery[] };
    if (!parsed?.queries || parsed.v !== CACHE_VERSION) return;
    const now = Date.now();
    for (const q of parsed.queries) {
      // Hydrate stale data; React Query will refetch in the background.
      if (now - q.dataUpdatedAt > 1000 * 60 * 60 * 24) continue; // drop >24h old
      client.setQueryData(q.key, q.data);
    }
  } catch {
    /* corrupt cache — ignore */
  }
}

export function startQueryPersister(client: QueryClient) {
  let saving = false;
  const save = async () => {
    if (saving) return;
    saving = true;
    try {
      const queries = client
        .getQueryCache()
        .getAll()
        .filter((q) => q.state.status === "success" && q.state.data != null)
        .filter((q) => !shouldSkipKey(q.queryKey as unknown[]))
        .filter((q) => !containsNonSerializable(q.state.data))
        .map<PersistedQuery>((q) => ({
          key: q.queryKey as unknown[],
          data: q.state.data,
          dataUpdatedAt: q.state.dataUpdatedAt,
        }));

      let payload = JSON.stringify({ v: CACHE_VERSION, queries });
      // If too large, halve until it fits (drop oldest first).
      while (payload.length > MAX_BYTES && queries.length > 0) {
        queries.sort((a, b) => a.dataUpdatedAt - b.dataUpdatedAt);
        queries.splice(0, Math.ceil(queries.length / 4));
        payload = JSON.stringify({ v: CACHE_VERSION, queries });
      }
      const storage = await getStorage();
      await storage.set(payload);
    } catch {
      /* noop */
    } finally {
      saving = false;
    }
  };

  const idle = (window as typeof window & {
    requestIdleCallback?: (cb: () => void) => number;
  }).requestIdleCallback;
  const scheduleSave = () => (idle ? idle(save) : setTimeout(save, 0));

  const interval = window.setInterval(scheduleSave, SAVE_INTERVAL_MS);
  const onHide = () => {
    if (document.visibilityState === "hidden") scheduleSave();
  };
  document.addEventListener("visibilitychange", onHide);

  return () => {
    window.clearInterval(interval);
    document.removeEventListener("visibilitychange", onHide);
  };
}
