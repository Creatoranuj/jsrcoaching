/**
 * Offline PDF Library service.
 *
 * Writes PDF bytes to Capacitor Filesystem (Directory.Data — app-private)
 * with streaming + progress + cancel + atomic-version-swap, and indexes
 * them in IndexedDB (libraryDB) for fast lookup.
 *
 * Web fallback: opens the remote URL in a new tab (no native filesystem).
 */
import { libraryDB, type LibraryRecord } from "../lib/libraryDB";
import { isResolvableStorageViewerUrl, resolveStorageBytes } from "@/lib/native/naveenStoragePdf";

const DIR = "pdfs";

/** Repair common URL corruption like "httpshttps://..." or "<url>://<dup>" stored in DB. */
function sanitizeUrl(url: string): string {
  if (!url) return url;
  let u = url.trim();
  // Strip a duplicated leading scheme: "httpshttps://..." → "https://..."
  u = u.replace(/^(https?)(https?:\/\/)/i, "$2");
  // Strip a duplicated tail: "<scheme>://<a>://<b>" → "<scheme>://<a>"
  const first = u.indexOf("://");
  if (first !== -1) {
    const second = u.indexOf("://", first + 3);
    if (second !== -1) u = u.slice(0, second);
  }
  return u;
}

function extOf(name: string, fallback = "pdf") {
  const ext = name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  return ext || fallback;
}

function relPath(pdf_id: string, version: number, fileName: string) {
  return `${DIR}/${pdf_id}__v${version}.${extOf(fileName)}`;
}

async function getFS() {
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return null;
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  return { Filesystem, Directory };
}

async function ensureDir() {
  const fs = await getFS();
  if (!fs) return;
  try {
    await fs.Filesystem.mkdir({
      path: DIR,
      directory: fs.Directory.Data,
      recursive: true,
    });
  } catch {
    /* already exists */
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, Math.min(i + chunk, bytes.length));
    let part = "";
    for (let j = 0; j < slice.length; j += 1) part += String.fromCharCode(slice[j]);
    bin += part;
  }
  return btoa(bin);
}

function blobSliceToBase64(slice: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const result = String(fr.result || "");
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    fr.onerror = () => reject(fr.error || new Error("file read failed"));
    fr.readAsDataURL(slice);
  });
}

function pickChunkSize(): number {
  const dm = (navigator as { deviceMemory?: number }).deviceMemory;
  if (typeof dm === "number" && dm > 0 && dm <= 2) return 128 * 1024;
  if (typeof dm === "number" && dm > 0 && dm <= 4) return 512 * 1024;
  return 1024 * 1024;
}

export interface DownloadProgress {
  pdf_id: string;
  loaded: number;
  total: number;
  percent: number;
}

export interface PdfMeta {
  pdf_id: string;
  title: string;
  url: string;
  version: number;
  subject: string | null;
  skill_level: "beginner" | "intermediate" | "advanced";
  size_bytes?: number;
}

const cancellers = new Map<string, AbortController>();

export async function isDownloaded(pdf_id: string, version?: number): Promise<boolean> {
  const rec = await libraryDB.get(pdf_id);
  if (!rec || rec.state !== "complete") return false;
  if (version != null && rec.version !== version) return false;
  return true;
}

export async function listDownloaded(): Promise<LibraryRecord[]> {
  const all = (await libraryDB.all()) || [];
  return all.filter((r) => r.state === "complete");
}

export async function totalUsedBytes(): Promise<number> {
  const all = await listDownloaded();
  return all.reduce((s, r) => s + (r.size_bytes || 0), 0);
}

export async function getLocalFileUri(pdf_id: string): Promise<string | null> {
  const rec = await libraryDB.get(pdf_id);
  if (!rec || rec.state !== "complete") return null;
  const fs = await getFS();
  // Web fallback: local_path stores the remote URL so Open still works.
  if (!fs) {
    if (rec.local_path && /^https?:\/\//i.test(rec.local_path)) return rec.local_path;
    return null;
  }
  try {
    const { uri } = await fs.Filesystem.getUri({
      path: rec.local_path,
      directory: fs.Directory.Data,
    });
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.convertFileSrc(uri);
  } catch {
    return null;
  }
}

export function cancelDownload(pdf_id: string) {
  cancellers.get(pdf_id)?.abort();
  cancellers.delete(pdf_id);
}

export async function deletePdf(pdf_id: string): Promise<void> {
  const rec = await libraryDB.get(pdf_id);
  if (!rec) return;
  const fs = await getFS();
  if (fs) {
    try {
      await fs.Filesystem.deleteFile({
        path: rec.local_path,
        directory: fs.Directory.Data,
      });
    } catch {
      /* file already gone */
    }
  }
  await libraryDB.delete(pdf_id);
}

export async function downloadPdf(
  meta: PdfMeta,
  onProgress?: (p: DownloadProgress) => void
): Promise<LibraryRecord> {
  const fs = await getFS();
  const fetchUrl = sanitizeUrl(meta.url);
  if (!fs) {
    // Web fallback — fetch as blob and trigger a real "Save as" via <a download>.
    // Also index the record so the card shows an "Open" button afterwards.
    try {
      const blob = isResolvableStorageViewerUrl(fetchUrl)
        ? await resolveStorageBytes(fetchUrl)
        : await (async () => {
            const resp = await fetch(fetchUrl, { credentials: "omit" });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            return resp.blob();
          })();
      const blobUrl = URL.createObjectURL(blob);
      const rawName = meta.title || `${meta.pdf_id}.${extOf(meta.title)}`;
      const filename = rawName.replace(/[/\\?%*:|"<>]/g, "_");
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
      const rec: LibraryRecord = {
        pdf_id: meta.pdf_id,
        title: meta.title,
        subject: meta.subject,
        skill_level: meta.skill_level,
        version: meta.version,
        local_path: fetchUrl, // web: remote URL doubles as "local" pointer
        size_bytes: blob.size,
        downloaded_at: new Date().toISOString(),
        last_opened_at: null,
        state: "complete",
      };
      await libraryDB.put(rec);
      return rec;
    } catch (err) {
      // Last-resort: open in new tab so the user can save manually.
      window.open(fetchUrl, "_blank", "noopener,noreferrer");
      throw err;
    }
  }



  // Idempotent: same version already present → return existing record.
  const existing = await libraryDB.get(meta.pdf_id);
  if (existing && existing.state === "complete" && existing.version === meta.version) {
    return existing;
  }

  await ensureDir();
  const path = relPath(meta.pdf_id, meta.version, meta.title);
  const abort = new AbortController();
  cancellers.set(meta.pdf_id, abort);

  // Mark partial so a force-quit shows up as interrupted on next launch.
  await libraryDB.put({
    pdf_id: meta.pdf_id,
    title: meta.title,
    subject: meta.subject,
    skill_level: meta.skill_level,
    version: meta.version,
    local_path: path,
    size_bytes: 0,
    downloaded_at: new Date().toISOString(),
    last_opened_at: null,
    state: "partial",
  });

  try {
    let total = 0;
    let loaded = 0;
    let first = true;

    if (isResolvableStorageViewerUrl(fetchUrl)) {
      // Viewer URL → chunk raw bytes to disk. Never hold the full PDF as
      // ArrayBuffer/base64 in the WebView heap on low-RAM Android devices.
      const blob = await resolveStorageBytes(fetchUrl, abort.signal);
      total = blob.size;
      const chunkSize = pickChunkSize();
      for (let off = 0; off < blob.size; off += chunkSize) {
        const end = Math.min(off + chunkSize, blob.size);
        const data = await blobSliceToBase64(blob.slice(off, end));
        if (first) {
          await fs.Filesystem.writeFile({ path, directory: fs.Directory.Data, data });
          first = false;
        } else {
          await fs.Filesystem.appendFile({ path, directory: fs.Directory.Data, data });
        }
        loaded = end;
        onProgress?.({ pdf_id: meta.pdf_id, loaded, total, percent: total ? Math.round((loaded / total) * 100) : 0 });
        await new Promise((r) => setTimeout(r, 0));
      }
    } else {
      const resp = await fetch(fetchUrl, { signal: abort.signal });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      total = Number(resp.headers.get("content-length")) || meta.size_bytes || 0;

      const reader = resp.body?.getReader();
      if (!reader) throw new Error("Stream unsupported");

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;
        const b64 = bytesToBase64(value);
        if (first) {
          await fs.Filesystem.writeFile({
            path,
            directory: fs.Directory.Data,
            data: b64,
          });
          first = false;
        } else {
          await fs.Filesystem.appendFile({
            path,
            directory: fs.Directory.Data,
            data: b64,
          });
        }
        loaded += value.length;
        onProgress?.({
          pdf_id: meta.pdf_id,
          loaded,
          total,
          percent: total ? Math.min(100, Math.round((loaded / total) * 100)) : 0,
        });
      }
    }

    // Delete any stale previous-version files for this pdf_id (atomic swap).
    if (existing && existing.version !== meta.version) {
      try {
        await fs.Filesystem.deleteFile({
          path: existing.local_path,
          directory: fs.Directory.Data,
        });
      } catch {
        /* ignore */
      }
    }

    const rec: LibraryRecord = {
      pdf_id: meta.pdf_id,
      title: meta.title,
      subject: meta.subject,
      skill_level: meta.skill_level,
      version: meta.version,
      local_path: path,
      size_bytes: loaded,
      downloaded_at: new Date().toISOString(),
      last_opened_at: null,
      state: "complete",
    };
    await libraryDB.put(rec);
    cancellers.delete(meta.pdf_id);
    return rec;
  } catch (err) {
    cancellers.delete(meta.pdf_id);
    // Best-effort cleanup of partial file.
    try {
      await fs.Filesystem.deleteFile({ path, directory: fs.Directory.Data });
    } catch {
      /* ignore */
    }
    if ((err as any)?.name === "AbortError") {
      await libraryDB.delete(meta.pdf_id);
    } else {
      const partial = await libraryDB.get(meta.pdf_id);
      if (partial) {
        partial.state = "interrupted";
        await libraryDB.put(partial);
      }
    }
    throw err;
  }
}

/**
 * Drop local files for PDFs the server no longer returns (revoked access
 * or deleted by admin). `serverIds` = set of pdf_ids the user CAN see.
 */
export async function reconcileEntitlements(serverIds: Set<string>): Promise<number> {
  const all = (await libraryDB.all()) || [];
  let removed = 0;
  for (const r of all) {
    if (!serverIds.has(r.pdf_id)) {
      await deletePdf(r.pdf_id);
      removed++;
    }
  }
  return removed;
}

/** Mark partial files (from a force-quit) as interrupted on next boot. */
export async function repairInterrupted(): Promise<void> {
  const all = (await libraryDB.all()) || [];
  for (const r of all) {
    if (r.state === "partial") {
      r.state = "interrupted";
      await libraryDB.put(r);
    }
  }
}

/** Concurrency-limited queue (max 2 in parallel). */
const queue: Array<() => Promise<unknown>> = [];
let active = 0;
const MAX = 2;
function pump() {
  while (active < MAX && queue.length) {
    const job = queue.shift()!;
    active++;
    job().finally(() => {
      active--;
      pump();
    });
  }
}
export function enqueueDownload<T>(job: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push(() => job().then(resolve, reject));
    pump();
  });
}