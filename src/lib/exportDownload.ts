/**
 * Export a saved download to the user's device — surfaces it via the native
 * share sheet so the user can pick "Save to Files / Drive / WhatsApp / etc."
 *
 * Why share sheet, not "copy to /sdcard/Download"?
 *  - Android 10+ scoped storage blocks raw writes to public Downloads without
 *    the Storage Access Framework (SAF). The share sheet's "Save to device"
 *    action goes through SAF for free and works on every Android version.
 *  - iOS Documents/ isn't user-visible without the share sheet either.
 *
 * Web fallback: triggers a regular browser download from the blob/URL.
 */
import type { DownloadRecord } from "./indexedDB";
import { downloadFileDB } from "./indexedDB";

const WEB_LOCAL_PREFIX = "web-indexeddb:";

async function getFS() {
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return null;
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  return { Filesystem, Directory, Capacitor };
}

function parseTaggedPath(localPath: string): { dirName: string; filePath: string } {
  const m = localPath.match(/^(Documents|Data|External|ExternalStorage|Cache|Library):(.+)$/);
  return { dirName: m?.[1] ?? "Data", filePath: m?.[2] ?? localPath };
}

/** Trigger a browser <a download> for a blob or URL. */
function webDownload(href: string, filename: string): void {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 0);
}

/**
 * Returns true on success, false if the user cancelled or no export path
 * was viable. Throws on hard errors (caller surfaces a toast).
 */
export async function exportDownloadToDevice(rec: DownloadRecord): Promise<boolean> {
  const fs = await getFS();

  // ---- Web ------------------------------------------------------------
  if (!fs) {
    if (rec.local_path?.startsWith(WEB_LOCAL_PREFIX) && rec.id != null) {
      const row = await downloadFileDB.get(rec.id);
      if (row?.blob) {
        const url = URL.createObjectURL(row.blob);
        try { webDownload(url, rec.filename); } finally {
          setTimeout(() => URL.revokeObjectURL(url), 60_000);
        }
        return true;
      }
    }
    webDownload(rec.url, rec.filename);
    return true;
  }

  // ---- Native ---------------------------------------------------------
  // Strategy:
  //  1. Get a file:// URI for the saved file (native path) OR materialize
  //     the IndexedDB blob into a temp Cache file (web-fallback record).
  //  2. Open the system share sheet pointing at that URI.
  let fileUri: string | null = null;

  if (rec.local_path && !rec.local_path.startsWith(WEB_LOCAL_PREFIX)) {
    const { dirName, filePath } = parseTaggedPath(rec.local_path);
    const directory =
      (fs.Directory as unknown as Record<string, unknown>)[dirName] ?? fs.Directory.Data;
    try {
      const { uri } = await fs.Filesystem.getUri({
        path: filePath,
        directory: directory as never,
      });
      fileUri = uri;
    } catch (err) {
      console.warn("[exportDownload] getUri failed", err);
    }
  } else if (rec.local_path?.startsWith(WEB_LOCAL_PREFIX) && rec.id != null) {
    // Indexed-only record (rare on native, but possible if first save fell
    // back to IndexedDB). Materialize to Cache so Share has a file URI.
    const row = await downloadFileDB.get(rec.id);
    if (row?.blob) {
      const buf = new Uint8Array(await row.blob.arrayBuffer());
      let bin = "";
      const CHUNK = 0x8000;
      for (let i = 0; i < buf.length; i += CHUNK) {
        const slice = buf.subarray(i, Math.min(i + CHUNK, buf.length));
        let part = "";
        for (let j = 0; j < slice.length; j += 1) part += String.fromCharCode(slice[j]);
        bin += part;
      }
      const base64 = btoa(bin);
      const path = `exports/${rec.filename}`;
      await fs.Filesystem.writeFile({
        path,
        data: base64,
        directory: fs.Directory.Cache,
        recursive: true,
      });
      const { uri } = await fs.Filesystem.getUri({
        path,
        directory: fs.Directory.Cache,
      });
      fileUri = uri;
    }
  }

  if (!fileUri) throw new Error("No local copy to export. Re-download this file while online.");

  try {
    const { Share } = await import("@capacitor/share");
    await Share.share({
      title: rec.title,
      url: fileUri,
      dialogTitle: "Save / share file",
    });
    return true;
  } catch (err) {
    const msg = (err as Error)?.message || String(err);
    // User cancelled — Capacitor surfaces this as an error on Android.
    if (/cancel/i.test(msg)) return false;
    throw err;
  }
}
