/**
 * Reading progress + Obsidian-style notes for library / attachment PDFs.
 *
 * STORAGE TIERS (see also lib/libraryDB.ts, lib/personalLibraryDB.ts):
 *   1. MEMORY      — pdf.js renders only the visible page(s) (FastPdfReader).
 *   2. INDEXEDDB   — metadata, last-read page, and notes live here (this file,
 *                    DB "nb_reader"). Always available, web + native.
 *   3. FILESYSTEM  — the actual PDF bytes (Directory.Data) AND a human-readable
 *                    mirror of each note at MyLibrary/{itemId}/note.md so notes
 *                    are portable / Obsidian-compatible on native devices.
 *
 * The IndexedDB copy is the source of truth (fast, sync-free); the .md file is a
 * best-effort mirror written on save.
 */

const DB_NAME = "nb_reader";
const DB_VERSION = 1;
const NOTES = "notes";
const PROGRESS = "progress";

interface NoteRow {
  id: string; // item / attachment id
  md: string;
  updated_at: string;
}
interface ProgressRow {
  id: string;
  page: number;
  updated_at: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(NOTES)) db.createObjectStore(NOTES, { keyPath: "id" });
      if (!db.objectStoreNames.contains(PROGRESS)) db.createObjectStore(PROGRESS, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = run(t.objectStore(store));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      })
  );
}

// ---------- Reading progress ----------

export async function getReadingPage(id: string): Promise<number> {
  try {
    const row = await tx<ProgressRow | undefined>(PROGRESS, "readonly", (s) => s.get(id));
    return row?.page ?? 1;
  } catch {
    return 1;
  }
}

export async function setReadingPage(id: string, page: number): Promise<void> {
  try {
    await tx(PROGRESS, "readwrite", (s) =>
      s.put({ id, page, updated_at: new Date().toISOString() } as ProgressRow)
    );
  } catch {
    /* ignore */
  }
}

// ---------- Notes ----------

export async function getNote(id: string): Promise<string> {
  try {
    const row = await tx<NoteRow | undefined>(NOTES, "readonly", (s) => s.get(id));
    return row?.md ?? "";
  } catch {
    return "";
  }
}

async function mirrorNoteToFilesystem(id: string, md: string) {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;
    const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
    await Filesystem.writeFile({
      path: `MyLibrary/${id}/note.md`,
      data: md,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
      recursive: true,
    });
  } catch {
    /* mirror is best-effort; IndexedDB copy is source of truth */
  }
}

export async function saveNote(id: string, md: string): Promise<void> {
  await tx(NOTES, "readwrite", (s) =>
    s.put({ id, md, updated_at: new Date().toISOString() } as NoteRow)
  );
  void mirrorNoteToFilesystem(id, md);
}

/** Parse [[wikilinks]] out of note markdown. */
export function extractWikiLinks(md: string): string[] {
  const out: string[] = [];
  const re = /\[\[([^\]]+)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md))) {
    const name = m[1].split("|")[0].trim();
    if (name) out.push(name);
  }
  return Array.from(new Set(out));
}
