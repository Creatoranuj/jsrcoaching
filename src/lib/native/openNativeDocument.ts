import { getDownloadUrl } from "../../utils/fileUtils";
import { isResolvableStorageViewerUrl, resolveStorageBytes } from "./naveenStoragePdf";
import { googleDrivePdfProxyUrl, isGoogleDrive, sanitizeRemoteUrl } from "../pdfViewerUrl";
import { isRedirectHeavyUrl, openExternal } from "./browser";

type NativeDocumentOpenOptions = {
  filename?: string;
  preferBrowser?: boolean;
};

const safePdfName = (name?: string): string => {
  const cleaned = (name || "document.pdf").replace(/[\\/:*?"<>|]+/g, "_").trim() || "document.pdf";
  return /\.pdf$/i.test(cleaned) ? cleaned : `${cleaned}.pdf`;
};

const blobSliceToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = () => reject(reader.error || new Error("File read failed"));
    reader.readAsDataURL(blob);
  });

async function blobToCacheFile(blob: Blob, filename?: string): Promise<{ uri: string; path: string }> {
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const path = `native-open/${Date.now()}-${safePdfName(filename)}`;
  const chunkSize = 512 * 1024;
  for (let offset = 0; offset < blob.size; offset += chunkSize) {
    const data = await blobSliceToBase64(blob.slice(offset, Math.min(offset + chunkSize, blob.size)));
    if (offset === 0) {
      await Filesystem.writeFile({ path, data, directory: Directory.Cache, recursive: true });
    } else {
      await Filesystem.appendFile({ path, data, directory: Directory.Cache });
    }
  }
  const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
  return { uri, path };
}

const uriToAbsolutePath = (uri: string): string => {
  const withoutScheme = uri.replace(/^file:\/\//i, "");
  try { return decodeURIComponent(withoutScheme); } catch { return withoutScheme; }
};

async function openLocalFile(file: { uri: string; path: string }): Promise<boolean> {
  const absolutePath = uriToAbsolutePath(file.uri);
  try {
    const { FileViewer } = await import("@capacitor/file-viewer");
    // @capacitor/file-viewer Android requires the real absolute filesystem path,
    // not the Capacitor cache-relative path and not a file:// URI.
    await FileViewer.openDocumentFromLocalPath({ path: absolutePath });
    return true;
  } catch (err) {
    console.warn("[openNativeDocument] FileViewer local failed", err);
  }

  try {
    const { FileOpener } = await import("@capacitor-community/file-opener");
    await FileOpener.open({ filePath: file.uri, contentType: "application/pdf", openWithDefault: true });
    return true;
  } catch (err) {
    console.warn("[openNativeDocument] FileOpener file:// failed", err);
  }

  try {
    const { FileOpener } = await import("@capacitor-community/file-opener");
    await FileOpener.open({ filePath: absolutePath, contentType: "application/pdf", openWithDefault: true });
    return true;
  } catch (err) {
    console.warn("[openNativeDocument] FileOpener absolute-path failed", err);
  }

  return false;
}

async function openRemoteUrl(url: string): Promise<boolean> {
  try {
    const { FileViewer } = await import("@capacitor/file-viewer");
    await FileViewer.openDocumentFromUrl({ url });
    return true;
  } catch (err) {
    console.warn("[openNativeDocument] FileViewer url failed", err);
    return false;
  }
}

async function fetchPdfBlob(url: string, signal?: AbortSignal): Promise<Blob> {
  const sourceUrl = sanitizeRemoteUrl(url);
  if (isResolvableStorageViewerUrl(sourceUrl)) return resolveStorageBytes(sourceUrl, signal);

  // Drive previews are the common DPP failure in APK WebView. Fetch the bytes
  // through our CORS/range-safe Edge Function, then open the local PDF natively.
  const downloadUrl = isGoogleDrive(sourceUrl)
    ? (googleDrivePdfProxyUrl(sourceUrl) || getDownloadUrl(sourceUrl))
    : getDownloadUrl(sourceUrl);

  const response = await fetch(downloadUrl, { credentials: "omit", signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") || "";
  if (/text\/html/i.test(contentType)) throw new Error("Source returned HTML, not PDF bytes");
  return response.blob();
}

/**
 * Native APK fallback for DPP/Notes PDFs.
 * Android WebView often shows a white screen for Drive/Docs/Notion iframes and
 * some hosted viewer pages; this opens the same file through Capacitor's native
 * document surfaces, then returns false so callers can fall back to pdf.js.
 */
export async function openNativeDocument(
  url: string,
  options: NativeDocumentOpenOptions = {},
): Promise<boolean> {
  if (!url) return false;
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return false;

  const sourceUrl = sanitizeRemoteUrl(url);
  const redirectHeavy = isRedirectHeavyUrl(sourceUrl);
  const shouldForceLocal = redirectHeavy || isResolvableStorageViewerUrl(sourceUrl) || isGoogleDrive(sourceUrl);

  const directUrl = isResolvableStorageViewerUrl(sourceUrl) ? null : getDownloadUrl(sourceUrl);
  if (!shouldForceLocal && directUrl && /^https?:\/\//i.test(directUrl)) {
    const openedRemote = await openRemoteUrl(directUrl);
    if (openedRemote) return true;
  }

  try {
    const blob = await fetchPdfBlob(sourceUrl);
    const file = await blobToCacheFile(blob, options.filename);
    const openedLocal = await openLocalFile(file);
    if (openedLocal) return true;
  } catch (err) {
    console.warn("[openNativeDocument] byte fallback failed", err);
  }

  if (options.preferBrowser || redirectHeavy) {
    try {
      await openExternal(sourceUrl);
      return true;
    } catch (err) {
      console.warn("[openNativeDocument] browser surface failed", err);
    }
  }

  return false;
}