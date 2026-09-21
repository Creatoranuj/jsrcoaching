/**
 * Chhota content snapshot device par.
 *
 * Idea: jo lists student pehle dekh chuka hai (courses, chapters, lessons,
 * PDFs) unka halka sa snapshot device par rakh lo. Server na mile, to wahi
 * list dikha do — lecture aur PDF khulte rahenge (URL/asli file wahi purane
 * download/CDN se aati hai).
 *
 * Limits: 30 din purana snapshot apne aap bekaar; kul 1.5 MB tak; sabse purana
 * entry pehle hatta hai. localStorage na ho to sab chup-chaap no-op.
 */

const PREFIX = "jsr_snap:";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 din
const MAX_TOTAL_BYTES = 1_500_000; // ~1.5 MB

type Entry<T> = { at: number; data: T };

function storage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function keysOf(store: Storage): string[] {
  const out: string[] = [];
  for (let i = 0; i < store.length; i += 1) {
    const k = store.key(i);
    if (k && k.startsWith(PREFIX)) out.push(k);
  }
  return out;
}

function totalBytes(store: Storage): number {
  return keysOf(store).reduce((sum, k) => sum + (store.getItem(k)?.length ?? 0), 0);
}

/** Purane aur zyada bade snapshots hatao. */
export function pruneSnapshots(): void {
  const store = storage();
  if (!store) return;
  const now = Date.now();
  const live: { key: string; at: number; size: number }[] = [];

  for (const key of keysOf(store)) {
    const raw = store.getItem(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as Entry<unknown>;
      if (!parsed || typeof parsed.at !== "number" || now - parsed.at > MAX_AGE_MS) {
        store.removeItem(key);
        continue;
      }
      live.push({ key, at: parsed.at, size: raw.length });
    } catch {
      store.removeItem(key);
    }
  }

  let size = live.reduce((s, e) => s + e.size, 0);
  if (size <= MAX_TOTAL_BYTES) return;
  live.sort((a, b) => a.at - b.at); // sabse purana pehle
  for (const entry of live) {
    if (size <= MAX_TOTAL_BYTES) break;
    store.removeItem(entry.key);
    size -= entry.size;
  }
}

/** Snapshot save karo. Fail ho to chup-chaap chhod do. */
export function saveSnapshot<T>(name: string, data: T): void {
  const store = storage();
  if (!store) return;
  const payload = JSON.stringify({ at: Date.now(), data } satisfies Entry<T>);
  try {
    store.setItem(PREFIX + name, payload);
    if (totalBytes(store) > MAX_TOTAL_BYTES) pruneSnapshots();
  } catch {
    // quota full — thoda saaf karke ek baar aur koshish
    try {
      pruneSnapshots();
      store.setItem(PREFIX + name, payload);
    } catch {
      // ab bhi na ho to snapshot skip; app waise hi chalega
    }
  }
}

/** Snapshot padho. 30 din se purana ya kharab ho to null. */
export function readSnapshot<T>(name: string): T | null {
  const store = storage();
  if (!store) return null;
  const raw = store.getItem(PREFIX + name);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Entry<T>;
    if (!parsed || typeof parsed.at !== "number") return null;
    if (Date.now() - parsed.at > MAX_AGE_MS) {
      store.removeItem(PREFIX + name);
      return null;
    }
    return parsed.data;
  } catch {
    store.removeItem(PREFIX + name);
    return null;
  }
}

/** Ek snapshot hatao. */
export function clearSnapshot(name: string): void {
  storage()?.removeItem(PREFIX + name);
}

/** Saare snapshots hatao. */
export function clearAllSnapshots(): void {
  const store = storage();
  if (!store) return;
  keysOf(store).forEach((k) => store.removeItem(k));
}

/**
 * Sabse aam pattern: pehle server, na mile to snapshot.
 * Server chal jaye to snapshot apne aap taaza ho jata hai.
 */
export async function withSnapshot<T>(name: string, fetcher: () => Promise<T>): Promise<T> {
  try {
    const fresh = await fetcher();
    saveSnapshot(name, fresh);
    return fresh;
  } catch (err) {
    const cached = readSnapshot<T>(name);
    if (cached !== null) return cached;
    throw err;
  }
}
