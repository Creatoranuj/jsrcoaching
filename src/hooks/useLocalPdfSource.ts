import { useEffect, useState } from "react";
import { addBreadcrumb, captureException, redactUrl } from "../lib/sentry";
import { isResolvableStorageViewerUrl, resolveStorageBytes } from "@/lib/native/naveenStoragePdf";
import { fileDB as personalFileDB } from "../lib/personalLibraryDB";
import { downloadFileDB, getDownload } from "../lib/indexedDB";
import { getDownloadUrl } from "../utils/fileUtils";
import { fetchPdfViaNativeHttp } from "../lib/nativePdfHttp";
import { loadCore } from "../lib/native/core";
import { loadFilesystem } from "../lib/native/filesystem";
import { fetchWithAuthRetry } from "../lib/pdfProxyAuthRetry";


/**
 * Normalises any PDF URL into something react-pdf / pdf.js can load reliably.
 *
 * - Remote http(s) URLs are passed through untouched (pdf.js streams them with
 *   range requests — see FastPdfReader).
 * - Local URLs (capacitor://, file://, ionic://, http://localhost/_capacitor_file_…)
 *   cannot be range-requested by the pdf.js worker, so we read the bytes once and
 *   expose a same-origin `blob:` URL instead. This is what makes autoscroll +
 *   canvas rendering work for offline Library / Downloads / Attachment PDFs.
 *
 * Returns the resolved source URL plus loading/error state.
 */
export type LocalPdfState = {
  src: string | null;
  data: Uint8Array | null;
  loading: boolean;
  error: string | null;
  /** true when the source had to be materialised into a blob (local file). */
  isLocal: boolean;
};

const LOCAL_RE = /^(capacitor:|ionic:|file:|blob:|data:|web-indexeddb:|nb-personal-library:|nb-download:)/i;
const isLocalHttp = (u: string) =>
  /^https?:\/\/localhost\//i.test(u) || /_capacitor_file_/i.test(u);
const webDownloadId = (u: string) => u.match(/^web-indexeddb:(\d+)$/i)?.[1] ?? null;
const nbDownloadId = (u: string) => u.match(/^nb-download:(\d+)$/i)?.[1] ?? null;
const personalLibraryId = (u: string) => u.match(/^nb-personal-library:([^?#]+)$/i)?.[1] ?? null;
const FETCH_TIMEOUT_MS = 25000;
// Kept for API compatibility with the abort/timeout branches below; no longer
// used to preload whole remote PDFs on native (pdf.js streams them directly).
const NATIVE_REMOTE_FETCH_TIMEOUT_MS = 25000;

async function fetchBlobWithTimeout(url: string, signal: AbortSignal): Promise<Blob> {
  const nativeBlob = await fetchPdfViaNativeHttp(url, signal);
  if (nativeBlob) return nativeBlob;

  // First attempt — normal cached fetch. For pdf-proxy URLs, a 401 triggers
  // a one-shot session refresh + retry (see pdfProxyAuthRetry.ts).
  let res = await fetchWithAuthRetry(url, { credentials: "omit", signal });
  // Signed-URL expiry / transient gateway hiccup: one retry with cache bypass.
  // 401/403/410 = expired signature; 408/425/429/5xx = transient. Skip 404
  // (real missing object — retry won't help and just delays the error toast).
  if (!res.ok && res.status !== 404 && /^(?:401|403|408|410|425|429|5\d\d)$/.test(String(res.status))) {
    addBreadcrumb("pdf", "fetch:retry", { status: res.status, url: redactUrl(url, 80) });
    const sep = url.includes("?") ? "&" : "?";
    res = await fetchWithAuthRetry(`${url}${sep}_nbretry=${Date.now()}`, { credentials: "omit", signal, cache: "reload" });
  }
  if (!res.ok) throw new Error(`FileNotFound: HTTP ${res.status}`);
  return res.blob();
}

/**
 * Read a Capacitor-local file (capacitor://, file://, or the WebViewLocalServer
 * https://localhost/_capacitor_file_/<path> form) DIRECTLY via the Filesystem
 * plugin instead of round-tripping through fetch(). This avoids a class of
 * release-APK bugs where WebViewLocalServer returns empty/HTML responses for
 * large binary files, making offline PDFs fail to open.
 *
 * Returns null on web (or when the plugin isn't available) so the caller can
 * fall back to the normal fetch path.
 */
/** Hard ceiling for JS-side base64 materialisation of local files. Above
 *  this, decoding the base64 payload from the Filesystem bridge into a JS
 *  string + Uint8Array + Blob peaks at ~5× the file size in heap, which
 *  OOM-kills the Android WebView on 2–4 GB devices. Instead we fall back
 *  to a `capacitor://` http URL and let pdf.js stream pages on demand. */
const NATIVE_INLINE_READ_MAX_BYTES = 40 * 1024 * 1024;

function absPathFromLocalUrl(url: string): string | null {
  if (/^file:\/\//i.test(url)) return decodeURIComponent(url.replace(/^file:\/\//i, ""));
  const m = url.match(/_capacitor_file_(.*)$/i);
  if (m) return decodeURIComponent(m[1]);
  return null;
}

async function readNativeFileAsBlob(url: string): Promise<Blob | null> {
  try {
    const { Capacitor } = await loadCore();
    if (!Capacitor.isNativePlatform()) return null;
    const { plugin: Filesystem } = await loadFilesystem();
    const absPath = absPathFromLocalUrl(url);
    if (!absPath) return null;

    // Pre-flight size probe. Large files must NOT be inlined through the
    // base64 bridge — decode+copy peak ~5× file size and OOMs the WebView.
    try {
      const stat = await Filesystem.stat({ path: absPath });
      if (typeof stat?.size === "number" && stat.size > NATIVE_INLINE_READ_MAX_BYTES) {
        addBreadcrumb("pdf", "readNativeFile:skip-large", { size: stat.size });
        return null; // Caller falls back to convertFileSrc streaming URL.
      }
    } catch { /* stat is best-effort; if it fails we still try the read */ }

    const res = await Filesystem.readFile({ path: absPath });
    const data = res.data;
    if (typeof data === "string") {
      // Decode via the browser's native base64 decoder (data: URL fetch)
      // instead of a char-by-char atob loop — keeps the JS heap flat.
      return await fetch(`data:application/pdf;base64,${data}`).then((r) => r.blob());
    }
    if (data instanceof Blob) return data;
    return null;
  } catch (err) {
    addBreadcrumb("pdf", "readNativeFile:fail", { msg: (err as Error)?.message });
    return null;
  }
}

/**
 * Read a downloaded file (identified by IndexedDB id) directly into a Blob,
 * OR return a range-streamable capacitor URL when the file is too large to
 * safely materialise through the base64 bridge.
 *
 * OOM background: `Filesystem.readFile` returns base64 which peaks at ~5×
 * file size in JS heap during decode. On 2-4 GB Android devices a 40+ MB
 * download reliably crashed the WebView with
 *   "Failed to allocate a 180404920 byte allocation with 100663296 free bytes"
 * — surfaced to Sentry as `readNbDownload:fail`. We now:
 *   1. Use rec.size_bytes (or Filesystem.stat) to reject inline reads > 40 MB.
 *   2. Fall back to Capacitor.convertFileSrc so pdf.js can range-stream pages
 *      from disk instead of loading the whole PDF into JS memory.
 * Web IndexedDB tier stays blob-based (bytes already live in memory).
 */
type NbDownloadSource = { blob?: Blob; streamUrl?: string };

async function resolveNbDownloadSource(id: number): Promise<NbDownloadSource | null> {
  try {
    const rec = await getDownload(id);
    if (!rec) return null;
    // Web IndexedDB tier.
    if (rec.local_path?.startsWith("web-indexeddb:")) {
      const row = await downloadFileDB.get(id);
      return row?.blob ? { blob: row.blob } : null;
    }
    // Native filesystem tier.
    if (rec.local_path) {
      const { Capacitor } = await loadCore();
      if (!Capacitor.isNativePlatform()) return null;
      const { plugin: Filesystem, Directory } = await loadFilesystem();
      const parsed = rec.local_path.match(/^(Documents|Data|External|ExternalStorage|Cache|Library):(.+)$/);
      const dirName = parsed?.[1] ?? "Data";
      const filePath = parsed?.[2] ?? rec.local_path;
      const directory =
        (Directory as unknown as Record<string, unknown>)[dirName] ??
        Directory.Data;

      // Pre-flight size probe. Prefer the recorded size; fall back to stat.
      let size = rec.size_bytes ?? 0;
      if (!size) {
        try {
          const stat = await Filesystem.stat({ path: filePath, directory: directory as never });
          if (typeof stat?.size === "number") size = stat.size;
        } catch { /* stat is best-effort */ }
      }
      if (size > NATIVE_INLINE_READ_MAX_BYTES) {
        // Large file: resolve the absolute URI and hand pdf.js a streamable URL.
        try {
          const uri = await Filesystem.getUri({ path: filePath, directory: directory as never });
          const conv = (Capacitor as unknown as { convertFileSrc?: (p: string) => string }).convertFileSrc;
          const abs = uri?.uri?.replace(/^file:\/\//i, "") ?? "";
          if (conv && abs) {
            addBreadcrumb("pdf", "readNbDownload:stream-large", { id, size });
            return { streamUrl: conv(abs) };
          }
        } catch (e) {
          addBreadcrumb("pdf", "readNbDownload:stream-fail", { id, msg: (e as Error)?.message });
        }
        return null;
      }

      const res = await Filesystem.readFile({ path: filePath, directory: directory as never });
      const data = (res as { data: string | Blob }).data;
      if (typeof data === "string") {
        return { blob: await fetch(`data:application/pdf;base64,${data}`).then((r) => r.blob()) };
      }
      if (data instanceof Blob) return { blob: data };
    }
    return null;
  } catch (err) {
    addBreadcrumb("pdf", "readNbDownload:fail", { id, msg: (err as Error)?.message });
    return null;
  }
}

/** Streamable WebView URL for a local absolute path — the large-file
 *  fallback so pdf.js can range-request pages instead of loading the whole
 *  file into JS memory. Returns null on web or if Capacitor is missing. */
async function toCapacitorHttpUrl(url: string): Promise<string | null> {
  try {
    const { Capacitor } = await loadCore();
    if (!Capacitor?.isNativePlatform?.()) return null;
    const conv = (Capacitor as unknown as { convertFileSrc?: (p: string) => string }).convertFileSrc;
    const absPath = absPathFromLocalUrl(url);
    if (!absPath || !conv) return null;
    return conv(absPath);
  } catch { return null; }
}

export function isLocalPdfUrl(url: string): boolean {
  return LOCAL_RE.test(url) || isLocalHttp(url);
}

export function useLocalPdfSource(url: string, retryNonce = 0): LocalPdfState {
  const initiallyMaterialized = isLocalPdfUrl(url) || isResolvableStorageViewerUrl(url);
  const [state, setState] = useState<LocalPdfState>({
    src: initiallyMaterialized ? null : url,
    data: null,
    loading: initiallyMaterialized,
    error: null,
    isLocal: initiallyMaterialized,
  });

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    let timedOut = false;
    let timeout: number | null = null;

    if (!url) {
      setState({ src: null, data: null, loading: false, error: "No file", isLocal: false });
      return;
    }

    const isLocal = isLocalPdfUrl(url);
    const isResolvableRemote = !isLocal && isResolvableStorageViewerUrl(url);
    // On Capacitor native (`https://localhost` WebView origin) pdf.js worker
    // Range requests against cross-origin hosts are silently CORS-blocked for
    // any host that doesn't echo `Access-Control-Allow-Headers: Range` — the
    // worker stalls with no `onLoadError`, leaving users on a blank reader.
    // Detect native + remote http(s) here and pre-fetch bytes on the main
    // thread (a normal page fetch, not a Range worker fetch). Falls back to
    // passthrough on failure so the existing iframe-viewer chain still runs.
    const isRemoteHttp =
      !isLocal && /^https?:\/\//i.test(url) && !/^https?:\/\/localhost\b/i.test(url);
    const isDrivePdfProxy = /\/pdf-proxy\?kind=drive|[?&]kind=drive/i.test(url);
    let isNativePlatform = false;
    try {
      isNativePlatform = !!(
        globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }
      ).Capacitor?.isNativePlatform?.();
    } catch { /* web */ }
    // PERF: Previously on Android APK we preloaded EVERY remote http(s) PDF
    // through CapacitorHttp before pdf.js could render page 1 — a 40 MB Notes
    // PDF over 4G took ~90s of blank spinner. pdf.js Range streaming works
    // fine through pdf-proxy (Drive path already relies on it), so we now let
    // ALL remote http URLs stream directly on native too. Only local files
    // and resolvable Supabase-storage viewer URLs still need materialisation.
    const shouldMaterialize = isLocal || isResolvableRemote;

    if (!shouldMaterialize) {
      setState({ src: url, data: null, loading: false, error: null, isLocal: false });
      return;
    }

    timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, isNativePlatform && isRemoteHttp ? NATIVE_REMOTE_FETCH_TIMEOUT_MS : FETCH_TIMEOUT_MS);

    // blob:/data: URLs from the personal library are same-origin object URLs.
    // Materialise them to bytes before handing them to pdf.js; mobile Firefox /
    // Android WebView can fail when the worker tries to re-fetch blob URLs by
    // URL, which surfaces as "Could not load this PDF" even though the Blob is valid.

    setState({ src: null, data: null, loading: true, error: null, isLocal: true });
    addBreadcrumb("pdf", "materialize-local", { url: redactUrl(url, 80) });

    (async () => {
      try {
        const dlId = webDownloadId(url);
        const nbId = nbDownloadId(url);
        const plId = personalLibraryId(url);
        let blob: Blob | undefined;
        if (nbId) {
          const nbSrc = await resolveNbDownloadSource(Number(nbId));
          // Large native downloads: hand pdf.js a range-streamable URL and
          // stop — do NOT try to materialise bytes (OOM on low-RAM Android).
          if (nbSrc?.streamUrl) {
            if (!alive) return;
            setState({ src: nbSrc.streamUrl, data: null, loading: false, error: null, isLocal: false });
            return;
          }
          blob = nbSrc?.blob;
          if (!blob) {
            const rec = await getDownload(Number(nbId));
            // Never re-fetch a `data:` URL fallback — the payload is huge,
            // leaks into breadcrumbs, and reliably fails with
            // "Failed to fetch ()" on Android WebView.
            const canFetch =
              !!rec?.url && !/^data:/i.test(rec.url) &&
              typeof navigator !== "undefined" && navigator.onLine !== false;
            if (canFetch) {
              blob = await fetchBlobWithTimeout(rec!.url, controller.signal);
            } else {
              throw new Error("This file isn't available offline. Re-download it while you're online.");
            }
          }
        } else if (dlId) {
          blob = (await downloadFileDB.get(Number(dlId)))?.blob;
          if (!blob) {
            // Bytes missing locally — only attempt remote fetch when online.
            if (typeof navigator !== "undefined" && navigator.onLine === false) {
              throw new Error("This file isn't available offline. Re-download it while you're online.");
            }
            const rec = await getDownload(Number(dlId));
            if (rec?.url) {
              blob = await fetchBlobWithTimeout(rec.url, controller.signal);
            }
          }
        } else if (plId) {
          blob = (await personalFileDB.get(plId))?.blob;
          if (!blob) {
            throw new Error("This library file is no longer available on this device.");
          }
        } else if (isResolvableRemote) {
          blob = await resolveStorageBytes(url, controller.signal);
        } else {
          // For native local URLs, prefer reading bytes directly via the
          // Filesystem plugin (skips the WebViewLocalServer round-trip that
          // breaks in release APKs for large binary PDFs).
          if (isLocal) {
            const direct = await readNativeFileAsBlob(url);
            if (direct) {
              blob = direct;
            } else {
              // Large local file → hand pdf.js a range-streamable URL
              // instead of loading the whole PDF into JS memory.
              const streamUrl = await toCapacitorHttpUrl(url);
              if (streamUrl) {
                if (!alive) return;
                setState({ src: streamUrl, data: null, loading: false, error: null, isLocal: false });
                return;
              }
            }
          }
          if (!blob) {
            blob = await fetchBlobWithTimeout(url, controller.signal);
          }

        }
        if (!blob) throw new Error("FileNotFound: local PDF bytes missing");
        if (dlId) {
          try { await downloadFileDB.put(Number(dlId), blob); } catch { /* best-effort repair */ }
        }
        if (!alive) return;
        const ab = await blob.arrayBuffer();
        // Validate the payload is actually a PDF (starts with `%PDF-`).
        // pdf-proxy / signed-URL failures sometimes return 200 OK with an
        // HTML auth page — pdf.js then throws "Invalid PDF structure" with
        // no useful context. Detect early and surface a clean error.
        if (ab.byteLength < 5) {
          throw new Error("InvalidPdf: file is empty or truncated");
        }
        const head = new Uint8Array(ab, 0, 5);
        // %PDF- = 0x25 0x50 0x44 0x46 0x2D
        const isPdf = head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46 && head[4] === 0x2D;
        if (!isPdf) {
          throw new Error("InvalidPdf: response is not a PDF (server may have returned an error page)");
        }
        const data = new Uint8Array(ab);
        setState({ src: null, data, loading: false, error: null, isLocal: true });
        addBreadcrumb("pdf", "materialize-local:ok", { size: blob.size });
      } catch (err) {
        if (!alive) return;
        const errName = (err as { name?: string })?.name || "";
        const rawMsg = (err as Error)?.message || "";
        // AbortError fires whenever the user navigates away (cleanup aborts
        // the controller) OR the 18s timeout trips. Neither is a real error
        // — surfacing it as "Failed to load" + a captureException spammed
        // Sentry and showed a misleading red toast on chip-section reopen.
        // INVARIANT: `isIndexedLocal` must list EVERY pseudo-scheme handled by
        // this hook (web-indexeddb:, nb-personal-library:, nb-download:).
        // Missing one causes the error branch to hand pdf.js the raw pseudo-URL
        // as a fallback `src`, producing "Unexpected server response (0) while
        // retrieving PDF <scheme>:N". Add new schemes here AND in the second
        // check below.
        if (errName === "AbortError" || /aborted|AbortError/i.test(rawMsg)) {
          addBreadcrumb("pdf", "materialize-local:aborted", { url: redactUrl(url, 80) });
          const isIndexedLocal =
            !!webDownloadId(url) || !!personalLibraryId(url) || !!nbDownloadId(url);
          const nativeRemoteFallback = isNativePlatform && isRemoteHttp;
          // Timeout while materialising a large remote/native PDF is not a
          // navigation cleanup. Previously this returned without updating
          // state, leaving Notes/DPP/Library stuck on an infinite spinner in
          // the APK. Fall back to the stream/proxy reader path instead.
          if (timedOut && (isResolvableRemote || nativeRemoteFallback) && !isIndexedLocal) {
            if (isResolvableRemote) {
              // Storage viewer pages are HTML, not PDFs. Handing the raw URL
              // to pdf.js produces the misleading "Invalid PDF structure".
              setState({
                src: null,
                data: null,
                loading: false,
                error: "This document took too long to open. Tap Retry.",
                isLocal: true,
              });
            } else {
              setState({ src: url, data: null, loading: false, error: null, isLocal: false });
            }
          } else if (timedOut && isIndexedLocal) {
            setState({
              src: null,
              data: null,
              loading: false,
              error: "This file took too long to open. Re-download it while you're online.",
              isLocal: true,
            });
          }
          return;
        }
        captureException(err, { where: "useLocalPdfSource", url: redactUrl(url, 120) });
        const isIndexedLocal =
          !!webDownloadId(url) || !!personalLibraryId(url) || !!nbDownloadId(url);
        const isNetworkErr = /NetworkError|Failed to fetch|network/i.test(rawMsg);
        // Soft fallback for resolvable remote/local browser URLs AND native
        // remote http(s) URLs: pass through the original URL so pdf.js can
        // attempt a direct stream. IndexedDB virtual URLs are not real
        // fetchable URLs, so surface a clean error.
        const nativeRemoteFallback = isNativePlatform && isRemoteHttp;
        // NEVER pass a storage viewer URL through to pdf.js: that page is
        // HTML, so the real reason (auth / entitlement / upstream) would be
        // replaced by "Invalid PDF structure".
        if (!isResolvableRemote && (isLocal || nativeRemoteFallback) && !isIndexedLocal) {
          setState({ src: url, data: null, loading: false, error: null, isLocal: false });
        } else {
          const friendly = isIndexedLocal && isNetworkErr
            ? "This file isn't available offline. Re-download it while you're online."
            : rawMsg || "FileNotFound";
          setState({
            src: null,
            data: null,
            loading: false,
            error: friendly,
            isLocal: true,
          });
        }
      }

    })();

    return () => {
      alive = false;
      if (timeout) window.clearTimeout(timeout);
      controller.abort();
    };
    // `retryNonce` lets the reader re-run resolution in place (Retry button)
    // without a full page reload.
     
  }, [url, retryNonce]);

  return state;
}
