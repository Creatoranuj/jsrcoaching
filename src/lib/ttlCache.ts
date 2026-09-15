/**
 * Simple module-level TTL cache for legacy useState/useEffect hooks
 * that pre-date React Query. Mimics `staleTime`: within TTL a remount
 * hydrates from memory and skips the network entirely. Mutations call
 * `invalidateCache(key)` to force the next fetch.
 *
 * Data is per-tab (JS memory only). Safe for public/user-scoped rows
 * because the key can embed the user id (e.g. `courses:v1`, `lessons:42`).
 */

type Entry<T> = { data: T; ts: number };

const store = new Map<string, Entry<unknown>>();

export function getCached<T>(key: string, ttlMs: number): T | null {
  const hit = store.get(key) as Entry<T> | undefined;
  if (!hit) return null;
  if (Date.now() - hit.ts > ttlMs) return null;
  return hit.data;
}

export function setCached<T>(key: string, data: T): void {
  store.set(key, { data, ts: Date.now() });
}

export function invalidateCache(prefix: string): void {
  for (const k of Array.from(store.keys())) {
    if (k === prefix || k.startsWith(prefix + ":")) store.delete(k);
  }
}

// Convenience TTL constants
export const TTL = {
  short: 60_000,        // 1 min
  medium: 5 * 60_000,   // 5 min — courses/lessons
  long: 30 * 60_000,    // 30 min — landing content
} as const;
