// Detect material file type from a URL/filename.
// Used by Admin Library upload to auto-classify any pasted link.

export type MaterialFileType =
  | "PDF" | "DOC" | "DOCX" | "XLSX" | "PPT"
  | "NOTES" | "DPP" | "IMAGE" | "VIDEO" | "MD" | "LINK";

const hostMatches = (hostname: string, domain: string): boolean =>
  hostname === domain || hostname.endsWith(`.${domain}`);

/**
 * URL patterns that are known HTML/app pages, not raw PDF bytes.
 * These must never be sent to pdf.js because Android WebView then shows a
 * blank reader and pdf.js reports InvalidPDF / WorkerFailed noise.
 */
export function isKnownNonPdfWebUrl(url: string): boolean {
  if (!url) return false;
  const raw = url.trim();
  if (!raw) return false;
  const lower = raw.toLowerCase();

  // Our own proxy/edge-function URLs carry the original document link in a
  // query param (`?kind=url&url=https%3A%2F%2Fdocs.google.com%2F...`). The
  // substring checks below would see "docs.google.com" inside that encoded
  // param and wrongly flag the proxied PDF as a web page — that produced the
  // "This attachment is a web page, not a PDF." banner on Google Sheets
  // lessons even though the proxy returned valid `%PDF-` bytes.
  if (/\/functions\/v1\//i.test(lower) || /\/pdf-proxy(\?|$|\/)/i.test(lower)) return false;

  // Google Drive `/file/d/{id}/...`, `open?id=...`, and `uc?id=...` links
  // point at an actual file the in-app reader can render (via the /preview
  // iframe or direct-download pre-materialization). Do NOT classify these
  // as non-PDF pages, otherwise the lesson view bounces them to the
  // external browser with "This link isn't a PDF/Notion page."
  const isDriveFileShare =
    /drive\.google\.com\/file\/d\//i.test(lower) ||
    /drive\.google\.com\/open\?[^#]*id=/i.test(lower) ||
    /drive\.google\.com\/uc\?[^#]*id=/i.test(lower);
  if (isDriveFileShare) return false;

  // Google Docs / Sheets / Slides documents are exported to PDF by pdf-proxy
  // and rendered in-app, so they are NOT "web page only" links. Docs folders,
  // search pages and other docs.google.com surfaces still are.
  const isGoogleDocument =
    /docs\.google\.com\/(document|spreadsheets|presentation)\/d\/[a-zA-Z0-9_-]+/i.test(lower);
  if (isGoogleDocument) return false;

  const hasKnownHostText =
    lower.includes("docs.google.com") ||
    lower.includes("drive.google.com") ||
    lower.includes("dropbox.com/scl/");

  try {
    const parsed = new URL(raw, "https://x.invalid");
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    if (hostMatches(host, "docs.google.com")) return true;
    // Drive folders / search / my-drive pages stay HTML.
    if (hostMatches(host, "drive.google.com")) return true;
    if (hostMatches(host, "dropbox.com") && path.startsWith("/scl/")) return true;
  } catch {
    if (hasKnownHostText) return true;
  }

  return hasKnownHostText;
}


/**
 * Best-effort URL classifier for "is this a PDF we can hand to pdf.js?".
 *
 * Returns true for: `.pdf` extensions (including signed URLs with `?...`),
 * Supabase storage paths/signed URLs, blob:/data:application/pdf, and the
 * common CDN paths that always serve PDF bytes (Backblaze/B2, S3 keyed by
 * `.pdf`, custom proxy `/pdf-proxy?`).
 *
 * Returns false for HTML "viewer" pages (Notion, Google Docs/Drive view links,
 * Dropbox preview, generic web articles) — those must NOT be fed to pdf.js.
 * Callers should open them in the in-app browser instead.
 */
export function isLikelyPdfUrl(url: string): boolean {
  if (!url) return false;
  const u = url.trim();
  if (!u) return false;
  if (/^data:application\/pdf/i.test(u)) return true;
  if (/^blob:/i.test(u)) return true;
  if (/^storage:\/\//i.test(u)) return true;
  // Known HTML hosts — explicit deny so we never optimistically try pdf.js.
  if (isKnownNonPdfWebUrl(u)) return false;
  // path/extension check that survives ?signed=... and #page=2
  let pathname = u;
  try {
    pathname = new URL(u, "http://x").pathname;
  } catch { /* keep raw */ }
  if (/\.pdf($|[?#])/i.test(pathname) || /\.pdf$/i.test(pathname)) return true;
  // Supabase storage object endpoint usually serves the underlying content-type.
  if (/\/storage\/v1\/object\/(public|sign)\//i.test(u)) return true;
  // pdf-proxy edge function we ship.
  if (/\/pdf-proxy(\?|$)/i.test(u)) return true;
  // Google Docs/Sheets/Slides documents — exported to PDF by pdf-proxy.
  if (/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/[a-zA-Z0-9_-]+/i.test(u)) return true;
  // archive.org items resolve to a PDF file through pdf-proxy.
  if (/archive\.org\/(details|download)\//i.test(u)) return true;
  return false;

}

export function detectFileType(url: string): MaterialFileType {
  const u = url.trim().toLowerCase();
  if (!u) return "LINK";

  // Extension match (most reliable)
  const extMatch = u.match(/\.([a-z0-9]{2,5})(?:\?|#|$)/);
  const ext = extMatch?.[1];
  if (ext) {
    if (ext === "pdf") return "PDF";
    if (ext === "doc") return "DOC";
    if (ext === "docx") return "DOCX";
    if (["xls", "xlsx", "csv"].includes(ext)) return "XLSX";
    if (["ppt", "pptx"].includes(ext)) return "PPT";
    if (["md", "markdown"].includes(ext)) return "MD";
    if (["jpg", "jpeg", "png", "webp", "gif", "svg", "heic"].includes(ext)) return "IMAGE";
    if (["mp4", "mov", "avi", "mkv", "webm"].includes(ext)) return "VIDEO";
  }

  // Domain hints (Google Drive / Docs / etc. usually have no extension)
  if (u.includes("docs.google.com/spreadsheets")) return "XLSX";
  if (u.includes("docs.google.com/presentation")) return "PPT";
  if (u.includes("docs.google.com/document")) return "DOCX";
  if (u.includes("youtube.com") || u.includes("youtu.be") || u.includes("vimeo.com")) return "VIDEO";
  if (u.includes("drive.google.com")) return "PDF"; // best guess for Drive shares

  return "LINK";
}

export const fileTypeOptions: { value: MaterialFileType; label: string; icon: string }[] = [
  { value: "PDF",   label: "PDF",          icon: "📄" },
  { value: "DOC",   label: "Doc (.doc)",   icon: "📝" },
  { value: "DOCX",  label: "Word (.docx)", icon: "📝" },
  { value: "XLSX",  label: "Spreadsheet",  icon: "📊" },
  { value: "PPT",   label: "Presentation", icon: "📽️" },
  { value: "NOTES", label: "Notes",        icon: "🗒️" },
  { value: "DPP",   label: "DPP",          icon: "📋" },
  { value: "IMAGE", label: "Image",        icon: "🖼️" },
  { value: "VIDEO", label: "Video",        icon: "🎬" },
  { value: "LINK",  label: "Other Link",   icon: "🔗" },
];
