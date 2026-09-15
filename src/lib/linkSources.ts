/**
 * "Add from link" — source classification + local shelf persistence.
 *
 * Fully independent of the admin/content system: nothing here touches
 * Supabase tables. A pasted link is classified client-side, stored in
 * localStorage, and read through the same viewer stack the rest of the app
 * uses (pdf-proxy → pdf.js for remote PDFs, NotionPageRenderer for Notion).
 *
 * Two modes per link:
 *  - "Read online"  → streams, needs internet.
 *  - "Save offline" → downloads bytes into the Personal Library (works offline).
 */
import {
  isArchiveOrg,
  isGoogleDocs,
  isGoogleDrive,
  isNotion,
  sanitizeRemoteUrl,
} from "./pdfViewerUrl";
import { safeGetJSON, safeSetJSON } from "./storage";

export type LinkSource = "drive" | "docs" | "notion" | "archive" | "cdn" | "web";

export interface SavedLink {
  id: string;
  url: string;
  title: string;
  source: LinkSource;
  /** File-type hint handed to UniversalFileViewer. */
  kind: string;
  added_at: string;
  /** Personal-library item id once an offline copy exists. */
  offline_item_id?: string | null;
}

export const SOURCE_LABEL: Record<LinkSource, string> = {
  drive: "Google Drive",
  docs: "Google Docs",
  notion: "Notion",
  archive: "Archive.org",
  cdn: "CDN / direct file",
  web: "Web link",
};

const PDF_RE = /\.pdf(\?|#|$)/i;
const OFFICE_RE = /\.(docx?|pptx?|xlsx?|xlsm|csv)(\?|#|$)/i;
const MD_RE = /\.(md|markdown|txt)(\?|#|$)/i;
const IMG_RE = /\.(jpe?g|png|webp|gif|svg|heic|avif)(\?|#|$)/i;
const CDN_HOST_RE =
  /(cdn\.jsdelivr\.net|raw\.githubusercontent\.com|\.blob\.core\.windows\.net|cloudfront\.net|\.r2\.dev|storage\.googleapis\.com|\.supabase\.co|githubusercontent\.com|unpkg\.com)/i;

export function classifyLink(raw: string): LinkSource {
  const url = raw.trim();
  if (isNotion(url)) return "notion";
  if (isGoogleDocs(url)) return "docs";
  if (isGoogleDrive(url)) return "drive";
  if (isArchiveOrg(url)) return "archive";
  if (CDN_HOST_RE.test(url) || PDF_RE.test(url) || OFFICE_RE.test(url)) return "cdn";
  return "web";
}

/** File-type label understood by UniversalFileViewer.classify(). */
export function kindForLink(url: string, source: LinkSource): string {
  if (source === "notion" || source === "drive" || source === "docs") return "PDF";
  if (PDF_RE.test(url)) return "PDF";
  if (OFFICE_RE.test(url)) return url.match(OFFICE_RE)![1].toUpperCase();
  if (MD_RE.test(url)) return "MD";
  if (IMG_RE.test(url)) return "IMAGE";
  if (source === "archive") return "PDF";
  return "LINK";
}

/** Only links that resolve to real bytes can be stored for offline reading. */
export function canSaveOffline(url: string, source: LinkSource): boolean {
  if (source === "notion") return false;
  if (source === "drive" || source === "docs" || source === "archive") return true;
  return PDF_RE.test(url) || OFFICE_RE.test(url) || MD_RE.test(url) || IMG_RE.test(url);
}

export interface ParsedLink {
  url: string;
  source: LinkSource;
  kind: string;
  title: string;
  offlineCapable: boolean;
}

/** Validate + normalise a pasted link. Throws a user-facing error when bad. */
export function parseLink(raw: string, titleHint?: string): ParsedLink {
  let input = (raw || "").trim();
  if (!input) throw new Error("Paste a link first.");
  if (!/^https?:\/\//i.test(input)) {
    if (/^[\w.-]+\.[a-z]{2,}/i.test(input)) input = `https://${input}`;
    else throw new Error("That doesn't look like a valid link.");
  }
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error("That doesn't look like a valid link.");
  }
  if (!/^https?:$/.test(parsed.protocol)) throw new Error("Only http/https links are supported.");

  const url = sanitizeRemoteUrl(parsed.toString());
  const source = classifyLink(url);
  const kind = kindForLink(url, source);
  const guessed =
    decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || "")
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[-_]+/g, " ")
      .trim() || SOURCE_LABEL[source];
  return {
    url,
    source,
    kind,
    title: (titleHint || "").trim() || guessed,
    offlineCapable: canSaveOffline(url, source),
  };
}

/* ---------------------------------------------------------------- shelf */

const SHELF_KEY = "nb_pl_links";
const MAX_LINKS = 200;

export function listSavedLinks(): SavedLink[] {
  const rows = safeGetJSON<SavedLink[]>(SHELF_KEY, []);
  return Array.isArray(rows) ? rows : [];
}

export function saveLink(entry: Omit<SavedLink, "id" | "added_at">): SavedLink {
  const rows = listSavedLinks();
  const existing = rows.find((r) => r.url === entry.url);
  if (existing) return existing;
  const rec: SavedLink = {
    ...entry,
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    added_at: new Date().toISOString(),
  };
  safeSetJSON(SHELF_KEY, [rec, ...rows].slice(0, MAX_LINKS));
  return rec;
}

export function removeLink(id: string) {
  safeSetJSON(
    SHELF_KEY,
    listSavedLinks().filter((r) => r.id !== id),
  );
}

export function renameLink(id: string, title: string) {
  safeSetJSON(
    SHELF_KEY,
    listSavedLinks().map((r) => (r.id === id ? { ...r, title } : r)),
  );
}

/** Remember (or clear) the offline copy created for a link. */
export function markLinkOffline(id: string, itemId: string | null) {
  safeSetJSON(
    SHELF_KEY,
    listSavedLinks().map((r) => (r.id === id ? { ...r, offline_item_id: itemId } : r)),
  );
}

/**
 * Hosts our `pdf-proxy` edge function will relay. Mirrors the allow-list in
 * `supabase/functions/pdf-proxy/index.ts` — keep both in sync.
 *
 * Anything outside this list is fetched directly, which works inside the
 * Android app (native HTTP) but fails in a browser when the host sends no
 * CORS headers. We surface that honestly instead of promising "any link".
 */
const RELAYABLE_HOSTS = [
  /(^|\.)cdn\.jsdelivr\.net$/i,
  /(^|\.)raw\.githubusercontent\.com$/i,
  /(^|\.)blob\.core\.windows\.net$/i,
  /(^|\.)github-storages-cdn\.vercel\.app$/i,
  /(^|\.)storage-safarenglishka-recording\.vercel\.app$/i,
  /(^|\.)storage-naveenbharat-recording\.vercel\.app$/i,
  /(^|\.)googleusercontent\.com$/i,
  /(^|\.)archive\.org$/i,
  /^prod-recordings\.vedantu\.com$/i,
  // Google Drive / Docs and Notion have dedicated proxy routes.
  /(^|\.)drive\.google\.com$/i,
  /(^|\.)docs\.google\.com$/i,
  /(^|\.)notion\.(so|site)$/i,
];

export function isProxyRelayable(url: string): boolean {
  try {
    return RELAYABLE_HOSTS.some((re) => re.test(new URL(url).hostname));
  } catch {
    return false;
  }
}

/** True when a browser is likely to block the direct fetch for this host. */
export function needsAppToRead(url: string): boolean {
  if (isProxyRelayable(url)) return false;
  try {
    return new URL(url).origin !== window.location.origin;
  } catch {
    return true;
  }
}

