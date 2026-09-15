/**
 * Save a remote PDF (or any file) to the user's device.
 *
 * - Capacitor (Android/iOS): downloads via fetch, base64-encodes in chunks
 *   (to avoid the `String.fromCharCode(...bigArr)` arg-limit crash that
 *   killed the app), then writes to `Documents/JSR/<filename>`
 *   using @capacitor/filesystem. Falls back to share-sheet on iOS so the
 *   file lands in Files → On My iPhone.
 *
 * - Web / preview: triggers the standard `<a download>` flow.
 *
 * Returns the final saved path (native) or empty string (web).
 */

import { reportError } from "./sentry";

const APP_FOLDER = "JSR";

function sanitizeFilename(name: string): string {
  const base = (name || "document").replace(/[/\\?%*:|"<>]/g, "_").trim();
  return /\.[a-z0-9]{2,5}$/i.test(base) ? base : `${base}.pdf`;
}

/** Chunked Uint8Array → base64 (safe for files > 1 MB). */
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000; // 32 KB — well under JS arg-limit on every engine
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    let part = "";
    for (let j = 0; j < slice.length; j += 1) part += String.fromCharCode(slice[j]);
    binary += part;
  }
  return btoa(binary);
}

async function fetchAsBase64(url: string): Promise<{ base64: string; mime: string }> {
  const res = await fetch(url, { credentials: "omit" });
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const mime = res.headers.get("content-type") || "application/pdf";
  const buf = await res.arrayBuffer();
  return { base64: bytesToBase64(new Uint8Array(buf)), mime };
}

export async function savePdfToDevice(
  url: string,
  rawFilename: string,
  opts?: { onProgress?: (msg: string) => void }
): Promise<{ savedPath: string; nativeSave: boolean }> {
  const filename = sanitizeFilename(rawFilename);
  const log = opts?.onProgress ?? (() => {});

  // --- Capacitor native path ----------------------------------------------
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      log("Downloading…");
      const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
      // suppress unused-import lint for Encoding
      void Encoding;

      const path = `${APP_FOLDER}/${filename}`;
      log("Saving…");
      const result = /^https?:\/\//i.test(url) && "downloadFile" in Filesystem
        ? await (Filesystem as typeof Filesystem & {
            downloadFile: (opts: { url: string; path: string; directory: unknown; recursive?: boolean }) => Promise<{ uri?: string }>;
          }).downloadFile({ url, path, directory: Directory.Documents, recursive: true })
        : await (async () => {
            const { base64 } = await fetchAsBase64(url);
            return Filesystem.writeFile({
              path,
              data: base64,
              directory: Directory.Documents,
              recursive: true,
            });
          })();
      const savedUri = result.uri || (await Filesystem.getUri({ path, directory: Directory.Documents })).uri;

      // iOS: surface the file via share sheet so user can pick "Save to Files"
      // (Documents/ on iOS isn't user-visible without this).
      if (Capacitor.getPlatform() === "ios") {
        try {
          const { Share } = await import("@capacitor/share");
          await Share.share({
            title: filename,
            url: savedUri,
            dialogTitle: "Save PDF",
          }).catch(() => {});
        } catch {
          /* share plugin absent — file still saved to Documents */
        }
      }

      return { savedPath: savedUri, nativeSave: true };
    }
  } catch (err) {
    reportError(err, { surface: "nativePdfSaver", stage: "native-save-fallback" });
  }

  // --- Web fallback --------------------------------------------------------
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
  return { savedPath: "", nativeSave: false };
}
