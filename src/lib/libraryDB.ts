/**
 * IndexedDB store for the Skill-Based Offline PDF Library.
 * Tracks which PDFs the user has downloaded to native Filesystem storage.
 * DB: nb_library  |  Store: pdfs (keyPath: pdf_id)
 */

const DB_NAME = "nb_library";
const DB_VERSION = 1;
const STORE = "pdfs";

export type DownloadState = "complete" | "partial" | "interrupted";

export interface LibraryRecord {
  pdf_id: string;
  title: string;
  subject: string | null;
  skill_level: "beginner" | "intermediate" | "advanced";
  version: number;
  local_path: string; // relative path inside Filesystem.Directory.Data
  size_bytes: number;
  downloaded_at: string; // ISO
  last_opened_at: string | null;
  state: DownloadState;
}

// Cache the IDBDatabase connection at module level — see indexedDB.ts for
// rationale. Without caching, every libraryDB.put/get/delete/all opened a
// fresh connection that leaked on low-RAM Android WebViews.
let _dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: "pdf_id" });
        s.createIndex("skill_level", "skill_level", { unique: false });
        s.createIndex("state", "state", { unique: false });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { try { db.close(); } catch { /* noop */ } _dbPromise = null; };
      db.onclose = () => { _dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => { _dbPromise = null; reject(req.error); };
    req.onblocked = () => { _dbPromise = null; reject(new Error("IndexedDB upgrade blocked")); };
  });
  return _dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      })
  );
}

export const libraryDB = {
  put: (rec: LibraryRecord) => tx("readwrite", (s) => s.put(rec)),
  get: (pdf_id: string) => tx<LibraryRecord | undefined>("readonly", (s) => s.get(pdf_id)),
  delete: (pdf_id: string) => tx("readwrite", (s) => s.delete(pdf_id)),
  all: () =>
    tx<LibraryRecord[]>("readonly", (s) => s.getAll() as IDBRequest<LibraryRecord[]>),
};