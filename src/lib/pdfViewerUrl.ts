/** Shared PDF embed URL builder — single source of truth */

/** Self-hosted PDF.js viewer (same-origin) so we can drive scroll programmatically. */
const PDFJS_VIEWER = "/pdfjs/web/viewer.html";

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || "https://wegamscqtvqhxowlskfm.supabase.co";
// Use the canonical /functions/v1 path on the PRIMARY Supabase domain rather
// than the custom `*.functions.supabase.co` subdomain. Every working request in
// the app (REST, RPC, auth) already hits `<ref>.supabase.co` successfully; the
// custom functions subdomain was the one host that produced
// "Failed to fetch (…functions.supabase.co)" for pdf-proxy inside the pdf.js
// worker/iframe. Same edge function, same CORS, but a host origin that is
// already proven to work in every environment (preview, web, native WebView).
const FUNCTIONS_BASE = `${SUPABASE_URL.replace(/\/+$/, "")}/functions/v1`;

import { supabase } from "@/integrations/supabase/client";

/**
 * Cached Supabase access token. pdf-proxy is authenticated but pdf.js loads
 * URLs inside an <iframe>/worker that can't set request headers, so the JWT
 * rides in a `?token=` query param. We cache the token in module scope and
 * refresh it via `onAuthStateChange` so the URL builder stays synchronous
 * (called from render paths) without ever reading `localStorage` directly —
 * that read couples us to Supabase's internal storage key format and defeats
 * a future httpOnly/cookie migration.
 */
let cachedAccessToken: string | null = null;

// Prime the cache on module load.
void supabase.auth.getSession().then(({ data }) => {
  cachedAccessToken = data.session?.access_token ?? null;
});

// Keep the cache fresh on sign-in / sign-out / token refresh.
supabase.auth.onAuthStateChange((_event, session) => {
  cachedAccessToken = session?.access_token ?? null;
});

const currentAccessToken = (): string | null => cachedAccessToken;


/** Append the caller's access token to a pdf-proxy URL when signed in. */
const withAccessToken = (url: string): string => {
  const token = currentAccessToken();
  if (!token) return url;
  return `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
};

/** Google Drive file URL detection. Drive PDFs render via pdf-proxy, not preview iframe. */
export const isGoogleDrive = (url: string) => /drive\.google\.com/.test(url);

/** Google Docs document URL */
export const isGoogleDocs = (url: string) => /docs\.google\.com\/document/.test(url);

/** Google Sheets spreadsheet URL */
export const isGoogleSheets = (url: string) => /docs\.google\.com\/spreadsheets/.test(url);

/** Extract Google Sheets id */
export const extractSheetsId = (url: string): string | null => {
  const m = url.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return m?.[1] || null;
};


/**
 * Notion page URL detection. Matches both `*.notion.site/*` (published pages)
 * and `notion.so/*` (workspace URLs).
 *
 * IMPORTANT: Notion pages cannot be iframed from third-party origins.
 * Notion sets `x-frame-options: SAMEORIGIN` and `frame-ancestors 'self'`
 * — every public/published page returns these headers. Embedding in an iframe
 * produces a blank/blocked view. The correct UX is an "Open in Browser" card
 * (same pattern Substack/Medium/Twitter use). See PdfViewer's Notion branch.
 */
export const isNotion = (url: string): boolean => {
  if (!url) return false;
  const raw = url.trim();
  if (!raw) return false;
  const looksLikeNotionHost = /(?:^|\.)notion\.(?:site|so|com)(?:\/|$|[?#])/i.test(raw);

  try {
    const parsed = new URL(
      raw,
      /^https?:\/\//i.test(raw) ? undefined : looksLikeNotionHost ? `https://${raw}` : "https://x.invalid",
    );
    const host = parsed.hostname.toLowerCase();
    return (
      host === "notion.site" ||
      host.endsWith(".notion.site") ||
      host === "notion.so" ||
      host.endsWith(".notion.so") ||
      host === "notion.com" ||
      host.endsWith(".notion.com")
    );
  } catch {
    return looksLikeNotionHost;
  }
};

/**
 * Consolidated HTML-app URL detector. These URLs look like https:// but point
 * at HTML viewer apps (Notion, Drive `/view`, Docs) — they MUST be rendered
 * by the in-app viewer; the native OS document opener cannot parse them.
 */
export const isHtmlAppUrl = (url: string): boolean =>
  isNotion(url) || isGoogleDrive(url) || isGoogleDocs(url);

/**
 * Strip Notion tracking params (`?source=copy_link`, `pvs=4`, etc.) so the
 * external open URL is canonical.
 */
export const cleanNotionUrl = (url: string): string => {
  try {
    const u = new URL(url);
    ["source", "pvs", "p"].forEach((k) => u.searchParams.delete(k));
    return u.toString().replace(/\?$/, "");
  } catch {
    return url;
  }
};

/**
 * Extract the 32-char Notion page id from any notion.site / notion.so URL.
 * Notion appends the id (with or without hyphens) at the end of the slug:
 *   /Top-Tools-Notion-3888ce5904b0800ea8a8d485918c83b7
 *   /Top-Tools-3888ce59-04b0-800e-a8a8-d485918c83b7
 */
export const extractNotionPageId = (url: string): string | null => {
  const normalize = (value: string | null | undefined) => {
    if (!value) return null;
    const m = value.match(/[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    return m?.[0]?.replace(/-/g, "").toLowerCase() ?? null;
  };

  try {
    const parsed = new URL(url, /^https?:\/\//i.test(url) ? undefined : "https://notion.so");
    const queryId = normalize(parsed.searchParams.get("p")) || normalize(parsed.hash);
    if (queryId) return queryId;
  } catch {
    // Fall through to raw string extraction.
  }

  const matches = decodeURIComponent(url).match(/[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi);
  const last = matches?.[matches.length - 1];
  return last?.replace(/-/g, "").toLowerCase() ?? null;
};

/** Notion-page JSON proxy (returns recordMap for react-notion-x). */
export const notionPageProxyUrl = (pageId: string): string =>
  `${FUNCTIONS_BASE}/notion-page?id=${encodeURIComponent(pageId)}`;

/** jsDelivr CDN URL (direct PDF hosting) */
export const isJsDelivrCdn = (url: string) => /cdn\.jsdelivr\.net/i.test(url);

/** GitHub raw / Azure Blob direct PDF hosting — usually needs CORS+Range proxy in Capacitor. */
export const isGithubRawCdn = (url: string) => /raw\.githubusercontent\.com/i.test(url);
export const isAzureBlobCdn = (url: string) => /\.blob\.core\.windows\.net/i.test(url);

/** GitHub Storages CDN viewer (already a viewer page) */
export const isGithubStoragesCdn = (url: string) =>
  /github-storages-cdn\.vercel\.app/i.test(url);

/** JSR COACHING Storage viewer (already a viewer page) */
export const isNaveenBharatStorage = (url: string) =>
  /storage-naveenbharat-recording\.vercel\.app/i.test(url);

export const hasPdfPath = (url: string): boolean => {
  try {
    return /\.pdf$/i.test(new URL(url).pathname);
  } catch {
    return /\.pdf(?:[?#]|$)/i.test(url);
  }
};

/** Extract Google Drive file ID */
export const extractDriveFileId = (url: string): string | null => {
  const m1 = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return m1?.[1] || m2?.[1] || null;
};

/**
 * Public Google Drive file → CORS-enabled PDF proxy for local PDF.js rendering.
 *
 * NOTE (2026-06): Drive preview iframes are a known blank-screen path on
 * mobile Firefox / Android WebView. Drive PDFs therefore use this single
 * proxied byte path for canvas rendering, autoscroll, and page restore.
 */
export const googleDrivePdfProxyUrl = (url: string): string | null => {
  const id = extractDriveFileId(url);
  if (!id) return null;
  return withAccessToken(`${FUNCTIONS_BASE}/pdf-proxy?kind=drive&id=${encodeURIComponent(id)}`);
};

/** CORS-safe proxy for trusted direct PDF CDNs that redirect/open web pages in Android WebView. */
export const remotePdfProxyUrl = (url: string): string =>
  withAccessToken(`${FUNCTIONS_BASE}/pdf-proxy?kind=url&url=${encodeURIComponent(url)}`);

/** archive.org item page (`/details/<id>`) or direct download link. */
export const isArchiveOrg = (url: string) => /(^|\/\/|\.)archive\.org(\/|$)/i.test(url);

/** Extract the archive.org item identifier from a `/details/<id>` URL. */
export const extractArchiveId = (url: string): string | null => {
  const m = url.match(/archive\.org\/(?:details|download)\/([^/?#]+)/i);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
};

/**
 * archive.org item → pdf-proxy `kind=archive`, which resolves the item's
 * first PDF file through the archive metadata API and streams the bytes.
 */
export const archiveOrgPdfProxyUrl = (url: string): string | null => {
  const id = extractArchiveId(url);
  if (!id) return null;
  return withAccessToken(
    `${FUNCTIONS_BASE}/pdf-proxy?kind=archive&id=${encodeURIComponent(id)}&url=${encodeURIComponent(url)}`,
  );
};

/**
 * Google Docs / Sheets / Slides → their built-in PDF export endpoint.
 * The `/preview` iframe is blocked in Android WebView and mobile Firefox, so
 * we stream the exported PDF bytes through pdf-proxy instead.
 */
export const googleExportPdfUrl = (url: string): string | null => {
  const m = url.match(
    /docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_-]+)/,
  );
  if (!m) return null;
  const [, kind, id] = m;
  const query =
    kind === "spreadsheets"
      ? "format=pdf&portrait=false&size=A4&sheetnames=false&printtitle=false&gridlines=false"
      : "format=pdf";
  return `https://docs.google.com/${kind}/d/${id}/export?${query}`;
};

/** Proxied, renderable PDF bytes for a Google Docs/Sheets/Slides link. */
export const googleDocsPdfProxyUrl = (url: string): string | null => {
  const exportUrl = googleExportPdfUrl(url);
  return exportUrl ? remotePdfProxyUrl(exportUrl) : null;
};

/**
 * Convert remote PDFs into a renderable source.
 * Drive URLs are passed through here; PdfViewer detects Drive and replaces
 * them with googleDrivePdfProxyUrl() before FastPdfReader mounts.
 */
export const renderablePdfUrl = (rawUrl: string): string => {
  const url = sanitizeRemoteUrl(rawUrl);
  const gdoc = googleDocsPdfProxyUrl(url);
  if (gdoc) return gdoc;
  if (isArchiveOrg(url) && !hasPdfPath(url)) {
    const archive = archiveOrgPdfProxyUrl(url);
    if (archive) return archive;
  }
  if (
    isJsDelivrCdn(url) ||
    isGithubRawCdn(url) ||
    isAzureBlobCdn(url) ||
    isArchiveOrg(url) ||
    ((isGithubStoragesCdn(url) || isNaveenBharatStorage(url)) && hasPdfPath(url))
  ) return remotePdfProxyUrl(url);
  return url;
};


/** Extract Google Docs document ID */
export const extractDocsId = (url: string): string | null => {
  const m = url.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
  return m?.[1] || null;
};

/** Build PDF.js CDN viewer URL (fast, client-side rendering) */
export const pdfJsViewerUrl = (fileUrl: string): string =>
  `${PDFJS_VIEWER}?file=${encodeURIComponent(fileUrl)}#toolbar=0&navpanes=0&pagemode=none`;

/** Google Docs viewer fallback for external PDFs that block CORS */
export const googleDocsViewerUrl = (fileUrl: string): string =>
  `https://docs.google.com/gview?url=${encodeURIComponent(fileUrl)}&embedded=true`;

/**
 * Detect any remote URL (used to gate routing through /pdfjs viewer).
 * Previously these routed to Google `gview`, which has NO autoscroll bridge
 * — silently failing with "Save this file to My Library to enable it".
 */
const isExternalPdf = (url: string): boolean => {
  try {
    const u = new URL(url);
    return !!u.hostname;
  } catch {
    return false;
  }
};

/**
 * Resolve the best embed URL for any document URL.
 * Returns { embedUrl, openUrl, isDrive }
 */
/**
 * Normalize malformed remote URLs. The CMS sometimes stores PDF URLs with
 * literal spaces (e.g. "…/Suffer English /Day 2 _Re NEET (1).pdf"). Browsers'
 * `fetch`, PDF.js, and our own `pdf-proxy` edge function all reject those as
 * malformed → reader shows a blank screen. Encoding raw whitespace to %20
 * fixes the load without touching already-encoded paths.
 */
export const sanitizeRemoteUrl = (url: string): string => {
  if (!url) return url;
  if (/^(blob:|data:|file:|capacitor:|ionic:)/i.test(url)) return url;
  if (!/[\s]/.test(url)) return url;
  return url.replace(/ /g, "%20").replace(/\t/g, "%09");
};

export function resolveEmbedUrl(rawUrl: string): {
  embedUrl: string;
  openUrl: string;
  isDrive: boolean;
} {
  const url = sanitizeRemoteUrl(rawUrl);
  // Local-origin URLs (blob:, data:, file:, capacitor://, ionic://) can't be
  // loaded by the remote PDF.js viewer (cross-origin). Browsers + Capacitor
  // WebView render these natively in an <iframe>, so embed directly.
  if (/^(blob:|data:|file:|capacitor:|ionic:)/i.test(url)) {
    return { embedUrl: url, openUrl: url, isDrive: false };
  }

  // Google Drive → ALWAYS render through pdf-proxy + self-hosted PDF.js viewer.
  // Why: Drive's `/preview` iframe is unreliable in mobile browsers (Firefox,
  // Android WebView) due to X-Frame-Options / 3rd-party-cookie restrictions
  // and for files whose share permissions block embedding — the iframe shows
  // a blank screen or a "You need access" page. Routing through pdf-proxy
  // streams the raw bytes and renders them in pdf.js inside the app, which
  // works for both web and Capacitor APK. `openUrl` still points at Drive
  // so external-open keeps working.
  if (isGoogleDrive(url)) {
    const fileId = extractDriveFileId(url);
    if (fileId) {
      const proxied = googleDrivePdfProxyUrl(url);
      if (proxied) {
        return {
          embedUrl: pdfJsViewerUrl(proxied),
          openUrl: `https://drive.google.com/file/d/${fileId}/view`,
          isDrive: true,
        };
      }
      return {
        embedUrl: `https://drive.google.com/file/d/${fileId}/preview`,
        openUrl: `https://drive.google.com/file/d/${fileId}/view`,
        isDrive: true,
      };
    }
  }


  // Google Docs / Sheets / Slides → export the document as PDF bytes and
  // stream them through pdf-proxy into the self-hosted pdf.js viewer.
  // The `/preview` iframe is blocked in Android WebView and mobile Firefox
  // (X-Frame-Options / 3rd-party cookies) and has no autoscroll bridge.
  if (isGoogleDocs(url) || isGoogleSheets(url) || /docs\.google\.com\/presentation/.test(url)) {
    const proxied = googleDocsPdfProxyUrl(url);
    if (proxied) {
      const docId = url.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1];
      const kind = url.match(/docs\.google\.com\/(document|spreadsheets|presentation)/)?.[1];
      return {
        embedUrl: pdfJsViewerUrl(proxied),
        openUrl: docId && kind ? `https://docs.google.com/${kind}/d/${docId}/edit` : url,
        isDrive: false,
      };
    }
  }

  // archive.org item page → resolve the item's PDF through pdf-proxy.
  if (isArchiveOrg(url)) {
    const proxied = hasPdfPath(url) ? remotePdfProxyUrl(url) : archiveOrgPdfProxyUrl(url);
    if (proxied) {
      return { embedUrl: pdfJsViewerUrl(proxied), openUrl: url, isDrive: false };
    }
  }



  // Notion page → CANNOT be iframed (x-frame-options: SAMEORIGIN).
  // We hand the URL back as both embed and open; PdfViewer renders a
  // dedicated "Open in Notion" card instead of trying to embed.
  if (isNotion(url)) {
    const clean = cleanNotionUrl(url);
    return { embedUrl: clean, openUrl: clean, isDrive: false };
  }

  // Custom viewer pages — embed directly. Direct `.pdf` URLs on these hosts are
  // NOT viewer pages; they go through pdf-proxy + PDF.js so Android WebView does
  // not stall on missing CORS/Range headers.
  if ((isGithubStoragesCdn(url) || isNaveenBharatStorage(url)) && !hasPdfPath(url)) {
    return { embedUrl: url, openUrl: url, isDrive: false };
  }

  // External PDFs → self-hosted PDF.js viewer (has nb-bridge.js for autoscroll).
  // gview was removed: it broke autoscroll and stalled 5–15 s on first paint.
  if (isExternalPdf(url)) {
    const safeUrl = renderablePdfUrl(url);
    return {
      embedUrl: pdfJsViewerUrl(safeUrl),
      openUrl: safeUrl,
      isDrive: false,
    };
  }


  // Everything else (jsDelivr, Supabase, generic PDFs) → PDF.js CDN viewer.
  // (Was incorrectly returning gview here, which caused 5–15s "Loading PDF…"
  // stalls. PDF.js renders client-side and starts streaming pages immediately.)
  return {
    embedUrl: pdfJsViewerUrl(url),
    openUrl: url,
    isDrive: false,
  };
}
