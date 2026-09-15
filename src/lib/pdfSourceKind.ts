/**
 * Source-kind predicates for the PDF reader.
 *
 * Kept in a standalone module (instead of inside FastPdfReader) so they can be
 * unit-tested without pulling pdf.js/canvas into the test environment.
 */

/**
 * Smart content-crop is a Google Sheets-only workaround. Sheets exports arrive
 * either as a direct docs.google.com/spreadsheets link or wrapped inside the
 * pdf-proxy `url=` query param. Everything else must render untouched.
 */
export function isSheetsSource(url: string | undefined | null): boolean {
  if (!url) return false;
  let u = url;
  try { u = decodeURIComponent(url); } catch { /* keep raw */ }
  return /docs\.google\.com(\/|%2F)spreadsheets/i.test(u) || /docs\.google\.com\/spreadsheets/i.test(url);
}

/**
 * True for Internet Archive sources — either a direct archive.org URL or the
 * `pdf-proxy?kind=archive` wrapper. Used solely to pick archive-only pdf.js
 * loader options (bigger range chunks, no background auto-fetch).
 */
export function isArchiveSource(url: string | undefined | null): boolean {
  if (!url) return false;
  let u = url;
  try { u = decodeURIComponent(url); } catch { /* keep raw */ }
  if (/[?&]kind=archive\b/i.test(url) || /[?&]kind=archive\b/i.test(u)) return true;
  return /(^|\/\/|\.)archive\.org(\/|$)/i.test(u);
}

/**
 * Archive's proxy validates `%PDF-` on byte-zero ranges, so its lightweight
 * total-size probe must include the complete five-byte signature. Other
 * sources keep the original one-byte probe.
 */
export function pdfSizeProbeRange(url: string | undefined | null): string {
  return isArchiveSource(url) ? "bytes=0-4" : "bytes=0-0";
}

/**
 * True for Notion-hosted documents — a notion.so/notion.site page, or one of
 * Notion's file hosts (secure.notion-static.com, file.notion.so,
 * prod-files-secure S3), including the pdf-proxy `url=` wrapper form.
 *
 * AUDIT 2026-09-08: both Notion lectures silently degraded to "Web page" mode
 * because no code path recognised Notion as a document source. notion-page now
 * returns a bestDocument and the reader opens it, and Notion file hosts stream
 * through pdf-proxy like every other remote PDF.
 */
export function isNotionSource(url: string | undefined | null): boolean {
  if (!url) return false;
  let u = url;
  try { u = decodeURIComponent(url); } catch { /* keep raw */ }
  return /(^|\/\/|\.)notion\.(so|site|com)(\/|$)/i.test(u)
    || /notion-static\.com|file\.notion\.so|prod-files-secure/i.test(u);
}
