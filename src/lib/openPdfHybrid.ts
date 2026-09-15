/**
 * Hybrid PDF opener for chip-section (Notes / DPP / Attachments) tap handlers.
 *
 * Product decision (per user QA): PDFs must ALWAYS open inside the app, never
 * redirect to the OS browser, the CDN web page, or an external PDF reader.
 * This helper now unconditionally returns `false`, which tells callers to
 * mount the in-app `<PdfViewer>`. The viewer wraps remote URLs through
 * `useLocalPdfSource` → fetch-as-blob → pdf.js, which renders reliably on
 * web and Capacitor Android for CDN, Supabase signed URLs, and jsdelivr.
 *
 * Kept as a thin wrapper (instead of removing the call sites) so we have a
 * single switch if we ever need to re-introduce native handoff for a
 * specific URL pattern.
 */
export interface HybridOpenInput {
  url: string;
  fileName: string;
  record?: unknown;
}

export async function openPdfHybrid(_input: HybridOpenInput): Promise<boolean> {
  return false;
}
