/**
 * SWR-style offline cache for MyCourseDetail's chapter/lesson bundle.
 *
 * Pattern: stale-while-revalidate.
 *   1. On mount, `readBundleSync` returns the last-known bundle instantly
 *      (used as react-query `initialData`) → zero-flicker cold reopen.
 *   2. React-Query then refetches in the background and `writeBundle` snapshots
 *      the fresh payload for the next cold start.
 *
 * Why a second cache layer on top of react-query's persister?
 *   - The RQ persister is async (Preferences → rehydrate → paint), so the very
 *     first frame after a cold WebView boot still flashes an empty state.
 *   - `readBundleSync` hits `localStorage` synchronously in the WebView, so the
 *     first React render already has data → matches native app feel.
 *   - Cheap: bundles are typically <30 KB per course, hard-capped at 200 KB.
 *
 * Storage: @capacitor/preferences on native (survives OOM-kill), localStorage
 * on web + mirrored on native so `readBundleSync` works after cold start.
 *
 * Also compatible with the app-crash-shield: no listeners, no timers, no blob
 * URLs held in memory — pure JSON in/out.
 */
import { safeGet, safeSet, safeRemove } from "@/lib/storage";
import { loadCore } from "@/lib/native/core";
import { loadPreferences } from "@/lib/native/preferences";
export interface CachedCourseBundle {
  course: unknown;
  hasPurchased: boolean;
  lessons: unknown[];
  allChapters: unknown[];
  chapters: unknown[];
  /** Serialized as string[] because Sets don't survive JSON round-trip. */
  completedSet: string[];
  lastWatched: string | null;
  cachedAt: number;
}

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const BUNDLE_KEY = (courseId: string | number) => `nb_cd_bundle_v1_${courseId}`;
// Hard cap per course — protects against runaway bundles evicting other keys.
const MAX_BYTES = 200 * 1024;

type Storage = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
};

let storagePromise: Promise<Storage> | null = null;

async function getStorage(): Promise<Storage> {
  if (storagePromise) return storagePromise;
  storagePromise = (async () => {
    try {
      const { Capacitor } = await loadCore();
      if (Capacitor.isNativePlatform()) {
        const { plugin: Preferences } = await loadPreferences();
        return {
          async get(key) { return (await Preferences.get({ key })).value; },
          async set(key, value) { await Preferences.set({ key, value }); },
          async remove(key) { await Preferences.remove({ key }); },
        } satisfies Storage;
      }
    } catch {
      /* fall through to web */
    }
    return {
      async get(key) { return safeGet(key); },
      async set(key, value) { safeSet(key, value); },
      async remove(key) { safeRemove(key); },
    } satisfies Storage;
  })();
  return storagePromise;
}

/** Sync read from localStorage — safe to call during render. */
export function readBundleSync(courseId: string | number | undefined): CachedCourseBundle | null {
  if (!courseId || typeof window === "undefined") return null;
  try {
    const raw = safeGet(BUNDLE_KEY(courseId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedCourseBundle;
    if (!parsed || typeof parsed !== "object") return null;
    if (Date.now() - parsed.cachedAt > TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function readBundle(courseId: string | number): Promise<CachedCourseBundle | null> {
  try {
    const storage = await getStorage();
    const raw = await storage.get(BUNDLE_KEY(courseId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedCourseBundle;
    if (!parsed || typeof parsed !== "object") return null;
    if (Date.now() - parsed.cachedAt > TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeBundle(
  courseId: string | number,
  bundle: Omit<CachedCourseBundle, "cachedAt">,
): Promise<void> {
  try {
    const storage = await getStorage();
    const payload: CachedCourseBundle = { ...bundle, cachedAt: Date.now() };
    const serialized = JSON.stringify(payload);
    if (serialized.length > MAX_BYTES) return;
    await storage.set(BUNDLE_KEY(courseId), serialized);
    // Mirror to localStorage so readBundleSync works on next cold start.
    safeSet(BUNDLE_KEY(courseId), serialized);
  } catch {
    /* noop */
  }
}

export async function clearBundle(courseId: string | number): Promise<void> {
  try {
    const storage = await getStorage();
    await storage.remove(BUNDLE_KEY(courseId));
    safeRemove(BUNDLE_KEY(courseId));
  } catch { /* noop */ }
}
