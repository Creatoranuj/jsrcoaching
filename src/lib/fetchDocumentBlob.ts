/**
 * Single source of truth for "give me the bytes of this document".
 *
 * The reader (PdfViewer / FastPdfReader) already knows how to reach a
 * document: Supabase storage URIs are resolved to bytes, Drive/Docs/archive
 * links go through `pdf-proxy` (which carries the caller's access token in
 * the query string), and on the APK the WebView `fetch()` is bypassed with
 * CapacitorHttp because the app origin is `https://localhost`.
 *
 * "Add to My Library" used a bare `fetch(url)` instead, so any document the
 * reader could only reach through the proxy (or any cross-origin host that
 * refuses CORS) failed with `TypeError: Failed to fetch`. This helper gives
 * the import the same reach as the reader.
 *
 * Security: the access token is only ever attached by `renderablePdfUrl` /
 * `withAccessToken`, i.e. to our own `pdf-proxy` edge function — never to a
 * third-party host. Errors never echo the URL or the token.
 */
import { isResolvableStorageViewerUrl, resolveStorageBytes } from "./native/naveenStoragePdf";
import { fetchPdfViaNativeHttp } from "./nativePdfHttp";
import { fetchWithAuthRetry } from "./pdfProxyAuthRetry";
import {
  googleDrivePdfProxyUrl,
  isGoogleDrive,
  remotePdfProxyUrl,
  renderablePdfUrl,
  sanitizeRemoteUrl,
} from "./pdfViewerUrl";

/** Cross-origin http(s) URL that isn't already a pdf-proxy call. */
function isProxyableRemote(url: string): boolean {
  try {
    const u = new URL(url, window.location.href);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    if (u.origin === window.location.origin) return false;
    return !/\/functions\/v1\/pdf-proxy/.test(u.pathname);
  } catch {
    return false;
  }
}

/** Ordered list of URLs to try for a document, most-likely-to-work first. */
export function documentSourceCandidates(rawUrl: string): string[] {
  const url = sanitizeRemoteUrl(rawUrl);
  const out: string[] = [];
  const push = (candidate: string | null | undefined) => {
    if (!candidate) return;
    if (!out.includes(candidate)) out.push(candidate);
  };

  if (isGoogleDrive(url)) push(googleDrivePdfProxyUrl(url));
  const renderable = renderablePdfUrl(url);
  // Only push the renderable rewrite when it actually rewrites something —
  // otherwise it is just the direct URL, which must stay last (CORS-prone).
  if (renderable && renderable !== url) push(renderable);
  // Any other cross-origin host: relay through pdf-proxy. The proxy keeps its
  // own server-side allow-list (admin-managed `trusted_hosts` + the static
  // baseline), so offering it as a candidate can't widen what we can reach —
  // it only gives admin-approved hosts a CORS-safe path in the browser, which
  // the hardcoded CDN list in `renderablePdfUrl` never covered.
  if (isProxyableRemote(url)) push(remotePdfProxyUrl(url));
  // Direct URL last: it is the one that CORS-fails in the WebView, but it is
  // still the right answer for plain same-origin / CORS-open hosts.
  push(url);
  return out;
}

const isHtml = (blob: Blob) => /text\/html/i.test(blob.type || "");

async function fetchOne(url: string, signal?: AbortSignal): Promise<Blob> {
  // Native HTTP first on the APK — returns null on web and on transient
  // failures so we always fall through to the browser fetch.
  const nativeBlob = await fetchPdfViaNativeHttp(url, signal).catch((err) => {
    if ((err as { name?: string })?.name === "AbortError") throw err;
    return null;
  });
  if (nativeBlob && nativeBlob.size > 0 && !isHtml(nativeBlob)) return nativeBlob;

  const response = await fetchWithAuthRetry(url, { credentials: "omit", signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const blob = await response.blob();
  if (blob.size === 0) throw new Error("Empty response");
  if (isHtml(blob)) throw new Error("Source returned a web page, not a file");
  return blob;
}

/**
 * Fetch the bytes of a document, trying every source the reader would try.
 * Throws a user-readable Error when every candidate fails.
 */
export async function fetchDocumentBlob(rawUrl: string, signal?: AbortSignal): Promise<Blob> {
  const url = sanitizeRemoteUrl(rawUrl);
  if (isResolvableStorageViewerUrl(url)) return resolveStorageBytes(url, signal);

  let lastError: unknown = null;
  for (const candidate of documentSourceCandidates(url)) {
    try {
      return await fetchOne(candidate, signal);
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") throw err;
      lastError = err;
    }
  }

  const detail = (lastError as Error)?.message || "";
  const reason = /failed to fetch|network/i.test(detail)
    ? "Could not download this file — check your connection and try again."
    : `Could not download this file${detail ? ` (${detail})` : ""}.`;
  throw new Error(reason);
}
