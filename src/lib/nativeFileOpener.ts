/**
 * Native-first file opener.
 *
 * Why this exists:
 *   In-app pdf.js viewer renders blank inside Android WebView for many PDFs
 *   (signed Bunny URLs, large files, embedded fonts). Handing the file off
 *   to the OS via `@capacitor-community/file-opener` opens it in the user's
 *   preferred PDF reader (Drive, Adobe, etc.) — 100% reliable.
 *
 * Strategy:
 *   1. Native + already on disk → resolve file:// via Filesystem.getUri, open.
 *   2. Native + only in IndexedDB (web-fallback record) → materialize to Cache.
 *   3. Native + only remote URL → download to Cache, then open.
 *   4. Web → caller falls back to in-app viewer (this fn returns false).
 *
 * Returns true if a native opener was invoked, false to signal fallback.
 */
import type { DownloadRecord } from "./indexedDB";
import { downloadFileDB } from "./indexedDB";
import { isHtmlAppUrl } from "./pdfViewerUrl";
import { reportError } from "./sentry";

/**
 * Outcome of a native open attempt. Lets callers distinguish "the OS opened
 * it" from "we deliberately fell back to the in-app viewer" from "we tried
 * and failed" — useful for telemetry and UX (e.g. surfacing a retry toast
 * only on hard errors, not on web-fallback).
 */
export type OpenOutcome = "opened" | "fallback" | "error";

const WEB_LOCAL_PREFIX = "web-indexeddb:";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function fileUriToAbsolutePath(fileUri: string): string {
  if (/^file:\/\//i.test(fileUri)) {
    return decodeURIComponent(fileUri.replace(/^file:\/\//i, ""));
  }
  return fileUri;
}

function isDirectPdfLikeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (/\.pdf$/i.test(u.pathname)) return true;
    if (/supabase\.co|cdn\.jsdelivr\.net|githubusercontent\.com|github-storages-cdn\.vercel\.app|storage-safarenglishka-recording\.vercel\.app/i.test(u.hostname)) return true;
  } catch {
    return false;
  }
  return false;
}

async function openWithOfficialFileViewer(input: { fileUri?: string | null; url?: string | null }): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("FileViewer")) return false;

    const { FileViewer } = await import("@capacitor/file-viewer");
    if (input.fileUri) {
      await FileViewer.openDocumentFromLocalPath({ path: fileUriToAbsolutePath(input.fileUri) });
      return true;
    }
    if (input.url && /^https?:\/\//i.test(input.url)) {
      if (isHtmlAppUrl(input.url)) {
        console.info("[openFileNative] skip native viewer — html-app-url", input.url);
        return false;
      }
      await FileViewer.openDocumentFromUrl({ url: input.url });
      return true;
    }
  } catch (err) {
    console.warn("[openFileNative] FileViewer failed", errorMessage(err));
  }
  return false;
}

function parseTaggedPath(localPath: string): { dirName: string; filePath: string } {
  const m = localPath.match(/^(Documents|Data|External|ExternalStorage|Cache|Library):(.+)$/);
  return { dirName: m?.[1] ?? "Data", filePath: m?.[2] ?? localPath };
}

function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    let part = "";
    for (let j = 0; j < slice.length; j += 1) part += String.fromCharCode(slice[j]);
    binary += part;
  }
  return btoa(binary);
}

/**
 * Detailed variant — returns an OpenOutcome so callers can distinguish
 * "fallback" (intentional) from "error" (hard failure). The boolean wrapper
 * below preserves the legacy contract for existing callers.
 */
export async function openFileNativeDetailed(rec: DownloadRecord): Promise<OpenOutcome> {
  let Capacitor: typeof import("@capacitor/core").Capacitor;
  try {
    ({ Capacitor } = await import("@capacitor/core"));
  } catch {
    return "fallback";
  }
  if (!Capacitor.isNativePlatform()) return "fallback";

  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const mime = rec.mime || "application/pdf";

  let fileUri: string | null = null;
  let hadError = false;

  if (rec.url && /^https?:\/\//i.test(rec.url) && !isHtmlAppUrl(rec.url)) {
    const openedRemote = await openWithOfficialFileViewer({ url: rec.url });
    if (openedRemote) return "opened";
  }

  if (rec.local_path && !rec.local_path.startsWith(WEB_LOCAL_PREFIX)) {
    const { dirName, filePath } = parseTaggedPath(rec.local_path);
    const directory =
      (Directory as unknown as Record<string, unknown>)[dirName] ?? Directory.Data;
    try {
      const { uri } = await Filesystem.getUri({ path: filePath, directory: directory as never });
      fileUri = uri;
    } catch (err) {
      hadError = true;
      console.warn("[openFileNative] getUri failed", err);
    }
  }

  if (!fileUri && rec.id != null) {
    try {
      const row = await downloadFileDB.get(rec.id);
      if (row?.blob) {
        const buf = new Uint8Array(await row.blob.arrayBuffer());
        const path = `opens/${rec.filename}`;
        await Filesystem.writeFile({
          path,
          data: bytesToBase64(buf),
          directory: Directory.Cache,
          recursive: true,
        });
        const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
        fileUri = uri;
      }
    } catch (err) {
      hadError = true;
      console.warn("[openFileNative] IDB materialize failed", err);
    }
  }

  if (!fileUri && rec.url && !rec.url.startsWith("blob:")) {
    if (!isDirectPdfLikeUrl(rec.url)) return "fallback";
    try {
      const res = await fetch(rec.url, { credentials: "omit" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = new Uint8Array(await res.arrayBuffer());
      const path = `opens/${rec.filename}`;
      await Filesystem.writeFile({
        path,
        data: bytesToBase64(buf),
        directory: Directory.Cache,
        recursive: true,
      });
      const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
      fileUri = uri;
    } catch (err) {
      hadError = true;
      console.warn("[openFileNative] remote fetch failed", err);
    }
  }

  if (!fileUri) return hadError ? "error" : "fallback";

  const openedLocal = await openWithOfficialFileViewer({ fileUri });
  if (openedLocal) return "opened";

  try {
    const { FileOpener } = await import("@capacitor-community/file-opener");
    await FileOpener.open({ filePath: fileUri, contentType: mime, openWithDefault: true });
    return "opened";
  } catch (err) {
    const msg = errorMessage(err);
    reportError(err, { surface: "nativeFileOpener", stage: "FileOpener.open", fileUri, mime, message: msg });
    return "error";
  }
}

/** Legacy boolean wrapper — true when a native opener was invoked. */
export async function openFileNative(rec: DownloadRecord): Promise<boolean> {
  return (await openFileNativeDetailed(rec)) === "opened";
}
