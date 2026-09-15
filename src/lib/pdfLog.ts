/**
 * Centralized, structured PDF logging.
 *
 * Goal (per release QA): every PDF open/render event flows through ONE helper
 * so logs are consistent, structured, and SILENT in production. Native console
 * noise (`console.log("[pdf] …")` scattered across viewers) is replaced by
 * `pdfLog`, which only emits when a single debug flag is set:
 *
 *   - URL query   ?debug=1   (or ?debug)
 *   - localStorage nb_pdf_debug = "1"
 *
 * When the flag is off (the default in shipped APKs / web), `pdfLog.*` is a
 * no-op for console output. Breadcrumbs still go to Sentry so we keep crash
 * telemetry without polluting the user-visible console.
 */
import { addBreadcrumb } from "./sentry";

export type PdfLogEvent =
  | "open"
  | "source"
  | "first-byte"
  | "progress"
  | "load-success"
  | "load-error"
  | "byte-fallback"
  | "viewer-fallback"
  | "resolve-error"
  | "download"
  | "retry";

let cachedEnabled: boolean | null = null;

/** True when the PDF debug flag is active. Cached after first read. */
export function isPdfDebug(): boolean {
  if (cachedEnabled !== null) return cachedEnabled;
  if (typeof window === "undefined") return (cachedEnabled = false);
  try {
    const qs = new URLSearchParams(window.location.search);
    const fromQuery = qs.has("debug") && qs.get("debug") !== "0" && qs.get("debug") !== "false";
    const fromStorage = window.localStorage.getItem("nb_pdf_debug") === "1";
    cachedEnabled = fromQuery || fromStorage;
  } catch {
    cachedEnabled = false;
  }
  return cachedEnabled;
}

/** Trim URLs in logs so signed tokens / long query strings aren't dumped. */
function safeUrl(url?: string): string | undefined {
  if (!url) return undefined;
  return url.length > 120 ? `${url.slice(0, 120)}…` : url;
}

type Fields = Record<string, unknown> & { url?: string };

/** Structured PDF log. Console output only when debug flag is on; always breadcrumbs. */
export function pdfLog(event: PdfLogEvent, fields: Fields = {}): void {
  const payload = { ...fields, url: safeUrl(fields.url) };
  // Always record a breadcrumb for crash telemetry (cheap, non-visible).
  try {
    addBreadcrumb("pdf", event, payload);
  } catch {
    /* ignore breadcrumb failures */
  }
  if (!isPdfDebug()) return;
   
  console.info(`[pdf:${event}]`, payload);
}

/** Error variant — same gating, routed to console.error when debug is on. */
export function pdfLogError(event: PdfLogEvent, err: unknown, fields: Fields = {}): void {
  const message = err instanceof Error ? err.message : String(err);
  const payload = { ...fields, url: safeUrl(fields.url), error: message };
  try {
    addBreadcrumb("pdf", event, payload);
  } catch {
    /* ignore */
  }
  if (!isPdfDebug()) return;
   
  console.error(`[pdf:${event}]`, payload);
}
