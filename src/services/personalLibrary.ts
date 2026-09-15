/**
 * Personal Offline Library service.
 *
 * Stores user-imported PDFs under Filesystem.Directory.Data/personal_library/
 * and indexes them via personalLibraryDB. All file IO is queued and pauses
 * while a video/PDF lesson player is mounted (playerBusy), so the library
 * never causes glitches in the main learning surfaces.
 */
import {
  folderDB,
  itemDB,
  fileDB,
  type PersonalFolder,
  type PersonalItem,
} from "../lib/personalLibraryDB";
import { canAdd } from "../lib/personalLibraryQuota";
import { waitForPlayerIdle } from "../lib/playerBusy";
import { fetchDocumentBlob } from "@/lib/fetchDocumentBlob";
import { downloadFileDB } from "../lib/indexedDB";
import { cleanNotionUrl, isNotion } from "../lib/pdfViewerUrl";
import { reportError } from "../lib/sentry";

const ROOT = "personal_library";
const webDownloadId = (url: string) => url.match(/^web-indexeddb:(\d+)$/i)?.[1] ?? null;
const personalLibraryId = (url: string) => url.match(/^nb-personal-library:([^?#]+)$/i)?.[1] ?? null;

/**
 * Broadcast that the personal library changed so every mounted hook
 * (usePersonalLibrary, useFolderItems) refreshes instantly instead of
 * requiring a pull-to-refresh. Safe on SSR — guarded.
 */
export function emitLibraryRefresh() {
  try { window.dispatchEvent(new Event("personalLibrary:refresh")); } catch { /* noop */ }
}

function uuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function getFS() {
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return null;
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  return { Filesystem, Directory, Capacitor };
}

async function ensureFolderDir(folderId: string) {
  const fs = await getFS();
  if (!fs) return;
  // Both mkdir calls use recursive:true so they no-op if the directory
  // already exists. Do NOT swallow errors here — a failed mkdir surfaces
  // as OS-PLUG-FILE-0010 later on writeFile/copy, which is much harder
  // to diagnose than a clear failure at creation time.
  await fs.Filesystem.mkdir({
    path: ROOT,
    directory: fs.Directory.Data,
    recursive: true,
  }).catch(() => {});
  await fs.Filesystem.mkdir({
    path: `${ROOT}/${folderId}`,
    directory: fs.Directory.Data,
    recursive: true,
  }).catch(() => {});
}

/** Hard per-file ceiling. Above this we refuse the import up front rather
 *  than letting the WebView OOM mid-write. Adaptive (Hole G), with a
 *  100 MB floor so users on low-RAM devices can still import the
 *  typical-sized chapter/book PDFs they actually use:
 *    ≤2 GB RAM → 100 MB
 *    >2 GB RAM → 200 MB
 *  Computed once at module load so the limit is stable for the session. */
function pickMaxFileBytes(): number {
  const dm = typeof navigator !== "undefined"
    ? (navigator as { deviceMemory?: number }).deviceMemory
    : undefined;
  if (typeof dm === "number" && dm > 0 && dm <= 2) return 100 * 1024 * 1024;
  return 200 * 1024 * 1024;
}
const MAX_FILE_BYTES = pickMaxFileBytes();

/** Per-file import limit for this session (device-RAM aware). */
export function getMaxFileBytes(): number {
  return MAX_FILE_BYTES;
}

/** Hole H — bridge timeout. A wedged native Filesystem.writeFile/appendFile
 *  must never stall the write queue forever. 30 s per chunk is generous
 *  (a 256 KB chunk normally completes in <50 ms) but bounded. One retry on
 *  timeout, then surface a real error so the queue drains. */
const BRIDGE_CHUNK_TIMEOUT_MS = 30_000;
function withTimeout<T>(p: Promise<T>, ms: number, tag: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${tag} timed out after ${ms}ms`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}
async function bridgeWithRetry<T>(fn: () => Promise<T>, tag: string): Promise<T> {
  try {
    return await withTimeout(fn(), BRIDGE_CHUNK_TIMEOUT_MS, tag);
  } catch (err) {
    if (!/timed out/.test((err as Error)?.message || "")) throw err;
    console.warn(`[personalLibrary] ${tag} timed out — retrying once`);
    return await withTimeout(fn(), BRIDGE_CHUNK_TIMEOUT_MS, tag);
  }
}

const MIN_BROWSER_HEADROOM_BYTES = 32 * 1024 * 1024;

function isQuotaError(err: unknown): boolean {
  const name = (err as { name?: string })?.name || "";
  const msg = (err as Error)?.message || String(err || "");
  return /Quota|NS_ERROR_DOM_QUOTA|storage.*full|disk.*full/i.test(`${name} ${msg}`);
}

async function clearRuntimeCaches(): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key).catch(() => false)));
  } catch { /* cache cleanup is best-effort */ }
}

async function ensureBrowserStorageHeadroom(nextBytes: number): Promise<void> {
  if (typeof navigator === "undefined" || !("storage" in navigator)) return;
  try {
    const estimate = await navigator.storage.estimate?.();
    const quota = estimate?.quota ?? 0;
    const usage = estimate?.usage ?? 0;
    if (!quota) return;
    const needed = nextBytes + MIN_BROWSER_HEADROOM_BYTES;
    if (quota - usage >= needed) return;
    await clearRuntimeCaches();
    const after = await navigator.storage.estimate?.();
    if (after?.quota && after.quota - (after.usage ?? 0) < needed) {
      throw new Error("Device storage is almost full. Delete old downloads/cache and try again.");
    }
  } catch (err) {
    if ((err as Error)?.message?.includes("Device storage")) throw err;
  }
}

/** Yield to the browser between chunks so paint/touch can run.
 *  rAF on visible tabs (~16ms tick), microtask fallback when hidden. */
function yieldToUi(): Promise<void> {
  if (typeof document !== "undefined" && document.hidden) {
    return new Promise((r) => setTimeout(r, 0));
  }
  if (typeof requestAnimationFrame === "function") {
    return new Promise((r) => requestAnimationFrame(() => r()));
  }
  return new Promise((r) => setTimeout(r, 0));
}

/** Encode a small chunk to base64 via FileReader (offloaded to the browser's
 *  native data: URL encoder — keeps the JS heap flat compared to btoa on a
 *  growing string). Falls back to inline btoa if FileReader is unavailable. */
function chunkToBase64(slice: Blob): Promise<string> {
  if (typeof FileReader === "function") {
    return new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => {
        const result = String(fr.result || "");
        const idx = result.indexOf(",");
        resolve(idx >= 0 ? result.slice(idx + 1) : result);
      };
      fr.onerror = () => reject(fr.error || new Error("read failed"));
      fr.readAsDataURL(slice);
    });
  }
  return slice.arrayBuffer().then((buf) => {
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let j = 0; j < bytes.length; j++) bin += String.fromCharCode(bytes[j]);
    return btoa(bin);
  });
}

/** Web-only sentinel scheme for `local_path`. Readers gate on this prefix and
 *  pull the actual bytes from IndexedDB via the item id — no ambiguity with
 *  native Filesystem-relative paths. */
const WEB_LOCAL_PATH_SCHEME = "web-indexeddb://";
export const webLocalPath = (id: string) => `${WEB_LOCAL_PATH_SCHEME}${id}`;
export const isWebLocalPath = (p: string) => p.startsWith(WEB_LOCAL_PATH_SCHEME);

/** Adaptive chunk size — bigger on capable devices to slash bridge round
 *  trips. A 100 MB import goes from ~400 chunks (256 KB) to ~100 chunks
 *  (1 MB) on a modern device, cutting native-JS hop overhead by 4×.
 *    ≤2 GB RAM  → 128 KB (low-end safety)
 *    ≤4 GB RAM  → 512 KB
 *    >4 GB RAM  → 1 MB */
function pickChunkSize(): number {
  const dm = (navigator as { deviceMemory?: number }).deviceMemory;
  if (typeof dm === "number" && dm > 0 && dm <= 2) return 128 * 1024;
  if (typeof dm === "number" && dm > 0 && dm <= 4) return 512 * 1024;
  return 1024 * 1024;
}

/** Stream a Blob to disk in adaptive chunks WITHOUT ever holding the full file
 *  in JS memory. Returns the relative path inside Filesystem.Directory.Data,
 *  or a `web-indexeddb://` sentinel on web (the real bytes live in IndexedDB).
 *  Pass `webId` on web to embed it in the returned sentinel path. */
async function streamBlobToFolder(
  folder_id: string,
  blob: Blob,
  ext: string,
  webId?: string
): Promise<string> {
  const fs = await getFS();
  if (!fs) {
    // Hole B fix: explicit sentinel scheme instead of a fake fs path that
    // pointed nowhere and tripped up offline-mirror / export code paths.
    return webId ? webLocalPath(webId) : `${ROOT}/${folder_id}/${uuid()}.${ext}`;
  }
  await ensureFolderDir(folder_id);
  const path = `${ROOT}/${folder_id}/${uuid()}.${ext}`;
  const CHUNK = pickChunkSize();
  // PERF: yield every N chunks instead of every chunk. rAF costs ~16ms per
  // call; yielding 400× on a 100 MB file added 6+ seconds of pure waiting.
  // Every 8 chunks keeps input/paint responsive (≤128ms gap) while cutting
  // the yield overhead by 8×. Player-busy check still runs every chunk so
  // playback NEVER glitches.
  const YIELD_EVERY = 8;
  let chunkIdx = 0;
  let first = true;
  for (let off = 0; off < blob.size; off += CHUNK) {
    const slice = blob.slice(off, Math.min(off + CHUNK, blob.size));
    const b64 = await chunkToBase64(slice);
    if (first) {
      try {
        await bridgeWithRetry(
          () => fs.Filesystem.writeFile({ path, directory: fs.Directory.Data, data: b64, recursive: true }),
          "Filesystem.writeFile",
        );
      } catch (err) {
        // OS-PLUG-FILE-0010 = "Directory does not exist". Self-heal by
        // re-creating the parent folder (older ensureFolderDir swallowed
        // errors) and retrying once with recursive:true.
        const msg = (err as Error)?.message || String(err);
        if (/0010|Directory.*(does not exist|not exist)/i.test(msg)) {
          await fs.Filesystem.mkdir({ path: ROOT, directory: fs.Directory.Data, recursive: true }).catch(() => {});
          await fs.Filesystem.mkdir({ path: `${ROOT}/${folder_id}`, directory: fs.Directory.Data, recursive: true }).catch(() => {});
          await bridgeWithRetry(
            () => fs.Filesystem.writeFile({ path, directory: fs.Directory.Data, data: b64, recursive: true }),
            "Filesystem.writeFile(retry)",
          );
        } else {
          throw err;
        }
      }
      first = false;
    } else {
      await bridgeWithRetry(
        () => fs.Filesystem.appendFile({ path, directory: fs.Directory.Data, data: b64 }),
        "Filesystem.appendFile",
      );
    }
    chunkIdx++;
    // Player priority: ALWAYS pause writes if a lesson player is mid-playback.
    await waitForPlayerIdle();
    // UI breath: only every Nth chunk — keeps the import 5-8× faster while
    // input still feels responsive on low-end devices.
    if (chunkIdx % YIELD_EVERY === 0) {
      await yieldToUi();
    }
  }
  return path;
}



/** Single-slot write queue (MAX=1) that pauses while the player is busy. */
const writeQueue: Array<() => Promise<unknown>> = [];
let writing = false;

/** Bytes reserved by jobs that are queued or in-flight but not yet committed.
 *  canAdd() considers (used + pendingBytes + nextSize) to close the race
 *  where two rapid imports each saw "enough space" and together blew the cap. */
let pendingBytes = 0;
const reserve = (n: number) => { pendingBytes += n; };
const release = (n: number) => { pendingBytes = Math.max(0, pendingBytes - n); };
export function getPendingBytes(): number { return pendingBytes; }

async function pumpWrite() {
  if (writing) return;
  writing = true;
  try {
    while (writeQueue.length) {
      await waitForPlayerIdle();
      const job = writeQueue.shift();
      if (!job) break;
      try {
        await job();
      } catch (err) {
        reportError(err, { surface: "personalLibrary.writeQueue" });
      }
    }
  } finally {
    writing = false;
  }
}
function enqueueWrite<T>(job: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    writeQueue.push(() => job().then(resolve, reject));
    pumpWrite();
  });
}

/**
 * Per-key single-flight guard for user-clickable mutations. Auto-clicker or
 * frantic double-taps used to fire N concurrent reorder/delete/rename calls
 * that raced on itemDB.put and threw ConstraintError → unhandled rejections
 * → crashShield emergency reload (looked like a crash to the user).
 *
 * With this guard, rapid clicks on the same target COALESCE into the single
 * in-flight promise; distinct targets still run in parallel.
 */
const inflight = new Map<string, Promise<unknown>>();
function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const p = (async () => {
    try { return await fn(); }
    finally { inflight.delete(key); }
  })();
  inflight.set(key, p);
  return p;
}

/** Device-space check that accounts for in-flight writes. Use inside enqueueWrite. */
async function canAddAware(size: number): Promise<{ ok: boolean; used: number; free: number | null }> {
  const { used, free } = await canAdd(size + pendingBytes);
  return { ok: free === null ? true : free >= size + pendingBytes, used, free };
}


// ----- Folders -----

export async function listFolders(parent_id: string | null = null): Promise<PersonalFolder[]> {
  const children = await folderDB.children(parent_id);
  return children.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
}

export async function listAllFolders(): Promise<PersonalFolder[]> {
  const all = await folderDB.all();
  return all.sort((a, b) => a.name.localeCompare(b.name));
}

export async function createFolder(
  name: string,
  parent_id: string | null = null,
  color?: string | null
): Promise<PersonalFolder> {
  const siblings = await folderDB.children(parent_id);
  const rec: PersonalFolder = {
    id: uuid(),
    name: name.trim() || "Untitled",
    color: color ?? null,
    icon: null,
    position: siblings.length,
    parent_id: parent_id ?? null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await folderDB.put(rec);
  await ensureFolderDir(rec.id);
  return rec;
}

export async function getOrCreateFolder(name: string, parent_id: string | null = null): Promise<PersonalFolder> {
  const existing = (await folderDB.children(parent_id)).find(
    (f) => f.name.trim().toLowerCase() === name.trim().toLowerCase()
  );
  if (existing) return existing;
  return createFolder(name, parent_id);
}

export async function moveFolder(id: string, new_parent_id: string | null) {
  return singleFlight(`moveFolder:${id}`, async () => {
    const rec = await folderDB.get(id);
    if (!rec || id === new_parent_id) return;
    // Prevent cycle: walk up the new parent chain — must not encounter `id`.
    let cursor: string | null = new_parent_id;
    while (cursor) {
      if (cursor === id) return; // would create a loop, refuse
      const parent: PersonalFolder | undefined = await folderDB.get(cursor);
      cursor = parent?.parent_id ?? null;
    }
    rec.parent_id = new_parent_id ?? null;
    rec.updated_at = new Date().toISOString();
    await folderDB.put(rec);
  });
}

export async function moveItem(id: string, new_folder_id: string) {
  return singleFlight(`moveItem:${id}`, async () => {
    const rec = await itemDB.get(id);
    if (!rec) return;
    rec.folder_id = new_folder_id;
    rec.sort_index = await nextItemSortIndex(new_folder_id);
    await itemDB.put(rec);
  });
}

export async function renameItem(id: string, title: string) {
  return singleFlight(`renameItem:${id}:${title}`, async () => {
    const rec = await itemDB.get(id);
    if (!rec) return;
    rec.title = title.trim() || rec.title;
    await itemDB.put(rec);
  });
}

/** Replace the binary backing an item, keeping its id / folder / title. */
export async function replaceItem(id: string, file: File): Promise<void> {
  const rec = await itemDB.get(id);
  if (!rec) return;
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(
      `File too large (${Math.round(file.size / 1024 / 1024)} MB). Maximum is ${Math.round(
        MAX_FILE_BYTES / 1024 / 1024
      )} MB per file.`
    );
  }
  return enqueueWrite(async () => {
    const fs = await getFS();
    // delete old file
    if (fs) {
      try {
        await fs.Filesystem.deleteFile({ path: rec.local_path, directory: fs.Directory.Data });
      } catch { /* ignore */ }
    } else {
      const old = sessionStorage.getItem(`nb_pl_blob_${id}`);
      if (old) URL.revokeObjectURL(old);
      try { await fileDB.delete(id); } catch { /* ignore */ }
      webBlobUrlCache.delete(id);
    }
    const ext = extOf(file.name, file.type);
    const path = await streamBlobToFolder(rec.folder_id, file, ext, rec.id);
    rec.local_path = path;
    rec.file_name = file.name;
    rec.mime_type = file.type || rec.mime_type;
    rec.size_bytes = file.size;
    await itemDB.put(rec);
    if (!fs) {
      try {
        await ensureBrowserStorageHeadroom(file.size);
        await fileDB.put(id, file);
      } catch (err) {
        if (isQuotaError(err)) {
          await clearRuntimeCaches();
          try { await fileDB.put(id, file); }
          catch { throw new Error("Browser storage is full. Delete some files/cache and try again."); }
        } else {
          throw err;
        }
      }
    }
  });
}

export async function duplicateItem(id: string, target_folder_id?: string): Promise<void> {
  const rec = await itemDB.get(id);
  if (!rec) return;
  return enqueueWrite(async () => {
    const fs = await getFS();
    const folder_id = target_folder_id || rec.folder_id;
    let path = rec.local_path;
    if (fs) {
      const ext = extOf(rec.file_name, rec.mime_type);
      const newPath = `${ROOT}/${folder_id}/${uuid()}.${ext}`;
      await ensureFolderDir(folder_id);
      await fs.Filesystem.copy({
        from: rec.local_path,
        to: newPath,
        directory: fs.Directory.Data,
      });
      path = newPath;
    }
    const newId = uuid();
    const copy: PersonalItem = {
      ...rec,
      id: newId,
      folder_id,
      title: `${rec.title} (copy)`,
      local_path: path,
      added_at: new Date().toISOString(),
      last_opened_at: null,
      sort_index: await nextItemSortIndex(folder_id),
    };
    await itemDB.put(copy);
    if (!fs) {
      const row = await fileDB.get(id);
      if (row) await fileDB.put(newId, row.blob);
    }
  });
}

async function nextItemSortIndex(folder_id: string): Promise<number> {
  const items = await itemDB.byFolder(folder_id);
  const max = items.reduce((m, it) => Math.max(m, it.sort_index ?? 0), -1);
  return max + 1;
}

/** Swap sort_index with the neighbour in the given direction. */
export async function reorderItem(id: string, direction: "up" | "down") {
  // Coalesce rapid-click / auto-clicker on the same row into one in-flight
  // swap. Direction is part of the key so up-then-down still runs sequentially
  // via awaits at the call site, but two concurrent "up" clicks dedupe.
  return singleFlight(`reorderItem:${id}:${direction}`, async () => {
    const rec = await itemDB.get(id);
    if (!rec) return;
    const siblings = (await itemDB.byFolder(rec.folder_id)).sort(
      (a, b) => (a.sort_index ?? 0) - (b.sort_index ?? 0) || a.added_at.localeCompare(b.added_at)
    );
    const idx = siblings.findIndex((s) => s.id === id);
    const swapWith = direction === "up" ? siblings[idx - 1] : siblings[idx + 1];
    if (!swapWith) return;
    const a = rec.sort_index ?? idx;
    const b = swapWith.sort_index ?? siblings.indexOf(swapWith);
    rec.sort_index = b;
    swapWith.sort_index = a;
    await itemDB.put(rec);
    await itemDB.put(swapWith);
  });
}

export async function reorderFolder(id: string, direction: "up" | "down") {
  return singleFlight(`reorderFolder:${id}:${direction}`, async () => {
    const rec = await folderDB.get(id);
    if (!rec) return;
    const siblings = (await folderDB.children(rec.parent_id ?? null)).sort(
      (a, b) => a.position - b.position || a.name.localeCompare(b.name)
    );
    const idx = siblings.findIndex((s) => s.id === id);
    const swapWith = direction === "up" ? siblings[idx - 1] : siblings[idx + 1];
    if (!swapWith) return;
    const a = rec.position;
    const b = swapWith.position;
    rec.position = b;
    swapWith.position = a;
    await folderDB.put(rec);
    await folderDB.put(swapWith);
  });
}

export async function renameFolder(id: string, name: string) {
  return singleFlight(`renameFolder:${id}:${name}`, async () => {
    const rec = await folderDB.get(id);
    if (!rec) return;
    rec.name = name.trim() || rec.name;
    rec.updated_at = new Date().toISOString();
    await folderDB.put(rec);
  });
}

export async function deleteFolder(id: string) {
  return singleFlight(`deleteFolder:${id}`, async () => {
    // Recursively delete child folders first.
    const children = await folderDB.children(id);
    for (const child of children) await deleteFolder(child.id);
    const items = await itemDB.byFolder(id);
    for (const it of items) await deleteItem(it.id);
    const fs = await getFS();
    if (fs) {
      try {
        await fs.Filesystem.rmdir({
          path: `${ROOT}/${id}`,
          directory: fs.Directory.Data,
          recursive: true,
        });
      } catch {
        /* ignore */
      }
    }
    await folderDB.delete(id);
  });
}

// ----- Items -----

export type ItemSort = "manual" | "name" | "newest" | "largest";

export async function listItems(folder_id: string, sort: ItemSort = "manual"): Promise<PersonalItem[]> {
  const items = await itemDB.byFolder(folder_id);
  const sorted = [...items];
  if (sort === "name") sorted.sort((a, b) => a.title.localeCompare(b.title));
  else if (sort === "newest") sorted.sort((a, b) => b.added_at.localeCompare(a.added_at));
  else if (sort === "largest") sorted.sort((a, b) => b.size_bytes - a.size_bytes);
  else sorted.sort((a, b) => (a.sort_index ?? 0) - (b.sort_index ?? 0) || a.added_at.localeCompare(b.added_at));
  return sorted;
}

export async function deleteItem(id: string) {
  return singleFlight(`deleteItem:${id}`, async () => {
    const rec = await itemDB.get(id);
    if (!rec) return;
    const fs = await getFS();
    if (fs) {
      try {
        await fs.Filesystem.deleteFile({
          path: rec.local_path,
          directory: fs.Directory.Data,
        });
      } catch {
        /* ignore */
      }
    } else {
      try { await fileDB.delete(id); } catch { /* ignore */ }
      const cached = webBlobUrlCache.get(id);
      if (cached) { URL.revokeObjectURL(cached); webBlobUrlCache.delete(id); }
      const legacy = sessionStorage.getItem(`nb_pl_blob_${id}`);
      if (legacy) { URL.revokeObjectURL(legacy); sessionStorage.removeItem(`nb_pl_blob_${id}`); }
    }
    await itemDB.delete(id);
  });
}

/** In-memory blob URL cache (web only). Keyed by item id. */
const webBlobUrlCache = new Map<string, string>();

/** Resolve a webview-usable URL for a stored item. */
export async function getItemUri(id: string): Promise<string | null> {
  const rec = await itemDB.get(id);
  if (!rec) return null;
  // Link items (and legacy URL-backed rows) resolve to their remote URL on
  // every platform — they have no local bytes to look up.
  if (/^https?:\/\//i.test(rec.local_path)) return rec.local_path;
  const fs = await getFS();
  if (!fs) {

    // Web: hand the stable item id to the PDF source hook. It loads the Blob
    // bytes directly from IndexedDB, avoiding fragile blob: URL re-fetches in
    // mobile Firefox / Android WebView.
    if (/pdf|markdown|text/i.test(rec.mime_type) || /\.(pdf|md|markdown|txt)$/i.test(rec.file_name)) {
      const row = await fileDB.get(id).catch(() => undefined);
      if (row?.blob) return `nb-personal-library:${id}`;
      const cached = webBlobUrlCache.get(id) || sessionStorage.getItem(`nb_pl_blob_${id}`);
      if (cached) {
        const ok = await fetch(cached, { method: "GET" }).then((r) => r.ok).catch(() => false);
        if (ok) return cached;
        try { URL.revokeObjectURL(cached); } catch { /* ignore */ }
        webBlobUrlCache.delete(id);
        sessionStorage.removeItem(`nb_pl_blob_${id}`);
      }
      return null;
    }
    const cached = webBlobUrlCache.get(id);
    if (cached) {
      try {
        // Quick liveness probe — HEAD on a blob: URL fails if revoked.
        const ok = await fetch(cached, { method: "GET" }).then((r) => r.ok).catch(() => false);
        if (ok) return cached;
      } catch { /* fall through and rebuild */ }
      URL.revokeObjectURL(cached);
      webBlobUrlCache.delete(id);
    }
    const row = await fileDB.get(id);
    if (!row) {
      // No persisted blob in IndexedDB → file is gone. Returning null
      // surfaces a proper "couldn't open" toast instead of handing a dead
      // sessionStorage URL to the reader (which produced "Could not load").
      return null;
    }
    const url = URL.createObjectURL(row.blob);
    webBlobUrlCache.set(id, url);
    return url;
  }
  try {
    const { uri } = await fs.Filesystem.getUri({
      path: rec.local_path,
      directory: fs.Directory.Data,
    });
    return fs.Capacitor.convertFileSrc(uri);
  } catch {
    return null;
  }
}


function extOf(name: string, mime: string) {
  const m = name.match(/\.([a-z0-9]+)$/i);
  if (m) return m[1].toLowerCase();
  if (mime.includes("pdf")) return "pdf";
  if (mime.includes("markdown") || mime.includes("text")) return "md";
  return "bin";
}

function mimeForExt(ext: string, fallback = "application/octet-stream") {
  if (ext === "pdf") return "application/pdf";
  if (ext === "md" || ext === "markdown") return "text/markdown";
  if (ext === "txt") return "text/plain";
  return fallback;
}

/** Pre-flight WebView heap pressure check. On 1–2 GB Android the V8 heap
 *  limit is ~256–512 MB. If the heap is already >75 % full when an import
 *  starts, the next big File reference + base64 chunks WILL OOM-kill the
 *  WebView. Refuse early with a clear message instead of crashing. */
function assertHeapHeadroom(fileBytes: number) {
  const mem = (performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
  if (!mem || !mem.jsHeapSizeLimit) return;
  const limit = mem.jsHeapSizeLimit;
  const used = mem.usedJSHeapSize;
  // Need at least the file size + 32 MB working buffer free.
  const headroomNeeded = Math.min(fileBytes, 96 * 1024 * 1024) + 32 * 1024 * 1024;
  if (limit - used < headroomNeeded) {
    throw new Error(
      "Phone is low on memory right now. Close other apps/tabs and try again."
    );
  }
}

/** Add a File (from <input type=file>) into a folder. */
export async function addFileToFolder(
  folder_id: string,
  file: File,
  source: "device" | "lesson" = "device"
): Promise<PersonalItem> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(
      `File too large (${Math.round(file.size / 1024 / 1024)} MB). Maximum is ${Math.round(
        MAX_FILE_BYTES / 1024 / 1024
      )} MB per file.`
    );
  }
  assertHeapHeadroom(file.size);
  // Reserve space immediately so a parallel canAdd() sees this byte budget
  // as already-spoken-for. Released in the finally block below regardless
  // of whether the write succeeds or rolls back.
  reserve(file.size);
  return enqueueWrite(async () => {
    try {
      // Re-check device space inside the queue with the pending-aware helper.
      const quota = await canAddAware(0); // size already reserved
      if (!quota.ok) {
        throw new Error(
          `Device is out of storage. Free up space on your phone and try again${
            quota.free !== null ? ` (about ${Math.round(quota.free / 1024 / 1024)} MB free)` : ""
          }.`
        );
      }

      const ext = extOf(file.name, file.type);
      // Pre-generate the id so we can embed it in the web sentinel path.
      const newId = uuid();
      // Stream — never load the full file into memory.
      const path = await streamBlobToFolder(folder_id, file, ext, newId);
      const rec: PersonalItem = {
        id: newId,
        folder_id,
        title: file.name.replace(/\.[^.]+$/, ""),
        file_name: file.name,
        mime_type: file.type || "application/pdf",
        size_bytes: file.size,
        local_path: path,
        source,
        added_at: new Date().toISOString(),
        last_opened_at: null,
        sort_index: await nextItemSortIndex(folder_id),
      };
      await itemDB.put(rec);

      // Web fallback: persist the Blob in IndexedDB so reloads survive.
      // Guarded — if IndexedDB quota is exceeded we roll back the index entry
      // instead of letting an uncaught QuotaExceededError crash the app.
      const fs = await getFS();
      if (!fs) {
        try {
          await ensureBrowserStorageHeadroom(file.size);
          await fileDB.put(rec.id, file);
        } catch (err) {
          if (isQuotaError(err)) {
            await clearRuntimeCaches();
            try {
              await fileDB.put(rec.id, file);
            } catch {
              try { await itemDB.delete(rec.id); } catch { /* ignore */ }
              throw new Error("Browser storage is full. Delete some files/cache and try again.");
            }
          } else {
            try { await itemDB.delete(rec.id); } catch { /* ignore */ }
            throw err;
          }
        }
      }
      return rec;
    } finally {
      release(file.size);
    }
  });
}

/**
 * Batch import many files at once. Dedups by (name + size) against existing
 * items in the target folder. Imports sequentially through the write queue so
 * we never hold two large base64 streams in memory at the same time.
 * Returns per-file outcomes so the caller can render a useful summary toast.
 */
export type BatchImportResult = {
  added: PersonalItem[];
  skipped: { name: string; reason: "duplicate" | "too-large" | "quota" }[];
  failed: { name: string; error: string }[];
};

export async function addFilesToFolder(
  folder_id: string,
  files: File[] | FileList,
  source: "device" | "lesson" = "device",
  onProgress?: (done: number, total: number, currentName: string) => void
): Promise<BatchImportResult> {
  const list = Array.from(files);
  const result: BatchImportResult = { added: [], skipped: [], failed: [] };
  if (list.length === 0) return result;

  // Build a dedup key set from what's already in the folder.
  const existing = await itemDB.byFolder(folder_id);
  const seen = new Set(existing.map((it) => `${it.file_name}::${it.size_bytes}`));

  let done = 0;
  for (const file of list) {
    onProgress?.(done, list.length, file.name);
    const key = `${file.name}::${file.size}`;
    if (seen.has(key)) {
      result.skipped.push({ name: file.name, reason: "duplicate" });
      done++;
      continue;
    }
    if (file.size > MAX_FILE_BYTES) {
      result.skipped.push({ name: file.name, reason: "too-large" });
      done++;
      continue;
    }
    try {
      const rec = await addFileToFolder(folder_id, file, source);
      result.added.push(rec);
      seen.add(key);
    } catch (err) {
      const msg = (err as Error)?.message || String(err);
      if (/out of storage|Library is full/i.test(msg)) {
        result.skipped.push({ name: file.name, reason: "quota" });
      } else {
        result.failed.push({ name: file.name, error: msg });
      }
    }
    done++;
    onProgress?.(done, list.length, file.name);
    // Breather between files so the UI thread can paint progress AND so V8
    // gets a window to GC the just-released File reference before the next
    // 100 MB blob lands. setTimeout(120) is long enough for a minor GC pass
    // on low-RAM Android without feeling sluggish.
    await new Promise((r) => setTimeout(r, 120));
    await yieldToUi();
  }
  return result;
}

/**
 * Add a *link* item — a normal library row whose bytes live remotely.
 *
 * Costs no storage and no memory: only the URL is written. Because it is a
 * regular PersonalItem it inherits folders, move, reorder, rename, sort,
 * multi-select and search from the rest of My Library.
 */
export async function addLinkToFolder(
  folder_id: string,
  link: { url: string; title: string; source: string; kind: string },
): Promise<PersonalItem> {
  return enqueueWrite(async () => {
    const url = isNotion(link.url) ? cleanNotionUrl(link.url) : link.url;
    const existing = (await itemDB.byFolder(folder_id)).find((it) => it.local_path === url);
    if (existing) return existing;
    const title = (link.title || "Link").replace(/\.[^.]+$/, "");
    const ext = (link.kind || "LINK").toLowerCase();
    const rec: PersonalItem = {
      id: uuid(),
      folder_id,
      title,
      file_name: /^(pdf|docx?|pptx?|xlsx?|csv|md|txt)$/i.test(ext) ? `${title}.${ext}` : `${title}.link`,
      mime_type: "text/uri-list",
      size_bytes: 0,
      local_path: url,
      source: "link",
      added_at: new Date().toISOString(),
      last_opened_at: null,
      sort_index: await nextItemSortIndex(folder_id),
      link_source: link.source,
      link_kind: link.kind,
    };
    await itemDB.put(rec);
    return rec;
  });
}

/** Drop the link markers once an item is backed by real local bytes. */
export async function clearLinkMarkers(id: string) {
  const rec = await itemDB.get(id);
  if (!rec) return;
  delete rec.link_source;
  delete rec.link_kind;
  rec.source = "device";
  await itemDB.put(rec);
}


/** Add by fetching a remote URL (used by "Save to My Library" from a lesson PDF). */
export async function addUrlToFolder(
  folder_id: string,
  url: string,
  title: string,
  filename?: string
): Promise<PersonalItem> {
  return enqueueWrite(async () => {
    if (isNotion(url)) {
      await ensureFolderDir(folder_id);
      const newId = uuid();
      const safeName = filename || `${title || "Notion Page"}.url`;
      const rec: PersonalItem = {
        id: newId,
        folder_id,
        title: (title || safeName).replace(/\.[^.]+$/, ""),
        file_name: /\.url$/i.test(safeName) ? safeName : `${safeName}.url`,
        mime_type: "text/uri-list",
        size_bytes: 0,
        local_path: cleanNotionUrl(url),
        source: "lesson",
        added_at: new Date().toISOString(),
        last_opened_at: null,
        sort_index: await nextItemSortIndex(folder_id),
      };
      await itemDB.put(rec);
      return rec;
    }
    const dlId = webDownloadId(url);
    const plId = personalLibraryId(url);
    const blob = dlId
      ? (await downloadFileDB.get(Number(dlId)))?.blob
      : plId
        ? (await fileDB.get(plId))?.blob
        // Same reach as the reader: storage resolution, pdf-proxy with the
        // caller's token, and native HTTP on the APK. A bare fetch() here
        // died with "Failed to fetch" on proxy-only / CORS-closed sources.
        : await fetchDocumentBlob(url);

    if (!blob) throw new Error("Could not find saved PDF bytes");
    const sourceName = filename || title;
    const ext = extOf(sourceName, blob.type || "");
    // Preserve the original extension when present; if unknown, fall back to
    // the mime-detected ext (or "bin") instead of forcing ".pdf" — saving a
    // .docx/.xlsx/.md/etc. as .pdf would break opening it later.
    const safeName = /\.[a-z0-9]+$/i.test(sourceName) ? sourceName : `${sourceName}.${ext}`;
    const file = new File([blob], safeName, { type: blob.type || mimeForExt(ext, "application/pdf") });
    // Pending-aware quota check — accounts for concurrent in-flight imports.
    reserve(file.size);
    const quota = await canAddAware(0);
    if (!quota.ok) {
      release(file.size);
      throw new Error("Device is out of storage. Free up space on your phone and try again.");
    }
    try {
      if (file.size > MAX_FILE_BYTES) {
        throw new Error(
          `File too large (${Math.round(file.size / 1024 / 1024)} MB). Maximum is ${Math.round(
            MAX_FILE_BYTES / 1024 / 1024
          )} MB per file.`
        );
      }
      const fileExt = extOf(file.name, file.type);
      const newId = uuid();
      // Stream — never materialise the full buffer in memory.
      const path = await streamBlobToFolder(folder_id, file, fileExt, newId);
      const rec: PersonalItem = {
        id: newId,
        folder_id,
        title: title.replace(/\.[^.]+$/, ""),
        file_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        local_path: path,
        source: "lesson",
        added_at: new Date().toISOString(),
        last_opened_at: null,
        sort_index: await nextItemSortIndex(folder_id),
      };
      await itemDB.put(rec);
      const fs = await getFS();
      if (!fs) {
        try {
          await ensureBrowserStorageHeadroom(file.size);
          await fileDB.put(rec.id, file);
        } catch (err) {
          if (isQuotaError(err)) {
            await clearRuntimeCaches();
            try {
              await fileDB.put(rec.id, file);
            } catch {
              try { await itemDB.delete(rec.id); } catch { /* ignore */ }
              throw new Error("Browser storage is full. Delete some files/cache and try again.");
            }
          } else {
            try { await itemDB.delete(rec.id); } catch { /* ignore */ }
            throw err;
          }
        }
      }
      return rec;
    } finally {
      release(file.size);
    }
  });
}


export async function addUrlToDefaultLibrary(url: string, title: string, filename?: string): Promise<PersonalItem> {
  const folder = await getOrCreateFolder("Saved PDFs");
  return addUrlToFolder(folder.id, url, title, filename);
}

/** Save a binary blob into "Saved PDFs" without doing any network fetch. */
export async function addBlobToDefaultLibrary(
  blob: Blob,
  title: string,
  filename: string
): Promise<PersonalItem> {
  const folder = await getOrCreateFolder("Saved PDFs");
  const safeName = /\.[a-z0-9]+$/i.test(filename)
    ? filename
    : `${filename}.${extOf(filename, blob.type || "")}`;
  const file = new File([blob], safeName, {
    type: blob.type || mimeForExt(extOf(safeName, blob.type || ""), "application/pdf"),
  });
  const rec = await addFileToFolder(folder.id, file, "lesson");
  rec.title = title.replace(/\.[^.]+$/, "");
  await itemDB.put(rec);
  return rec;
}

/** Export to user-visible storage (Share sheet on native, browser download on web). */
export async function exportItem(id: string) {
  const rec = await itemDB.get(id);
  if (!rec) return;
  const fs = await getFS();
  if (!fs) {
    const url = await getItemUri(id);
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = rec.file_name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }
  const { uri } = await fs.Filesystem.getUri({
    path: rec.local_path,
    directory: fs.Directory.Data,
  });
  const { Share } = await import("@capacitor/share");
  await Share.share({
    title: rec.title,
    url: uri,
    dialogTitle: "Save or share",
  });
}
