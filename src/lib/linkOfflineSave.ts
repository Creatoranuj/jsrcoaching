/**
 * Shared "save this link offline" flow for the My Library link shelf.
 *
 * Single source of truth used by both the add dialog and the shelf rows, so
 * the size guard, folder handling and error copy can't drift apart.
 *
 * Crash safety: the per-file limit is checked from the response headers
 * *before* the bytes are pulled into memory. Downloading a 200 MB file first
 * and rejecting it afterwards is exactly how a low-RAM Android WebView dies.
 */
import { documentSourceCandidates } from "./fetchDocumentBlob";
import { getMaxFileBytes } from "../services/personalLibrary";
import { canDownload, maxDownloadBytes, recordDownload, recordDownloadFailure } from "./bandwidthGuard";
import { canSaveOffline, type LinkSource } from "./linkSources";

const OFFLINE_FOLDER = "Link Imports";

/** Best-effort remote size probe. Returns null when the host won't say. */
export async function probeRemoteSize(url: string, signal?: AbortSignal): Promise<number | null> {
  for (const candidate of documentSourceCandidates(url)) {
    for (const init of [
      { method: "HEAD" as const },
      // Some CDNs reject HEAD; a 1-byte range still reveals the total size.
      { method: "GET" as const, headers: { Range: "bytes=0-0" } },
    ]) {
      try {
        const res = await fetch(candidate, { ...init, credentials: "omit", signal });
        if (!res.ok && res.status !== 206) continue;
        const range = res.headers.get("content-range");
        const total = range?.match(/\/(\d+)\s*$/)?.[1];
        if (total) return Number(total);
        const len = res.headers.get("content-length");
        if (len && init.method === "HEAD") return Number(len);
      } catch {
        /* try the next candidate */
      }
    }
  }
  return null;
}

export interface SaveLinkOfflineArgs {
  url: string;
  title: string;
  source: LinkSource;
  /** Fallback folder name when no explicit folder id is given. */
  folderName?: string;
  /** Target folder for a fresh download. */
  folderId?: string;
  /** Existing link item to upgrade in place (keeps folder/title/position). */
  itemId?: string;
  signal?: AbortSignal;
}


/** Filename hint from a URL path, so the offline copy keeps its extension. */
function nameFromUrl(url: string, title: string): string {
  try {
    const last = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() || "");
    if (/\.[a-z0-9]{2,5}$/i.test(last)) return last;
  } catch {
    /* fall through */
  }
  return title;
}

/**
 * Stream a URL into memory, aborting the moment the byte counter passes `max`.
 *
 * This is the guard for hosts that report no `content-length` / `content-range`:
 * without it the whole (possibly 500 MB) body lands in the WebView heap before
 * anyone checks its size — the classic low-RAM Android OOM. Returns null when
 * streaming isn't possible (no body, CORS-blocked, native HTTP path), so the
 * caller can fall back to the normal URL import.
 */
export async function fetchCapped(
  url: string,
  max: number,
  signal?: AbortSignal,
): Promise<Blob | null> {
  for (const candidate of documentSourceCandidates(url)) {
    let res: Response;
    try {
      res = await fetch(candidate, { credentials: "omit", signal });
    } catch {
      continue;
    }
    if (!res.ok || !res.body?.getReader) continue;
    const reader = res.body.getReader();
    const chunks: BlobPart[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        total += value.byteLength;
        if (total > max) {
          try {
            await reader.cancel();
          } catch {
            /* ignore */
          }
          throw new Error(
            `File is larger than the ${Math.round(max / 1024 / 1024)} MB per-file limit.`,
          );
        }
        chunks.push(value as unknown as BlobPart);
      }
    } catch (err) {
      if (/larger than the/.test((err as Error)?.message || "")) throw err;
      continue;
    }
    recordDownload(total);
    return new Blob(chunks, { type: res.headers.get("content-type") || "application/octet-stream" });
  }
  recordDownloadFailure();
  return null;
}

/**
 * Download a link into the Personal Library. Throws user-facing errors.
 *
 * Two modes:
 *  - `itemId` given → upgrade that existing link row *in place*, keeping its
 *    folder, title and manual position. Nothing new appears elsewhere.
 *  - otherwise      → create a fresh item (in `folderId`, else `folderName`).
 */
export async function saveLinkOffline({
  url,
  title,
  source,
  folderName = OFFLINE_FOLDER,
  folderId,
  itemId,
  signal,
}: SaveLinkOfflineArgs): Promise<{ itemId: string; folderName: string }> {
  if (!canSaveOffline(url, source)) {
    throw new Error("This link streams only — it can't be stored offline.");
  }

  // The effective ceiling is the stricter of the device/heap guard and the
  // admin-tunable bandwidth cap — whichever would break first.
  const max = Math.min(getMaxFileBytes(), maxDownloadBytes());
  const tooLarge = (bytes: number) =>
    new Error(
      `File too large (${Math.round(bytes / 1024 / 1024)} MB). Maximum is ${Math.round(
        max / 1024 / 1024,
      )} MB per file.`,
    );

  const size = await probeRemoteSize(url, signal);
  if (size !== null && size > max) throw tooLarge(size);

  const decision = canDownload(size);
  if (decision.allowed === false) throw new Error(decision.reason);

  const svc = await import("../services/personalLibrary");

  // ---- in-place upgrade of an existing link row -------------------------
  if (itemId) {
    let blob = await fetchCapped(url, max, signal);
    if (!blob) {
      const { fetchDocumentBlob } = await import("./fetchDocumentBlob");
      blob = await fetchDocumentBlob(url).catch(() => null);
    }
    if (!blob) throw new Error("Could not download this link — the host may block downloads.");
    if (blob.size > max) throw tooLarge(blob.size);
    const file = new File([blob], nameFromUrl(url, title), {
      type: blob.type || "application/octet-stream",
    });
    await svc.replaceItem(itemId, file);
    await svc.clearLinkMarkers(itemId);
    emitRefresh();
    return { itemId, folderName };
  }

  // ---- fresh download ---------------------------------------------------
  const folder = folderId ? { id: folderId } : await svc.getOrCreateFolder(folderName);

  // Always pull the bytes: "Save offline" that quietly stores a bare URL is a
  // file that dies the moment the student loses signal. The size probe above
  // has already rejected anything over the cap, and `fetchCapped` still keeps
  // its hard ceiling for hosts that under-report.
  let blob = await fetchCapped(url, max, signal);
  if (!blob) {
    const { fetchDocumentBlob } = await import("./fetchDocumentBlob");
    blob = await fetchDocumentBlob(url, signal).catch(() => null);
  }
  if (!blob) {
    throw new Error("Could not download this link — the host may block downloads.");
  }
  if (blob.size > max) throw tooLarge(blob.size);

  const file = new File([blob], nameFromUrl(url, title), {
    type: blob.type || "application/octet-stream",
  });
  const item = await svc.addFileToFolder(folder.id, file, "lesson");

  emitRefresh();
  return { itemId: item.id, folderName };
}

function emitRefresh() {
  try {
    window.dispatchEvent(new Event("personalLibrary:refresh"));
  } catch {
    /* noop */
  }
}



export { OFFLINE_FOLDER };
