/**
 * Pre-flight share-permission check for Drive & Notion URLs.
 *
 * Why: even with proxy + iframe fallback, if the source file isn't
 * "Anyone with link" public, BOTH paths fail and the reader shows
 * a perpetual blank/error. Validating at save-time prevents bad
 * URLs from ever entering the DB.
 */
import {
  isGoogleDrive,
  isGoogleDocs,
  isNotion,
  extractDriveFileId,
  extractDocsId,
  extractNotionPageId,
  googleDrivePdfProxyUrl,
  remotePdfProxyUrl,
  notionPageProxyUrl,
} from "./pdfViewerUrl";

export type ShareCheckResult =
  | { ok: true; kind: "drive" | "docs" | "notion" | "other"; warning?: string }
  | { ok: false; kind: "drive" | "docs" | "notion"; reason: string; hint: string };

/**
 * Fail-open helper. A pre-flight check may be inconclusive (proxy 400/5xx,
 * timeout, offline). Blocking the save in those cases stopped admins from
 * publishing perfectly valid links, so inconclusive results pass with a
 * warning; only a *proven* private file (401/403/404 or an HTML login page)
 * blocks the save.
 */
const inconclusive = (
  kind: "drive" | "docs" | "notion",
  warning: string,
): ShareCheckResult => ({ ok: true, kind, warning });

const TIMEOUT_MS = 5000;
const TIMEOUT_MS_DOCS = 7000; // Keep admin save flow responsive on mobile.

const withTimeout = async (
  url: string,
  init?: RequestInit,
  timeoutMs: number = TIMEOUT_MS,
): Promise<Response> => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
};

const checkDrive = async (url: string): Promise<ShareCheckResult> => {
  const id = extractDriveFileId(url);
  if (!id) {
    return {
      ok: false,
      kind: "drive",
      reason: "Invalid Google Drive link",
      hint: "Use a link like https://drive.google.com/file/d/FILE_ID/view",
    };
  }
  const proxy = googleDrivePdfProxyUrl(url);
  if (!proxy) {
    return { ok: false, kind: "drive", reason: "Cannot build proxy URL", hint: "Check the Drive link format." };
  }
  try {
    // Range request — only ~1KB; verifies bytes are reachable through proxy.
    const res = await withTimeout(proxy, {
      method: "GET",
      headers: { Range: "bytes=0-1023" },
    });
    if (res.status === 200 || res.status === 206) {
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      // Drive returns HTML interstitial when file is NOT public.
      if (ct.includes("text/html")) {
        return {
          ok: false,
          kind: "drive",
          reason: "Drive file is not public",
          hint: 'Open the file → Share → "Anyone with the link" → Viewer. Then save again.',
        };
      }
      return { ok: true, kind: "drive" };
    }
    if (res.status === 401 || res.status === 403 || res.status === 404) {
      return {
        ok: false,
        kind: "drive",
        reason: `Drive returned ${res.status} (not accessible)`,
        hint: 'Set the file to "Anyone with the link → Viewer" in Google Drive Share settings.',
      };
    }
    return inconclusive("drive", `Share check inconclusive (status ${res.status})`);
  } catch (e: any) {
    if (e?.name === "AbortError") {
      return inconclusive("drive", "Share check timed out — link saved unverified");
    }
    return inconclusive("drive", e?.message || "Share check network error — link saved unverified");
  }
};

const checkNotion = async (url: string): Promise<ShareCheckResult> => {
  const id = extractNotionPageId(url);
  if (!id) {
    return {
      ok: false,
      kind: "notion",
      reason: "Invalid Notion page link",
      hint: "Copy the link from Share → Copy link on the Notion page.",
    };
  }
  try {
    const res = await withTimeout(notionPageProxyUrl(id), { method: "GET" });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data && (data.recordMap || data.success !== false)) {
        return { ok: true, kind: "notion" };
      }
      return {
        ok: false,
        kind: "notion",
        reason: "Notion page is not public",
        hint: 'Open the Notion page → Share → "Publish to web" (or set link access to anyone).',
      };
    }
    if (res.status === 401 || res.status === 403 || res.status === 404) {
      return {
        ok: false,
        kind: "notion",
        reason: `Notion returned ${res.status}`,
        hint: 'Publish the page: Notion → Share → "Publish to web".',
      };
    }
    return inconclusive("notion", `Share check inconclusive (status ${res.status})`);
  } catch (e: any) {
    if (e?.name === "AbortError") {
      return inconclusive("notion", "Share check timed out — link saved unverified");
    }
    return inconclusive("notion", e?.message || "Share check network error — link saved unverified");
  }
};

/**
 * Google Docs pre-flight. Docs URLs are converted to the `/export?format=pdf`
 * endpoint and pushed through the same pdf-proxy so the check exercises the
 * SAME byte path the reader will use. If the doc isn't shared "Anyone with
 * link", the export URL returns HTML (login page) → we surface a clear hint
 * instead of letting the row land in the DB and blank-screen later.
 */
const checkDocs = async (url: string): Promise<ShareCheckResult> => {
  const id = extractDocsId(url);
  if (!id) {
    return {
      ok: false,
      kind: "docs",
      reason: "Invalid Google Docs link",
      hint: "Use a link like https://docs.google.com/document/d/DOC_ID/edit",
    };
  }
  const exportUrl = `https://docs.google.com/document/d/${id}/export?format=pdf`;
  const proxy = remotePdfProxyUrl(exportUrl);
  try {
    const res = await withTimeout(
      proxy,
      { method: "GET", headers: { Range: "bytes=0-1023" } },
      TIMEOUT_MS_DOCS,
    );
    if (res.status === 200 || res.status === 206) {
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      if (ct.includes("text/html")) {
        return {
          ok: false,
          kind: "docs",
          reason: "Google Docs file is not public",
          hint: 'Open the doc → Share → "Anyone with the link" → Viewer. Then save again.',
        };
      }
      return { ok: true, kind: "docs" };
    }
    if (res.status === 401 || res.status === 403 || res.status === 404) {
      return {
        ok: false,
        kind: "docs",
        reason: `Docs returned ${res.status} (not accessible)`,
        hint: 'Set the doc to "Anyone with the link → Viewer" in Google Docs Share settings.',
      };
    }
    return inconclusive("docs", `Share check inconclusive (status ${res.status})`);
  } catch (e: any) {
    if (e?.name === "AbortError") {
      return inconclusive("docs", "Share check timed out — link saved unverified");
    }
    return inconclusive("docs", e?.message || "Share check network error — link saved unverified");
  }
};

/**
 * Verify a Drive / Docs / Notion URL is publicly accessible BEFORE saving.
 * Non-recognised URLs short-circuit to ok:true (no check needed).
 */
export const verifyShareAccess = async (url: string): Promise<ShareCheckResult> => {
  const u = (url || "").trim();
  if (!u) return { ok: true, kind: "other" };
  if (isGoogleDrive(u)) return checkDrive(u);
  if (isGoogleDocs(u)) return checkDocs(u);
  if (isNotion(u)) return checkNotion(u);
  return { ok: true, kind: "other" };
};
