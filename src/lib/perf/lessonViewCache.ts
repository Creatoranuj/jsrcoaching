/**
 * Offline-first cache for LessonView's initial data bundle.
 *
 * Strategy:
 *   - Read-through: render cached bundle synchronously on mount, then refresh
 *     in the background. On offline / network failure, keep showing cache.
 *   - Per-course keying so users with multiple enrolled courses don't blow
 *     each other's cache.
 *   - 7-day TTL — long enough for repeat sessions on unreliable mobile data,
 *     short enough that stale chapter/lesson lists don't linger forever.
 *   - Storage: @capacitor/preferences on native (survives app restart),
 *     localStorage on web. Both quota-safe; bundle is small (<50 KB typical).
 *
 * Why not TanStack Query persister?
 *   LessonView uses manual useState/useEffect — converting to RQ would touch
 *   2000+ lines and break the video pipeline. This is a surgical wrapper.
 */
import { safeGet, safeSet, safeRemove } from "@/lib/storage";
import { loadCore } from "@/lib/native/core";
import { loadPreferences } from "@/lib/native/preferences";
// Types intentionally loose — LessonView keeps these shapes internal. We
// just need a stable container shape for the persisted bundle.
export interface CachedChapter { id: string; code?: string | null; title: string; [k: string]: unknown }
export interface CachedLesson { id: string; title: string; [k: string]: unknown }

export interface LessonViewBundle {
  course: unknown;
  chapters: CachedChapter[];
  lessons: CachedLesson[];
  hasPurchased: boolean;
  /** Timestamp when this bundle was written (ms epoch). */
  cachedAt: number;
}

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const BUNDLE_KEY = (courseId: string | number) => `nb_lv_bundle_v1_${courseId}`;
const LAST_LESSON_KEY = (courseId: string | number) => `nb_lv_last_lesson_v1_${courseId}`;

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
          async get(key) {
            return (await Preferences.get({ key })).value;
          },
          async set(key, value) {
            await Preferences.set({ key, value });
          },
          async remove(key) {
            await Preferences.remove({ key });
          },
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

/**
 * Synchronous-best-effort read. Returns null on web if localStorage is blocked,
 * or on native if the bundle hasn't been read yet this session. Most callers
 * should use `readBundle` which is async and authoritative.
 *
 * This sync variant is provided so the initial React render can hydrate from
 * cache without flashing a loading spinner — when localStorage is available
 * (always true in web preview / Capacitor WebView), this returns immediately.
 */
export function readBundleSync(courseId: string | number): LessonViewBundle | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = safeGet(BUNDLE_KEY(courseId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LessonViewBundle;
    if (!parsed || typeof parsed !== "object") return null;
    if (Date.now() - parsed.cachedAt > TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function readBundle(courseId: string | number): Promise<LessonViewBundle | null> {
  try {
    const storage = await getStorage();
    const raw = await storage.get(BUNDLE_KEY(courseId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LessonViewBundle;
    if (!parsed || typeof parsed !== "object") return null;
    if (Date.now() - parsed.cachedAt > TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeBundle(
  courseId: string | number,
  bundle: Omit<LessonViewBundle, "cachedAt">,
): Promise<void> {
  try {
    const storage = await getStorage();
    const payload: LessonViewBundle = { ...bundle, cachedAt: Date.now() };
    const serialized = JSON.stringify(payload);
    // Hard cap at ~200 KB per course bundle — typical course is <30 KB.
    if (serialized.length > 200 * 1024) return;
    await storage.set(BUNDLE_KEY(courseId), serialized);
    // Mirror to localStorage on web (already the storage backend there).
    // On native, also mirror so readBundleSync works on the next cold start.
    safeSet(BUNDLE_KEY(courseId), serialized);
  } catch {
    /* noop */
  }
}

export async function rememberLastLesson(
  courseId: string | number,
  lessonId: string,
): Promise<void> {
  try {
    const storage = await getStorage();
    await storage.set(LAST_LESSON_KEY(courseId), lessonId);
  } catch {
    /* noop */
  }
}

export async function recallLastLesson(
  courseId: string | number,
): Promise<string | null> {
  try {
    const storage = await getStorage();
    return await storage.get(LAST_LESSON_KEY(courseId));
  } catch {
    return null;
  }
}

/** Returns true when the device is offline. Used to skip background refresh. */
export function isOffline(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.onLine === false;
}
