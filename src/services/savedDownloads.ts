/**
 * Saves remote files to the device via @capacitor/filesystem and indexes them
 * in IndexedDB so the /downloads page works fully offline.
 *
 * - Native (Android/iOS): streams the file, chunk-base64 encodes, writes to
 *   Directory.Data/downloads/<filename> (app-private, no runtime permission
 *   prompt on modern OSes), and stores `local_path` in IndexedDB.
 * - Web: falls back to `<a download>` and indexes the remote URL only.
 *
 * Errors are caught and surfaced as toasts; we still index the remote URL so
 * the user can re-try while online.
 */
import { toast } from "sonner";
import {
  addDownload as dbAdd,
  updateDownload as dbUpdate,
  downloadFileDB,
  type DownloadRecord,
} from "../lib/indexedDB";
import { isResolvableStorageViewerUrl, resolveStorageBytes } from "@/lib/native/naveenStoragePdf";
import { reportError, addBreadcrumb } from "../lib/sentry";

/**
 * Guard: every DownloadRecord inserted from this module MUST carry a numeric
 * `size_bytes`. Downstream code (useLocalPdfSource.resolveNbDownloadSource)
 * uses this value to decide between an in-memory Blob read (OK for < 40 MB)
 * and a range-streamed capacitor:// URL (required for large PDFs to avoid
 * the July-16 nb-download OOM class). Missing size = we may pick the wrong
 * branch and crash the WebView on a 100 MB PDF. Legacy rows from before
 * this guard shipped can still be null — the interface stays optional.
 */
function assertHasSize(where: string, rec: { size_bytes?: number; local_path?: string }): void {
  const isNativeSave = !!rec.local_path && !rec.local_path.startsWith("web-indexeddb:");
  if (isNativeSave && (rec.size_bytes == null || rec.size_bytes <= 0)) {
    const msg = `[savedDownloads] ${where}: size_bytes missing on native insert — OOM risk`;
    addBreadcrumb("downloads", "size_bytes-missing", { where, path: rec.local_path });
    if (import.meta.env?.DEV) console.error(msg);
  }
}

const SUBDIR = "downloads";
const WEB_LOCAL_PREFIX = "web-indexeddb:";
const webDownloadUrlCache = new Map<number, string>();
/** Cache of blob URLs created from native file bytes (keyed by local_path). */
const nativeBlobUrlCache = new Map<string, string>();
const MAX_NATIVE_BLOB_URL_BYTES = 24 * 1024 * 1024;
/** Safety buffer left on origin quota after a web-fallback IndexedDB write. */
const QUOTA_SAFETY_BUFFER_BYTES = 50 * 1024 * 1024;

/**
 * Crash-shield: refuse to start an IndexedDB write we know will OOM/QuotaExceed.
 * On Android WebView a QuotaExceededError thrown deep inside idb-keyval can
 * kill the JS context; failing fast with a toast is safer.
 */
async function assertStorageQuota(requiredBytes: number): Promise<void> {
  try {
    const nav = navigator as Navigator & {
      storage?: { estimate?: () => Promise<{ quota?: number; usage?: number }> };
    };
    if (!nav.storage?.estimate) return; // older browsers — skip
    const { quota = 0, usage = 0 } = await nav.storage.estimate();
    if (quota <= 0) return;
    const available = quota - usage;
    if (requiredBytes + QUOTA_SAFETY_BUFFER_BYTES > available) {
      const mb = (n: number) => Math.round(n / (1024 * 1024));
      throw new Error(
        `Not enough storage: need ~${mb(requiredBytes)}MB, only ${mb(available)}MB free. Free space and retry.`
      );
    }
  } catch (err) {
    // Re-throw our own "Not enough storage" message; swallow probe failures.
    if (err instanceof Error && err.message.startsWith("Not enough storage")) throw err;
  }
}

/**
 * Free cached blob URLs when the WebView is backgrounded / page hidden.
 * On Android the WebView can be torn down and re-created (process death,
 * low-memory eviction); cached `blob:` URLs from the prior session become
 * dangling references whose underlying Blob is gone. Revoking on hide both
 * frees memory for large PDFs and prevents the stale-blob symptom on resume.
 */
if (typeof document !== "undefined") {
  const evictBlobCaches = () => {
    for (const url of nativeBlobUrlCache.values()) {
      try { URL.revokeObjectURL(url); } catch { /* noop */ }
    }
    nativeBlobUrlCache.clear();
    for (const url of webDownloadUrlCache.values()) {
      try { URL.revokeObjectURL(url); } catch { /* noop */ }
    }
    webDownloadUrlCache.clear();
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") evictBlobCaches();
  });
  window.addEventListener("pagehide", evictBlobCaches);
}

function sanitize(name: string): string {
  return (name || "file").replace(/[/\\?%*:|"<>]/g, "_").trim();
}

function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let bin = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const sub = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    let part = "";
    for (let j = 0; j < sub.length; j += 1) part += String.fromCharCode(sub[j]);
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

async function writeBlobChunked(
  fs: NonNullable<Awaited<ReturnType<typeof getFS>>>,
  blob: Blob,
  path: string,
  directory: unknown,
  onProgress?: (percent: number) => void,
): Promise<number> {
  const CHUNK = pickChunkSize();
  let loaded = 0;
  let first = true;
  let chunkIdx = 0;
  for (let off = 0; off < blob.size; off += CHUNK) {
    const end = Math.min(off + CHUNK, blob.size);
    const data = await blobSliceToBase64(blob.slice(off, end));
    if (first) {
      await fs.Filesystem.writeFile({ path, directory: directory as never, data, recursive: true });
      first = false;
    } else {
      await fs.Filesystem.appendFile({ path, directory: directory as never, data });
    }
    loaded = end;
    chunkIdx += 1;
    if (blob.size > 0) onProgress?.(Math.min(100, Math.round((loaded / blob.size) * 100)));
    if (chunkIdx % 8 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  if (first) throw new Error("Empty file response");
  return loaded;
}

async function getFS() {
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return null;
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  return { Filesystem, Directory, Capacitor };
}

/**
 * Pick the most user-visible writable directory available. On Android the
 * Documents directory shows up inside the device's Files app under
 * "Documents", so users can find their saved course PDFs without rooting
 * around in the app sandbox. Falls back to Directory.Data if Documents is
 * not writable (older iOS, sandboxed test environments, etc.).
 */
async function pickSaveDirectory(
  fs: NonNullable<Awaited<ReturnType<typeof getFS>>>
): Promise<unknown> {
  try {
    await fs.Filesystem.mkdir({
      path: SUBDIR,
      directory: fs.Directory.Documents,
      recursive: true,
    });
    return fs.Directory.Documents;
  } catch {
    try {
      await fs.Filesystem.mkdir({
        path: SUBDIR,
        directory: fs.Directory.Data,
        recursive: true,
      });
    } catch { /* already exists */ }
    return fs.Directory.Data;
  }
}

export interface SaveDownloadInput {
  title: string;
  url: string;
  filename: string;
  fileType?: DownloadRecord["fileType"];
  /**
   * Optional pre-fetched bytes. Pass this when the caller already has the
   * file in memory (e.g. Smart-Notes generated client-side as a `blob:` URL)
   * so we don't have to re-fetch a URL that may already be stale/revoked.
   */
  blob?: Blob;
}

export interface SaveDownloadResult {
  nativeSaved: boolean;
  local_path?: string;
  indexedFallback?: boolean;
}

/**
 * Save a remote file to the device and index it. Always indexes (even on
 * failure to write the file) so the entry is visible online; offline access
 * requires a successful native save.
 */
export async function saveAndIndexDownload(
  input: SaveDownloadInput,
  onProgress?: (percent: number) => void
): Promise<SaveDownloadResult> {
  const { title, url, fileType = "PDF", blob: providedBlob } = input;
  const filename = sanitize(input.filename);
  const fs = await getFS();
  const fetchBlob = async (): Promise<Blob> => {
    if (providedBlob) return providedBlob;
    if (isResolvableStorageViewerUrl(url)) return resolveStorageBytes(url);
    const res = await fetch(url, { credentials: "omit" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.blob();
  };

  const saveBlobToIndexedDb = async (blob: Blob): Promise<SaveDownloadResult> => {
    // Crash-shield: pre-check quota so we surface a friendly toast instead of
    // letting the WebView blow up mid-write with QuotaExceededError.
    await assertStorageQuota(blob.size);
    const id = await dbAdd({
      title,
      filename,
      url,
      downloadedAt: new Date().toISOString(),
      fileType,
      local_path: `${WEB_LOCAL_PREFIX}pending`,
      size_bytes: blob.size,
      mime: blob.type || undefined,
    });
    await downloadFileDB.put(id, blob);
    await dbUpdate({
      id,
      title,
      filename,
      url,
      downloadedAt: new Date().toISOString(),
      fileType,
      local_path: `${WEB_LOCAL_PREFIX}${id}`,
      size_bytes: blob.size,
      mime: blob.type || undefined,
    });
    const blobUrl = URL.createObjectURL(blob);
    webDownloadUrlCache.set(id, blobUrl);
    return { nativeSaved: false, local_path: `${WEB_LOCAL_PREFIX}${id}`, indexedFallback: true };
  };

  // --- Web fallback ------------------------------------------------------
  if (!fs) {
    try {
      const blob = await fetchBlob();
      const result = await saveBlobToIndexedDb(blob);
      const cachedUrl = webDownloadUrlCache.get(Number(result.local_path?.replace(WEB_LOCAL_PREFIX, "")));
      // If we had to mint a one-off URL for the anchor (cache miss path),
      // track it so we can revoke immediately after the click — otherwise
      // the Blob it points at leaks until tab close (HIGH MEM finding #3).
      let ephemeralUrl: string | null = null;
      const href = cachedUrl || (ephemeralUrl = URL.createObjectURL(blob));
      const a = document.createElement("a");
      a.href = href;
      a.download = filename;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (ephemeralUrl) {
        // Browsers need the URL alive long enough to start the download;
        // 30s is safe but bounded (vs the previous "never").
        setTimeout(() => URL.revokeObjectURL(ephemeralUrl!), 30_000);
      }
      return result;
    } catch (err) {
      console.warn("[savedDownloads] web offline copy failed, falling back to remote link", err);
    }
    await dbAdd({
      title,
      filename,
      url,
      downloadedAt: new Date().toISOString(),
      fileType,
    });
    return { nativeSaved: false };
  }

  // --- Native path -------------------------------------------------------
  const path = `${SUBDIR}/${filename}`;
  try {
    onProgress?.(0);
    const saveDir = await pickSaveDirectory(fs);

    // Preferred fast path on Android/iOS: stream straight to disk via the
    // native HTTP stack. This bypasses WebView CORS (the WebView origin is
    // `https://localhost`, so any cross-origin `fetch()` to Bunny/Supabase
    // CDNs fails in release builds), avoids 100% RAM use for large PDFs,
    // and skips the JS-side base64 encode entirely.
    const isRemoteHttp = !providedBlob && !isResolvableStorageViewerUrl(url) && /^https?:\/\//i.test(url);
    if (isRemoteHttp) {
      try {
        const dl = await (fs.Filesystem as unknown as {
          downloadFile: (opts: {
            url: string;
            path: string;
            directory: unknown;
            recursive?: boolean;
          }) => Promise<{ path?: string; blob?: Blob }>;
        }).downloadFile({
          url,
          path,
          directory: saveDir as never,
          recursive: true,
        });
        onProgress?.(100);
        let loaded = 0;
        try {
          const stat = await fs.Filesystem.stat({ path, directory: saveDir as never });
          loaded = Number((stat as { size?: number }).size) || 0;
        } catch { /* size optional */ }
        const dirTag = saveDir === fs.Directory.Documents ? "Documents" : "Data";
        const taggedPath = `${dirTag}:${path}`;
        const dlRec = {
          title,
          filename,
          url,
          downloadedAt: new Date().toISOString(),
          fileType,
          local_path: taggedPath,
          size_bytes: loaded || undefined,
        };
        assertHasSize("downloadFile", dlRec);
        await dbAdd(dlRec);
        void dl;
        return { nativeSaved: true, local_path: taggedPath };
      } catch (dlErr) {
        console.warn("[savedDownloads] Filesystem.downloadFile failed, falling back to fetch+write", dlErr);
        // fall through to the legacy fetch+writeFile path below
      }
    }

    const resp = providedBlob || isResolvableStorageViewerUrl(url)
      ? null
      : await fetch(url, { credentials: "omit" });
    if (resp && !resp.ok) throw new Error(`HTTP ${resp.status}`);
    const mime = resp?.headers.get("content-type") || providedBlob?.type || undefined;
    const total = Number(resp?.headers.get("content-length")) || providedBlob?.size || 0;

    const reader = resp?.body?.getReader();
    let loaded = 0;
    let first = true;

    if (!resp) {
      // Pre-supplied blob OR resolvable viewer URL → chunked write. Never
      // materialize a full PDF as ArrayBuffer/base64 in the WebView heap.
      const blob = providedBlob ?? (await resolveStorageBytes(url));
      loaded = await writeBlobChunked(fs, blob, path, saveDir, onProgress);
      onProgress?.(100);
    } else if (!reader) {
      // No ReadableStream support → keep the fallback bounded by writing the
      // Blob in slices instead of base64-encoding the whole response at once.
      const blob = await resp.blob();
      loaded = await writeBlobChunked(fs, blob, path, saveDir, onProgress);
      onProgress?.(100);
    } else {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;
        const data = bytesToBase64(value);
        if (first) {
          await fs.Filesystem.writeFile({
            path,
            directory: saveDir as never,
            data,
            recursive: true,
          });
          first = false;
        } else {
          await fs.Filesystem.appendFile({ path, directory: saveDir as never, data });
        }
        loaded += value.length;
        if (total > 0) {
          onProgress?.(Math.min(100, Math.round((loaded / total) * 100)));
        }
        await new Promise((r) => setTimeout(r, 0));
      }
      if (first || loaded === 0) throw new Error("Empty file response");
      onProgress?.(100);
    }

    const dirTag = saveDir === fs.Directory.Documents ? "Documents" : "Data";
    const taggedPath = `${dirTag}:${path}`;
    const nativeRec = {
      title,
      filename,
      url,
      downloadedAt: new Date().toISOString(),
      fileType,
      local_path: taggedPath,
      size_bytes: loaded,
      mime,
    };
    assertHasSize("chunkedWrite", nativeRec);
    await dbAdd(nativeRec);
    return { nativeSaved: true, local_path: taggedPath };
  } catch (err) {
    const msg = (err as Error)?.message || String(err);
    reportError(err, { surface: "savedDownloads.nativeSave" });
    try {
      const fallbackBlob = await fetchBlob();
      const fallback = await saveBlobToIndexedDb(fallbackBlob);
      return fallback;
    } catch (idxErr) {
      const permLike = /permission|denied|EACCES|EPERM/i.test(msg);
      toast.error(
        permLike
          ? "Storage permission denied. Enable storage access for the app in Settings."
          : `Download failed: ${msg}`
      );
      // Index remote URL anyway so user sees the entry while online.
      try {
        await dbAdd({
          title,
          filename,
          url,
          downloadedAt: new Date().toISOString(),
          fileType,
        });
      } catch (fallbackIndexErr) {
        console.warn("[savedDownloads] index fallback failed", fallbackIndexErr);
      }
    }
    return { nativeSaved: false };
  }
}

/** Resolve a saved record's playable URL (file:// → webview-safe URL when local). */
export async function resolveDownloadUri(rec: DownloadRecord): Promise<string> {
  if (!rec.local_path) {
    // Indexed-only record (remote URL fallback). If the remote URL is a dead
    // blob: from a prior session, surface a clear error instead of letting the
    // viewer trip over "NetworkError when attempting to fetch resource".
    if (rec.url?.startsWith("blob:")) {
      throw new Error("Offline copy missing for this file. Please re-download it while online.");
    }
    return rec.url;
  }
  if (rec.local_path.startsWith(WEB_LOCAL_PREFIX) && rec.id != null) {
    const hasBytes = !!(await downloadFileDB.get(rec.id))?.blob;
    // Treat .md/.markdown filenames as offline-routable even if fileType is
    // a legacy "NOTES" — the markdown viewer reads bytes via web-indexeddb:N.
    const isOfflineRoutable =
      ["PDF", "NOTES", "DPP", "MD", "MARKDOWN"].includes((rec.fileType || "").toUpperCase()) ||
      /\.(md|markdown|pdf)$/i.test(rec.filename || "");
    if (isOfflineRoutable) {
      // Route through `nb-download:{id}` so useLocalPdfSource / MarkdownViewer
      // read bytes via a single unified path (native filesystem + web IDB).
      // This avoids handing pdf.js a `blob:https://localhost/...` URL that
      // gets revoked when the WebView is backgrounded on Android APK — the
      // root cause of "Unexpected server response (0) while retrieving PDF".
      if (hasBytes) return `nb-download:${rec.id}`;
      // Bytes missing — fall back to remote URL (only useful when online).
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        throw new Error("This file isn't available offline. Re-download it while you're online.");
      }
      if (rec.url?.startsWith("blob:")) {
        throw new Error("Offline copy missing. Please re-download this file.");
      }
      return rec.url;
    }
    const cached = webDownloadUrlCache.get(rec.id);
    // Don't probe with fetch() — on some Android WebView builds a fetch on a
    // valid blob: URL returns !ok, which would cause us to revoke a working
    // URL and then fall back to an expired CDN URL (blank screen).
    if (cached) return cached;
    const row = await downloadFileDB.get(rec.id);
    if (!row?.blob) {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        throw new Error("This file isn't available offline. Re-download it while you're online.");
      }
      return rec.url;
    }
    const blobUrl = URL.createObjectURL(row.blob);
    webDownloadUrlCache.set(rec.id, blobUrl);
    return blobUrl;
  }
  const fs = await getFS();
  if (!fs) return rec.url;
  // Parse "Documents:downloads/foo.pdf" / "Data:downloads/foo.pdf"
  // Older records may be stored without a directory tag — treat as Data.
  const parsed = rec.local_path.match(/^(Documents|Data|External|ExternalStorage|Cache|Library):(.+)$/);
  const dirName = parsed?.[1] ?? "Data";
  const filePath = parsed?.[2] ?? rec.local_path;
  const directory =
    (fs.Directory as unknown as Record<string, unknown>)[dirName] ??
    fs.Directory.Data;

  // For offline-routable file types (PDF/NOTES/DPP/MD) on native, skip the
  // blob-URL mint entirely — `nb-download:{id}` lets useLocalPdfSource read
  // bytes directly via the Filesystem plugin. This eliminates the class of
  // "server response (0)" pdf.js errors caused by revoked blob URLs after
  // the Android WebView backgrounds.
  if (rec.id != null) {
    const isOfflineRoutable =
      ["PDF", "NOTES", "DPP", "MD", "MARKDOWN"].includes((rec.fileType || "").toUpperCase()) ||
      /\.(md|markdown|pdf)$/i.test(rec.filename || "");
    if (isOfflineRoutable) {
      return `nb-download:${rec.id}`;
    }
  }

  // Fast path: try to materialise the bytes into a same-origin blob URL.
  // This works for every file type (PDF, image, office, video) and avoids
  // WebViewLocalServer edge cases that return empty/HTML responses for
  // large binaries on some Android release builds.
  const cached = nativeBlobUrlCache.get(rec.local_path);
  // See note above — skip the fetch() liveness probe on Android WebView.
  if (cached) return cached;
  try {
    const knownSize = Number(rec.size_bytes || 0);
    if (knownSize > MAX_NATIVE_BLOB_URL_BYTES) throw new Error("large native file — use convertFileSrc");
    try {
      const stat = await fs.Filesystem.stat({ path: filePath, directory: directory as never });
      const size = Number((stat as { size?: number }).size || 0);
      if (size > MAX_NATIVE_BLOB_URL_BYTES) throw new Error("large native file — use convertFileSrc");
    } catch (statErr) {
      if (/large native file/i.test((statErr as Error)?.message || "")) throw statErr;
    }
    const res = await fs.Filesystem.readFile({
      path: filePath,
      directory: directory as never,
    });
    const data = (res as { data: string | Blob }).data;
    let blob: Blob;
    if (typeof data === "string") {
      const bin = atob(data);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      blob = new Blob([bytes], { type: rec.mime || "application/octet-stream" });
    } else {
      blob = data;
    }
    const blobUrl = URL.createObjectURL(blob);
    nativeBlobUrlCache.set(rec.local_path, blobUrl);
    return blobUrl;
  } catch (err) {
    console.warn("[savedDownloads] readFile failed, trying convertFileSrc", err);
  }
  try {
    const { uri } = await fs.Filesystem.getUri({
      path: filePath,
      directory: directory as never,
    });
    return fs.Capacitor.convertFileSrc(uri);
  } catch (err) {
    console.warn("[savedDownloads] local file missing, falling back to remote", err);
    return rec.url;
  }
}

/**
 * Proactively release a blob URL minted by `resolveDownloadUri` for this
 * record. Safe to call for URIs that were NOT blob URLs (no-op). Callers
 * that hold a URL long-term (viewers, hooks) should call this on close/
 * unmount to free the underlying Blob immediately instead of waiting for
 * the visibilitychange sweep. Idempotent.
 */
export function releaseDownloadUri(rec: DownloadRecord): void {
  if (!rec) return;
  if (rec.local_path?.startsWith(WEB_LOCAL_PREFIX) && rec.id != null) {
    const cached = webDownloadUrlCache.get(rec.id);
    if (cached) {
      try { URL.revokeObjectURL(cached); } catch { /* noop */ }
      webDownloadUrlCache.delete(rec.id);
    }
    return;
  }
  if (rec.local_path) {
    const cached = nativeBlobUrlCache.get(rec.local_path);
    if (cached) {
      try { URL.revokeObjectURL(cached); } catch { /* noop */ }
      nativeBlobUrlCache.delete(rec.local_path);
    }
  }
}

/** Delete the local file backing a download record (best-effort). */
export async function deleteLocalDownloadFile(rec: DownloadRecord): Promise<void> {
  if (!rec.local_path) return;
  if (rec.local_path.startsWith(WEB_LOCAL_PREFIX) && rec.id != null) {
    const cached = webDownloadUrlCache.get(rec.id);
    if (cached) URL.revokeObjectURL(cached);
    webDownloadUrlCache.delete(rec.id);
    await downloadFileDB.delete(rec.id);
    return;
  }
  const fs = await getFS();
  if (!fs) return;
  const cached = nativeBlobUrlCache.get(rec.local_path);
  if (cached) {
    URL.revokeObjectURL(cached);
    nativeBlobUrlCache.delete(rec.local_path);
  }
  const parsed = rec.local_path.match(/^(Documents|Data|External|ExternalStorage|Cache|Library):(.+)$/);
  const dirName = parsed?.[1] ?? "Data";
  const filePath = parsed?.[2] ?? rec.local_path;
  const directory =
    (fs.Directory as unknown as Record<string, unknown>)[dirName] ??
    fs.Directory.Data;
  try {
    await fs.Filesystem.deleteFile({
      path: filePath,
      directory: directory as never,
    });
  } catch {
    /* already gone */
  }
}
