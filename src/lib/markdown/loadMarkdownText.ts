import { fileDB as personalFileDB } from "../personalLibraryDB";
import { downloadFileDB, getDownload } from "../indexedDB";

/**
 * Single source of truth for turning any app-internal or remote markdown
 * address into text. Shared by the Downloads viewer
 * (`components/library/MarkdownViewer`) and the attachment viewer
 * (`components/video/MarkdownViewer`) so a new address scheme can never be
 * understood by one surface and not the other — the root cause of
 * "Couldn't reach the file source (Failed to fetch ())" when Downloads
 * resolved a saved .md to `nb-download:{id}`.
 *
 * Supported: nb-personal-library:{id} · web-indexeddb:{id} · nb-download:{id}
 *            capacitor:/ionic:/file:/_capacitor_file_ · blob: · http(s):
 */

export const personalLibraryId = (url: string) =>
  url.match(/^nb-personal-library:([^?#]+)$/i)?.[1] ?? null;
export const webDownloadId = (url: string) =>
  url.match(/^web-indexeddb:(\d+)$/i)?.[1] ?? null;
export const nbDownloadId = (url: string) =>
  url.match(/^nb-download:(\d+)$/i)?.[1] ?? null;

/** True for addresses that only exist inside the app (no network fetch possible). */
export const isVirtualMarkdownUrl = (url: string) =>
  /^(nb-personal-library:|web-indexeddb:|nb-download:)/i.test(url || "");

function decodeMaybeBase64(data: string): string {
  // Some Android builds return base64 even when utf8 encoding is requested.
  if (!/[#*\-`\n>|]/.test(data) && /^[A-Za-z0-9+/=\r\n]+$/.test(data.slice(0, 200))) {
    try {
      return decodeURIComponent(escape(atob(data)));
    } catch {
      return data;
    }
  }
  return data;
}

/**
 * Read a Capacitor-local file (capacitor://, file://, or the WebViewLocalServer
 * https://localhost/_capacitor_file_/<path> form) directly via the Filesystem
 * plugin instead of round-tripping through fetch(), which returns empty/HTML
 * responses on some Android release builds.
 */
export async function readNativeFileAsText(url: string): Promise<string | null> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return null;
    const { Filesystem } = await import("@capacitor/filesystem");

    let absPath: string | null = null;
    if (/^file:\/\//i.test(url)) {
      absPath = decodeURIComponent(url.replace(/^file:\/\//i, ""));
    } else if (/_capacitor_file_/i.test(url) || /^(capacitor|ionic):\/\//i.test(url)) {
      const m = url.match(/_capacitor_file_(.*)$/i);
      if (m) absPath = decodeURIComponent(m[1]);
    }
    if (!absPath) return null;

    const res = await Filesystem.readFile({ path: absPath, encoding: "utf8" as never });
    const data = (res as { data: string | Blob }).data;
    if (typeof data === "string") return decodeMaybeBase64(data);
    if (data instanceof Blob) return await data.text();
    return null;
  } catch {
    return null;
  }
}

/** Read the bytes of a saved download (`nb-download:{id}`) as text. */
async function readSavedDownloadAsText(id: number): Promise<string> {
  const rec = await getDownload(id);
  if (!rec) throw new Error("This download no longer exists on this device.");

  // Web tier (and native records whose bytes also landed in IndexedDB).
  const row = await downloadFileDB.get(id);
  if (row?.blob) return row.blob.text();

  if (rec.local_path && !rec.local_path.startsWith("web-indexeddb:")) {
    try {
      const { Capacitor } = await import("@capacitor/core");
      if (Capacitor.isNativePlatform()) {
        const { Filesystem, Directory } = await import("@capacitor/filesystem");
        const parsed = rec.local_path.match(
          /^(Documents|Data|External|ExternalStorage|Cache|Library):(.+)$/
        );
        const dirName = parsed?.[1] ?? "Data";
        const filePath = parsed?.[2] ?? rec.local_path;
        const directory =
          (Directory as unknown as Record<string, unknown>)[dirName] ?? Directory.Data;
        const res = await Filesystem.readFile({
          path: filePath,
          directory: directory as never,
          encoding: "utf8" as never,
        });
        const data = (res as { data: string | Blob }).data;
        if (typeof data === "string") return decodeMaybeBase64(data);
        if (data instanceof Blob) return await data.text();
      }
    } catch (err) {
      throw new Error((err as Error)?.message || "Could not read downloaded file", {
        cause: err,
      });
    }
  }
  throw new Error("Downloaded copy missing. Re-download it while online.");
}

export async function loadMarkdownText(url: string): Promise<string> {
  const plId = personalLibraryId(url);
  if (plId) {
    const row = await personalFileDB.get(plId);
    if (!row?.blob) throw new Error("This markdown file is no longer available on this device.");
    return row.blob.text();
  }

  const dlId = webDownloadId(url);
  if (dlId) {
    const row = await downloadFileDB.get(Number(dlId));
    if (!row?.blob)
      throw new Error("This downloaded markdown file is missing. Re-download it while online.");
    return row.blob.text();
  }

  const nbId = nbDownloadId(url);
  if (nbId) return readSavedDownloadAsText(Number(nbId));

  if (/^(capacitor:|ionic:|file:)/i.test(url) || /_capacitor_file_/i.test(url)) {
    const direct = await readNativeFileAsText(url);
    if (direct != null) return direct;
  }

  if (/^blob:/i.test(url)) {
    // A blob: URL only lives for the session that created it.
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (!text) throw new Error("Empty blob");
      return text;
    } catch (err) {
      console.warn("[loadMarkdownText] blob fetch failed", err);
      throw new Error(
        "Offline copy missing. Please delete this entry and re-download the notes while online.",
        { cause: err }
      );
    }
  }

  let res: Response;
  try {
    res = await fetch(url, { credentials: "omit" });
  } catch (e) {
    throw new Error(
      `Couldn't reach the file source (${(e as Error)?.message || "network error"}). If you're offline, re-download it while online.`,
      { cause: e }
    );
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (!text) throw new Error("Empty response — file may be inaccessible offline.");
  return text;
}
