/**
 * Source-aware PDF error copy.
 *
 * Rule (per user QA): the "Drive file is private" wording must ONLY appear for
 * Drive-backed sources. For CDN / Supabase / direct URLs we surface the exact
 * reason instead — HTTP status, the server's status text when it gave one, and
 * the host that rejected the request, so the uploader knows where to look.
 */

export function isDrivePdfSource(src: string | null | undefined): boolean {
  return /drive\.google\.com|docs\.google\.com|googleusercontent\.com|pdf-proxy\?kind=drive|[?&]kind=drive/i.test(
    src || ""
  );
}

export function pdfSourceHost(src: string | null | undefined): string | null {
  if (!src) return null;
  try {
    return new URL(src, typeof window !== "undefined" ? window.location.href : "https://x.invalid").hostname || null;
  } catch {
    return null;
  }
}

export const DRIVE_PRIVATE_MSG =
  "This Drive file is private — ask the uploader to enable link sharing.";

export interface PdfErrorLike {
  name?: string;
  message?: string;
  status?: number;
  statusText?: string;
}

export function friendlyPdfErrorMessage(err: unknown, src: string | null | undefined): string {
  const e = (err || {}) as PdfErrorLike;
  const msg = e.message || String(err || "");
  const status = e.status ?? Number(msg.match(/HTTP\s+(\d{3})/i)?.[1] || 0);
  const isDrive = isDrivePdfSource(src);

  // Telegram-backed storage proxy (`resolve-storage-pdf`) — surface the real
  // reason instead of letting the reader report "Invalid PDF structure".
  const code = (e as PdfErrorLike & { code?: string }).code || "";
  if (/storage_key_rejected/i.test(`${code} ${msg}`)) {
    return "यह document अभी available नहीं है (storage key issue). Admin को बताएँ।";
  }
  if (/Asset not registered/i.test(msg)) {
    return "This document link isn't registered with the app. Ask the uploader to re-add it to the lesson.";
  }
  if (/Not entitled to this document/i.test(msg)) {
    return "You don't have access to this document. Enroll in the course to open it.";
  }
  if (/Sign in required to open this document/i.test(msg)) {
    return "Please sign in again to open this document.";
  }
  if (/Storage proxy unavailable|Storage proxy HTTP|Unsupported JSR COACHING storage link/i.test(msg)) {
    return "Document service didn't respond. Tap Retry; if it keeps failing, tell the admin.";
  }

  // 403 minted by OUR pdf-proxy (not the upstream CDN) means the enrollment
  // gate rejected the user — tell them to enroll / re-login instead of blaming
  // the uploader's link (Sentry SAFAR-ENGLISH-W: "ResponseException 403" on a
  // jsdelivr URL that was perfectly public).
  if (status === 403 && /\/functions\/v1\/pdf-proxy|Not authorized for this file/i.test(`${src || ""} ${msg}`)) {
    return "Yeh PDF sirf enrolled students ke liye hai. Course me enroll karein, ya session expire hua ho to dobara login karein.";
  }

  if (status === 403 || status === 404) {
    if (isDrive) return DRIVE_PRIVATE_MSG;
    const host = pdfSourceHost(src);
    const where = host ? ` by ${host}` : "";
    const reason = e.statusText ? ` — server said "${e.statusText}"` : "";
    return status === 404
      ? `PDF not found (404)${where}${reason}. The file was moved or deleted at its link — ask the uploader to re-upload it.`
      : `PDF access denied (403)${where}${reason}. The link is private or expired — tap Retry, or ask the uploader for a fresh link.`;
  }

  if (status === 503 || status === 502 || status === 504) {
    return "PDF service is busy. Retry in a few seconds.";
  }

  if (status === 415 || /HTML page, not a PDF|Drive did not return a PDF|HTTP 415|web page instead of a PDF|not_pdf/i.test(msg)) {
    return isDrive
      ? DRIVE_PRIVATE_MSG
      : "The link returned a web page instead of a PDF file. Check the file URL / sharing settings.";
  }

  if (/InvalidPDFException|Invalid PDF structure|InvalidPdf|missing pdf signature/i.test(`${e.name || ""} ${msg}`)) {
    return "This link did not return a valid PDF file. Tap Retry; if it still fails, ask the uploader to replace the link.";
  }


  if (/exceeds response Body|Content-Length header of network response|truncated|unexpected end|stream.*(closed|ended)/i.test(msg)) {
    return "The file download was cut short. Tap Retry to fetch a fresh copy.";
  }

  if (/failed to fetch|network error|network request failed|load failed|net::ERR|connection (reset|closed|abort)|ECONNRESET|ETIMEDOUT|timeout/i.test(msg)) {
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    return offline
      ? "You're offline — turn on mobile data or Wi-Fi (airplane mode off) and tap Retry."
      : "Network connection dropped while downloading. Tap Retry.";
  }

  return msg || "Failed to load PDF.";
}
