/**
 * Persistent storage helpers.
 *
 * The user explicitly chose "truly unlimited" — no hard cap. We:
 *  1. Ask the browser/WebView to mark our origin's storage as **persistent**
 *     so the OS won't silently evict it under memory pressure.
 *     (Risk accepted: if the device fills up, OS may still evict — surfaced
 *      via the manual cleanup UI in StorageManagerSheet.)
 *  2. Expose `getStorageEstimate()` so the UI can show real usage/quota
 *     instead of a fake fixed cap.
 *
 * Safe on every platform: feature-detects + swallows errors.
 */

const FLAG_KEY = "nb:persisted-storage:requested";

export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
    const already = await navigator.storage.persisted?.().catch(() => false);
    if (already) return true;
    // Avoid spamming the request — most engines only grant on user gesture.
    // We still try once per session; flag is purely diagnostic.
    try { sessionStorage.setItem(FLAG_KEY, "1"); } catch { /* ignore */ }
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export interface StorageEstimate {
  usage: number;
  quota: number;
  persisted: boolean;
  supported: boolean;
}

export async function getStorageEstimate(): Promise<StorageEstimate> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
      return { usage: 0, quota: 0, persisted: false, supported: false };
    }
    const [est, persisted] = await Promise.all([
      navigator.storage.estimate(),
      navigator.storage.persisted?.().catch(() => false) ?? Promise.resolve(false),
    ]);
    return {
      usage: est.usage ?? 0,
      quota: est.quota ?? 0,
      persisted: !!persisted,
      supported: true,
    };
  } catch {
    return { usage: 0, quota: 0, persisted: false, supported: false };
  }
}