/**
 * IndexedDB wrapper for in-app Downloads section.
 * DB: nb_app  |  Store: downloads
 *
 * v2: added optional local_path / size_bytes / mime so the Downloads page
 * can render offline from files saved via @capacitor/filesystem.
 * v3: added a Blob store for web downloads so browser/Firefox uploads survive reloads.
 */

const DB_NAME = "nb_app";
const DB_VERSION = 3;
const STORE = "downloads";
const FILES = "download_files";

export interface DownloadRecord {
  id?: number;
  title: string;
  filename: string;
  url: string;
  downloadedAt: string; // ISO 8601
  fileType: "PDF" | "NOTES" | "DPP" | string;
  /** Capacitor Filesystem relative path under Directory.Data. Present on native saves. */
  local_path?: string;
  /** Saved byte size when known. */
  size_bytes?: number;
  /** Original content-type when known. */
  mime?: string;
}

// Cache the IDBDatabase connection at module level. Without this, every
// addDownload / getDownloads / downloadFileDB.* call opened a brand-new
// connection that was never explicitly close()d — on low-RAM Android
// devices these dangling handles piled up and the next operation after a
// WebView eviction threw "InvalidStateError: connection is closing" as
// an unhandled rejection, tripping crashShield's reload threshold.
let _dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("downloadedAt", "downloadedAt", { unique: false });
      }
      // v2: no destructive migration — new fields are optional on existing rows.
      if (!db.objectStoreNames.contains(FILES)) {
        db.createObjectStore(FILES, { keyPath: "id" });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // Drop the cached handle if another tab triggers an upgrade or the
      // connection is closed, so the next call re-opens cleanly.
      db.onversionchange = () => { try { db.close(); } catch { /* noop */ } _dbPromise = null; };
      db.onclose = () => { _dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => { _dbPromise = null; reject(req.error); };
    req.onblocked = () => { _dbPromise = null; reject(new Error("IndexedDB upgrade blocked")); };
  });
  return _dbPromise;
}

export async function addDownload(
  item: Omit<DownloadRecord, "id">
): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).add(item);
    req.onsuccess = () => resolve(req.result as number);
    req.onerror = () => reject(req.error);
  });
}

export async function getDownloads(): Promise<DownloadRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () =>
      resolve(
        ((req.result as DownloadRecord[]) || []).sort(
          (a, b) =>
            new Date(b.downloadedAt).getTime() -
            new Date(a.downloadedAt).getTime()
        )
      );
    req.onerror = () => reject(req.error);
  });
}

export async function getDownload(id: number): Promise<DownloadRecord | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result as DownloadRecord | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteDownload(id: number): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function updateDownload(item: DownloadRecord & { id: number }): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).put(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export const downloadFileDB = {
  put: async (id: number, blob: Blob): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(FILES, "readwrite");
      const req = tx.objectStore(FILES).put({ id, blob });
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || req.error);
      tx.onabort = () => reject(tx.error || req.error || new Error("IndexedDB transaction aborted"));
    });
  },
  get: async (id: number): Promise<{ id: number; blob: Blob } | undefined> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(FILES, "readonly");
      const req = tx.objectStore(FILES).get(id);
      req.onsuccess = () => resolve(req.result as { id: number; blob: Blob } | undefined);
      req.onerror = () => reject(req.error);
    });
  },
  delete: async (id: number): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(FILES, "readwrite");
      const req = tx.objectStore(FILES).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },
};
