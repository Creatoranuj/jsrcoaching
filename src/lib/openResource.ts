/**
 * Single funnel for "open a user-facing resource" (PDF / image / doc / link).
 *
 * Rules:
 *  - PDFs go through the bundled pdf.js viewer via `resolveEmbedUrl`, then
 *    are opened with `openExternal` (Capacitor InAppBrowser on native,
 *    window.open on web). This keeps the user in-app even for Drive-hosted
 *    PDFs.
 *  - Images / docs / plain links → `openExternal` directly.
 *  - `download: true` bypasses the viewer and calls `downloadFile` so the
 *    user gets the raw bytes.
 *
 * Every "open PDF" and "download PDF" call site should funnel through here
 * to prevent regressions like PDFs escaping to the system browser.
 */
import { openExternal } from "./native/browser";
import { resolveEmbedUrl } from "./pdfViewerUrl";
import { downloadFile } from "../utils/fileUtils";

export type ResourceKind = "pdf" | "image" | "doc" | "link" | "auto";

export interface OpenResourceOptions {
  url: string;
  kind?: ResourceKind;
  filename?: string;
  /** When true, trigger a byte download instead of opening the viewer. */
  download?: boolean;
}

const PDF_EXT_RE = /\.pdf(\?|#|$)/i;
const IMG_EXT_RE = /\.(png|jpe?g|webp|gif|avif|heic)(\?|#|$)/i;
const DOC_EXT_RE = /\.(docx?|xlsx?|pptx?|txt|csv)(\?|#|$)/i;

function inferKind(url: string): ResourceKind {
  if (PDF_EXT_RE.test(url)) return "pdf";
  if (IMG_EXT_RE.test(url)) return "image";
  if (DOC_EXT_RE.test(url)) return "doc";
  return "link";
}

export async function openResource(opts: OpenResourceOptions): Promise<void> {
  const { url, filename, download } = opts;
  const kind = opts.kind && opts.kind !== "auto" ? opts.kind : inferKind(url);

  if (download) {
    const fname = filename || (kind === "pdf" ? "document.pdf" : url.split("/").pop() || "download");
    await downloadFile(url, fname);
    return;
  }

  if (kind === "pdf") {
    const { embedUrl } = resolveEmbedUrl(url);
    await openExternal(embedUrl || url, { preferWebView: true });
    return;
  }

  await openExternal(url);
}